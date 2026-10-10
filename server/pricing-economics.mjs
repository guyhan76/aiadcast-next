// Planning calculator only. Never use these display estimates to grant credits.
function number(value,name,min=0,max=Infinity){
 if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error(`Invalid ${name}`);
 return value;
}
export function estimateUnitCost({plannedUnitCostKrw,krwPerUsd}){
 const krwPerNewAd=number(plannedUnitCostKrw,'planned unit cost');
 const fx=number(krwPerUsd,'FX',Number.EPSILON);
 return {krwPerNewAd,usdPerNewAd:krwPerNewAd/fx,measured:false};
}
export function estimatePackContribution({pack,currency,unitCostKrw,krwPerUsd,vatRate,storeFeeRate,refundReserveRate=0}){
 if(currency!=='KRW'&&currency!=='USD')throw Error('Unsupported currency');
 const amount=number(pack.prices[currency],'price',1);
 const ads=number(pack.credits,'new ads',1);
 if(!Number.isInteger(amount)||!Number.isInteger(ads))throw Error('Prices and credits must use integer minor units');
 const price=amount/(currency==='USD'?100:1);
 const fx=number(krwPerUsd,'FX',Number.EPSILON);
 const costPerAd=number(unitCostKrw,'unit cost')/(currency==='USD'?fx:1);
 const vat=number(vatRate,'VAT',0,1),fee=number(storeFeeRate,'store fee',0,.99);
 const reserveRate=number(refundReserveRate,'refund reserve',0,1);
 const salesBeforeTax=price/(1+vat);
 const storeFee=salesBeforeTax*fee;
 const netReceipts=salesBeforeTax-storeFee;
 const refundReserve=netReceipts*reserveRate;
 const variableCost=costPerAd*ads;
 const contributionPerPack=netReceipts-refundReserve-variableCost;
 return {price,ads,salesBeforeTax,storeFee,netReceipts,refundReserve,variableCost,costPerAd,contributionPerPack,contributionPerAd:contributionPerPack/ads,contributionShareOfSales:contributionPerPack/salesBeforeTax};
}
export function estimateMixedBreakEven({packs,mix,currency,monthlyCashOutflowKrw,...options}){
 const fixedKrw=number(monthlyCashOutflowKrw,'cash outflow');
 const fx=number(options.krwPerUsd,'FX',Number.EPSILON);
 let shareTotal=0,averagePrice=0,averageAds=0,contributionPerPurchase=0;
 for(const [id,share] of Object.entries(mix)){
  number(share,'pack share',0,1);
  const pack=packs.find(item=>item.id===id);
  if(!pack)throw Error('Unknown pack');
  const estimate=estimatePackContribution({...options,pack,currency});
  shareTotal+=share;averagePrice+=share*estimate.price;averageAds+=share*estimate.ads;contributionPerPurchase+=share*estimate.contributionPerPack;
 }
 if(Math.abs(shareTotal-1)>1e-9)throw Error('Pack shares must sum to one');
 const cashOutflow=fixedKrw/(currency==='USD'?fx:1);
 const breakEvenPurchases=contributionPerPurchase>0?Math.ceil(cashOutflow/contributionPerPurchase):null;
 return {averagePrice,averageAds,contributionPerPurchase,breakEvenPurchases,cashOutflow};
}
