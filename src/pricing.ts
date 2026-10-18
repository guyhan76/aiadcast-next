// Owner-approved launch catalog. This is display data, not an executable quote.
// Checkout must use verified store/server product prices and billing country.
export type PricingLanguage = 'ko' | 'en';
export type PricingCurrency = 'KRW' | 'USD';
export const pricingCatalog = {
  version: 'test-credits-v2-2026-10-18', status: 'approved', purchasesEnabled: false,
  standardCredits: 10,
  packs: [
    {id:'credits-v2-30', credits:30, creditsPerGeneration:10, prices:{KRW:9900, USD:null}},
    {id:'credits-v2-100', credits:100, creditsPerGeneration:10, prices:{KRW:29800, USD:null}},
    {id:'credits-v2-180', credits:180, creditsPerGeneration:10, prices:{KRW:48900, USD:null}},
  ],
} as const;
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
