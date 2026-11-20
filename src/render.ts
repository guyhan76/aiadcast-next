import {paintPlannedAdText} from './planned-ad-text-render';
import {paintExactAdText} from './exact-ad-text-render';
import {exactTextSnapshot} from './exact-ad-text';
import {manualRequested} from './manual-dimensions';
import {paintManualDimensions} from './manual-dimension-render';
import {isTextExample,textExampleGeometryError} from './generation-input';
import {renderControlledProduct} from './controlled-product-render';
import {annotationIncomplete} from './dimension-annotation';
import {paintAnnotation} from './annotation-render';
import {dimensionLabel} from './dimension-units';
import {dimensionAxes,specSummary} from './product.ts';
import {labels, loadImage,footerVisible} from './model';
import type {Project,Axis} from './model';
import {geometry} from './layout.ts';
import {hasUsableCreative,visualAsset} from './generated.ts';
import {paintCreativeFrame} from './creative-render.ts';
import {boxProjectionActive,boxProjectionReady} from './box-projection.ts';
import {boxTexture} from './box-texture.ts';
import {artDirectionFor} from './art-direction.ts';
import {fitAdText} from './ad-type.ts';
import {splitAdOffer} from './ad-copy.ts';
import {paintCampaignAd} from './campaign-ad.ts';
import {hasCompleteAd,completeAdPlacement} from './complete-ad.ts';
import {defaultPrecision} from './precision.ts';
import type {TextLayer,BackgroundEffect} from './precision.ts';
export {geometry} from './layout.ts';
export const font='"Noto Sans KR Variable", sans-serif';
const editorialFont='"Noto Serif KR Variable", serif';
function applyBackgroundEffect(ctx:CanvasRenderingContext2D,effect:BackgroundEffect,intensity:number){
  if(effect==='none')return;
  let filterStr='';
  switch(effect){
    case 'blur':filterStr=`blur(${Math.round(intensity*8)}px)`;break;
    case 'darken':filterStr=`brightness(${1-intensity*0.5})`;break;
    case 'brighten':filterStr=`brightness(${1+intensity*0.5})`;break;
    case 'saturate':filterStr=`saturate(${1+intensity})`;break;
    case 'desaturate':filterStr=`saturate(${1-intensity})`;break;
    case 'warm':filterStr=`hue-rotate(${Math.round(intensity*25)}deg) saturate(${1+intensity*0.3})`;break;
    case 'cool':filterStr=`hue-rotate(${Math.round(-intensity*15)}deg) saturate(${1+intensity*0.3})`;break;
  }
  if(filterStr&&'filter' in ctx)ctx.filter=filterStr;
}

export async function render(canvas:HTMLCanvasElement,p:Project,editingAxis?:Axis,manualBaseOnly=false):Promise<string[]> {
 const exampleError=textExampleGeometryError(p);if(exampleError)return [exampleError];
 if(p.dimensionControl)return renderControlledProduct(canvas,p);
 if(manualRequested(p)&&!manualBaseOnly){const errors=await render(canvas,p,editingAxis,true);if(errors.length)return errors;const missing=annotationIncomplete(p);if(missing)return [missing];try{await paintManualDimensions(canvas,p);}catch{return [p.locale==='ko'?'치수선 위치를 확인해주세요.':'Review dimension positions.'];}return [];}
 const incomplete=manualBaseOnly?null:annotationIncomplete(p);if(incomplete){await render(canvas,{...p,dimensionAnnotation:undefined},editingAxis);return [incomplete];}
 if(p.dimensionAnnotation?.mode&&p.dimensionAnnotation.mode!=='none'&&p.dimensionAnnotation.proposal){
  const errors=await render(canvas,{...p,dimensionAnnotation:undefined},editingAxis);
  if(errors.length)return errors;
  try{await paintAnnotation(canvas,p);}catch{return ['규격 표시를 안전하게 배치하지 못했습니다. 위치를 수정하거나 표시 없음을 선택해주세요.'];}
  return [];
 }
 if(hasCompleteAd(p)){
  const frame=completeAdPlacement(p),image=await loadImage(p.generated!.asset.data);
  canvas.width=frame.width;canvas.height=frame.height;const ctx=canvas.getContext('2d')!;let exactFrame={x:frame.x,y:frame.y,w:frame.w,h:frame.h};
  ctx.fillStyle=p.background.color;ctx.fillRect(0,0,frame.width,frame.height);
  if(isTextExample(p)){
   const label=p.locale==='ko'?'AI 예시 · 실제 상품 재현 아님':'AI example · Not an actual product reproduction';
   const band=Math.max(40,Math.round(frame.height*.035)),scale=Math.min(frame.width/image.naturalWidth,(frame.height-band)/image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;
   exactFrame={x:(frame.width-w)/2,y:(frame.height-band-h)/2,w,h};ctx.drawImage(image,exactFrame.x,exactFrame.y,w,h);
   let size=Math.max(16,Math.round(frame.width*.028));await document.fonts.load(`500 ${size}px ${font}`,label);ctx.font=`500 ${size}px ${font}`;
   while(ctx.measureText(label).width>frame.width*.92&&size>10){size--;ctx.font=`500 ${size}px ${font}`;}
   ctx.fillStyle='#fff';ctx.fillRect(0,frame.height-band,frame.width,band);ctx.fillStyle='#222';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,frame.width/2,frame.height-band/2);
  }else ctx.drawImage(image,frame.x,frame.y,frame.w,frame.h);
  const exact=exactTextSnapshot(p);if(exact&&hasUsableCreative(p)){try{if(exact.version===2)await paintPlannedAdText(canvas,exact,exactFrame);else await paintExactAdText(canvas,exact);}catch{return [p.locale==='ko'?'정확한 문구를 합성하지 못했습니다. 원본은 보관되며 자동 재생성하지 않습니다.':'Could not compose exact text. The original is preserved; no automatic regeneration.'];}}
  return hasUsableCreative(p)?[]:[p.locale==='ko'?'광고 정보가 변경되었습니다. 이전 문구가 포함된 이미지는 저장할 수 없습니다. 현재 정보로 새 시안을 요청해주세요.':'Ad details changed. The image still contains the previous copy. Request a new visual before exporting.'];
 }
 const precision=p.precision??defaultPrecision();
 const layout=geometry(p);const {width,height,area,photo,summary,footerLine}=layout;const content=p.copy[p.locale];
 await Promise.all([400,500,700].map(weight=>document.fonts.load(`${weight} 32px ${font}`,Object.values(content).join('')+'가로세로높이상품규격')));
 const titleFont=p.presentation==='campaign'?editorialFont:font;
 await document.fonts.load(`700 32px ${titleFont}`,content.title);
 const visual=visualAsset(p);
 const [product,background]=await Promise.all([visual?loadImage(visual.data):null,p.background.image?loadImage(p.background.image.data):null]);
 if(p.presentation==='campaign'&&hasUsableCreative(p)&&product&&visual&&!p.dimensions.lines&&!boxProjectionActive(p))return paintCampaignAd(canvas,p,product,visual);
 canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d')!;const errors:string[]=[];
 let projected:ReturnType<typeof boxTexture>|null=null;
 if(product&&boxProjectionReady(p)){try{projected=boxTexture(product,p,photo.w,photo.h);}catch{errors.push(p.locale==='ko'?'원본 면을 투영하지 못했습니다. 사진 모서리와 규격을 확인해주세요.':'Could not project the source faces. Check the corners and dimensions.');}}
 const color=p.ink==='dark'?'#20261f':'#ffffff';ctx.fillStyle=p.background.color;ctx.fillRect(0,0,width,height);
  if(background){
    const settings=precision.background;
    const fit=Math.max(width/background.naturalWidth,height/background.naturalHeight)*settings.zoom;
    const w=background.naturalWidth*fit;
    const h=background.naturalHeight*fit;
    ctx.save();
    ctx.globalAlpha=settings.opacity;

    // 배경 효과 적용
    if(settings.effect!=='none'){
      applyBackgroundEffect(ctx,settings.effect,settings.effectIntensity);
    }

    ctx.drawImage(background,(width-w)/2+settings.x*width,(height-h)/2+settings.y*height,w,h);
    ctx.restore();
  }
 const campaign=p.presentation==='campaign'&&hasUsableCreative(p);
 if(campaign&&product){
  ctx.drawImage(product,photo.x,photo.y,photo.w,photo.h);
  const shade=p.ink==='dark'?'248,247,244':'14,17,19';
  const zone=artDirectionFor(p.productProfile.category,p.format,p.campaign?.creative?.note??'').copyZone;
  const wash=zone==='left'?ctx.createLinearGradient(0,0,width,0):ctx.createLinearGradient(0,0,0,height);
  if(zone==='left'){wash.addColorStop(0,`rgba(${shade},.90)`);wash.addColorStop(.42,`rgba(${shade},.72)`);wash.addColorStop(.58,`rgba(${shade},0)`);}
  else if(zone==='bottom'){wash.addColorStop(0,`rgba(${shade},0)`);wash.addColorStop(.43,`rgba(${shade},0)`);wash.addColorStop(.68,`rgba(${shade},.87)`);wash.addColorStop(1,`rgba(${shade},.95)`);}
  else{wash.addColorStop(0,`rgba(${shade},.87)`);wash.addColorStop(.30,`rgba(${shade},0)`);}
  ctx.fillStyle=wash;ctx.fillRect(0,0,width,height);
  const footerWash=ctx.createLinearGradient(0,height*.80,0,height);footerWash.addColorStop(0,`rgba(${shade},0)`);footerWash.addColorStop(1,`rgba(${shade},.94)`);ctx.fillStyle=footerWash;ctx.fillRect(0,height*.80,width,height*.20);
 }else paintCreativeFrame(ctx,p,width,height);
  // 다양한 동작 효과 렌더링
  if(precision.motion!=='none'){
    ctx.save();
    ctx.strokeStyle=color;
    ctx.globalAlpha=.16;
    ctx.lineWidth=Math.max(3,width*.006);

    if(precision.motion==='rays'){
      const x=area.x+area.w*.5,y=area.y+area.h*.5,r=Math.min(area.w,area.h)*.22;
      for(let i=0;i<16;i++){
        const a=i*Math.PI/8;
        ctx.beginPath();
        ctx.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r);
        ctx.lineTo(x+Math.cos(a)*r*1.7,y+Math.sin(a)*r*1.7);
        ctx.stroke();
      }
    }
    else if(precision.motion==='swoosh'){
      ctx.beginPath();
      ctx.moveTo(area.x,area.y+area.h*.75);
      ctx.bezierCurveTo(area.x+area.w*.45,area.y-area.h*.2,area.x+area.w*.55,area.y+area.h*1.2,area.x+area.w,area.y+area.h*.15);
      ctx.stroke();
    }
    else if(precision.motion==='spiral'){
      const cx=area.x+area.w*.5,cy=area.y+area.h*.5,maxR=Math.min(area.w,area.h)*.25;
      ctx.beginPath();
      for(let i=0;i<80;i++){
        const t=i/79;
        const r=maxR*t;
        const angle=t*Math.PI*4;
        const x=cx+r*Math.cos(angle);
        const y=cy+r*Math.sin(angle);
        if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
    else if(precision.motion==='pulse'){
      ctx.globalAlpha=.12;
      for(let i=1;i<=3;i++){
        const r=Math.min(area.w,area.h)*(.15+i*.08);
        ctx.beginPath();
        ctx.arc(area.x+area.w*.5,area.y+area.h*.5,r,0,Math.PI*2);
        ctx.stroke();
      }
    }
    else if(precision.motion==='glow'){
      ctx.globalAlpha=.08;
      for(let i=1;i<=4;i++){
        const r=Math.min(area.w,area.h)*(.2+i*.06);
        ctx.beginPath();
        ctx.arc(area.x+area.w*.5,area.y+area.h*.5,r,0,Math.PI*2);
        ctx.stroke();
      }
    }
    else if(precision.motion==='shimmer'){
      ctx.globalAlpha=.14;
      for(let i=0;i<6;i++){
        const x=area.x+area.w*(i/5);
        ctx.beginPath();
        ctx.moveTo(x,area.y);
        ctx.lineTo(x+area.w*.15,area.y+area.h);
        ctx.stroke();
      }
    }
    else if(precision.motion==='float'){
      ctx.globalAlpha=.1;
      ctx.beginPath();
      ctx.arc(area.x+area.w*.5,area.y+area.h*.4,Math.min(area.w,area.h)*.18,0,Math.PI*2);
      ctx.stroke();
      ctx.globalAlpha=.15;
      ctx.beginPath();
      ctx.arc(area.x+area.w*.5,area.y+area.h*.6,Math.min(area.w,area.h)*.12,0,Math.PI*2);
      ctx.stroke();
    }

    ctx.restore();
  }

 const text=(value:string,x:number,y:number,size:number,maxWidth:number,maxLines:number,name:string,weight=400,family=font,fillColor=color)=>{
  if(!value)return;
  const fit=fitAdText(value,maxWidth,size,size*.68,maxLines,(line,s)=>{ctx.font=`${weight} ${s}px ${family}`;return ctx.measureText(line).width;});
  ctx.fillStyle=fillColor;ctx.font=`${weight} ${fit.size}px ${family}`;ctx.textBaseline='top';
  if(fit.overflow||y+fit.lines.length*fit.size*1.4>height||x+maxWidth>width)errors.push(`${name}이(가) 영역을 넘습니다. 문구를 줄이거나 줄바꿈을 조정해주세요.`);
  fit.lines.slice(0,maxLines).forEach((line,i)=>ctx.fillText(line,x,y+i*fit.size*1.4));
 };
 const placed=(value:string,region:typeof layout.title,name:string,weight=400,layer?:TextLayer)=>{
  const style=layer&&p.precision?.text[layer];
  const family=style?.font==='serif'?editorialFont:style?.font==='mono'?'monospace':layer==='title'?titleFont:font;
  const x=region.x+(style?.x??0)*width,y=region.y+(style?.y??0)*height;
  ctx.save();
  ctx.globalAlpha=style?.opacity??1;
  text(value,x,y,region.size*(style?.scale??1),region.w,region.lines,name,weight,family,style?.color??color);
  ctx.restore();
 };
 if(!p.footer)placed(content.company||(layout.textOnly?'BRAND STORY':'PRODUCT STORY'),layout.brand,'상단 기업명',500,'brand');
 placed(content.title,layout.title,'제목',700,'title');
 const adCopy=splitAdOffer(content.description);
 placed(adCopy.description,layout.description,'설명',400,'description');
 placed(adCopy.offer,layout.offer,'가격',700);
 if(product&&!campaign){if(projected)ctx.drawImage(projected.canvas,photo.x,photo.y);else ctx.drawImage(product,photo.x,photo.y,photo.w,photo.h);}else if(!product&&!layout.textOnly){
  ctx.save();ctx.strokeStyle=p.ink==='dark'?'#b2afa5':'#aaa';ctx.lineWidth=2;ctx.setLineDash([12,12]);ctx.strokeRect(area.x,area.y,area.w,area.h);ctx.restore();ctx.save();ctx.globalAlpha=.65;text(p.locale==='ko'?'이곳에 실제 상품 사진이 표시됩니다.':'Your original product photo goes here.',area.x+24,area.y+area.h/2,28*layout.markScale,area.w-48,2,'사진 안내');ctx.restore();
 }
  if(precision.sticker.glyph){
    const s=precision.sticker;
    ctx.save();
    ctx.translate(s.x*width,s.y*height);
    ctx.rotate(s.rotation*Math.PI/180);
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.font=`${s.size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.fillText(s.glyph,0,0);
    ctx.restore();
  }

 if(p.dimensions.visible&&p.dimensions.lines&&product&&(!boxProjectionActive(p)||projected)){for(const axis of dimensionAxes(p.productProfile)){const edge=projected?.model.dimensions.find(d=>d.axis===axis);const unit=photo.w/720;const shift=axis==='width'?{x:-25*unit,y:33*unit}:axis==='depth'?{x:25*unit,y:33*unit}:{x:36*unit,y:0};const points=edge?[edge.start,edge.end].map(pt=>({x:photo.x+pt.x+shift.x,y:photo.y+pt.y+shift.y})):p.dimensions.anchors[axis].map(pt=>({x:photo.x+pt.x*photo.w,y:photo.y+pt.y*photo.h}));const [a,b]=points;ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=3;if(edge){ctx.save();ctx.globalAlpha=.5;ctx.lineWidth=1;ctx.beginPath();for(const [index,pt] of [edge.start,edge.end].entries()){ctx.moveTo(photo.x+pt.x,photo.y+pt.y);ctx.lineTo(points[index].x,points[index].y);}ctx.stroke();ctx.restore();}ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();const angle=Math.atan2(b.y-a.y,b.x-a.x);for(const [pt,theta] of [[a,angle+Math.PI],[b,angle]] as const){ctx.beginPath();ctx.moveTo(pt.x,pt.y);ctx.lineTo(pt.x-14*Math.cos(theta-.4),pt.y-14*Math.sin(theta-.4));ctx.lineTo(pt.x-14*Math.cos(theta+.4),pt.y-14*Math.sin(theta+.4));ctx.closePath();ctx.fill();}
  const label=dimensionLabel(p.dimensions[axis],p.dimensions.displayUnit);ctx.font=`500 26px ${font}`;const tw=ctx.measureText(label).width;const x=(a.x+b.x)/2,y=(a.y+b.y)/2;ctx.fillStyle=p.ink==='dark'?'#fffefaee':'#171917ee';ctx.fillRect(x-tw/2-12,y-42,tw+24,38);ctx.fillStyle=color;ctx.textBaseline='top';ctx.fillText(label,x-tw/2,y-39);
  if(!projected&&editingAxis===axis){for(const pt of points){ctx.fillStyle='#e36a22';ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.beginPath();ctx.arc(pt.x,pt.y,13,0,Math.PI*2);ctx.fill();ctx.stroke();}}ctx.restore();}}
 if(p.dimensions.visible&&dimensionAxes(p.productProfile).length){ctx.save();ctx.fillStyle=p.ink==='dark'?'#ffffffdf':'#10130fe6';ctx.fillRect(summary.x,summary.y,summary.w,summary.h);ctx.restore();placed(labels[p.locale].spec,layout.specLabel,'규격 제목',500);placed(specSummary(p.dimensions,p.productProfile),layout.specValue,'규격 숫자',700);}
 const footerCompany=footerVisible(p,'company')?content.company:'';
 const footerDetails=(['contact','email','website'] as const).filter(key=>footerVisible(p,key)&&content[key]).map(key=>content[key]!).join(campaign?'\n':'  |  ');
 if(footerCompany||footerDetails){ctx.fillStyle=color;ctx.globalAlpha=.25;ctx.fillRect(footerLine.x,footerLine.y,footerLine.w,footerLine.h);ctx.globalAlpha=1;}
 placed(footerCompany,layout.company,'기업명',700,'company');placed(footerDetails,layout.contact,'연락처',400,'contact');
 if(p.generated?.model==='local-demo.composition'){ctx.save();ctx.fillStyle='#ffffffdf';ctx.fillRect(10,height-35,390,28);ctx.fillStyle='#222';ctx.font=`18px ${font}`;ctx.textBaseline='top';ctx.fillText(p.locale==='ko'?'체험 합성 · AI 생성 미사용':'DEMO COMPOSITION · NO AI CALL',20,height-30);ctx.restore();}
 return errors;
}
