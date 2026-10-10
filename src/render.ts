import {dimensionAxes,specSummary} from './product.ts';
import {labels, loadImage} from './model';
import type {Project,Axis} from './model';
import {geometry} from './layout.ts';
import {visualAsset} from './generated.ts';
import {paintCreativeFrame} from './creative-render.ts';
import {boxProjectionActive,boxProjectionReady} from './box-projection.ts';
import {boxTexture} from './box-texture.ts';
export {geometry} from './layout.ts';
export const font='"Noto Sans KR Variable", sans-serif';
function wrap(ctx:CanvasRenderingContext2D,text:string,width:number){const lines:string[]=[];for(const paragraph of text.split('\n')){let line='';for(const char of Array.from(paragraph)){if(ctx.measureText(line+char).width>width&&line){lines.push(line);line=char;}else line+=char;}lines.push(line);}return lines;}
export async function render(canvas:HTMLCanvasElement,p:Project,editingAxis?:Axis):Promise<string[]> {
 const layout=geometry(p);const {width,height,area,photo,summary,footerLine}=layout;const content=p.copy[p.locale];
 await Promise.all([400,500,700].map(weight=>document.fonts.load(`${weight} 32px ${font}`,Object.values(content).join('')+'가로세로높이상품규격')));
 const visual=visualAsset(p);
 const [product,background]=await Promise.all([visual?loadImage(visual.data):null,p.background.image?loadImage(p.background.image.data):null]);
 canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d')!;const errors:string[]=[];
 let projected:ReturnType<typeof boxTexture>|null=null;
 if(product&&boxProjectionReady(p)){try{projected=boxTexture(product,p,photo.w,photo.h);}catch{errors.push(p.locale==='ko'?'원본 면을 투영하지 못했습니다. 사진 모서리와 규격을 확인해주세요.':'Could not project the source faces. Check the corners and dimensions.');}}
 const color=p.ink==='dark'?'#20261f':'#ffffff';ctx.fillStyle=p.background.color;ctx.fillRect(0,0,width,height);
 if(background){const fit=Math.max(width/background.naturalWidth,height/background.naturalHeight);const w=background.naturalWidth*fit,h=background.naturalHeight*fit;ctx.drawImage(background,(width-w)/2,(height-h)/2,w,h);}
 paintCreativeFrame(ctx,p,width,height);
 const text=(value:string,x:number,y:number,size:number,maxWidth:number,maxLines:number,name:string,weight=400)=>{ctx.fillStyle=color;ctx.font=`${weight} ${size}px ${font}`;ctx.textBaseline='top';const lines=wrap(ctx,value,maxWidth);if(lines.length>maxLines)errors.push(`${name}이(가) 영역을 넘습니다. 문구를 줄이거나 줄바꿈을 조정해주세요.`);lines.slice(0,maxLines).forEach((line,i)=>ctx.fillText(line,x,y+i*size*1.4));};
 const placed=(value:string,region:typeof layout.title,name:string,weight=400)=>text(value,region.x,region.y,region.size,region.w,region.lines,name,weight);
 placed(content.company||(layout.textOnly?'BRAND STORY':'PRODUCT STORY'),layout.brand,'상단 기업명',500);
 placed(content.title,layout.title,'제목',700);
 placed(content.description,layout.description,'설명');
 if(product){if(projected)ctx.drawImage(projected.canvas,photo.x,photo.y);else ctx.drawImage(product,photo.x,photo.y,photo.w,photo.h);}else if(!layout.textOnly){
  ctx.save();ctx.strokeStyle=p.ink==='dark'?'#b2afa5':'#aaa';ctx.lineWidth=2;ctx.setLineDash([12,12]);ctx.strokeRect(area.x,area.y,area.w,area.h);ctx.restore();ctx.save();ctx.globalAlpha=.65;text(p.locale==='ko'?'이곳에 실제 상품 사진이 표시됩니다.':'Your original product photo goes here.',area.x+24,area.y+area.h/2,28*layout.markScale,area.w-48,2,'사진 안내');ctx.restore();
 }
 if(p.dimensions.visible&&p.dimensions.lines&&product&&(!boxProjectionActive(p)||projected)){for(const axis of dimensionAxes(p.productProfile)){const edge=projected?.model.dimensions.find(d=>d.axis===axis);const unit=photo.w/720;const shift=axis==='width'?{x:-25*unit,y:33*unit}:axis==='depth'?{x:25*unit,y:33*unit}:{x:36*unit,y:0};const points=edge?[edge.start,edge.end].map(pt=>({x:photo.x+pt.x+shift.x,y:photo.y+pt.y+shift.y})):p.dimensions.anchors[axis].map(pt=>({x:photo.x+pt.x*photo.w,y:photo.y+pt.y*photo.h}));const [a,b]=points;ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=3;if(edge){ctx.save();ctx.globalAlpha=.5;ctx.lineWidth=1;ctx.beginPath();for(const [index,pt] of [edge.start,edge.end].entries()){ctx.moveTo(photo.x+pt.x,photo.y+pt.y);ctx.lineTo(points[index].x,points[index].y);}ctx.stroke();ctx.restore();}ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();const angle=Math.atan2(b.y-a.y,b.x-a.x);for(const [pt,theta] of [[a,angle+Math.PI],[b,angle]] as const){ctx.beginPath();ctx.moveTo(pt.x,pt.y);ctx.lineTo(pt.x-14*Math.cos(theta-.4),pt.y-14*Math.sin(theta-.4));ctx.lineTo(pt.x-14*Math.cos(theta+.4),pt.y-14*Math.sin(theta+.4));ctx.closePath();ctx.fill();}
  const label=`${p.dimensions[axis]} mm`;ctx.font=`500 26px ${font}`;const tw=ctx.measureText(label).width;const x=(a.x+b.x)/2,y=(a.y+b.y)/2;ctx.fillStyle=p.ink==='dark'?'#fffefaee':'#171917ee';ctx.fillRect(x-tw/2-12,y-42,tw+24,38);ctx.fillStyle=color;ctx.textBaseline='top';ctx.fillText(label,x-tw/2,y-39);
  if(!projected&&editingAxis===axis){for(const pt of points){ctx.fillStyle='#e36a22';ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.beginPath();ctx.arc(pt.x,pt.y,13,0,Math.PI*2);ctx.fill();ctx.stroke();}}ctx.restore();}}
 if(p.dimensions.visible&&dimensionAxes(p.productProfile).length){ctx.save();ctx.fillStyle=p.ink==='dark'?'#ffffffdf':'#10130fe6';ctx.fillRect(summary.x,summary.y,summary.w,summary.h);ctx.restore();placed(labels[p.locale].spec,layout.specLabel,'규격 제목',500);placed(specSummary(p.dimensions,p.productProfile),layout.specValue,'규격 숫자',700);}
 ctx.fillStyle=color;ctx.globalAlpha=.25;ctx.fillRect(footerLine.x,footerLine.y,footerLine.w,footerLine.h);ctx.globalAlpha=1;
 placed(content.company,layout.company,'기업명',700);placed([content.contact,content.website].filter(Boolean).join('  |  '),layout.contact,'연락처');
 return errors;
}
