// Keep only transaction evidence. The publisher response also contains a token and buyer address.
const billion=1_000_000_000n;
function amount(money,currency) {
 if(money?.currencyCode!==currency || !/^\d{1,10}$/.test(String(money.units??0)) ||
    !Number.isInteger(money.nanos??0) || (money.nanos??0)<0 || (money.nanos??0)>=1e9)throw Error('INVALID_PLAY_AMOUNT');
 return BigInt(money.units??0)*billion+BigInt(money.nanos??0);
}
function date(value) {
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw Error('INVALID_PLAY_EVENT_TIME');
 return new Date(value).toISOString();
}
export function playOrderEvidence(order,orderNo,product,token) {
 if(order?.orderId!==orderNo || (token!==undefined && order.purchaseToken!==token) ||
   order.lineItems?.length!==1 || order.lineItems[0].productId!==product ||
   !['PROCESSED','PENDING_REFUND','PARTIALLY_REFUNDED','REFUNDED'].includes(order.state))throw Error('INVALID_PLAY_ORDER');
 const currency=order.total?.currencyCode;
 if(!/^[A-Z]{3}$/.test(currency??''))throw Error('INVALID_PLAY_CURRENCY');
 const paid=amount(order.total,currency), history=order.orderHistory??{};
 const refunds=(history.partialRefundEvents??[]).filter(e=>e.state==='PROCESSED_SUCCESSFULLY')
  .map(e=>({at:date(e.processTime),nanos:String(amount(e.refundDetails?.total,currency))}));
 let refunded=refunds.reduce((s,e)=>s+BigInt(e.nanos),0n);
 if(history.refundEvent){
  const e=history.refundEvent,final=amount(e.refundDetails?.total,currency);
  // A full-refund event may describe the remaining payment or the full order total.
  const remainder=final===paid?paid-refunded:final;
  if(remainder<0n)throw Error('INVALID_PLAY_REFUND');
  refunds.push({at:date(e.eventTime),nanos:String(remainder)});refunded+=remainder;
 }
 if(refunded>paid || (order.state==='REFUNDED'&&(!history.refundEvent||refunded!==paid)) ||
    (order.state==='PARTIALLY_REFUNDED'&&!refunds.length))throw Error('INCOMPLETE_PLAY_HISTORY');
 return {currency,paid:String(paid),refunds,purchasedAt:date(order.createTime),
  lastEvent:date(order.lastEventTime??order.createTime),fullyRefunded:order.state==='REFUNDED'};
}
