import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {ApiFailure} from './generation-service.mjs';
import {pricingCatalog} from '../src/pricing.ts';
// Server-owned quote. Never accept a client price, currency, user ID or credit amount.
const packs=Object.fromEntries(pricingCatalog.packs.map(pack=>[pack.id,{credits:pack.credits,amount:pack.prices.KRW}]));
const retiredPacks=new Set(['credits-v2-180','trial','basic','bundle']);
const orderUnit=row=>row.pack.startsWith('credits-v2-')?'credit-v2':'legacy-ticket';
const digest=s=>createHash('sha256').update(s).digest('hex');
const fail=(code,status=400)=>{throw new ApiFailure(code,status);};
const checkoutWindow=30*60_000;
const providerStates=new Set(['READY','IN_PROGRESS','WAITING_FOR_DEPOSIT','CANCELED','EXPIRED','ABORTED','PARTIAL_CANCELED']);
const closedStates=new Set(['CANCELED','EXPIRED','ABORTED']);
export class TestCheckout {
 constructor(store,{provider,clientKey,publicOrigin,creditPurchase,readPurchase,now=()=>Date.now()}={}){
  Object.assign(this,{store,db:store.db,provider,clientKey,origin:publicOrigin,creditPurchase,readPurchase,now});this.pending=new Map();
  this.db.exec(`CREATE TABLE IF NOT EXISTS test_orders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,pack TEXT NOT NULL,credits INTEGER NOT NULL,amount INTEGER NOT NULL,created INTEGER NOT NULL,ticket_hash TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',payment_key TEXT UNIQUE,UNIQUE(user_id,request_id));`);
  const columns=this.db.prepare('PRAGMA table_info(test_orders)').all().map(column=>column.name);
  if(!columns.includes('provider_status'))this.db.exec('ALTER TABLE test_orders ADD COLUMN provider_status TEXT');
  if(!columns.includes('checked_at'))this.db.exec('ALTER TABLE test_orders ADD COLUMN checked_at INTEGER NOT NULL DEFAULT 0');
 }
 available(){return Boolean(this.provider&&this.clientKey);}
 view(order){return {id:order.id,pack:order.pack,unit:orderUnit(order),policy:orderUnit(order)==='credit-v2'?'delivered-2026-10-18':'legacy-accept-v1',credits:order.credits,amount:order.amount,currency:'KRW',state:order.state,providerStatus:order.provider_status??undefined,created:order.created,test:true};}
 create(user,{pack,requestId,agreed}={}){
  if(!this.available())fail('CHECKOUT_UNAVAILABLE',503);
  if((!Object.hasOwn(packs,pack??'')&&!retiredPacks.has(pack))||typeof requestId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)||agreed!==true)fail('INVALID_ORDER');
  const ticket=randomBytes(32).toString('base64url');
  const order=this.store.transaction(()=>{
   let row=this.db.prepare('SELECT * FROM test_orders WHERE user_id=? AND request_id=?').get(user.id,requestId);
   if(row&&row.pack!==pack)fail('ORDER_CONFLICT',409);
   if(row&&row.state!=='pending')return row;
   if(!row){if(retiredPacks.has(pack))fail('SKU_RETIRED',409);if(this.db.prepare('SELECT COUNT(*) n FROM test_orders WHERE user_id=? AND created>?').get(user.id,this.now()-3600_000).n>=10)fail('ORDER_RATE_LIMIT',429);
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
  if(!this.readPurchase)fail('PURCHASE_NOT_VERIFIED',409);
  const result=await this.status({id:row.user_id},row.id);
  if(!result.receipt?.verified)fail('PURCHASE_NOT_VERIFIED',409);
  return result;
 }
 async serialize(id,fn){const previous=this.pending.get(id)??Promise.resolve();const p=previous.catch(()=>{}).then(fn);this.pending.set(id,p);try{return await p;}finally{if(this.pending.get(id)===p)this.pending.delete(id);}}
 async settle(row,payment){
  if(payment.orderId!==row.id||payment.currency!=='KRW'||payment.totalAmount!==row.amount||payment.status!=='DONE'||typeof payment.paymentKey!=='string'||!payment.paymentKey||payment.paymentKey.length>240)fail('PAYMENT_MISMATCH',409);
  if(row.payment_key&&row.payment_key!==payment.paymentKey)fail('PAYMENT_MISMATCH',409);
  this.db.prepare("UPDATE test_orders SET state='verified',payment_key=?,provider_status='DONE',checked_at=? WHERE id=?").run(payment.paymentKey,this.now(),row.id);
  // The ledger is in another SQLite file. Its purchase ID makes replay after a crash safe.
  await this.creditPurchase(row.user_id,{purchaseId:'toss-test:'+row.id,credits:row.credits,unit:orderUnit(row)});
  this.db.prepare("UPDATE test_orders SET state='paid' WHERE id=?").run(row.id);
  return this.paidView({...row,state:'paid',provider_status:'DONE'});
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
   let payment;
   try{payment=await this.provider.lookup(orderId);}
   catch(error){
    if(error.code!=='PAYMENT_NOT_FOUND'&&(error.code!=='PAYMENT_UNCERTAIN'||this.now()-current.created>checkoutWindow))throw error;
   }
   if(payment?.status!=='DONE'&&(closedStates.has(payment?.status)||current.state==='canceled'||this.now()-current.created>checkoutWindow))fail('ORDER_EXPIRED',409);
   if(payment?.status!=='DONE')payment=await this.provider.confirm({orderId,paymentKey,amount:row.amount});
   if(payment.paymentKey!==paymentKey)fail('PAYMENT_MISMATCH',409);
   return this.settle(current,payment);
  });
 }
 async status(user,id,{cached=false}={}){
  const row=this.db.prepare('SELECT * FROM test_orders WHERE id=? AND user_id=?').get(id,user.id);if(!row)fail('ORDER_NOT_FOUND',404);
  if(row.state==='paid')return this.paidView(row);
  if(!this.available())return this.view(row);
  return this.serialize(id,async()=>{
   const fresh=this.db.prepare('SELECT * FROM test_orders WHERE id=?').get(id);
   if(fresh.state==='paid')return this.paidView(fresh);
   if(fresh.state==='canceled'||(cached&&fresh.checked_at>this.now()-15_000))return this.view(fresh);
   let payment,observation;
   try{payment=await this.provider.lookup(id);}
   catch(error){
    if(error.code==='PAYMENT_NOT_FOUND')observation='NOT_FOUND';
    else if(error.code==='PAYMENT_UNCERTAIN')observation='UNAVAILABLE';
    else throw error;
   }
   if(payment?.status==='DONE')return this.settle(fresh,payment);
   if(payment&&(payment.orderId!==id||payment.currency!=='KRW'||payment.totalAmount!==fresh.amount))fail('PAYMENT_MISMATCH',409);
   if(!observation)observation=providerStates.has(payment?.status)?payment.status:'UNAVAILABLE';
   if(observation==='NOT_FOUND'&&this.now()-fresh.created>checkoutWindow)observation='NO_APPROVAL';
   const state=closedStates.has(observation)&&fresh.state==='pending'?'canceled':fresh.state;
   this.db.prepare('UPDATE test_orders SET state=?,provider_status=?,checked_at=? WHERE id=?').run(state,observation,this.now(),id);
   return this.view({...fresh,state,provider_status:observation});
  });
 }
 async refreshOutstanding(user){
  if(!this.available())return;
  const rows=this.db.prepare(`SELECT id FROM test_orders WHERE user_id=? AND state IN ('verified','pending') AND checked_at<=?
   AND id IN (SELECT id FROM test_orders WHERE user_id=? ORDER BY created DESC LIMIT 30)
   ORDER BY checked_at ASC,created DESC LIMIT 3`).all(user.id,this.now()-15_000,user.id);
  const check=row=>this.status(user,row.id,{cached:true});
  const results=await Promise.allSettled(rows.map(check));
  if(results.some(result=>result.status==='rejected'))console.warn('Test checkout order could not be reconciled.');
 }
 async recoverOutstanding(){
  if(!this.available())return;
  const members=this.db.prepare(`SELECT o.user_id AS id FROM test_orders o JOIN users u ON u.id=o.user_id
   WHERE u.disabled=0 AND o.state IN ('verified','pending') GROUP BY o.user_id ORDER BY MIN(o.checked_at),MAX(o.created) DESC LIMIT 4`).all();
  for(const user of members){
   let release;
   try{release=await this.store.membership?.enter(user);await this.refreshOutstanding(user);}
   catch(error){if(error.code!=='AUTH_REQUIRED'&&error.code!=='ACCOUNT_MAINTENANCE')throw error;}
   finally{release?.();}
  }
 }
 history(user){return this.db.prepare('SELECT * FROM test_orders WHERE user_id=? ORDER BY created DESC LIMIT 30').all(user.id).map(row=>this.view(row));}
}
