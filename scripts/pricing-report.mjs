import {readFileSync} from 'node:fs';
import {pricingCatalog} from '../src/pricing.ts';
import {estimateUnitCost,estimatePackContribution,estimateMixedBreakEven} from '../server/pricing-economics.mjs';
const assumptions=JSON.parse(readFileSync(new URL('../config/pricing-assumptions.json',import.meta.url),'utf8'));
const costs=estimateUnitCost(assumptions);
console.log('# 확정 출시 가격·계획 원가 계산\n');
console.log('2026-11-17 · 확정된 국내 출시 가격. 신규 가입 첫 광고 1장 무료. 신규 생성 1회 = 10크레딧. USD 가격 미정. 단순 수정·비율별 저장은 추가 생성 차감 없음.\n');
console.log(`계획 원가 광고당 ${costs.krwPerNewAd}원 ($${costs.usdPerNewAd.toFixed(3)}), 환율 1 USD = ${assumptions.krwPerUsd}원. 실측 원가나 보장 상한이 아니다. 원화 VAT 10% 포함, USD 현지 판매세 별도. 세금·스토어 수수료 차감 후 정산액의 2%를 현금 환불 준비금으로 가정한다.\n`);
console.log('| 통화 | 수수료 가정 | 광고 수 | 판매가 | 팩당 변동원가 | 팩당 현금지출 충당액 | 광고당 현금지출 충당액 |\n|---|---:|---:|---:|---:|---:|---:|');
for(const currency of ['KRW'])for(const fee of assumptions.storeFeeRates)for(const pack of pricingCatalog.packs){
 const result=estimatePackContribution({pack,currency,storeFeeRate:fee,vatRate:currency==='KRW'?assumptions.koreanVatRate:0,krwPerUsd:assumptions.krwPerUsd,unitCostKrw:costs.krwPerNewAd,refundReserveRate:assumptions.refundReserveRateOfNetReceipts});
 const fmt=n=>currency==='KRW'?'₩'+Math.round(n).toLocaleString('en-US'):'$'+n.toFixed(2);
 console.log(`| ${currency} | ${Math.round(fee*100)}% | ${result.ads} | ${fmt(result.price)} | ${fmt(result.variableCost)} | ${fmt(result.contributionPerPack)} | ${fmt(result.contributionPerAd)} |`);
}
console.log('\n충당액은 변동원가 차감 후 공헌이익이며 순이익이 아니다. 월 2,200만원에는 대출 원리금 350만원이 포함되어 있고 원금/이자 분할이 미확인이다. 따라서 현금충당 기준이며 이 숫자로 회계 영업이익률을 계산하지 않는다. 실제 가입 프로그램·국가·정산·환전 조건은 별도 확인한다. 기본 스토어 결제에 카드 PG 비용을 자동으로 중복 차감하지 않는다. 월 현금지출에 이미 포함한 급여·마케팅을 변동원가에서 다시 빼지 않는다. 모든 구매 크레딧을 사용한다고 가정하며, 미사용 소멸을 수익 근거로 삼지 않는다. 무료 1장의 생성 원가는 위 유료팩 계산에 포함되지 않았으므로 실제 신규 가입 수에 맞춰 별도로 반영해야 한다. 승인 가격은 화면 표시용 카탈로그이고 실제 결제금액·결제통화·제품 ID·구매 영수증은 서버와 스토어로 검증해야 한다.');
