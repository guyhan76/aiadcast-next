import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {ApiFailure} from './generation-service.mjs';
// Server-owned quote. Never accept a client price, currency, user ID or credit amount.
const packs={trial:{credits:3,amount:6900},basic:{credits:10,amount:19900},bundle:{credits:30,amount:49900}};
const digest=s=>createHash('sha256').update(s).digest('hex');
const fail=(code,status=400)=>{throw new ApiFailure(code,status);};
export class TestCheckout {
 constructor(store,{provider,clientKey,publicOrigin,creditPurchase,now=()=>Date.now()}={}){
  Object.assign(this,{store,db:store.db,provider,clientKey,origin:publicOrigin,creditPurchase,now});this.pending=new Map();
  this.db.exec(`CREATE TABLE IF NOT EXISTS test_orders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,pack TEXT NOT NULL,credits INTEGER NOT NULL,amount INTEGER NOT NULL,created INTEGER NOT NULL,ticket_hash TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',payment_key TEXT UNIQUE,UNIQUE(user_id,request_id));`);
 }
 available(){return Boolean(this.provider&&this.clientKey);}
 view(order){return {id:order.id,pack:order.pack,credits:order.credits,amount:order.amount,currency:'KRW',state:order.state,created:order.created,test:true};}
 create(user,{pack,requestId,agreed}={}){
  if(!this.available())fail('CHECKOUT_UNAVAILABLE',503);
  if(!Object.hasOwn(packs,pack??'')||typeof requestId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)||agreed!==true)fail('INVALID_ORDER');
  const ticket=randomBytes(32).toString('base64url');
  const order=this.store.transaction(()=>{
   let row=this.db.prepare('SELECT * FROM test_orders WHERE user_id=? AND request_id=?').get(user.id,requestId);
   if(row&&row.pack!==pack)fail('ORDER_CONFLICT',409);
   if(row&&row.state!=='pending')return row;
   if(!row){if(this.db.prepare('SELECT COUNT(*) n FROM test_orders WHERE user_id=? AND created>?').get(user.id,this.now()-3600_000).n>=10)fail('ORDER_RATE_LIMIT',429);
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
  return {...this.view(row),clientKey:this.clientKey,customerKey:row.user_id,orderName:`aiadcast ${row.credits}개 광고 테스트 이용권`,successUrl:this.origin+'/?checkout=return',failUrl:this.origin+'/?checkout=return'};
 }
 async serialize(id,fn){const previous=this.pending.get(id)??Promise.resolve();const p=previous.catch(()=>{}).then(fn);this.pending.set(id,p);try{return await p;}finally{if(this.pending.get(id)===p)this.pending.delete(id);}}
 async settle(row,payment){
  if(payment.orderId!==row.id||payment.currency!=='KRW'||payment.totalAmount!==row.amount||payment.status!=='DONE'||typeof payment.paymentKey!=='string'||!payment.paymentKey||payment.paymentKey.length>240)fail('PAYMENT_MISMATCH',409);
  if(row.payment_key&&row.payment_key!==payment.paymentKey)fail('PAYMENT_MISMATCH',409);
  this.db.prepare("UPDATE test_orders SET state='verified',payment_key=? WHERE id=?").run(payment.paymentKey,row.id);
  // The ledger is in another SQLite file. Its purchase ID makes replay after a crash safe.
  await this.creditPurchase(row.user_id,{purchaseId:'toss-test:'+row.id,credits:row.credits});
  this.db.prepare("UPDATE test_orders SET state='paid' WHERE id=?").run(row.id);
  return this.view({...row,state:'paid'});
 }
 async confirm({orderId,ticket,paymentKey,amount}={}){
  if(!this.available())fail('CHECKOUT_UNAVAILABLE',503);
  const row=this.byTicket(orderId,ticket);
  if(!Number.isSafeInteger(amount)||amount!==row.amount||typeof paymentKey!=='string'||!paymentKey||paymentKey.length>240)fail('INVALID_CONFIRMATION');
  return this.serialize(orderId,async()=>{
   const current=this.db.prepare('SELECT * FROM test_orders WHERE id=?').get(orderId);
   if(current.state==='paid'){if(current.payment_key!==paymentKey)fail('PAYMENT_MISMATCH',409);return this.view(current);}
   // Reconcile an earlier confirmation before retrying the same idempotent POST.
   let payment;try{payment=await this.provider.lookup(orderId);}catch(e){if(e.code!=='PAYMENT_NOT_FOUND')throw e;}
   if(payment?.status!=='DONE')payment=await this.provider.confirm({orderId,paymentKey,amount:row.amount});
   if(payment.paymentKey!==paymentKey)fail('PAYMENT_MISMATCH',409);
   return this.settle(current,payment);
  });
 }
 async status(user,id){
  const row=this.db.prepare('SELECT * FROM test_orders WHERE id=? AND user_id=?').get(id,user.id);if(!row)fail('ORDER_NOT_FOUND',404);
  if(row.state==='paid'||!this.available())return this.view(row);
  return this.serialize(id,async()=>{
   const fresh=this.db.prepare('SELECT * FROM test_orders WHERE id=?').get(id);
   if(fresh.state==='paid')return this.view(fresh);
   let payment;try{payment=await this.provider.lookup(id);}catch(e){if(e.code==='PAYMENT_NOT_FOUND')return this.view(row);throw e;}
   if(payment.status==='DONE')return this.settle(fresh,payment);
   return this.view(fresh);
  });
 }
 history(user){return this.db.prepare('SELECT * FROM test_orders WHERE user_id=? ORDER BY created DESC LIMIT 30').all(user.id).map(row=>this.view(row));}
}
