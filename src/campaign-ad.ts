import type {Asset,Project} from './model.ts';
import {footerVisible} from './model.ts';
import {getImageFormat} from './formats.ts';
import {dimensionAxes,specSummary} from './product.ts';
import {adDetails} from './ad-copy.ts';
import {fitAdText} from './ad-type.ts';

type Rect={x:number;y:number;w:number;h:number};
type TextBox={x:number;y:number;w:number;size:number;lines:number};
const box=(x:number,y:number,w:number,size:number,lines=1):TextBox=>({x,y,w,size,lines});
export function campaignContent(p:Project){
 const copy=p.copy[p.locale],name=p.productName.trim();
 let headline=copy.title.trim();
 if(name&&headline.startsWith(name+'\n'))headline=headline.slice(name.length+1);
 // Older projects used only the product name as their automatic headline.
 // An individually authored headline is never replaced.
 if(p.locale==='ko'&&headline===name&&/박스/.test(name)&&/튼튼|내구성|든든/.test(copy.description))headline='배송의 시작,\n든든하게.';
 const details=adDetails(copy.description);
 const company=footerVisible(p,'company')?copy.company:'';
 const phone=footerVisible(p,'contact')?copy.contact:'';
 const email=footerVisible(p,'email')?copy.email??'':'';
 const website=footerVisible(p,'website')?copy.website:'';
 return {...details,headline,name:headline===name?'':name,company,phone,email,website};
}

// The photograph is a reusable asset, not a final ad. Wide photographic plates
// fill the hero panel; existing portrait results remain contained, never cropped.
// These internal 9:16 margins reserve room for common player overlays, rather
// than claiming guaranteed platform approval on every device/placement.
export function campaignAdGeometry(p:Project,visual:Asset){
 const {width,height}=getImageFormat(p.format),unit=Math.min(width,height)/1080;
 const content=campaignContent(p),landscape=width>height,reels=p.format==='9:16';
 const margin=64*unit,right=reels?160*unit:margin;
 const contentWidth=width-margin-right,top=reels?190*unit:58*unit,bottom=height-(reels?350*unit:48*unit);
 const footerRows=[!!(content.company||content.phone),!!content.email,!!content.website].filter(Boolean).length;
 const footerHeight=footerRows?(footerRows*44+24)*unit:0;
 const showSpec=p.dimensions.visible&&dimensionAxes(p.productProfile).length>0;
 const infoHeight=(content.offer?138:showSpec?92:content.delivery?64:0)*unit;
 const featureHeight=content.features.length?(landscape?150:206)*unit:0;
 const footerY=bottom-footerHeight,infoY=footerY-infoHeight-(infoHeight?20*unit:0);
 const featureY=infoY-featureHeight-(featureHeight?24*unit:0);
 const headerHeight=(content.lead?340:250)*unit;
 const hero:Rect=landscape?{x:width*.45,y:top,w:width*.55,h:featureY-top-22*unit}:{x:0,y:top+headerHeight,w:width,h:featureY-top-headerHeight-26*unit};
 // Full containment also preserves old photos and manual dimension anchors.
 const photograph=visual.height>visual.width&&!landscape?{x:0,y:0,w:width,h:hero.y+hero.h}:hero;
 const fit=Math.min(photograph.w/visual.width,photograph.h/visual.height)*p.scale;
 const photo={x:photograph.x+(photograph.w-visual.width*fit)/2,y:photograph.y+(photograph.h-visual.height*fit)/2,w:visual.width*fit,h:visual.height*fit};
 const titleWidth=landscape?width*.38:contentWidth;
 const brand=box(margin,top,titleWidth,32*unit);
 const title=box(margin,top+(content.name?54:0)*unit,titleWidth,(landscape?76:86)*unit,2);
 const description=box(margin,title.y+201*unit,titleWidth,31*unit,2);
 const featureGap=24*unit,featureWidth=(contentWidth-featureGap*(Math.max(1,content.features.length)-1))/Math.max(1,content.features.length);
 const features=content.features.map((value,index)=>({value,rect:{x:margin+index*(featureWidth+featureGap),y:featureY,w:featureWidth,h:featureHeight},text:box(margin+index*(featureWidth+featureGap)+18*unit,featureY+66*unit,featureWidth-36*unit,31*unit,4)}));
 const specWidth=content.offer||content.delivery?contentWidth*.54:contentWidth;
 const summary={x:margin,y:infoY,w:specWidth,h:infoHeight};
 const specLabel=box(margin,infoY+10*unit,specWidth-24*unit,24*unit);
 const specValue=box(margin,infoY+48*unit,specWidth-24*unit,38*unit,2);
 const offer=box(showSpec?margin+specWidth+24*unit:margin,infoY+36*unit,showSpec?contentWidth-specWidth-24*unit:contentWidth,76*unit);
 const offerLabel=box(offer.x,infoY+4*unit,offer.w,27*unit);
 const delivery=box(offer.x,infoY+(content.offer?114:36)*unit,offer.w,27*unit);
 const footerLine={x:margin,y:footerY,w:contentWidth,h:unit};
 const company=box(margin,footerY+20*unit,contentWidth,29*unit);
 const contact=box(margin,footerY+20*unit,contentWidth,27*unit,3);
 return {width,height,unit,content,hero,features,brand,title,description,offer,offerLabel,delivery,summary,specLabel,specValue,footerLine,company,contact,photo,area:photograph,markScale:unit,textOnly:false,landscape};
}

const sans='"Noto Sans KR Variable", sans-serif',serif='"Noto Serif KR Variable", serif';
export async function paintCampaignAd(canvas:HTMLCanvasElement,p:Project,image:HTMLImageElement,visual:Asset):Promise<string[]>{
 const g=campaignAdGeometry(p,visual),{width,height,unit,content}=g;
 const elegant=/^(?:beauty|bags|jewelry|fashion|lodging|travel)$/.test(p.productProfile.category);
 await Promise.all([sans,serif].map(f=>document.fonts.load(`700 32px ${f}`,Object.values(p.copy[p.locale]).join('')+'상품규격')));
 canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d')!,errors:string[]=[];
 const paper=p.ink==='dark'?p.background.color:'#15191d',ink=p.ink==='dark'?'#24201d':'#fffaf3';
 const accent=p.ink==='dark'?(/박스/.test(p.productName)?'#96451f':'#675544'):'#d6bd94';
 ctx.fillStyle=paper;ctx.fillRect(0,0,width,height);
 ctx.drawImage(image,g.photo.x,g.photo.y,g.photo.w,g.photo.h);
 // Lightly soften existing portrait-photo backgrounds only behind the headline.
 if(visual.height>visual.width&&!g.landscape){
  const wash=ctx.createLinearGradient(0,0,0,g.hero.y);
  const rgb=p.ink==='dark'?'248,247,244':'21,25,29';
  wash.addColorStop(0,`rgba(${rgb},.94)`);wash.addColorStop(.70,`rgba(${rgb},.92)`);wash.addColorStop(1,`rgba(${rgb},0)`);
  ctx.fillStyle=wash;ctx.fillRect(0,0,width,g.hero.y);
 }
 const draw=(value:string,r:TextBox,name:string,weight=400,color=ink,family=sans,lineHeight=1.22)=>{
  if(!value)return;
  const fit=fitAdText(value,r.w,r.size,r.size*.74,r.lines,(line,size)=>{ctx.font=`${weight} ${size}px ${family}`;return ctx.measureText(line).width;});
  if(fit.overflow||r.y+fit.size*fit.lines.length*lineHeight>height||r.x+r.w>width)errors.push(`${name}이(가) 영역을 넘습니다. 문구를 줄이거나 줄바꿈을 조정해주세요.`);
  ctx.fillStyle=color;ctx.font=`${weight} ${fit.size}px ${family}`;ctx.textBaseline='top';
  fit.lines.slice(0,r.lines).forEach((line,i)=>ctx.fillText(line.trim(),r.x,r.y+i*fit.size*lineHeight));
 };
 draw(content.name,g.brand,'상품명',500,accent);
 draw(content.headline,g.title,'제목',800,ink,elegant?serif:sans,1.14);
 draw(content.lead,g.description,'설명');
 // An exact-fact strip replaces tiny copy floating over an empty scene.
 if(g.features.length){
  ctx.fillStyle=paper;ctx.fillRect(0,g.features[0].rect.y-15*unit,width,height-g.features[0].rect.y+15*unit);
  for(const [index,feature] of g.features.entries()){
   ctx.save();ctx.strokeStyle=p.ink==='dark'?'#cfc7bb':'#51483e';ctx.lineWidth=unit;
   ctx.beginPath();ctx.moveTo(feature.rect.x,feature.rect.y);ctx.lineTo(feature.rect.x+feature.rect.w,feature.rect.y);ctx.stroke();
   draw(`0${index+1}`,box(feature.rect.x+18*unit,feature.rect.y+18*unit,feature.rect.w-36*unit,26*unit),'특징 번호',700,accent);
   draw(feature.value,feature.text,'상품 특징',500);ctx.restore();
  }
 }else{ctx.fillStyle=paper;ctx.fillRect(0,g.summary.y-12*unit,width,height-g.summary.y+12*unit);}
 const showSpec=p.dimensions.visible&&dimensionAxes(p.productProfile).length>0;
 if(showSpec){draw(p.locale==='ko'?'상품 규격':'DIMENSIONS',g.specLabel,'규격 제목',500,accent);draw(specSummary(p.dimensions,p.productProfile),g.specValue,'규격 숫자',700);}
 if(content.offer){
  // Keep qualifying words attached (e.g. "판매가", "월", "부터"). A
  // bare price can have a separate quantity, but an advertised condition cannot.
  const match=/^(\d+\s*(?:개|매|장|세트|박스)\s*(?:에|[:·])?\s*)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*원|\$\s*\d+(?:,\d{3})*(?:\.\d{1,2})?)$/.exec(content.offer);
  draw(match?.[1]?.trim()??'',g.offerLabel,'판매 수량',600,accent);
  draw(match?.[2]??content.offer,g.offer,'가격',800,accent);
 }
 draw(content.delivery,g.delivery,'배송 정보',600);
 const footer=[ [content.company,content.phone].filter(Boolean).join('  ·  '),content.email,content.website ].filter(Boolean);
 if(footer.length){ctx.fillStyle='#24201d';ctx.fillRect(0,g.footerLine.y-12*unit,width,height-g.footerLine.y+12*unit);footer.forEach((line,i)=>draw(line,box(g.contact.x,g.contact.y+i*44*unit,g.contact.w,(i===0?36:27)*unit),'연락처',i===0?600:400,'#fffaf3'));}
 if(p.generated?.model==='local-demo.composition')draw(p.locale==='ko'?'체험 합성 · AI 생성 미사용':'DEMO COMPOSITION · NO AI CALL',box(20,height-40,width-40,18),'체험 표시');
 return errors;
}
