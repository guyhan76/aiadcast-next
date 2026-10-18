import {fitAdText} from './ad-type';
import {loadImage} from './model';
export type MaterialManifest={shape:'open-carton'|'cylinder';bodyMm:{width:number;depth:number;height:number};axes:Record<string,[[number,number],[number,number]]>;sha256:string;width:number;height:number;materialRecoveredFromPhoto:false;printRecovered:false};
export type MaterialCopy={title:string;description:string;company:string;contact:string};
const sans='"Noto Sans KR Variable", sans-serif',serif='"Noto Serif KR Variable", serif';
export async function composeMaterialAd(canvas:HTMLCanvasElement,imageUrl:string,m:MaterialManifest,copy:MaterialCopy,annotations:boolean){
 const glyphs=Object.values(copy).join('')+'가로깊이높이지름본체덮개제외절차적재질시안0123456789mm';await Promise.all([document.fonts.load(`500 32px ${sans}`,glyphs),document.fonts.load(`500 72px ${serif}`,glyphs)]);await document.fonts.ready;
 const image=await loadImage(imageUrl);canvas.width=1080;canvas.height=1350;const c=canvas.getContext('2d')!;
 // Product-free procedural studio: the raster and every axis share this same uniform transform.
 const bg=c.createLinearGradient(0,0,1080,1350);bg.addColorStop(0,'#f5f0e5');bg.addColorStop(.55,'#ebe3d4');bg.addColorStop(1,'#d7c8b0');c.fillStyle=bg;c.fillRect(0,0,1080,1350);
 const light=c.createRadialGradient(800,390,40,800,390,850);light.addColorStop(0,'#fffdf5aa');light.addColorStop(1,'#fffdf500');c.fillStyle=light;c.fillRect(0,0,1080,1350);
 const text=(s:string,x:number,y:number,width:number,size:number,lines:number,family=sans,color='#30281d')=>{const fit=fitAdText(s,width,size,size*.75,lines,(t,n)=>{c.font=`500 ${n}px ${family}`;return c.measureText(t).width;});if(fit.overflow)throw Error('문구가 길어 영역을 넘습니다. 줄여주세요.');c.font=`500 ${fit.size}px ${family}`;c.textAlign='left';c.textBaseline='top';c.fillStyle=color;fit.lines.forEach((line,i)=>c.fillText(line,x,y+i*fit.size*1.45));};
 c.fillStyle='#785d3e';c.fillRect(72,72,40,3);text(copy.company||'PRODUCT STUDY',130,57,850,23,1);
 text(copy.title,72,136,935,76,2,serif);text(copy.description,76,377,900,28,2);
 const r={x:-20,y:365,size:1120};c.drawImage(image,r.x,r.y,r.size,r.size);
 if(annotations){
  for(const[axis,points]of Object.entries(m.axes)){
   const p=points.map(([x,y])=>({x:r.x+x*r.size,y:r.y+y*r.size})),shift=axis==='height'?{x:78,y:0}:axis==='depth'?{x:22,y:65}:{x:-18,y:58},a={x:p[0].x+shift.x,y:p[0].y+shift.y},b={x:p[1].x+shift.x,y:p[1].y+shift.y};
   c.strokeStyle='#65503a';c.fillStyle='#65503a';c.lineWidth=2;c.beginPath();c.moveTo(p[0].x,p[0].y);c.lineTo(a.x,a.y);c.moveTo(p[1].x,p[1].y);c.lineTo(b.x,b.y);c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
   const angle=Math.atan2(b.y-a.y,b.x-a.x);for(const[pt,t]of[[a,angle+Math.PI],[b,angle]]as const){c.beginPath();c.moveTo(pt.x,pt.y);c.lineTo(pt.x-10*Math.cos(t-.4),pt.y-10*Math.sin(t-.4));c.lineTo(pt.x-10*Math.cos(t+.4),pt.y-10*Math.sin(t+.4));c.closePath();c.fill();}
   const value=axis==='diameter'?m.bodyMm.width:m.bodyMm[axis as keyof MaterialManifest['bodyMm']],label=`${({width:'가로',depth:'깊이',height:'높이',diameter:'지름'}as Record<string,string>)[axis]} ${value} mm`;
   c.font=`500 24px ${sans}`;const width=c.measureText(label).width,x=(a.x+b.x)/2,y=(a.y+b.y)/2;c.fillStyle='#f5efe3';c.fillRect(x-width/2-9,y-20,width+18,40);c.fillStyle='#493822';c.textAlign='center';c.textBaseline='middle';c.fillText(label,x,y);
  }
 }
 c.strokeStyle='#9f8e7460';c.beginPath();c.moveTo(72,1240);c.lineTo(1008,1240);c.stroke();
 text(copy.contact,72,1268,930,23,1);text('절차적 재질 시안 · 사진의 인쇄·재질 복원 아님',72,1310,930,17,1,sans,'#6a5b46');
}
