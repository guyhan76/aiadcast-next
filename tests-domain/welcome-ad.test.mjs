import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GenerationService} from '../server/generation-service.mjs';
import {BetaStore} from '../server/beta-store.mjs';
import {createBetaServer} from '../server/beta-server.mjs';

test('beta cutover starts at zero once and preserves subsequent top-ups on restart',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'shared-wallet-'));
 const path=join(dir,'wallet.sqlite');
 let service=new GenerationService({databasePath:path,testCredits:3});
 t.after(async()=>{await service.close();rmSync(dir,{recursive:true,force:true});});
 const user='aiadcast-next-local-developer';
 service.recordVerifiedPurchase({purchaseId:'old-beta',credits:30,unit:'credit-v2'});
 service.ledger.reserve({jobId:'old-held',userId:user,credits:5,unit:'credit-v2',requestHash:'old-held',modelRevision:'fixture',expiresAt:Date.now()+60000});
 service.initializeSharedWallet();
 assert.equal(service.wallet().available,0);
 assert.equal(service.wallet().credits.available,0);
 service.ledger.release('old-held',user,'system_error');
 assert.deepEqual(service.wallet().credits,{available:0,reserved:0});
 service.recordVerifiedPurchase({purchaseId:'new-pack',credits:100,unit:'credit-v2'});
 await service.close();service=new GenerationService({databasePath:path});
 service.initializeSharedWallet();service.initializeSharedWallet();
 assert.deepEqual(service.wallet().credits,{available:100,reserved:0});
 assert.equal(service.db.prepare('SELECT COUNT(*) n FROM purchases').get().n,2);
});

test('new and existing beta members see zero across login, parallel reads and forged input',async t=>{
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
  assert.equal(result.status,200);assert.equal(result.body.wallet.credits.available,0);
  assert.equal(result.body.wallet.unlimited,undefined);
 }
 assert.equal((await call('/api/auth/test/signup',credentials)).status,409);
 const login=await call('/api/auth/test/login',credentials);
 assert.equal((await call('/api/status',undefined,login.body.token)).body.wallet.credits.available,0);
 const old=store.provision({label:'Existing account',credits:0});
 const existing=await call('/api/auth/login',{invite:old.invite});
 assert.equal((await call('/api/status',undefined,existing.body.token)).body.wallet.credits.available,0);
});
