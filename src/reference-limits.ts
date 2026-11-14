export const maximumReferencePhotos=10;
export const maximumReferenceBytes=10*1024*1024;

// Base64 padding is not image data. Counting it can reject a photo whose real
// byte length is exactly the server's limit.
export function referenceBytes(assets:readonly {data:string}[]):number{
 return assets.reduce((total,asset)=>{
  const encoded=asset.data.slice(asset.data.indexOf(',')+1);
  const padding=encoded.endsWith('==')?2:encoded.endsWith('=')?1:0;
  return total+Math.max(0,Math.floor(encoded.length*3/4)-padding);
 },0);
}
