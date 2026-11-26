import {findImageSkill} from '../src/image-skills.ts';
import {getVideoFormat} from '../src/video-formats.ts';

const skills = ['macro','product-explosion','freeze-frame','closeup','practical-light'];
export const photoDirection = [
  'Inspect the actual photos before choosing one opening technique. Pick the visible product feature that best demonstrates the customer highlight. Honor explicit shot order and exclusions.',
  ...skills.map(id => id + ': ' + findImageSkill(id).visualDirection),
  'Translate the chosen technique into a single filmable opening and its visible consequence. Write the feature, its appearance and motion directly into the reviewed shots, without skill names. Match material, silhouette, toppings or markings across the cut. Ignore viewer controls and text around screenshots.',
  'For example, a cheese emphasis may motivate a slice lifting with strands attached at both ends. A topping emphasis may motivate an exploded arrangement of identifiable ingredients. Apply either only when the actual photo and brief support it.'
].join(' ');

export const layoutInstructions = 'Also return frameLayout for this opening. Use mode original when a supplied photo already shows the opening, the action needs no still, boundaries are unclear, or the source is unsuitable. Use mode crop for a useful close-up; outline the desired crop with two opposite corners. Use mode layers only when the approved opening calls for separated, clearly identifiable components: trace 2 to 4 distinct visible components in top-to-bottom output order, each as a polygon of 4 to 10 vertices inside its visible silhouette. Never include screen chrome. Use one source photo, one-based source index, and integer x,y coordinates from 0 to 1000 relative to that entire photo. For original use an empty regions array.';

const coordinate = {type:'integer',minimum:0,maximum:1000};
export const layoutSchema = {
  type:'object',additionalProperties:false,required:['mode','source','regions'],
  properties:{
    mode:{type:'string',enum:['original','crop','layers']},
    source:{type:'integer',minimum:1,maximum:10},
    regions:{type:'array',maxItems:4,items:{type:'array',minItems:2,maxItems:10,items:{
      type:'object',additionalProperties:false,required:['x','y'],properties:{x:coordinate,y:coordinate}
    }}}
  }
};

// Make a composition guide from actual product pixels. A weak outline falls back to original references.
export async function openingReference(layout, references, ratio) {
  if (!layout || !['crop','layers'].includes(layout.mode) || !Number.isInteger(layout.source) ||
      layout.source<1 || layout.source>references.length || references.length>=10) return;
  const layers = layout.mode==='layers';
  if (!Array.isArray(layout.regions) || (layers ? layout.regions.length<2 || layout.regions.length>4 : layout.regions.length!==1)) return;
  const {default:sharp} = await import('sharp');
  const encoded = references[layout.source-1].split(',')[1];
  const normalized = await sharp(Buffer.from(encoded,'base64'),{limitInputPixels:40_000_000}).autoOrient().resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).flatten({background:'white'}).jpeg().toBuffer({resolveWithObject:true});
  const source=normalized.data;
  const {width,height}=normalized.info;
  const format = getVideoFormat(ratio);
  const scale = 512 / Math.max(format.width,format.height);
  const w = Math.round(format.width*scale), h = Math.round(format.height*scale);
  const pieces = [];
  for (const region of layout.regions) {
    if (!Array.isArray(region) || (layers ? region.length<4 || region.length>10 : region.length!==2)) return;
    if (!region.every(p=>p && [p.x,p.y].every(v=>Number.isInteger(v)&&v>=0&&v<=1000))) return;
    const points = region.map(p=>[Math.round(p.x*(width-1)/1000),Math.round(p.y*(height-1)/1000)]);
    const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
    const left=Math.min(...xs), top=Math.min(...ys), cw=Math.max(...xs)-left+1, ch=Math.max(...ys)-top+1;
    if (cw<12 || ch<12) return;
    const crop=sharp(source).extract({left,top,width:cw,height:ch});
    if (!layers) {
      const bytes=await crop.resize(w,h,{fit:'cover'}).jpeg({quality:87}).toBuffer();
      return 'data:image/jpeg;base64,'+bytes.toString('base64');
    }
    const area=Math.abs(points.reduce((sum,[x,y],i)=>{
      const [nx,ny]=points[(i+1)%points.length];
      return sum+x*ny-nx*y;
    },0))/2;
    if (area<cw*ch*0.15) return;
    const polygon=points.map(([x,y])=>(x-left)+','+(y-top)).join(' ');
    const mask=Buffer.from('<svg width="'+cw+'" height="'+ch+'" xmlns="http://www.w3.org/2000/svg"><polygon fill="white" points="'+polygon+'"/></svg>');
    const cut=await crop.ensureAlpha().composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
    const row=h/layout.regions.length;
    const tile=await sharp(cut).resize(Math.round(w*0.72),Math.round(row*0.82),{fit:'inside'}).png().toBuffer({resolveWithObject:true});
    pieces.push({input:tile.data,left:Math.round((w-tile.info.width)/2),top:Math.round(row*(pieces.length+0.5)-tile.info.height/2)});
  }
  const bytes=await sharp({create:{width:w,height:h,channels:3,background:'#282321'}}).composite(pieces).jpeg({quality:87}).toBuffer();
  return 'data:image/jpeg;base64,'+bytes.toString('base64');
}
