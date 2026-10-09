// Launch proposal only. Checkout must use verified store/server product prices.
// Advertising copy language, pricing language and billing country are separate.
export type PricingLanguage = 'ko' | 'en';
export type PricingCurrency = 'KRW' | 'USD';
export const pricingProposal = {
  version: 'proposal-2026-10-09', status: 'proposal', purchasesEnabled: false,
  standardCredits: 1, premiumCredits: 3,
  packs: [
    {id:'starter', credits:10, prices:{KRW:9900, USD:799}},
    {id:'growth', credits:30, prices:{KRW:24900, USD:1999}},
    {id:'business', credits:100, prices:{KRW:79900, USD:5999}},
  ],
} as const;
// KRW amounts are won; USD amounts are cents. These are fixed regional proposals,
// not conversions at a live exchange rate and not executable checkout quotes.
export function pricingCurrency(language:PricingLanguage):PricingCurrency {
  return language==='en'?'USD':'KRW';
}
export function formatPrice(amountMinor:number, currency:PricingCurrency, language:PricingLanguage) {
  if(!Number.isFinite(amountMinor)||amountMinor<0)throw Error('Invalid display amount');
  return new Intl.NumberFormat(language==='en'?'en-US':'ko-KR', {
    style:'currency',currency,minimumFractionDigits:currency==='USD'?2:0,
    maximumFractionDigits:currency==='USD'?2:0,
  }).format(amountMinor/(currency==='USD'?100:1));
}
