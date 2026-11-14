import type {ExactAdText} from './exact-ad-text';
const family='"Noto Sans KR Variable"';
type Line={text:string;size:number;weight:number;x:number;y:number};
// Experimental layout only; production creation does not opt in.
// Visual review rejected the image shrinkage; this is not release-ready.
// Exact fields occupy NEW space outside the visual: no erasure, inpainting, or
// guessed "empty" rectangles over a product/logo. The source is uniformly fit.
export async function paintExactAdText(canvas:HTMLCanvasElement,copy:ExactAdText){
 const strings=[copy.company,copy.product,...copy.offers].filter(Boolean);
 if(!strings.length)return;
 const fontReady=async()=>{for(const weight of [500,700]){const faces=await document.fonts.load(`${weight} 32px ${family}`,strings.join(''));if(!faces.length||faces.some(f=>f.status!=='loaded'))throw Error('EXACT_TEXT_FONT');}};
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{await Promise.race([fontReady(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('EXACT_TEXT_FONT')),10000);})]);}finally{clearTimeout(timer);}
 const w=canvas.width,h=canvas.height,ctx=canvas.getContext('2d');if(!ctx||w<1||h<1)throw Error('EXACT_TEXT_CANVAS');
 const source=document.createElement('canvas');source.width=w;source.height=h;source.getContext('2d')!.drawImage(canvas,0,0);
 const side=w/h>1.25,margin=Math.round(Math.min(w,h)*.028),region=side?{x:0,y:0,w:Math.round(w*.27),h}:{x:0,y:Math.round(h*.76),w,h:Math.round(h*.24)};
 const width=region.w-margin*2,height=region.h-margin*2,lines:Line[]=[];
 const wrap=(text:string,size:number,weight:number)=>{ctx.font=`${weight} ${size}px ${family}`;const result:string[]=[];let line='';for(const {segment:ch} of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)){if(ch==='\n'||ch==='\r'){if(line)result.push(line);line='';continue;}if(ctx.measureText(line+ch).width>width){if(!line)throw Error('EXACT_TEXT_OVERFLOW');result.push(line);line=ch;}else line+=ch;}if(line)result.push(line);return result;};
 let fitted=false;
 // Ratio- and content-dependent typography, never truncate names or price terms.
 for(let size=Math.round(Math.min(w,h)*.045);size>=Math.ceil(Math.min(w,h)*.019);size--){
  lines.length=0;let y=region.y+margin;
  const fields=[{text:copy.company,scale:.68,weight:500},{text:copy.product,scale:1,weight:700},...copy.offers.map(text=>({text,scale:.86,weight:700}))].filter(f=>f.text);
  for(const f of fields){const fs=Math.max(12,Math.round(size*f.scale));for(const text of wrap(f.text,fs,f.weight)){lines.push({text,size:fs,weight:f.weight,x:region.x+margin,y});y+=fs*1.28;}y+=size*.16;}
  if(y<=region.y+margin+height){fitted=true;break;}
 }
 if(!fitted)throw Error('EXACT_TEXT_OVERFLOW');
 // Sample only for palette, never interpret these pixels as proof of empty space.
 const sample=document.createElement('canvas');sample.width=sample.height=1;const sc=sample.getContext('2d')!;sc.drawImage(source,0,0,1,1);const rgb=sc.getImageData(0,0,1,1).data;
 const linear=(v:number)=>{const n=v/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;};
 const luminance=linear(rgb[0])*.2126+linear(rgb[1])*.7152+linear(rgb[2])*.0722;
 const background=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`,light=(luminance+.05)/.05>=1.05/(luminance+.05);
 ctx.fillStyle=background;ctx.fillRect(0,0,w,h);
 const visual=side?{x:region.w,y:0,w:w-region.w,h}:{x:0,y:0,w,h:region.y};
 const scale=Math.min(visual.w/w,visual.h/h),iw=w*scale,ih=h*scale;
 ctx.drawImage(source,visual.x+(visual.w-iw)/2,visual.y+(visual.h-ih)/2,iw,ih);
 ctx.fillStyle=light?'#111111':'#ffffff';ctx.textAlign='left';ctx.textBaseline='top';
 for(const line of lines){ctx.font=`${line.weight} ${line.size}px ${family}`;ctx.fillText(line.text,line.x,line.y);}
}
