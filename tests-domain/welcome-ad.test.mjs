import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GenerationService} from '../server/generation-service.mjs';
import {BetaStore} from '../server/beta-store.mjs';
import {createBetaServer} from '../server/beta-server.mjs';

test('one free ad survives restart, failure restores it, delivery consumes it once',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'welcome-ad-'));
 let service=new GenerationService({databasePath:join(dir,'wallet.sqlite'),testCredits:0});
 t.after(async()=>{await service.close();rmSync(dir,{recursive:true,force:true});});
 service.grantWelcomeAd();service.grantWelcomeAd();
 assert.deepEqual(service.wallet().credits,{available:10,reserved:0});
 assert.equal(service.wallet().available,0);
 const user='aiadcast-next-local-developer';
 const reserve=id=>service.ledger.reserve({jobId:id,userId:user,credits:10,unit:'credit-v2',requestHash:id,modelRevision:'fixture',expiresAt:Date.now()+60000});
 reserve('first-attempt');
 assert.throws(()=>reserve('concurrent-attempt'),/Insufficient/);
 service.ledger.release('first-attempt',user,'system_error');
 assert.equal(service.wallet().credits.available,10);
 reserve('successful-attempt');service.ledger.markReady('successful-attempt','fixture-result');
 service.ledger.release('successful-attempt',user,'customer_rejected');
 assert.deepEqual(service.wallet().credits,{available:0,reserved:0});
 await service.close();service=new GenerationService({databasePath:join(dir,'wallet.sqlite'),testCredits:0});
 service.grantWelcomeAd();assert.equal(service.wallet().credits.available,0);
 assert.equal(service.db.prepare("SELECT COUNT(*) n FROM credit_events WHERE kind='welcome'").get().n,1);
 assert.equal(service.db.prepare('SELECT COUNT(*) n FROM purchases').get().n,0);
});

test('failed welcome transaction rolls back balance and can safely retry',t=>{
 const service=new GenerationService({testCredits:0});t.after(()=>service.close());
 service.db.exec("CREATE TRIGGER fail_welcome BEFORE INSERT ON local_development_meta WHEN NEW.key='welcome-ad-v1' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
 assert.throws(()=>service.grantWelcomeAd(),/fixture failure/);
 assert.equal(service.wallet().credits.available,0);
 service.db.exec('DROP TRIGGER fail_welcome');service.grantWelcomeAd();
 assert.equal(service.wallet().credits.available,10);
});

test('signup issues welcome eligibility once; login, parallel status and forged input cannot add more',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'welcome-http-')),store=new BetaStore(dir);
 const app=createBetaServer({store,publicUrl:'https://fixture.invalid',accounts:{password:{enabled:true}},
  serviceFactory:user=>new GenerationService({databasePath:join(dir,user.id+'.sqlite'),testCredits:0})});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await app.close();store.close();rmSync(dir,{recursive:true,force:true});});
 const origin='http://127.0.0.1:'+app.server.address().port;
 const call=async(path,body,token)=>{const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{Origin:'https://fixture.invalid','Content-Type':'application/json','X-Aiadcast-Client':'local-studio',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};};
 const credentials={email:'welcome@example.com',password:'Fixture-only-1234',credits:999,role:'admin'};
 const signup=await call('/api/auth/test/signup',credentials);
 assert.equal(signup.status,200,JSON.stringify(signup.body));
 for(const result of await Promise.all(Array.from({length:3},()=>call('/api/status',undefined,signup.body.token)))){
  assert.equal(result.status,200);assert.equal(result.body.wallet.credits.available,10);
  assert.equal(result.body.wallet.unlimited,undefined);
 }
 assert.equal((await call('/api/auth/test/signup',credentials)).status,409);
 const login=await call('/api/auth/test/login',credentials);
 assert.equal((await call('/api/status',undefined,login.body.token)).body.wallet.credits.available,10);
 const old=store.provision({label:'Existing account',credits:0});
 const existing=await call('/api/auth/login',{invite:old.invite});
 assert.equal((await call('/api/status',undefined,existing.body.token)).body.wallet.credits.available,0);
});
