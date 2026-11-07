// Transport-independent, injection-only prototype. No network or credentials here.
import {randomBytes} from 'node:crypto';
import {mkdir,open} from 'node:fs/promises';
import {claimSql,inspectSql,dispatchReceipt} from './connector-ledger.mjs';
import {TRIAL_ID} from './runner.mjs';

// Accept only the observed MCP envelope, never execute or interpret surrounding prose.
export function parseRows(reply){
 if(reply?.isError||reply?.content?.length!==1||reply.content[0].type!=='text')throw Error('INVALID_CONNECTOR_RESPONSE');
 let envelope;try{envelope=JSON.parse(reply.content[0].text);}catch{throw Error('INVALID_CONNECTOR_RESPONSE');}
 if(typeof envelope.result!=='string')throw Error('INVALID_CONNECTOR_RESPONSE');
 const matches=[...envelope.result.matchAll(/<untrusted-data-([a-f0-9-]+)>\s*([\s\S]*?)\s*<\/untrusted-data-\1>/g)];
 if(matches.length!==1)throw Error('INVALID_CONNECTOR_RESPONSE');
 let rows;try{rows=JSON.parse(matches[0][2]);}catch{throw Error('INVALID_CONNECTOR_RESPONSE');}
 if(!Array.isArray(rows)||rows.length!==1||!rows[0]||typeof rows[0]!=='object'||Array.isArray(rows[0]))throw Error('INVALID_CONNECTOR_RESPONSE');
 return rows;
}
export async function consumeLocalOnce(directory){
 await mkdir(directory,{recursive:true,mode:0o700});
 const f=await open(`${directory}/${TRIAL_ID}.dispatch-consumed`,'wx',0o600);
 try{await f.writeFile('Consumed before dispatch. Never delete to retry.\n');await f.sync();}finally{await f.close();}
 const d=await open(directory,'r');try{await d.sync();}finally{await d.close();}
}
// execute must issue separate requests; inspect must observe a committed transaction.
// No settlement is implicit. Caller preserves result/usage then performs reviewed settlement.
export async function connectorOnce({execute,dispatch,consume,hash,now=Date.now}){
 const token=randomBytes(16).toString('hex'),started=now();
 let receipt,inspection;
 try{
  receipt=parseRows(await execute(claimSql(hash,token)));
  // Lost/malformed/replayed claim response stops BEFORE read/recovery.
  if(receipt[0].newly_claimed!==true||receipt[0].nonce!==token||receipt[0].trial_id!==TRIAL_ID)return {status:'stopped'};
  inspection=parseRows(await execute(inspectSql()));
  if(now()-started<0||now()-started>10000||!dispatchReceipt(receipt,{hash,token},inspection))return {status:'stopped'};
  await consume(); // exclusive durable marker; failure permanently stops this invocation
  inspection=parseRows(await execute(inspectSql()));
  if(now()-started<0||now()-started>10000||!dispatchReceipt(receipt,{hash,token},inspection))return {status:'stopped'};
 }catch{return {status:'stopped'};}
 try{return {status:'responded',token,result:await dispatch()};}
 catch{return {status:'uncertain',token};} // Never retry, including definite transport errors.
}
