import {readFileSync} from 'node:fs';
import {pricingProposal} from '../src/pricing.ts';
import {estimateUnitCost,estimatePackContribution} from '../server/pricing-economics.mjs';
const assumptions=JSON.parse(readFileSync(new URL('../config/pricing-assumptions.json',import.meta.url),'utf8'));
console.log('# 가격·원가 가정 계산\n');
console.log('실제 청구서/최신 요금 확인 결과가 아닌 계획용 추정. 1 USD = '+assumptions.krwPerUsd+' KRW. 국내 부가세 10%, USD 판매세 별도. 정산액 대비 기여이익률이며 고정비·마케팅·법인세 전.\n');
console.log('| 시나리오 | 승인·차감된 결과당 예상 USD 원가 | 예상 원화 원가 |\n|---|---:|---:|');
for(const [name,scenario] of Object.entries(assumptions.costScenarios)){
 const cost=estimateUnitCost(scenario).usdPerChargedExport;
 console.log(`| ${name} | $${cost.toFixed(4)} | ₩${Math.round(cost*assumptions.krwPerUsd).toLocaleString('en-US')} |`);
}
console.log('\n| 통화 | 수수료 | 팩 | 제작 | 정산액/장 | 원가/장 | 기여이익/장 | 정산액 대비 |\n|---|---:|---:|---|---:|---:|---:|---:|');
for(const currency of ['KRW','USD'])for(const fee of assumptions.storeFeeRates)for(const pack of pricingProposal.packs)for(const kind of ['standard','premium']){
 const result=estimatePackContribution({pack,currency,storeFeeRate:fee,vatRate:currency==='KRW'?assumptions.koreanVatRate:0,krwPerUsd:assumptions.krwPerUsd,creditsPerExport:kind==='standard'?pricingProposal.standardCredits:pricingProposal.premiumCredits,unitCostUsd:estimateUnitCost(assumptions.costScenarios[kind]).usdPerChargedExport});
 const fmt=n=>currency==='KRW'?'₩'+Math.round(n).toLocaleString('en-US'):'$'+n.toFixed(3);
 console.log(`| ${currency} | ${Math.round(fee*100)}% | ${pack.credits} | ${kind} | ${fmt(result.receiptsPerExport)} | ${fmt(result.costPerExport)} | ${fmt(result.contributionPerExport)} | ${(result.contributionShareOfReceipts*100).toFixed(1)}% |`);
}
console.log('\n모든 구매 크레딧을 사용한다고 가정한다. 고급 결과 1장은 3크레딧. 수수료는 세전 판매금액에 적용하는 단순 모델이며 실제 스토어/PG 정산 규칙은 계약으로 확인해야 한다. USD 판매세는 위 표시 가격 외에 별도 계산되어 정산에 영향이 없는 경우의 예시다. 고정 결제 수수료·환불 현금 비용·광고비는 별도 추가한다.');
