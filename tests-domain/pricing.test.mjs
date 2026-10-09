import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pricingCurrency,formatPrice,pricingProposal} from '../src/pricing.ts';
import {estimateUnitCost,estimatePackContribution} from '../server/pricing-economics.mjs';
const assumptions=JSON.parse(readFileSync(new URL('../config/pricing-assumptions.json',import.meta.url),'utf8'));
test('pricing proposals use won and cents correctly and cannot claim checkout is enabled',()=>{
 assert.equal(pricingCurrency('ko'),'KRW');assert.equal(pricingCurrency('en'),'USD');
 assert.equal(formatPrice(9900,'KRW','ko'),'₩9,900');assert.equal(formatPrice(799,'USD','en'),'$7.99');
 assert.equal(pricingProposal.purchasesEnabled,false);
 assert.equal(pricingProposal.status,'proposal');
 assert.throws(()=>formatPrice(-1,'USD','en'),/Invalid/);
});
test('retry and uncharged jobs are borne by the business, not omitted from unit cost',()=>{
 const cost=estimateUnitCost(assumptions.costScenarios.standard);
 assert.ok(Math.abs(cost.usdPerChargedExport-.17933333333333334)<1e-10);
 const worse=estimateUnitCost({...assumptions.costScenarios.standard,chargedShareOfJobs:.5});
 assert.ok(worse.usdPerChargedExport>cost.usdPerChargedExport);
 for(const change of [{chargedShareOfJobs:0},{chargedShareOfJobs:1.1},{averageAttemptsPerJob:.9},{outputUsdPerAttempt:-1}])assert.throws(()=>estimateUnitCost({...assumptions.costScenarios.standard,...change}),/Invalid/);
});
test('regional tax and store fees do not double charge VAT or confuse USD cents',()=>{
 const base={pack:pricingProposal.packs[1],currency:'KRW',creditsPerExport:1,unitCostUsd:estimateUnitCost(assumptions.costScenarios.standard).usdPerChargedExport,krwPerUsd:1400,vatRate:.1,storeFeeRate:.15};
 const result=estimatePackContribution(base);
 assert.ok(Math.abs(result.netReceipts-24900/1.1*.85)<1e-8);
 assert.ok(Math.abs(result.contributionPerExport-390.2969696969697)<1e-8);
 const usd=estimatePackContribution({...base,currency:'USD',vatRate:0});
 assert.ok(Math.abs(usd.netReceipts-19.99*.85)<1e-8);
 const highFee=estimatePackContribution({...base,storeFeeRate:.3});
 assert.ok(highFee.contributionPerExport<result.contributionPerExport);
 const loss=estimatePackContribution({...base,unitCostUsd:1});
 assert.ok(loss.contributionPerExport<0);
 assert.throws(()=>estimatePackContribution({...base,currency:'EUR'}),/Unsupported/);
 assert.throws(()=>estimatePackContribution({...base,creditsPerExport:1.5}),/integer/);
});
