import {ApiFailure} from '../generation-service.mjs';
import {playOrderEvidence} from '../play-order.mjs';

const fail=(code,status)=>{throw new ApiFailure(code,status);};
const base='/api/membership/records';
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const selectOrders=`SELECT o.order_no,o.product,o.ads,o.purchased_at,o.erase_at,o.currency,o.paid_nanos::text AS paid,
 o.refunds,o.checked_at,o.restored,
 (SELECT coalesce(jsonb_agg(w.requested_at ORDER BY w.requested_at),'[]'::jsonb) FROM commerce_withdrawals w WHERE w.order_no=o.order_no) AS refund_requests, (SELECT count(*) FROM commerce_deliveries d WHERE d.order_no=o.order_no) AS delivered,
 (SELECT count(*) FROM commerce_deliveries d WHERE d.order_no=o.order_no AND d.credit_returned_at IS NOT NULL) AS returned
 FROM commerce_orders o`;
const caseColumns='c.case_id,c.category,c.order_no,c.received_at,c.description,c.resolution,c.resolved_at,c.erase_at';
function summary(row) {
 if(!row)return null;
 const remaining=Math.max(0,row.ads-Number(row.delivered)+Number(row.returned));
 const refunded=row.refunds?.reduce((sum,e)=>sum+BigInt(e.nanos),0n);
 const unused=row.paid!==null && !row.restored && refunded!==undefined
  ?BigInt(row.paid)*BigInt(remaining)/BigInt(row.ads)-refunded:null;
 const fullyRefunded=row.refunds?.length>0 && row.paid!==null && refunded===BigInt(row.paid);
 return {...row,remaining:fullyRefunded?0:row.restored?null:remaining,refunded:refunded?.toString()??null,
  estimated:unused===null?null:String(unused>0n?unused:0n)};
}
export class CommerceRecords {
 constructor(db,provider){this.db=db;this.provider=provider;}
 async saveEvidence(orderNo,e) {
  await this.db.prepare(`UPDATE commerce_orders SET currency=?,paid_nanos=?,refunds=?::jsonb,checked_at=now(),
    provider_event_at=?::timestamptz,purchased_at=?::timestamptz,
    next_check_at=CASE WHEN ? THEN NULL WHEN purchased_at>now()-interval '60 days' THEN now()+interval '1 day' ELSE now()+interval '7 days' END,
    erase_at=greatest(erase_at,?::timestamptz+interval '5 years')
    WHERE order_no=? AND (provider_event_at IS NULL OR provider_event_at<=?::timestamptz)`)
   .run(e.currency,e.paid,JSON.stringify(e.refunds),e.lastEvent,e.purchasedAt,e.fullyRefunded,e.lastEvent,orderNo,e.lastEvent);
  if(e.fullyRefunded){
   await this.db.prepare(`UPDATE customer_image_sales s SET revoked_credits=greatest(s.revoked_credits,
     s.credits-10*(SELECT count(*) FROM commerce_deliveries WHERE order_no=l.order_no AND credit_returned_at IS NULL))
     FROM commerce_order_links l WHERE s.purchase_id=l.purchase_key AND l.order_no=?`).run(orderNo);
  }
 }
 async recordSale(receipt,accountId,restored) {
  const number=receipt.orderNo??receipt.purchaseId;
  const at=receipt.evidence?.purchasedAt??receipt.purchasedAt??new Date().toISOString();
  await this.db.transaction(async()=>{
   const prior=await this.db.prepare('SELECT account_id,order_no FROM commerce_order_links WHERE purchase_key=?').get(receipt.purchaseId);
   if(prior && (prior.account_id!==accountId||prior.order_no!==number))fail('PURCHASE_RECORD_CONFLICT',409);
   if(!prior){
    await this.db.prepare(`INSERT INTO commerce_orders(order_no,product,ads,purchased_at,erase_at,restored)
     VALUES(?,?,?,?::timestamptz,?::timestamptz+interval '5 years',?)`).run(number,receipt.product,receipt.credits/10,at,at,restored);
    await this.db.prepare('INSERT INTO commerce_order_links VALUES(?,?,?)').run(number,receipt.purchaseId,accountId);
   }
   if(receipt.evidence)await this.saveEvidence(number,receipt.evidence);
  });
 }
 async capture(accountId,jobId,remainingBeforeDelivery) {
  // Consume the welcome/legacy allowance before paid orders, then the oldest paid order.
  const orders=await this.db.prepare(`SELECT o.order_no,
   greatest(0,o.ads-coalesce(s.revoked_credits,0)/10-(SELECT count(*) FROM commerce_deliveries d WHERE d.order_no=o.order_no
    AND d.credit_returned_at IS NULL)) AS left_ads
   FROM commerce_orders o JOIN commerce_order_links l USING(order_no) LEFT JOIN customer_image_sales s ON s.purchase_id=l.purchase_key
   WHERE l.account_id=? AND o.erase_at>now() ORDER BY o.purchased_at,o.order_no`).all(accountId);
  if(remainingBeforeDelivery>orders.reduce((n,r)=>n+Number(r.left_ads),0))return;
  const order=orders.find(r=>r.left_ads>0);
  if(order){
   await this.db.prepare('INSERT INTO commerce_deliveries(job_key,order_no) VALUES(?,?) ON CONFLICT DO NOTHING').run(jobId,order.order_no);
   await this.db.prepare("UPDATE commerce_orders SET erase_at=greatest(erase_at,now()+interval '5 years') WHERE order_no=?").run(order.order_no);
  }
 }
 async restore(jobId) {
  const row=await this.db.prepare('UPDATE commerce_deliveries SET credit_returned_at=now() WHERE job_key=? AND credit_returned_at IS NULL RETURNING order_no').get(jobId);
  if(row){
   await this.db.prepare("UPDATE commerce_orders SET erase_at=greatest(erase_at,now()+interval '5 years') WHERE order_no=?").run(row.order_no);
   await this.db.prepare(`UPDATE customer_image_sales s SET revoked_credits=least(credits,revoked_credits+10)
    FROM commerce_order_links l JOIN commerce_orders o USING(order_no) WHERE s.purchase_id=l.purchase_key AND l.order_no=?
    AND o.refunds IS NOT NULL AND jsonb_array_length(o.refunds)>0 AND
    (SELECT sum((value->>'nanos')::numeric) FROM jsonb_array_elements(o.refunds))=o.paid_nanos`).run(row.order_no);
  }
 }
 async reconcileDue(){
  if(!this.provider?.order)return;
  const rows=await this.db.prepare(`UPDATE commerce_orders SET next_check_at=now()+interval '1 hour'
   WHERE order_no IN (SELECT order_no FROM commerce_orders WHERE next_check_at<=now() AND erase_at>now()
    ORDER BY next_check_at LIMIT 2 FOR UPDATE SKIP LOCKED) RETURNING order_no,product`).all();
  for(const row of rows){
   try{
    const e=playOrderEvidence(await this.provider.order(row.order_no),row.order_no,row.product);
    await this.db.transaction(()=>this.saveEvidence(row.order_no,e));
   }catch{console.error('Play order reconciliation deferred');}
  }
 }
 async order(number){return summary(await this.db.prepare(selectOrders+' WHERE o.order_no=? AND o.erase_at>now()').get(number));}
 async route(user,method,path,body) {
  const admin=user.role==='admin';
  if(method==='POST' && path===base+'/cases'){
   const {category,description,orderNo,requestId}=body??{};
   if(!['refund','complaint','dispute'].includes(category)||typeof description!=='string'||!description.trim()||
      description.trim().length>800||!uuid.test(requestId??'')||(orderNo!=null && (typeof orderNo!=='string'||orderNo.length>160)))fail('INVALID_CASE',400);
   return this.db.transaction(async()=>{
    if(orderNo && !await this.db.prepare(`SELECT 1 FROM commerce_orders o LEFT JOIN commerce_order_links l USING(order_no)
      WHERE o.order_no=? AND o.erase_at>now() AND (? OR l.account_id=?)`).get(orderNo,admin,user.id))fail('ORDER_NOT_FOUND',404);
    const id='CS-'+requestId;
    const existing=await this.db.prepare(`SELECT c.*,l.account_id FROM protected_complaints c LEFT JOIN complaint_member_links l USING(case_id) WHERE case_id=?`).get(id);
    if(existing){
     if(existing.account_id!==user.id || existing.description!==description.trim() || existing.category!==category || existing.order_no!==(orderNo||null))fail('CASE_CONFLICT',409);
     return {caseId:id};
    }
    await this.db.prepare(`INSERT INTO protected_complaints(case_id,category,order_no,description,received_at,erase_at)
     VALUES(?,?,?,?,now(),now()+interval '3 years')`).run(id,category,orderNo||null,description.trim());
    if(category==='refund'&&orderNo){
     await this.db.prepare('INSERT INTO commerce_withdrawals(case_id,order_no) VALUES(?,?)').run(id,orderNo);
     await this.db.prepare("UPDATE commerce_orders SET erase_at=greatest(erase_at,now()+interval '5 years') WHERE order_no=?").run(orderNo);
    }
    await this.db.prepare('INSERT INTO complaint_member_links VALUES(?,?)').run(id,user.id);
    return {caseId:id};
   });
  }
  if(method==='GET' && path===base+'/mine'){
   const orders=await this.db.prepare(selectOrders+' JOIN commerce_order_links l USING(order_no) WHERE l.account_id=? AND o.erase_at>now() ORDER BY o.purchased_at DESC LIMIT 50').all(user.id);
   const cases=await this.db.prepare('SELECT '+caseColumns+' FROM protected_complaints c JOIN complaint_member_links l USING(case_id) WHERE l.account_id=? AND c.erase_at>now() ORDER BY c.received_at DESC LIMIT 50').all(user.id);
   return {orders:orders.map(summary),cases};
  }
  if(!admin)fail('ADMIN_REQUIRED',403);
  if(method==='POST'&&path===base+'/lookup'){
   const key=body?.key??'';
   if(typeof key!=='string'||key.length>160)fail('INVALID_REFERENCE',400);
   const orders=key?[await this.order(key)].filter(Boolean):(await this.db.prepare(selectOrders+' WHERE o.erase_at>now() ORDER BY o.purchased_at DESC,o.order_no LIMIT 20').all()).map(summary);
   const cases=await this.db.prepare('SELECT '+caseColumns+' FROM protected_complaints c WHERE c.erase_at>now() '+(key?'AND (c.case_id=? OR c.order_no=?) ':'')+'ORDER BY c.received_at DESC,c.case_id LIMIT 30').all(...(key?[key,key]:[]));
   if(!orders.length&&cases[0]?.order_no){const o=await this.order(cases[0].order_no);if(o)orders.push(o);}
   return {orders,cases};
  }
  if(method==='POST'&&path===base+'/resolve'){
   const resolution=body?.resolution?.trim?.();
   if(typeof body?.caseId!=='string'||typeof resolution!=='string'||!resolution||resolution.length>800)fail('INVALID_CASE',400);
   const row=await this.db.prepare(`UPDATE protected_complaints SET resolution=?,resolved_at=now(),erase_at=now()+interval '3 years'
    WHERE case_id=? AND erase_at>now() AND resolution IS NULL AND (category<>'defect' OR NOT EXISTS(SELECT 1 FROM complaint_member_links l WHERE l.case_id=protected_complaints.case_id)) RETURNING case_id`).get(resolution,body.caseId);
   if(!row && !await this.db.prepare('SELECT 1 FROM protected_complaints WHERE case_id=? AND resolution=? AND erase_at>now()').get(body.caseId,resolution))fail('CASE_CLOSED_OR_MISSING',409);
   return {caseId:body.caseId};
  }
  if(method==='POST'&&path===base+'/sync'){
   const o=await this.order(body?.orderNo);
   if(!o)fail('ORDER_NOT_FOUND',404);
   if(!this.provider?.order)fail('PLAY_VERIFICATION_UNAVAILABLE',503);
   const e=playOrderEvidence(await this.provider.order(o.order_no),o.order_no,o.product);
   await this.db.transaction(()=>this.saveEvidence(o.order_no,e));
   return {order:await this.order(o.order_no)};
  }
  fail('NOT_FOUND',404);
 }
}
