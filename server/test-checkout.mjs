import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {ApiFailure} from './generation-service.mjs';
// Server-owned quote. Never accept a client price, currency, user ID or credit amount.
const packs={'credits-v2-30':{credits:30,amount:9900},'credits-v2-100':{credits:100,amount:29800},'credits-v2-180':{credits:180,amount:48900},trial:{credits:3,amount:6900},basic:{credits:10,amount:19900},bundle:{credits:30,amount:49900}};
const orderUnit=row=>row.pack.startsWith('credits-v2-')?'credit-v2':'legacy-ticket';
const digest=s=>createHash('sha256').update(s).digest('hex');
const fail=(code,status=400)=>{throw new ApiFailure(code,status);};
export class TestCheckout {
 constructor(store,{provider,clientKey,publicOrigin,creditPurchase,readPurchase,now=()=>Date.now()}={}){
  Object.assign(this,{store,db:store.db,provider,clientKey,origin:publicOrigin,creditPurchase,readPurchase,now});this.pending=new Map();
  this.db.exec(`CREATE TABLE IF NOT EXISTS test_orders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,pack TEXT NOT NULL,credits INTEGER NOT NULL,amount INTEGER NOT NULL,created INTEGER NOT NULL,ticket_hash TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',payment_key TEXT UNIQUE,UNIQUE(user_id,request_id));`);
 }
 available(){return Boolean(this.provider&&this.clientKey);}
 view(order){return {id:order.id,pack:order.pack,unit:orderUnit(order),policy:orderUnit(order)==='credit-v2'?'delivered-2026-10-18':'legacy-accept-v1',credits:order.credits,amount:order.amount,currency:'KRW',state:order.state,created:order.created,test:true};}
 create(user,{pack,requestId,agreed}={}){
  if(!this.available())fail('CHECKOUT_UNAVAILABLE',503);
  if(!Object.hasOwn(packs,pack??'')||typeof requestId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)||agreed!==true)fail('INVALID_ORDER');
  const ticket=randomBytes(32).toString('base64url');
  const order=this.store.transaction(()=>{
   let row=this.db.prepare('SELECT * FROM test_orders WHERE user_id=? AND request_id=?').get(user.id,requestId);
   if(row&&row.pack!==pack)fail('ORDER_CONFLICT',409);
   if(row&&row.state!=='pending')return row;
   if(!row){if(!pack.startsWith('credits-v2-'))fail('SKU_RETIRED',409);if(this.db.prepare('SELECT COUNT(*) n FROM test_orders WHERE user_id=? AND created>?').get(user.id,this.now()-3600_000).n>=10)fail('ORDER_RATE_LIMIT',429);
    const id='ad_'+randomUUID();this.db.prepare('INSERT INTO test_orders(id,user_id,request_id,pack,credits,amount,created,ticket_hash) VALUES(?,?,?,?,?,?,?,?)').run(id,user.id,requestId,pack,packs[pack].credits,packs[pack].amount,this.now(),digest(ticket));row=this.db.prepare('SELECT * FROM test_orders WHERE id=?').get(id);
   }else this.db.prepare('UPDATE test_orders SET ticket_hash=? WHERE id=?').run(digest(ticket),row.id);
   return row;
  });
  return {...this.view(order),...(order.state==='pending'?{checkoutUrl:this.origin+'/#pay?orderId='+order.id+'&ticket='+ticket}:{})};
 }
 byTicket(id,ticket){
  if(typeof id!=='string'||typeof ticket!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(ticket))fail('ORDER_NOT_FOUND',404);
  const row=this.db.prepare('SELECT * FROM test_orders WHERE id=? AND ticket_hash=?').get(id,digest(ticket));
  if(!row)fail('ORDER_NOT_FOUND',404);
  if(!this.db.prepare('SELECT id FROM users WHERE id=? AND disabled=0').get(row.user_id))fail('AUTH_REQUIRED',401);
  return row;
 }
 launch({orderId,ticket}={}){
  if(!this.available())fail('CHECKOUT_UNAVAILABLE',503);
  const row=this.byTicket(orderId,ticket);
  if(row.state!=='pending'||this.now()-row.created>30*60_000)fail('ORDER_EXPIRED',409);
  return {...this.view(row),clientKey:this.clientKey,customerKey:row.user_id,orderName:`aiadcast ${row.credits}${orderUnit(row)==='credit-v2'?' 크레딧':'개 광고 이용권'} · 테스트`,successUrl:this.origin+'/?checkout=return',failUrl:this.origin+'/?checkout=return'};
 }
 async paidView(row){
  if(row.state!=='paid'||!this.readPurchase)return this.view(row);
  const receipt=await this.readPurchase(row.user_id,{purchaseId:'toss-test:'+row.id,credits:row.credits,unit:orderUnit(row)});
  if(receipt.grantedCredits!==row.credits||!Number.isSafeInteger(receipt.balance)||receipt.balance<0)fail('PURCHASE_NOT_VERIFIED',409);
  return {...this.view(row),receipt:{...receipt,verified:true}};
 }
 async receipt({orderId,ticket}={}){
  const row=this.byTicket(orderId,ticket);
  if(this.now()-row.created>86400000)fail('ORDER_EXPIRED',409);
  if(row.state!=='paid'||!this.readPurchase)fail('PURCHASE_NOT_VERIFIED',409);
  return this.paidView(row);
 }
 async serialize(id,fn){const previous=this.pending.get(id)??Promise.resolve();const p=previous.catch(()=>{}).then(fn);this.pending.set(id,p);try{return await p;}finally{if(this.pending.get(id)===p)this.pending.delete(id);}}
 async settle(row,payment){
  if(payment.orderId!==row.id||payment.currency!=='KRW'||payment.totalAmount!==row.amount||payment.status!=='DONE'||typeof payment.paymentKey!=='string'||!payment.paymentKey||payment.paymentKey.length>240)fail('PAYMENT_MISMATCH',409);
  if(row.payment_key&&row.payment_key!==payment.paymentKey)fail('PAYMENT_MISMATCH',409);
  this.db.prepare("UPDATE test_orders SET state='verified',payment_key=? WHERE id=?").run(payment.paymentKey,row.id);
  // The ledger is in another SQLite file. Its purchase ID makes replay after a crash safe.
  await this.creditPurchase(row.user_id,{purchaseId:'toss-test:'+row.id,credits:row.credits,unit:orderUnit(row)});
  this.db.prepare("UPDATE test_orders SET state='paid' WHERE id=?").run(row.id);
  return this.paidView({...row,state:'paid'});
 }
 async confirm({orderId,ticket,paymentKey,amount}={}){
  if(!this.available())fail('CHECKOUT_UNAVAILABLE',503);
  const row=this.byTicket(orderId,ticket);
  if(this.now()-row.created>86400000)fail('ORDER_EXPIRED',409);
  if(!Number.isSafeInteger(amount)||amount!==row.amount||typeof paymentKey!=='string'||!paymentKey||paymentKey.length>240)fail('INVALID_CONFIRMATION');
  return this.serialize(orderId,async()=>{
   const current=this.db.prepare('SELECT * FROM test_orders WHERE id=?').get(orderId);
   if(current.state==='paid'){if(current.payment_key!==paymentKey)fail('PAYMENT_MISMATCH',409);return this.paidView(current);}
   // Reconcile an earlier confirmation before retrying the same idempotent POST.
   let payment;try{payment=await this.provider.lookup(orderId);}catch(e){if(e.code!=='PAYMENT_NOT_FOUND')throw e;}
   if(payment?.status!=='DONE'&&(current.state==='canceled'||this.now()-current.created>30*60_000))fail('ORDER_EXPIRED',409);
   if(payment?.status!=='DONE')payment=await this.provider.confirm({orderId,paymentKey,amount:row.amount});
   if(payment.paymentKey!==paymentKey)fail('PAYMENT_MISMATCH',409);
   return this.settle(current,payment);
  });
 }
 async status(user,id){
  const row=this.db.prepare('SELECT * FROM test_orders WHERE id=? AND user_id=?').get(id,user.id);if(!row)fail('ORDER_NOT_FOUND',404);
  if(row.state==='paid')return this.paidView(row);
  if(!this.available())return this.view(row);
  return this.serialize(id,async()=>{
   const fresh=this.db.prepare('SELECT * FROM test_orders WHERE id=?').get(id);
   if(fresh.state==='paid')return this.paidView(fresh);
   let payment;try{payment=await this.provider.lookup(id);}catch(e){if(e.code==='PAYMENT_NOT_FOUND')return this.view(row);throw e;}
   if(payment.status==='DONE')return this.settle(fresh,payment);
   return this.view(fresh);
  });
 }
 history(user){return this.db.prepare('SELECT * FROM test_orders WHERE user_id=? ORDER BY created DESC LIMIT 30').all(user.id).map(row=>this.view(row));}
}
