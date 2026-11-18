import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {GenerationService} from '../server/generation-service.mjs';
import {BetaStore} from '../server/beta-store.mjs';
import {createBetaServer} from '../server/beta-server.mjs';
import {verifyPlayPurchase,playAccountId,googlePlayProvider} from '../server/play-billing.mjs';

const owner='fixture-play-member';
const token='fixture-play-purchase';
function fixture(t) {
  const service=new GenerationService({testCredits:0});
  t.after(()=>service.close());
  const offer={quantity:1,refundableQuantity:1,consumptionState:'CONSUMPTION_STATE_YET_TO_BE_CONSUMED'};
  const receipt={obfuscatedExternalAccountId:playAccountId(owner),purchaseStateContext:{purchaseState:'PURCHASED'},
    productLineItem:[{productId:'credits_100',productOfferDetails:offer}]};
  const provider={lookup:async()=>structuredClone(receipt),consume:async()=>{offer.consumptionState='CONSUMPTION_STATE_CONSUMED';}};
  return {service,receipt,offer,provider,run:(user=owner)=>verifyPlayPurchase(provider,user,token,service)};
}
test('Play receipt grants each authorized SKU once even on concurrent redelivery',async t=>{
  for(const credits of [30,100,180]){
    const f=fixture(t);f.receipt.productLineItem[0].productId='credits_'+credits;
    await Promise.all([f.run(),f.run()]);
    const result=await f.run();assert.equal(result.state,'paid');assert.equal(result.balance,credits);
    assert.equal(f.service.wallet().available,0);assert.equal(f.service.wallet().credits.available,credits);
  }
});
test('pending, canceled, refunded, foreign-owner, unknown SKU, invalid and previously consumed tokens do not grant',async t=>{
  const f=fixture(t);
  await assert.rejects(f.run('another-account'),/PLAY_ACCOUNT_MISMATCH/);
  await assert.rejects(verifyPlayPurchase(f.provider,owner,'',f.service),/INVALID_PURCHASE_TOKEN/);
  f.receipt.purchaseStateContext.purchaseState='PENDING';assert.deepEqual(await f.run(),{state:'pending'});
  f.receipt.purchaseStateContext.purchaseState='CANCELLED';await assert.rejects(f.run(),/NOT_PAID/);
  f.receipt.purchaseStateContext.purchaseState='PURCHASED';f.offer.refundableQuantity=0;
  await assert.rejects(f.run(),/NOT_ELIGIBLE/);
  f.offer.refundableQuantity=1;f.receipt.productLineItem[0].productId='other';
  await assert.rejects(f.run(),/NOT_ELIGIBLE/);
  f.receipt.productLineItem[0].productId='credits_100';f.offer.consumptionState='CONSUMPTION_STATE_CONSUMED';
  await assert.rejects(f.run(),/PURCHASE_NOT_VERIFIED/);
  assert.equal(f.service.wallet().credits.available,0);
});
test('consume retry after ledger commit is idempotent',async t=>{
  const f=fixture(t),consume=f.provider.consume;
  f.provider.consume=()=>{throw Error('TEMPORARY_FAILURE');};
  await assert.rejects(f.run(),/TEMPORARY_FAILURE/);
  assert.equal(f.service.wallet().credits.available,100);
  f.provider.consume=consume;assert.equal((await f.run()).balance,100);
});
test('authenticated checkout API gets SKU, account and quantity from Play',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'play-http-'));
  const store=new BetaStore(directory);
  const user=store.provision({label:'Play tester',credits:0}),session=store.login(user.invite);
  let consumed=false;
  const issuer={lookup:async()=>({obfuscatedExternalAccountId:playAccountId(user.userId),purchaseStateContext:{purchaseState:'PURCHASED'},
    productLineItem:[{productId:'credits_30',productOfferDetails:{quantity:1,consumptionState:consumed?'CONSUMPTION_STATE_CONSUMED':'CONSUMPTION_STATE_YET_TO_BE_CONSUMED'}}]}),
    consume:async()=>{consumed=true;}};
  const origin='https://fixture.invalid';
  const app=createBetaServer({store,publicUrl:origin,accounts:{play:issuer},serviceFactory:()=>new GenerationService({testCredits:0})});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await app.close();store.close();rmSync(directory,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+app.server.address().port+'/api/checkout/play/';
  const headers={origin,'Content-Type':'application/json','X-Aiadcast-Client':'local-studio',Authorization:'Bearer '+session.token};
  assert.equal((await fetch(base+'account')).status,401);
  assert.deepEqual(await (await fetch(base+'account',{headers})).json(),{enabled:true,accountId:playAccountId(user.userId)});
  for(let attempt=0;attempt<2;attempt++){
    const response=await fetch(base+'verify',{method:'POST',headers,body:JSON.stringify({token,credits:99999,product:'credits_180',userId:'another-account'})});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{state:'paid',grantedCredits:30,unit:'credit-v2',balance:30});
  }
});
test('server adapter uses signed scoped authorization, fixed package and escaped token',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'play-oauth-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const file=join(directory,'service.json');
  writeFileSync(file,JSON.stringify({type:'service_account',client_email:'test@example.invalid',private_key:privateKey.export({format:'pem',type:'pkcs8'}).toString()}));
  const calls=[];
  const adapter=googlePlayProvider({AIADCAST_PLAY_BILLING_ENABLED:'true',AIADCAST_PLAY_SERVICE_ACCOUNT_FILE:file},async(url,options)=>{
    calls.push([url,options.method]);
    if(url==='https://oauth2.googleapis.com/token'){
      const [header,body,signature]=options.body.get('assertion').split('.');
      assert.ok(verify('RSA-SHA256',Buffer.from(header+'.'+body),publicKey,Buffer.from(signature,'base64url')));
      assert.equal(JSON.parse(Buffer.from(body,'base64url')).scope,'https://www.googleapis.com/auth/androidpublisher');
      return Response.json({access_token:'test-only',expires_in:3600});
    }
    assert.equal(options.headers.Authorization,'Bearer test-only');
    return options.method==='GET'?Response.json({kind:'receipt'}):new Response(null,{status:204});
  });
  assert.equal(googlePlayProvider({}),undefined);
  assert.deepEqual(await adapter.lookup('fixture/a'),{kind:'receipt'});await adapter.consume('credits_30','fixture/a');
  const base='https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.selluplabs.aiadcast.next/purchases/';
  assert.deepEqual(calls.slice(1),[[base+'productsv2/tokens/fixture%2Fa','GET'],[base+'products/credits_30/tokens/fixture%2Fa:consume','POST']]);
});
