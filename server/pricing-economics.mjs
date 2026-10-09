// Planning calculator, not a checkout/ledger implementation. All results are
// estimates in major currency units; real purchases require integer store amounts.
function number(value,name,min=0,max=Infinity){
 if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error(`Invalid ${name}`);
 return value;
}
export function estimateUnitCost(scenario){
 const output=number(scenario.outputUsdPerAttempt,'output');
 const input=number(scenario.inputAndChecksUsdPerAttempt,'input/checks');
 const attempts=number(scenario.averageAttemptsPerJob,'attempts',1);
 const infra=number(scenario.infrastructureUsdPerJob,'infrastructure');
 const chargedShare=number(scenario.chargedShareOfJobs,'charged share',Number.EPSILON,1);
 const support=number(scenario.supportReserveUsdPerChargedExport,'support');
 const costPerRequestedJob=(output+input)*attempts+infra;
 return {costPerRequestedJob,usdPerChargedExport:costPerRequestedJob/chargedShare+support};
}
export function estimatePackContribution({pack,currency,creditsPerExport,unitCostUsd,krwPerUsd,vatRate,storeFeeRate}){
 if(currency!=='KRW'&&currency!=='USD')throw Error('Unsupported currency');
 const scale=currency==='USD'?100:1;
 const price=number(pack.prices[currency],'price',1)/scale;
 const credits=number(pack.credits,'credits',1);
 const units=number(creditsPerExport,'credits per export',1);
 if(!Number.isInteger(pack.prices[currency])||!Number.isInteger(credits)||!Number.isInteger(units))throw Error('Prices and credits must use integer minor units');
 const cost=number(unitCostUsd,'unit cost')*(currency==='KRW'?number(krwPerUsd,'FX',Number.EPSILON):1);
 const vat=number(vatRate,'VAT',0,1),fee=number(storeFeeRate,'store fee',0,.99);
 const salesBeforeTax=price/(1+vat);
 const netReceipts=salesBeforeTax*(1-fee);
 const receiptsPerExport=netReceipts/credits*units;
 const contributionPerExport=receiptsPerExport-cost;
 return {salesBeforeTax,storeFee:salesBeforeTax*fee,netReceipts,receiptsPerExport,costPerExport:cost,contributionPerExport,contributionShareOfReceipts:contributionPerExport/receiptsPerExport};
}
