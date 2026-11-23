// Beta top-up catalog. This is display data, not an executable quote.
// Checkout must use verified store/server product prices and billing country.
export type PricingLanguage = 'ko' | 'en';
export type PricingCurrency = 'KRW' | 'USD';
export const imageCredits = 5;
export const videoCreditsPerSecond = 2;
export const pricingCatalog = {
  version: 'shared-beta-2026-11-23', status: 'beta', purchasesEnabled: false,
  welcomeCredits: 0,
  standardCredits: imageCredits,
  packs: [
    {id:'credits-v3-50', credits:50, creditsPerGeneration:imageCredits, prices:{KRW:18000, USD:null}},
    {id:'credits-v3-100', credits:100, creditsPerGeneration:imageCredits, prices:{KRW:33900, USD:null}},
    {id:'credits-v3-250', credits:250, creditsPerGeneration:imageCredits, prices:{KRW:79900, USD:null}},
    {id:'credits-v3-500', credits:500, creditsPerGeneration:imageCredits, prices:{KRW:149900, USD:null}},
  ],
  plans: [
    {id:'plus', ko:'플러스', en:'Plus', credits:100, monthly:33900, annualMonthly:25900},
    {id:'business', ko:'비즈니스', en:'Business', credits:250, monthly:79900, annualMonthly:61900},
    {id:'ultra', ko:'울트라', en:'Ultra', credits:500, monthly:149900, annualMonthly:119900},
  ],
} as const;
export type BillingPeriod='monthly'|'annual'|'topup';
export const checkoutOffers=[
  ...pricingCatalog.plans.flatMap(plan=>(['monthly','annual'] as const).map(period=>({
    id:'plan-'+plan.id+'-'+period, period, ko:plan.ko, en:plan.en, credits:plan.credits,
    monthlyRate:period==='annual'?plan.annualMonthly:plan.monthly,
    prices:{KRW:period==='annual'?plan.annualMonthly*12:plan.monthly,USD:null}
  }))),
  ...pricingCatalog.packs.map(pack=>({...pack,period:'topup' as const,ko:'크레딧 추가',en:'Top-up',monthlyRate:0}))
];
export function billingAnniversary(start:number,months:number){
  const offset=9*3600_000, local=new Date(start+offset);
  const last=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth()+months+1,0)).getUTCDate();
  local.setUTCDate(Math.min(last,local.getUTCDate()));
  local.setUTCMonth(local.getUTCMonth()+months);
  return local.getTime()-offset;
}
// Compatibility export for integrations written before the prices were approved.
export const pricingProposal = pricingCatalog;
// KRW amounts are won; USD amounts are cents. Language is never a billing input.
export function pricingCurrency(savedCurrency:unknown):PricingCurrency {
  return savedCurrency==='USD'?'USD':'KRW';
}
export function formatPrice(amountMinor:number|null, currency:PricingCurrency, language:PricingLanguage) {
  if(amountMinor===null)return language==='ko'?'가격 미정':'Not priced';
  if(!Number.isFinite(amountMinor)||amountMinor<0)throw Error('Invalid display amount');
  return new Intl.NumberFormat(language==='en'?'en-US':'ko-KR', {
    style:'currency',currency,minimumFractionDigits:currency==='USD'?2:0,
    maximumFractionDigits:currency==='USD'?2:0,
  }).format(amountMinor/(currency==='USD'?100:1));
}
