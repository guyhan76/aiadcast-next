export const dimensionUnits = ['cm','mm','inch'] as const;
export type DimensionUnit = typeof dimensionUnits[number];
export function dimensionUnit(value:unknown):DimensionUnit {return value==='cm'||value==='inch'?value:'mm';}
// Axes always store millimetres. Changing the display unit never rewrites them.
function decimal(integer:bigint,places:number) {
 const s=integer.toString().padStart(places+1,'0');
 return places?(s.slice(0,-places)+'.'+s.slice(-places)).replace(/\.?0+$/,''):s;
}
export function toMillimeters(value:string,unit:DimensionUnit):string {
 if(!/^\d*(\.\d{0,6})?$/.test(value)||!/[0-9]/.test(value))return '';
 const [whole,fraction='']=value.split('.');
 const coefficient=BigInt((whole||'0')+fraction);
 if(unit==='inch')return decimal(coefficient*254n,fraction.length+1);
 if(unit==='cm')return decimal(coefficient*10n,fraction.length);
 return decimal(coefficient,fraction.length);
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
