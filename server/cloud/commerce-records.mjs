import {refundPolicyVersion} from '../../src/refund-policy.ts';
import {refundDeadline} from './refund-window.mjs';
import {ApiFailure} from '../generation-service.mjs';
import {playOrderEvidence} from '../play-order.mjs';
import {casePayout} from './case-payout.mjs';
import {randomUUID} from 'node:crypto';

const fail=(code,status)=>{throw new ApiFailure(code,status);};
const base='/api/membership/records';
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const selectOrders=`SELECT o.order_no,o.product,o.ads,o.purchased_at,o.erase_at,o.currency,o.paid_nanos::text AS paid,
 o.refunds,o.checked_at,o.restored,o.refund_policy,o.refund_notice_received_at,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('method',w.refund_method,'amount',w.amount_krw,'at',w.processed_at,
 'recorded',w.recorded_at,'reference',w.refund_reference) ORDER BY w.recorded_at),'[]'::jsonb) FROM commerce_withdrawals w
 WHERE w.order_no=o.order_no AND w.refund_method IS NOT NULL) AS recorded_refunds,
 (SELECT coalesce(jsonb_agg(w.requested_at ORDER BY w.requested_at),'[]'::jsonb) FROM commerce_withdrawals w WHERE w.order_no=o.order_no) AS refund_requests, (SELECT count(*) FROM commerce_deliveries d WHERE d.order_no=o.order_no) AS delivered,
 (SELECT count(*) FROM commerce_deliveries d WHERE d.order_no=o.order_no AND d.credit_returned_at IS NOT NULL) AS returned
 FROM commerce_orders o`;
const caseColumns='c.receipt_no AS case_id,c.category,c.order_no,c.received_at,c.description,c.resolution,c.resolved_at,c.erase_at';
const events=admin=>`(SELECT coalesce(jsonb_agg(jsonb_build_object('at',v.happened_at,'kind',v.kind,'detail',v.detail,
 'actor',${admin?'v.actor_label':'NULL'},'outcome',v.outcome,'amount',v.amount_krw,'reference',v.reference,'processed_at',v.processed_at) ORDER BY v.id),'[]'::jsonb)
 FROM complaint_events v WHERE v.case_id=c.case_id)`;
function requestedAmount(value){
 if(value==null)return null;
 if(!Number.isSafeInteger(value)||value<0||value>999999999)fail('INVALID_CASE_AMOUNT',400);
 return value;
}
function payoutDetails(value){
 if(value==null)return null;
 const {bank,holder,number}=value;
 if(typeof bank!=='string'||!bank.trim()||bank.length>40||typeof holder!=='string'||!holder.trim()||holder.length>60||
    typeof number!=='string'||number.length>30||!/^\d{7,20}$/.test(number.replace(/[ -]/g,'')))fail('INVALID_PAYOUT_DETAILS',400);
 return {bank:bank.trim(),holder:holder.trim(),number:number.replace(/[ -]/g,'')};
}
function summary(row) {
 if(!row)return null;
 const remaining=Math.max(0,row.ads-Number(row.delivered)+Number(row.returned));
 const refunded=row.refunds?.reduce((sum,e)=>sum+BigInt(e.nanos),0n);
 const bankRefunds=row.currency==='KRW'?row.recorded_refunds.filter(e=>e.method==='transfer').reduce((sum,e)=>sum+BigInt(e.amount)*1000000000n,0n):0n;
 const notedOriginal=row.currency==='KRW'?row.recorded_refunds.filter(e=>e.method==='original').reduce((sum,e)=>sum+BigInt(e.amount)*1000000000n,0n):0n;
 const knownOriginal=refunded===undefined?null:(refunded>notedOriginal?refunded:notedOriginal);
 const unused=row.paid!==null && !row.restored && knownOriginal!==null
  ?BigInt(row.paid)*BigInt(remaining)/BigInt(row.ads)-knownOriginal-bankRefunds:null;
 const fullyRefunded=row.refunds?.length>0 && row.paid!==null && refunded===BigInt(row.paid);
 const deadline=row.refund_policy===refundPolicyVersion&&row.refund_notice_received_at
  ?refundDeadline(Math.max(new Date(row.purchased_at).getTime(),new Date(row.refund_notice_received_at).getTime())):null;
 return {...row,refund_deadline:deadline,remaining:fullyRefunded?0:row.restored?null:remaining,refunded:refunded?.toString()??null,
  estimated:unused===null?null:String(unused>0n?unused:0n)};
}
export class CommerceRecords {
 constructor(db,provider,now=Date.now){this.now=now;this.db=db;this.provider=provider;this.configurePayout();}
 configurePayout(key){this.payout=casePayout(key);}
 async cases(admin,userId,key,receiptOnly=false){
  const requester=admin?`,u.id AS member_id,u.label AS member_name,e.email AS member_email,
   (SELECT count(*) FROM commerce_order_links ol WHERE ol.account_id=u.id) AS member_orders,
   (SELECT count(*) FROM test_orders t WHERE t.user_id=u.id AND t.state='paid') AS test_purchases`:'';
  const condition=admin?(key?(receiptOnly?' AND (c.receipt_no=? OR c.case_id=?)':' AND (c.receipt_no=? OR c.case_id=? OR c.order_no=?)'):''):' AND l.account_id=?';
  const args=admin?(key?(receiptOnly?[key,key]:[key,key,key]):[]):[userId];
  const cases=await this.db.prepare(`SELECT ${caseColumns},c.refund_quote,c.bank_requested,c.requested_krw,c.payout_bank,c.payout_last4,${events(admin)} AS events ${requester}
   FROM protected_complaints c LEFT JOIN complaint_member_links l USING(case_id)
   ${admin?'LEFT JOIN users u ON u.id=l.account_id AND u.disabled=0 LEFT JOIN email_identities e ON e.user_id=u.id':''}
   WHERE c.erase_at>now()${condition} ORDER BY c.received_at DESC,c.case_id LIMIT ${admin?30:50}`).all(...args);
  for(const c of cases){
   const account=admin?c.member_id:userId;
   if(c.category==='refund'&&!c.resolution&&!c.refund_quote&&account){
    c.balance_review=await this.refundBalance(account,c.received_at,c.order_no);
   }
  }
  return cases;
 }
 async refundBalance(accountId, before=null, onlyOrder=null,reason='change'){
  const rows=await this.db.prepare(selectOrders+` JOIN commerce_order_links l USING(order_no)
   WHERE l.account_id=? AND o.erase_at>now() AND (?::timestamptz IS NULL OR o.purchased_at<=?::timestamptz)
    AND (?::text IS NULL OR o.order_no=?) ORDER BY o.purchased_at,o.order_no`).all(accountId,before,before,onlyOrder,onlyOrder);
  const items=[],expired=[];
  const requestedAt=before?new Date(before).getTime():this.now();
  for(const row of rows){
   const o=summary(row);
   if(o.remaining===0||o.estimated==='0')continue;
   if(reason==='change'&&o.refund_deadline&&requestedAt>Date.parse(o.refund_deadline)){
    expired.push({orderNo:o.order_no,deadline:o.refund_deadline});continue;
   }
   const calendarNeedsReview=o.refund_policy===refundPolicyVersion&&o.refund_notice_received_at&&!o.refund_deadline;
   const amount=!calendarNeedsReview&&o.currency==='KRW'&&o.estimated!==null?Number(BigInt(o.estimated)/1000000000n):null;
   if(amount!==0)items.push({orderNo:o.order_no,amountKrw:amount});
  }
  return {items,paidOrders:rows.length,...(expired.length?{expired}:{}),...(reason==='exception'?{reason}:{}),krw:reason==='exception'||items.some(i=>i.amountKrw===null)?null:items.reduce((sum,i)=>sum+i.amountKrw,0)};
 }
 async boundOrder(orderNo,accountId){
  if(orderNo&&!await this.db.prepare(`SELECT 1 FROM commerce_orders o JOIN commerce_order_links l USING(order_no)
   WHERE o.order_no=? AND o.erase_at>now() AND l.account_id=?`).get(orderNo,accountId))fail('ORDER_NOT_FOUND',404);
 }
 async linkRefund(id,orderNo){
  await this.db.prepare('INSERT INTO commerce_withdrawals(case_id,order_no) VALUES(?,?) ON CONFLICT DO NOTHING').run(id,orderNo);
  await this.db.prepare("UPDATE commerce_orders SET erase_at=greatest(erase_at,now()+interval '5 years') WHERE order_no=?").run(orderNo);
 }
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
    await this.db.prepare(`INSERT INTO commerce_orders(order_no,product,ads,purchased_at,erase_at,restored,refund_policy)
     VALUES(?,?,?,?::timestamptz,?::timestamptz+interval '5 years',?,?)`).run(number,receipt.product,receipt.credits/10,at,at,restored,!restored&&receipt.refundPolicy===refundPolicyVersion?refundPolicyVersion:null);
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
  if(method==='POST'&&path===base+'/receipt-seen'){
   const number=body?.orderNo;
   if(typeof number!=='string'||!number||number.length>160)fail('INVALID_REFERENCE',400);
   const row=await this.db.prepare(`UPDATE commerce_orders o SET refund_notice_received_at=coalesce(o.refund_notice_received_at,now())
    FROM commerce_order_links l WHERE l.order_no=o.order_no AND l.account_id=? AND o.order_no=? AND o.refund_policy=?
    AND o.erase_at>now() RETURNING o.refund_notice_received_at,o.purchased_at`).get(user.id,number,refundPolicyVersion);
   if(!row)fail('ORDER_NOT_FOUND',404);
   return {deadline:refundDeadline(Math.max(new Date(row.purchased_at).getTime(),new Date(row.refund_notice_received_at).getTime()))};
  }
  if(method==='POST' && path===base+'/cases'){
   const {category,description,orderNo,requestId,refundReason='change'}=body??{};
   if(!['change','exception'].includes(refundReason)||category!=='refund'&&body?.refundReason!=null)fail('INVALID_CASE',400);
   if(!['refund','complaint','dispute'].includes(category)||typeof description!=='string'||!description.trim()||
      description.trim().length>800||!uuid.test(requestId??'')||(orderNo!=null && (typeof orderNo!=='string'||orderNo.length>160)))fail('INVALID_CASE',400);
   return this.db.transaction(async()=>{
    if(category==='refund'&&body.balanceRefund===true)await this.db.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').get(user.id);
    await this.boundOrder(orderNo,user.id);
    const bank=payoutDetails(body.payout),amount=requestedAmount(body.requestedKrw);
    if(category!=='refund'&&(bank||amount!==null))fail('INVALID_CASE',400);
    const id='CS-'+requestId;
    const existing=await this.db.prepare(`SELECT c.*,l.account_id FROM protected_complaints c LEFT JOIN complaint_member_links l USING(case_id) WHERE case_id=?`).get(id);
    if(existing){
     const reasonChanged=body.balanceRefund===true&&(existing.refund_quote?.reason??'change')!==refundReason;
     if(reasonChanged || existing.account_id!==user.id || Boolean(existing.refund_quote)!==(body.balanceRefund===true) || existing.description!==description.trim() || existing.category!==category || (orderNo&&existing.order_no!==orderNo))fail('CASE_CONFLICT',409);
     return {caseId:existing.receipt_no};
    }
    const assessment=category==='refund'?await this.refundBalance(user.id,null,orderNo,refundReason):null;
    if(assessment?.expired?.length&&!assessment.items.length)fail('REFUND_WINDOW_ENDED',409);
    const quote=body.balanceRefund===true?assessment:null;
    if(quote&&(orderNo||bank||amount!==null))fail('INVALID_CASE',400);
    if(quote){
     const duplicate=await this.db.prepare(`SELECT c.receipt_no FROM protected_complaints c JOIN complaint_member_links l USING(case_id)
      WHERE l.account_id=? AND c.category='refund' AND c.resolution IS NULL AND c.erase_at>now()
       AND c.description=? AND c.refund_quote=?::jsonb ORDER BY c.received_at DESC LIMIT 1`).get(user.id,description.trim(),JSON.stringify(quote));
     if(duplicate)return {caseId:duplicate.receipt_no};
    }
    const linked=quote?(quote.items.length===1?quote.items[0].orderNo:null):orderNo;
    const receipt=await this.db.prepare(`INSERT INTO protected_complaints(case_id,category,order_no,description,received_at,erase_at,requested_krw,payout_bank,payout_last4,payout_secret,refund_quote)
     VALUES(?,?,?,?,now(),now()+interval '3 years',?,?,?,?,?::jsonb) RETURNING receipt_no`).get(id,category,linked||null,description.trim(),quote?quote.krw:amount,bank?.bank??null,bank?.number.slice(-4)??null,bank?this.payout.seal(id,bank):null,quote?JSON.stringify(quote):null);
    if(quote){for(const item of quote.items)await this.linkRefund(id,item.orderNo);}
    else if(category==='refund'&&orderNo)await this.linkRefund(id,orderNo);
    await this.db.prepare('INSERT INTO complaint_member_links VALUES(?,?)').run(id,user.id);
    return {caseId:receipt.receipt_no};
   });
  }
  if(method==='GET' && path===base+'/mine'){
   const orders=await this.db.prepare(selectOrders+' JOIN commerce_order_links l USING(order_no) WHERE l.account_id=? AND o.erase_at>now() ORDER BY o.purchased_at DESC LIMIT 50').all(user.id);
   const cases=await this.cases(false,user.id);
   return {orders:orders.map(summary),cases,refundBalance:await this.refundBalance(user.id)};
  }
  if(method==='POST'&&path===base+'/details'){
   if(!uuid.test(body?.requestId??''))fail('INVALID_CASE',400);
   return this.db.transaction(async()=>{
    const row=await this.db.prepare(`SELECT c.* FROM protected_complaints c JOIN complaint_member_links l USING(case_id)
     WHERE receipt_no=? AND l.account_id=? AND category='refund' AND erase_at>now() FOR UPDATE OF c`).get(body.caseId,user.id);
    if(!row)fail('CASE_NOT_FOUND',404);
    if(await this.db.prepare('SELECT 1 FROM complaint_events WHERE case_id=? AND request_id=?').get(row.case_id,body.requestId))return {saved:true};
    if(row.resolution)fail('CASE_CLOSED_OR_MISSING',409);
    const orderNo=body.orderNo||row.order_no,bank=payoutDetails(body.payout),amount=requestedAmount(body.requestedKrw)??row.requested_krw;
    if(row.refund_quote&&(body.orderNo||body.requestedKrw!=null))fail('FIXED_REFUND_QUOTE',400);
    if(row.refund_quote&&bank&&!row.bank_requested&&!row.payout_last4)fail('BANK_NOT_REQUESTED',400);
    await this.boundOrder(orderNo,user.id);
    if(row.order_no&&orderNo!==row.order_no)fail('ORDER_ALREADY_LINKED',409);
    if(!bank&&amount===row.requested_krw&&orderNo===row.order_no)fail('NO_CASE_CHANGE',400);
    if(orderNo&&!row.order_no)await this.linkRefund(row.case_id,orderNo);
    await this.db.prepare(`UPDATE protected_complaints SET order_no=?,requested_krw=?,payout_bank=coalesce(?,payout_bank),
     payout_last4=coalesce(?,payout_last4),payout_secret=coalesce(?,payout_secret) WHERE case_id=?`)
     .run(orderNo,amount,bank?.bank??null,bank?.number.slice(-4)??null,bank?this.payout.seal(row.case_id,bank):null,row.case_id);
    const changes=[orderNo!==row.order_no?'관련 구매 연결':null,amount!==row.requested_krw?'요청 금액 '+amount.toLocaleString('ko-KR')+'원':null,bank?'환불계좌 '+bank.bank+' 끝 4자리 '+bank.number.slice(-4):null].filter(Boolean);
    await this.db.prepare("INSERT INTO complaint_events(case_id,request_id,kind,detail) VALUES(?,?,'member',?)").run(row.case_id,body.requestId,changes.join(' · ')+' 보완');
    return {saved:true};
   });
  }
  if(!admin)fail('ADMIN_REQUIRED',403);
  if(method==='POST'&&path===base+'/lookup'){
   const key=body?.key??'';
   if(typeof key!=='string'||key.length>160)fail('INVALID_REFERENCE',400);
   const receiptOnly=body?.by==='receipt';
   const cases=await this.cases(true,null,key,receiptOnly);
   const orders=key?(receiptOnly?[]:[await this.order(key)].filter(Boolean)):(await this.db.prepare(selectOrders+' WHERE o.erase_at>now() ORDER BY o.purchased_at DESC,o.order_no LIMIT 20').all()).map(summary);
   for(const number of new Set(cases.flatMap(c=>c.refund_quote?.items.map(i=>i.orderNo)??[c.order_no]).filter(Boolean))){
    if(!orders.some(o=>o.order_no===number)){const order=await this.order(number);if(order)orders.push(order);}
   }
   return {orders,cases};
  }
  if(method==='POST'&&path===base+'/payout'){
   return this.db.transaction(async()=>{
    const row=await this.db.prepare('SELECT case_id,receipt_no,payout_secret FROM protected_complaints WHERE receipt_no=? AND resolution IS NULL AND erase_at>now() FOR UPDATE').get(body?.caseId);
    if(!row?.payout_secret)fail('PAYOUT_NOT_AVAILABLE',404);
    const bank=this.payout.open(row.case_id,row.payout_secret);
    await this.db.prepare('INSERT INTO admin_audit VALUES(?,?,?,?,?,?)').run(randomUUID(),user.id,'case_payout_view',null,JSON.stringify({receipt:row.receipt_no}),Date.now());
    return bank;
   });
  }
  if(method==='POST'&&[base+'/note',base+'/resolve'].includes(path)){
   const resolution=body?.resolution?.trim?.();
   if(typeof body?.caseId!=='string'||typeof resolution!=='string'||!resolution||resolution.length>800)fail('INVALID_CASE',400);
   const closing=path===base+'/resolve',kind=closing?'closed':'review',requestId=body.requestId??(closing?'final':'');
   if(requestId!=='final'&&!uuid.test(requestId)||!closing&&requestId==='final')fail('INVALID_CASE',400);
   const outcome=body.outcome??'reply',amount=requestedAmount(body.amountKrw),ref=typeof body.reference==='string'?body.reference.trim():'';
   const paid=['original','transfer'].includes(outcome);
   if(!['reply','original','transfer','declined'].includes(outcome)||ref.length>100||(paid&&(!closing||!amount||!ref))||(!paid&&(amount!==null||ref)))fail('INVALID_REFUND_RESULT',400);
   const processed=body.processedAt;
   if(processed!=null&&(!paid||typeof processed!=='string'||!Number.isFinite(Date.parse(processed))||Date.parse(processed)>Date.now()+60000))fail('INVALID_REFUND_RESULT',400);
   return this.db.transaction(async()=>{
    const row=await this.db.prepare(`SELECT c.* FROM protected_complaints c WHERE (case_id=? OR receipt_no=?) AND erase_at>now()
     AND (category<>'defect' OR NOT EXISTS(SELECT 1 FROM complaint_member_links l WHERE l.case_id=c.case_id)) FOR UPDATE`).get(body.caseId,body.caseId);
    if(!row||row.category!=='refund'&&outcome!=='reply')fail('CASE_CLOSED_OR_MISSING',409);
    const old=await this.db.prepare('SELECT * FROM complaint_events WHERE case_id=? AND request_id=?').get(row.case_id,requestId);
    if(old){
     if(old.kind!==kind||old.detail!==resolution||old.outcome!==outcome||old.amount_krw!==amount||(old.reference??'')!==ref||
        (processed&&new Date(old.processed_at).getTime()!==Date.parse(processed)))fail('CASE_CONFLICT',409);
     return {caseId:row.receipt_no};
    }
    if(row.resolution)fail('CASE_CLOSED_OR_MISSING',409);
    if(!closing&&body.requestBank===true){
     if(row.category!=='refund')fail('INVALID_CASE',400);
     await this.db.prepare('UPDATE protected_complaints SET bank_requested=true WHERE case_id=?').run(row.case_id);
    }
    const numbers=row.refund_quote?.items.map(i=>i.orderNo)??(row.order_no?[row.order_no]:[]);
    let amounts=[];
    if(paid&&numbers.length>1){
     amounts=body.allocations;
     if(!Array.isArray(amounts)||amounts.length!==numbers.length||
      new Set(amounts.map(i=>i?.orderNo)).size!==numbers.length||
      amounts.some(i=>!numbers.includes(i?.orderNo)||!Number.isSafeInteger(i.amountKrw)||i.amountKrw<0)||
      amounts.reduce((n,i)=>n+i.amountKrw,0)!==amount)fail('INVALID_REFUND_ALLOCATION',400);
    }else if(paid&&numbers.length===1){amounts=[{orderNo:numbers[0],amountKrw:amount}];}
    for(const part of amounts.filter(i=>i.amountKrw>0)){
     await this.db.prepare(`UPDATE commerce_withdrawals SET refund_method=?,amount_krw=?,processed_at=?::timestamptz,
      recorded_at=now(),refund_reference=? WHERE case_id=? AND order_no=?`).run(outcome,part.amountKrw,processed??null,ref,row.case_id,part.orderNo);
     await this.db.prepare("UPDATE commerce_orders SET erase_at=greatest(erase_at,now()+interval '5 years') WHERE order_no=?").run(part.orderNo);
    }
    await this.db.prepare(`INSERT INTO complaint_events(case_id,request_id,kind,detail,actor_label,outcome,amount_krw,reference,processed_at)
     VALUES(?,?,?,?,?,?,?,?,?::timestamptz)`).run(row.case_id,requestId,kind,resolution,user.label||'관리자',outcome,amount,ref||null,processed??null);
    if(closing)await this.db.prepare("UPDATE protected_complaints SET resolution=?,resolved_at=now(),erase_at=now()+interval '3 years',payout_secret=NULL WHERE case_id=?").run(resolution,row.case_id);
    return {caseId:row.receipt_no};
   });
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
