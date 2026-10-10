import {readFileSync} from 'node:fs';
import {pricingCatalog} from '../src/pricing.ts';
import {estimateUnitCost,estimatePackContribution,estimateMixedBreakEven} from '../server/pricing-economics.mjs';
const assumptions=JSON.parse(readFileSync(new URL('../config/pricing-assumptions.json',import.meta.url),'utf8'));
const costs=estimateUnitCost(assumptions);
console.log('# 확정 출시 가격·계획 원가 계산\n');
console.log('2026-10-10 · 가격은 사용자 확정, 결제는 미연결. 신규 광고 1개 = 1크레딧. 단순 수정·비율별 저장은 추가 생성 차감 없음.\n');
console.log(`계획 원가 광고당 ${costs.krwPerNewAd}원 ($${costs.usdPerNewAd.toFixed(3)}), 환율 1 USD = ${assumptions.krwPerUsd}원. 실측 원가나 보장 상한이 아니다. 원화 VAT 10% 포함, USD 현지 판매세 별도. 세금·스토어 수수료 차감 후 정산액의 2%를 현금 환불 준비금으로 가정한다.\n`);
console.log('| 통화 | 수수료 가정 | 광고 수 | 판매가 | 팩당 변동원가 | 팩당 현금지출 충당액 | 광고당 현금지출 충당액 |\n|---|---:|---:|---:|---:|---:|---:|');
for(const currency of ['KRW','USD'])for(const fee of assumptions.storeFeeRates)for(const pack of pricingCatalog.packs){
 const result=estimatePackContribution({pack,currency,storeFeeRate:fee,vatRate:currency==='KRW'?assumptions.koreanVatRate:0,krwPerUsd:assumptions.krwPerUsd,unitCostKrw:costs.krwPerNewAd,refundReserveRate:assumptions.refundReserveRateOfNetReceipts});
 const fmt=n=>currency==='KRW'?'₩'+Math.round(n).toLocaleString('en-US'):'$'+n.toFixed(2);
 console.log(`| ${currency} | ${Math.round(fee*100)}% | ${pack.credits} | ${fmt(result.price)} | ${fmt(result.variableCost)} | ${fmt(result.contributionPerPack)} | ${fmt(result.contributionPerAd)} |`);
}
console.log('\n## 월 현금지출 2,200만원을 충당하는 목표\n');
console.log('10개팩 70%·30개팩 30%의 정상팩 구매 비중을 가정한다. 체험팩은 반복 구매 믹스에서 제외하며, 대출 원리금 350만원을 포함한 현금지출 충당을 목표로 한다.\n');
console.log('| 통화 | 수수료 가정 | 평균 결제액 | 결제당 현금지출 충당액 | 월 현금충당 구매건수 |\n|---|---:|---:|---:|---:|');
for(const currency of ['KRW','USD'])for(const fee of assumptions.storeFeeRates){
 const result=estimateMixedBreakEven({packs:pricingCatalog.packs,mix:assumptions.normalPackMix,currency,storeFeeRate:fee,vatRate:currency==='KRW'?assumptions.koreanVatRate:0,krwPerUsd:assumptions.krwPerUsd,unitCostKrw:costs.krwPerNewAd,refundReserveRate:assumptions.refundReserveRateOfNetReceipts,monthlyCashOutflowKrw:assumptions.monthlyCashOutflowKrw});
 const fmt=n=>currency==='KRW'?'₩'+Math.round(n).toLocaleString('en-US'):'$'+n.toFixed(2);
 console.log(`| ${currency} | ${Math.round(fee*100)}% | ${fmt(result.averagePrice)} | ${fmt(result.contributionPerPurchase)} | ${result.breakEvenPurchases?.toLocaleString('en-US')??'도달 불가'} |`);
}
console.log('\n충당액은 변동원가 차감 후 공헌이익이며 순이익이 아니다. 월 2,200만원에는 대출 원리금 350만원이 포함되어 있고 원금/이자 분할이 미확인이다. 따라서 현금충당 기준이며 이 숫자로 회계 영업이익률을 계산하지 않는다. 실제 가입 프로그램·국가·정산·환전 조건은 별도 확인한다. 기본 스토어 결제에 카드 PG 비용을 자동으로 중복 차감하지 않는다. 월 현금지출에 이미 포함한 급여·마케팅을 변동원가에서 다시 빼지 않는다. 모든 구매 크레딧을 사용한다고 가정하며, 미사용 소멸을 수익 근거로 삼지 않는다. 승인 가격은 화면 표시용 카탈로그이고 실제 결제금액·결제통화·제품 ID·구매 영수증은 서버와 스토어로 검증해야 한다.');
