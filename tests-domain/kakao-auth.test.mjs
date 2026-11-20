import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {BetaStore} from '../server/beta-store.mjs';
import {createBetaServer} from '../server/beta-server.mjs';
import {KakaoAuth} from '../server/kakao-auth.mjs';
import {kakaoProvider} from '../server/kakao-provider.mjs';
import {kakaoTalkPage} from '../server/kakao-talk-page.mjs';

const origin = 'https://studio.example.com';
const env = {AIADCAST_KAKAO_ENABLED:'true', AIADCAST_KAKAO_APP_ID:'123',
  AIADCAST_KAKAO_JS_KEY:'public-js', AIADCAST_KAKAO_REST_KEY:'fixture-rest',
  AIADCAST_KAKAO_CLIENT_SECRET:'fixture-secret', AIADCAST_BETA_PUBLIC_ORIGIN:origin};
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'kakao-'));
  let time = Date.now();
  const store = new BetaStore(dir, {now:() => time});
  t.after(() => {store.close(); rmSync(dir, {recursive:true, force:true});});
  const provider = {...kakaoProvider(env), subjectForCode:async () => '10001'};
  const auth = new KakaoAuth(store, {provider, now:() => time});
  async function complete(intent, header) {
    return auth.finishKakao({...auth.startKakao(intent, header), code:'fixture'}, header);
  }
  return {store, auth, provider, complete, expire:() => {time += 600001;}};
}

test('KakaoTalk starts once and only offers an account fallback after a delay or startup failure', () => {
  const options={state:'s'.repeat(43),callbackUri:origin+'/api/auth/kakao/callback',javascriptKey:'test-key'};
  const html=kakaoTalkPage(options);
  assert.match(html,/<a id="account" hidden href=/);
  const script=html.match(/<script>([^]*?)<\/script>/)[1];
  function openPage() {
    const sdk={}, status={}, account={hidden:true}, attempts=[];
    let timer,visibilityChanged;
    const document={
      hidden:false,
      querySelector:selector=>selector==='main'?{dataset:{key:options.javascriptKey,state:options.state,callback:options.callbackUri}}:
        selector==='#account'?account:status,
      createElement:()=>sdk,head:{append:()=>{}},
      addEventListener:(event,callback)=>{if(event==='visibilitychange')visibilityChanged=callback;}
    };
    runInNewContext(script,{
      document,
      Kakao:{init:()=>{},Auth:{authorize:settings=>{attempts.push(settings.state);}}},
      setTimeout:callback=>{timer=callback;return 1;},clearTimeout:()=>{timer=undefined;}
    });
    return {sdk,account,attempts,status,timeout:()=>timer?.(),setHidden:hidden=>{document.hidden=hidden;visibilityChanged();}};
  }
  const talk=openPage();
  talk.sdk.onload();
  assert.deepEqual(talk.attempts,[options.state]);
  assert.equal(talk.account.hidden,true);
  assert.match(talk.status.textContent,/자동으로 돌아옵니다/);
  talk.setHidden(true);
  talk.timeout();
  assert.equal(talk.account.hidden,true);
  talk.setHidden(false);
  assert.equal(talk.account.hidden,true);
  talk.timeout();
  assert.equal(talk.account.hidden,false);
  assert.deepEqual(talk.attempts,[options.state]);
  for (const reason of ['error','timeout']) {
    const page=openPage();
    if (reason==='error') page.sdk.onerror(); else page.timeout();
    assert.equal(page.account.hidden,false);
    page.sdk.onload();
    assert.deepEqual(page.attempts,[]);
  }
});

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

  for (const destination of ['web','com.selluplabs.aiadcast.next.preview']) {
    const flow = await (await post('start',{intent:'login',destination})).json();
    const startUrl = new URL(flow.url);
    const launch = await fetch(base + startUrl.pathname + startUrl.search, {redirect:'manual'});
    assert.equal(launch.status,303);
    assert.equal(launch.headers.get('referrer-policy'),'no-referrer');
    assert.equal(launch.headers.get('cache-control'),'no-store');
    const authorize = new URL(launch.headers.get('location'));
    assert.equal(authorize.origin + authorize.pathname,'https://kauth.kakao.com/oauth/authorize');
    assert.deepEqual(Object.fromEntries(authorize.searchParams), {
      client_id:'fixture-rest', redirect_uri:origin+'/api/auth/kakao/callback',
      response_type:'code', prompt:'login', state:flow.state
    });
    const talk = await fetch(base + startUrl.pathname + startUrl.search + '&talk=1');
    if (destination === 'web') {
      assert.equal(talk.status,400);
    } else {
      assert.equal(talk.status,200);
      const page = await talk.text();
      assert.match(page,/Kakao.Auth.authorize\(\{throughTalk:true/);
      assert.ok(page.includes('data-state="'+flow.state+'"'));
      assert.ok(page.includes('data-callback="'+origin+'/api/auth/kakao/callback"'));
      assert.ok(!page.includes(flow.proof));
      assert.ok(!page.includes('fixture-secret'));
    }
    const finish = await fetch(base+'/api/auth/kakao/callback?state='+flow.state+'&code=fixture',{redirect:'manual'});
    const target = destination==='web' ? finish.headers.get('location') : await finish.text();
    const pattern = destination==='web' ? /^\/#kakao-return\// : /com\.selluplabs\.aiadcast\.next\.preview:\/\/kakao\/return#/;
    assert.match(target,pattern);
    assert.ok(!target.includes(flow.proof));
    const receipt = target.split(flow.state+'.')[1].slice(0,43);
    if (destination !== 'web') {
      const cookie = finish.headers.get('set-cookie').split(';')[0];
      assert.match(finish.headers.get('set-cookie'), /Secure; HttpOnly; SameSite=Lax/);
      const resumed = await fetch(base + startUrl.pathname + startUrl.search, {
        redirect:'manual',headers:{Cookie:cookie,'User-Agent':'Android WebView AiadcastKakaoReturn/1'}});
      assert.equal(resumed.status,303);
      assert.equal(resumed.headers.get('location'),'/api/auth/kakao/app-return#'+flow.state+'.'+receipt);
      const duplicate = await fetch(base+'/api/auth/kakao/callback?state='+flow.state+'&code=fixture',{
        redirect:'manual',headers:{'User-Agent':'Android WebView AiadcastKakaoReturn/1'}});
      assert.equal(duplicate.headers.get('location'),resumed.headers.get('location'));
      const otherBrowser = await fetch(base + startUrl.pathname + startUrl.search,{redirect:'manual'});
      assert.equal(new URL(otherBrowser.headers.get('location')).origin,'https://kauth.kakao.com');
    }
    assert.deepEqual(await (await post('poll',flow)).json(),{state:'pending'});
    const result = await (await post('poll',{...flow,receipt})).json();
    assert.equal(result.session.user.id,session.user.id);
    assert.equal((await post('poll',{...flow,receipt})).status,401);
    for (const path of [startUrl.pathname + startUrl.search, '/api/auth/kakao/callback?state='+flow.state+'&code=fixture']) {
      const late = await fetch(base+path,{redirect:'manual'});
      if (destination === 'web') {
        assert.equal(late.status,410);
      } else {
        assert.equal(late.status,200);
        const html = await late.text();
        assert.ok(html.includes('href="'+destination+'://kakao/return"'));
        assert.ok(!html.includes(receipt) && !html.includes(flow.proof));
        assert.equal(late.headers.get('set-cookie'),null);
      }
    }
  }
});

test('callback and initiating device must reunite before a signup or account link can finish',async t => {
  const f=fixture(t), flow=f.auth.startKakao('signup',undefined,'web');
  assert.throws(()=>f.auth.startKakao('login',undefined,'invalid'),/KAKAO_DESTINATION_INVALID/);
  await assert.rejects(f.auth.finishKakao({...flow,code:'fixture'}),/KAKAO_FLOW_INVALID/);
  const reply=await f.auth.receiveKakao(flow.state,'fixture');
  assert.equal((await f.auth.receiveKakao(flow.state,'fixture')).receipt,undefined);
  assert.deepEqual(f.auth.pollKakao({...flow,receipt:'x'.repeat(43)}),{state:'pending'});
  assert.throws(()=>f.auth.pollKakao({...flow,proof:'x'.repeat(43),receipt:reply.receipt}),/KAKAO_FLOW_INVALID/);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM users').get().n,0);
  const member=f.auth.pollKakao({...flow,receipt:reply.receipt}).session;
  const header='Bearer '+member.token;
  const link=f.auth.startKakao('link',header,'com.selluplabs.aiadcast.next.preview');
  const approval=await f.auth.receiveKakao(link.state,'fixture');
  f.store.logout(header);
  assert.throws(()=>f.auth.pollKakao({...link,receipt:approval.receipt},header),/AUTH_REQUIRED/);
});

test('Kakao cancellation and unknown accounts return once without creating a user',async t=>{
  const f=fixture(t);
  for (const [providerError,state] of [['access_denied','cancelled'],['other','failed'],[null,'unknown']]) {
    const flow=f.auth.startKakao('login',undefined,'web');
    const reply=await f.auth.receiveKakao(flow.state,'fixture',providerError);
    assert.deepEqual(f.auth.pollKakao({...flow,receipt:reply.receipt}),{state});
    assert.throws(()=>f.auth.pollKakao({...flow,receipt:reply.receipt}),/KAKAO_FLOW_INVALID/);
  }
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM users').get().n,0);
});


test('overlapping Android callbacks exchange once and only the linked member can resume in a second browser',async t=>{
  const f=fixture(t);
  const member=await f.complete('signup');
  const flow=f.auth.startKakao('login',undefined,'com.selluplabs.aiadcast.next.preview');
  let release, exchanges=0;
  f.provider.subjectForCode=()=>{exchanges++;return new Promise(resolve=>{release=resolve;});};
  const first=f.auth.receiveKakao(flow.state,'approved');
  const duplicate=f.auth.receiveKakao(flow.state,'approved');
  const fallback=f.auth.kakaoLaunch(flow.state);
  release('10001');
  const [one,two]=await Promise.all([first,duplicate]);
  assert.equal(exchanges,1);
  assert.deepEqual(two,one);
  assert.equal(await fallback,f.provider.authorizationUrl(flow.state));
  assert.equal((await f.auth.receiveKakao(flow.state,'approved')).receipt,one.receipt);
  assert.equal(exchanges,1);
  f.provider.subjectForCode=async()=> '20002';
  assert.equal((await f.auth.receiveKakao(flow.state,'second-browser')).receipt,undefined);
  f.provider.subjectForCode=async()=> '10001';
  assert.equal((await f.auth.receiveKakao(flow.state,'new-approval')).receipt,one.receipt);
  assert.equal(f.auth.pollKakao(flow).state,'pending');
  assert.equal(f.auth.pollKakao({...flow,receipt:one.receipt}).session.user.id,member.user.id);
  assert.throws(()=>f.auth.pollKakao({...flow,receipt:two.receipt}),/KAKAO_FLOW_INVALID/);
  assert.deepEqual(await f.auth.kakaoLaunch(flow.state),{destination:'com.selluplabs.aiadcast.next.preview',completed:true});
  f.expire();
  assert.equal(await f.auth.kakaoLaunch(flow.state),null);
  assert.equal(await f.auth.receiveKakao(flow.state,'approved'),null);
});
