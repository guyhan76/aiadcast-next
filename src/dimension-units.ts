export const dimensionUnits = ['cm','mm','inch'] as const;
export type DimensionUnit = typeof dimensionUnits[number];
export function dimensionUnit(value:unknown):DimensionUnit {return value==='cm'||value==='inch'?value:'mm';}
// Axes always store millimetres. Changing the display unit never rewrites them.
function decimal(integer:bigint,places:number) {
 const s=integer.toString().padStart(places+1,'0');
 return places?(s.slice(0,-places)+'.'+s.slice(-places)).replace(/\.?0+$/,''):s;
}
// Only trim outer whitespace and spaces immediately beside a decimal point.
// Never concatenate separated digits, interpret commas or strip a unit suffix.
export function normalizeDimensionDecimal(value:string):string {
 return value.trim().replace(/([0-9])(?:[ \t\u00a0\u202f]+)\./g,'$1.').replace(/\.(?:[ \t\u00a0\u202f]+)(?=[0-9])/g,'.');
}
export function toMillimeters(value:string,unit:DimensionUnit):string {
 value=normalizeDimensionDecimal(value);
 if(!/^\d*(\.\d{0,10})?$/.test(value)||!/[0-9]/.test(value))return '';
 const [whole,fraction='']=value.split('.');
 const coefficient=BigInt((whole||'0')+fraction);
 const integer=coefficient*(unit==='inch'?254n:unit==='cm'?10n:1n),places=fraction.length+(unit==='inch'?1:0);
 // Only a numeric edit is rounded to the canonical 8-decimal precision.
 // A unit switch never calls this conversion or rewrites the stored value.
 if(places>8){const divisor=10n**BigInt(places-8);return decimal((integer+divisor/2n)/divisor,8);}
 return decimal(integer,places);
}
export function fromMillimeters(value:string,unit:DimensionUnit):string {
 if(!/^\d+(\.\d{1,8})?$/.test(value))return value;
 if(unit==='mm')return value;
 const [whole,fraction='']=value.split('.');
 const coefficient=BigInt(whole+fraction),scale=10n**BigInt(fraction.length);
 const denominator=scale*(unit==='cm'?10n:254n),numerator=coefficient*(unit==='cm'?1n:10n)*10n**10n;
 return decimal((numerator+denominator/2n)/denominator,10);
}
export function validMillimeters(value:string):boolean {return /^\d+(\.\d{1,8})?$/.test(value)&&Number(value)>0&&Number(value)<=100000;}
export function dimensionLabel(value:string,unit?:DimensionUnit):string {const selected=dimensionUnit(unit);return `${fromMillimeters(value,selected)} ${selected}`;}
