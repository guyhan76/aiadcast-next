import {plannedRegionPixels,reservedPixelsConform,type PlannedAdText} from './planned-ad-text';
import {wrapExactText} from './exact-text-wrap';
const family='"Noto Sans KR Variable"';
export async function paintPlannedAdText(canvas:HTMLCanvasElement,text:PlannedAdText,frame:{x:number;y:number;w:number;h:number}){
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('EXACT_TEXT_CANVAS');
 const r=plannedRegionPixels(text.plan,frame),padding=Math.ceil(Math.min(frame.w,frame.h)*text.plan.padding);
 if(r.x<0||r.y<0||r.x+r.width>canvas.width||r.y+r.height>canvas.height||!reservedPixelsConform(ctx.getImageData(r.x,r.y,r.width,r.height).data,text.plan.background))throw Error('EXACT_TEXT_REGION');
 const strings=[text.company,text.product,...text.offers].filter(Boolean);let timer:ReturnType<typeof setTimeout>|undefined;
 try{await Promise.race([Promise.all([500,700].map(async weight=>{const faces=await document.fonts.load(`${weight} 32px ${family}`,strings.join(''));if(!faces.length||faces.some(f=>f.status!=='loaded'))throw Error('EXACT_TEXT_FONT');})),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('EXACT_TEXT_FONT')),10000);})]);}finally{clearTimeout(timer);}
 const maxWidth=r.width-2*padding,maxHeight=r.height-2*padding,min=Math.ceil(frame.w*text.plan.minFont),max=Math.floor(frame.w*text.plan.maxFont);
 let fitted:{text:string;x:number;y:number;size:number;weight:number}[]|undefined;
 for(let size=max;size>=min;size--){const lines:NonNullable<typeof fitted>=[];let y=r.y+padding;let invalid=false;
  for(const [index,string] of strings.entries()){const weight=string===text.product?700:500,fs=Math.max(min,Math.floor(size*(index===0&&text.company?.length ? .8 : 1)));ctx.font=`${weight} ${fs}px ${family}`;
   try{for(const line of wrapExactText(string,maxWidth,t=>ctx.measureText(t).width)){lines.push({text:line,x:r.x+padding,y,size:fs,weight});y+=fs*1.35;}}
   catch{invalid=true;break;}y+=size*.18;
  }
  if(!invalid&&y<=r.y+padding+maxHeight){fitted=lines;break;}
 }
 if(!fitted)throw Error('EXACT_TEXT_OVERFLOW');
 // Atomic local composition: canvas unchanged on any validation/font/layout failure.
 // No image resizing, cropping, opaque patch, erasure, or paid retry.
 const result=document.createElement('canvas');result.width=canvas.width;result.height=canvas.height;const out=result.getContext('2d')!;out.drawImage(canvas,0,0);out.fillStyle=text.plan.ink;out.textAlign='left';out.textBaseline='top';
 for(const line of fitted){out.font=`${line.weight} ${line.size}px ${family}`;out.fillText(line.text,line.x,line.y);}
 ctx.drawImage(result,0,0);
}

// Run before POST: reject font/layout failures without spending on an image.
export async function preflightPlannedAdText(text:PlannedAdText,width:number,height:number){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d')!;ctx.fillStyle=`rgb(${text.plan.background.join(',')})`;ctx.fillRect(0,0,width,height);await paintPlannedAdText(canvas,text,{x:0,y:0,w:width,h:height});
}
