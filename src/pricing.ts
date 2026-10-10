// Owner-approved launch catalog. This is display data, not an executable quote.
// Checkout must use verified store/server product prices and billing country.
export type PricingLanguage = 'ko' | 'en';
export type PricingCurrency = 'KRW' | 'USD';
export const pricingCatalog = {
  version: 'approved-2026-10-10', status: 'approved', purchasesEnabled: false,
  standardCredits: 1,
  packs: [
    {id:'trial', credits:3, prices:{KRW:6900, USD:499}},
    {id:'basic', credits:10, prices:{KRW:19900, USD:1499}},
    {id:'bundle', credits:30, prices:{KRW:49900, USD:3999}},
  ],
} as const;
// Compatibility export for integrations written before the prices were approved.
export const pricingProposal = pricingCatalog;
// KRW amounts are won; USD amounts are cents. Language is never a billing input.
export function pricingCurrency(savedCurrency:unknown):PricingCurrency {
  return savedCurrency==='USD'?'USD':'KRW';
}
export function formatPrice(amountMinor:number, currency:PricingCurrency, language:PricingLanguage) {
  if(!Number.isFinite(amountMinor)||amountMinor<0)throw Error('Invalid display amount');
  return new Intl.NumberFormat(language==='en'?'en-US':'ko-KR', {
    style:'currency',currency,minimumFractionDigits:currency==='USD'?2:0,
    maximumFractionDigits:currency==='USD'?2:0,
  }).format(amountMinor/(currency==='USD'?100:1));
}
