import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BetaStore} from '../server/beta-store.mjs';
import {createBetaServer} from '../server/beta-server.mjs';
import {KakaoAuth} from '../server/kakao-auth.mjs';
import {kakaoProvider} from '../server/kakao-provider.mjs';

const origin = 'https://studio.example.com';
const env = {AIADCAST_KAKAO_ENABLED:'true', AIADCAST_KAKAO_APP_ID:'123',
  AIADCAST_KAKAO_JS_KEY:'public-js', AIADCAST_KAKAO_REST_KEY:'fixture-rest',
  AIADCAST_KAKAO_CLIENT_SECRET:'fixture-secret', AIADCAST_BETA_PUBLIC_ORIGIN:origin};
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'kakao-'));
  let time = Date.now();
  const store = new BetaStore(dir, {now:() => time});
  t.after(() => {store.close(); rmSync(dir, {recursive:true, force:true});});
  const provider = {javascriptKey:'fixture-js', redirectUri:origin + '/?kakao=1', subjectForCode:async () => '10001'};
  const auth = new KakaoAuth(store, {provider, now:() => time});
  async function complete(intent, header) {
    return auth.finishKakao({...auth.startKakao(intent, header), code:'fixture'}, header);
  }
  return {store, auth, provider, complete, expire:() => {time += 600001;}};
}

test('Kakao exchanges the code server-side and preserves distinct 64-bit member IDs', async () => {
  let id = '9223372036854775806', app = 123, lifetime = 300;
  const p = kakaoProvider(env, async (url, options) => {
    assert.equal(options.redirect, 'error');
    if (url === 'https://kauth.kakao.com/oauth/token') {
      assert.equal(options.method, 'POST');
      assert.deepEqual(Object.fromEntries(options.body), {grant_type:'authorization_code', client_id:'fixture-rest',
        client_secret:'fixture-secret', redirect_uri:origin+'/?kakao=1', code:'fixture'});
      return Response.json({access_token:'fixture-kakao-token'});
    }
    assert.equal(url, 'https://kapi.kakao.com/v1/user/access_token_info');
    assert.equal(options.headers.Authorization, 'Bearer fixture-kakao-token');
    return new Response('{"id":'+id+',"app_id":'+app+',"expires_in":'+lifetime+'}');
  });
  for (id of ['9223372036854775806','9223372036854775807']) assert.equal(await p.subjectForCode('fixture'), id);
  id = '9223372036854775808';
  await assert.rejects(p.subjectForCode('fixture'), /KAKAO_TOKEN_INVALID/);
  id = '10001'; app = 124;
  await assert.rejects(p.subjectForCode('fixture'), /KAKAO_TOKEN_INVALID/);
  app = 123; lifetime = 0;
  await assert.rejects(p.subjectForCode('fixture'), /KAKAO_TOKEN_INVALID/);
  assert.equal(kakaoProvider({...env, AIADCAST_KAKAO_ENABLED:'false'}), undefined);
  assert.equal(kakaoProvider({...env, AIADCAST_KAKAO_CLIENT_SECRET:''}), undefined);
  assert.equal(kakaoProvider({...env, AIADCAST_BETA_PUBLIC_ORIGIN:'wrong'}), undefined);
});

test('an unknown login requires explicit signup and simultaneous signups share one member', async t => {
  const f = fixture(t);
  await assert.rejects(f.complete('login'), /KAKAO_ACCOUNT_UNKNOWN/);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM users').get().n, 0);
  const [one, two] = await Promise.all([f.complete('signup'), f.complete('signup')]);
  assert.equal(one.user.id, two.user.id);
  assert.equal(one.user.role, 'member');
  assert.equal((await f.complete('login')).user.id, one.user.id);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM welcome_ad_eligibility').get().n, 1);
});

test('linking preserves existing ownership and forbids linking an identity to a second account', async t => {
  const f = fixture(t);
  const old = f.store.provision({label:'Owner', credits:17});
  f.store.setRole(old.userId, 'admin');
  const owner = 'Bearer ' + f.store.login(old.invite).token;
  assert.throws(() => f.auth.startKakao('link'), /KAKAO_INTENT_INVALID/);
  assert.equal((await f.complete('link', owner)).user.id, old.userId);
  const kakaoSession = await f.complete('login');
  assert.equal(kakaoSession.user.role, 'admin');
  assert.equal(f.store.authenticate('Bearer '+kakaoSession.token).credits, 17);
  const other = f.store.provision({label:'Other'});
  const otherToken = 'Bearer ' + f.store.login(other.invite).token;
  await assert.rejects(f.complete('link', otherToken), /KAKAO_LINK_CONFLICT/);
  f.provider.subjectForCode = async () => '20002';
  await assert.rejects(f.complete('link', owner), /KAKAO_LINK_CONFLICT/);
  assert.notEqual((await f.complete('signup')).user.id, old.userId);
});

test('flows enforce one-time proofs, expiry and the active session even across a delayed exchange', async t => {
  const f = fixture(t);
  const header = 'Bearer ' + f.store.login(f.store.provision({label:'Member'}).invite).token;
  const flow = {...f.auth.startKakao('link', header), code:'fixture'};
  await assert.rejects(f.auth.finishKakao({...flow, proof:'x'.repeat(43)}, header), /KAKAO_FLOW_INVALID/);
  await assert.rejects(f.auth.finishKakao(flow), /KAKAO_FLOW_INVALID/);
  let release;
  f.provider.subjectForCode = () => new Promise(resolve => {release = resolve;});
  const pending = f.auth.finishKakao(flow, header);
  await assert.rejects(f.auth.finishKakao(flow, header), /KAKAO_FLOW_INVALID/);
  f.store.logout(header); release('10001');
  await assert.rejects(pending, /AUTH_REQUIRED/);
  const expired = {...f.auth.startKakao('signup'), code:'fixture'};
  f.expire();
  await assert.rejects(f.auth.finishKakao(expired), /KAKAO_FLOW_INVALID/);
  const uncertain = {...f.auth.startKakao('signup'), code:'fixture'};
  f.provider.subjectForCode = async () => {throw Error('fixture outage');};
  await assert.rejects(f.auth.finishKakao(uncertain), /KAKAO_VERIFICATION_FAILED/);
  await assert.rejects(f.auth.finishKakao(uncertain), /KAKAO_FLOW_INVALID/);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM kakao_identities').get().n, 0);
});

test('HTTP discovery, signup and authenticated session use the public app entry points', async t => {
  const f = fixture(t);
  const app = createBetaServer({store:f.store, publicUrl:origin, accounts:{kakao:f.provider},
    serviceFactory:() => {throw Error('unused');}});
  await new Promise(resolve => app.server.listen(0,'127.0.0.1',resolve));
  t.after(() => app.close());
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const post = (path, body, requestOrigin = origin) => fetch(base + '/api/auth/kakao/' + path, {
    method:'POST', headers:{Origin:requestOrigin, 'Content-Type':'application/json','X-Aiadcast-Client':'local-studio'}, body:JSON.stringify(body)});
  const capabilities = await (await fetch(base + '/api/account/capabilities')).json();
  assert.deepEqual(capabilities.kakao, {enabled:true});
  assert.equal((await post('start', {intent:'signup'}, 'https://elsewhere.example')).status, 403);
  const start = await post('start', {intent:'signup'});
  assert.equal(start.status, 200);
  const flow = await start.json();
  assert.deepEqual(Object.keys(flow).sort(), ['expires','javascriptKey','proof','redirectUri','state']);
  const finish = await post('finish', {...flow, code:'fixture', role:'admin'});
  assert.equal(finish.status, 200);
  const session = await finish.json();
  const read = await fetch(base+'/api/auth/session', {headers:{Authorization:'Bearer '+session.token}});
  assert.equal((await read.json()).user.id, session.user.id);
  assert.equal(session.user.role,'member');
});
