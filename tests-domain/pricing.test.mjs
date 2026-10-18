import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pricingCurrency,formatPrice,pricingCatalog,pricingProposal} from '../src/pricing.ts';
import {estimateUnitCost,estimatePackContribution,estimateMixedBreakEven} from '../server/pricing-economics.mjs';
const assumptions=JSON.parse(readFileSync(new URL('../config/pricing-assumptions.json',import.meta.url),'utf8'));
const legacyPacks=[{id:'trial',credits:3,prices:{KRW:6900,USD:499}},{id:'basic',credits:10,prices:{KRW:19900,USD:1499}},{id:'bundle',credits:30,prices:{KRW:49900,USD:3999}}];
const base={pack:legacyPacks[1],currency:'KRW',unitCostKrw:350,krwPerUsd:1400,vatRate:.1,storeFeeRate:.15,refundReserveRate:.02};
test('versioned test catalog uses approved KRW prices and leaves USD unpriced',()=>{
 assert.deepEqual(pricingCatalog.packs.map(p=>[p.credits,p.prices.KRW,p.prices.USD]),[[30,9900,null],[100,29800,null],[180,48900,null]]);
 assert.equal(pricingCatalog.status,'approved');assert.equal(pricingCatalog.purchasesEnabled,false);
 assert.equal(pricingCatalog.standardCredits,10);assert.equal('premiumCredits' in pricingCatalog,false);
 assert.equal(pricingProposal,pricingCatalog);
 assert.equal(formatPrice(6900,'KRW','ko'),'₩6,900');assert.equal(formatPrice(499,'USD','en'),'$4.99');
 assert.throws(()=>formatPrice(-1,'USD','en'),/Invalid/);
});
test('pricing language never determines billing or display currency',()=>{
 assert.equal(pricingCurrency('USD'),'USD');assert.equal(pricingCurrency('KRW'),'KRW');
 assert.equal(pricingCurrency('en'),'KRW');assert.equal(pricingCurrency(null),'KRW');
 assert.equal(formatPrice(19900,'KRW','en'),'₩19,900');assert.equal(formatPrice(1499,'USD','ko'),'US$14.99');
});
test('350 KRW remains an explicit planning budget, not a measured cost ceiling',()=>{
 const cost=estimateUnitCost(assumptions);
 assert.equal(cost.krwPerNewAd,350);assert.equal(cost.usdPerNewAd,.25);assert.equal(cost.measured,false);
 assert.throws(()=>estimateUnitCost({...assumptions,krwPerUsd:0}),/Invalid/);
 assert.throws(()=>estimateUnitCost({...assumptions,plannedUnitCostKrw:-1}),/Invalid/);
});
test('tax, store fees, refund reserve and all purchased ads are reflected once',()=>{
 const result=estimatePackContribution(base);
 assert.ok(Math.abs(result.netReceipts-19900/1.1*.85)<1e-8);
 assert.ok(Math.abs(result.refundReserve-result.netReceipts*.02)<1e-8);
 assert.equal(result.variableCost,3500);
 assert.ok(Math.abs(result.contributionPerPack-11569.72727272727)<1e-8);
 const usd=estimatePackContribution({...base,currency:'USD',vatRate:0});
 assert.ok(Math.abs(usd.netReceipts-14.99*.85)<1e-8);assert.equal(usd.variableCost,2.5);
 assert.ok(estimatePackContribution({...base,storeFeeRate:.3}).contributionPerPack<result.contributionPerPack);
 assert.ok(estimatePackContribution({...base,unitCostKrw:2000}).contributionPerPack<0);
 for(const change of [{currency:'EUR'},{refundReserveRate:1.1},{unitCostKrw:-1},{pack:{credits:1.5,prices:{KRW:6900}}}])assert.throws(()=>estimatePackContribution({...base,...change}));
});
test('cash break-even covers 22 million cash outflow including unsplit debt repayments',()=>{
 const args={...base,packs:legacyPacks,mix:assumptions.normalPackMix,monthlyCashOutflowKrw:assumptions.monthlyCashOutflowKrw};
 const result=estimateMixedBreakEven(args);
 assert.equal(Object.values(assumptions.monthlyCashOutflowBreakdownKrw).reduce((a,b)=>a+b,0),22000000);
 assert.equal(assumptions.loanPrincipalInterestSplitKnown,false);
 assert.equal(result.averagePrice,28900);assert.equal(result.averageAds,16);
 assert.ok(Math.abs(result.contributionPerPurchase-16285.18181818182)<1e-8);
 assert.equal(result.breakEvenPurchases,1351);
 assert.equal(estimateMixedBreakEven({...args,currency:'USD',vatRate:0}).breakEvenPurchases,1067);
 assert.equal(estimateMixedBreakEven({...args,unitCostKrw:2000}).breakEvenPurchases,null);
 assert.throws(()=>estimateMixedBreakEven({...args,mix:{basic:.7}}),/sum/);
 assert.throws(()=>estimateMixedBreakEven({...args,mix:{unknown:1}}),/Unknown/);
});

test('versioned new credits count ten per generation and never invent USD prices',()=>{const p=pricingCatalog.packs[1];const value=estimatePackContribution({...base,pack:p});assert.equal(value.ads,10);assert.equal(value.variableCost,3500);assert.equal(value.price,29800);assert.equal(formatPrice(p.prices.USD,'USD','en'),'Not priced');assert.throws(()=>estimatePackContribution({...base,pack:p,currency:'USD'}),/price/);});
