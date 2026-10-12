import {getImageFormat} from './formats.ts';
import {dimensionAxes,isServiceCategory} from './product.ts';
import type {Project} from './model.ts';
import {hasUsableCreative,visualAsset} from './generated.ts';
import {boxProjectionReady} from './box-projection.ts';
import {artDirectionFor} from './art-direction.ts';
import {splitAdOffer} from './ad-copy.ts';
type Rect={x:number;y:number;w:number;h:number};
type TextBox={x:number;y:number;w:number;size:number;lines:number};
const box=(x:number,y:number,w:number,size:number,lines=1):TextBox=>({x,y,w,size,lines});

// A layout change never crops or stretches the source photo. Annotation anchors stay
// normalized to that photo, so they follow it when the output format changes.
export function geometry(p:Project){
 const {width,height}=getImageFormat(p.format);
 let area:Rect,summary:Rect,brand:TextBox,title:TextBox,description:TextBox,company:TextBox,contact:TextBox,footerLine:Rect;
 let markScale=1;
 if(width>height){
  // Lay out on a 1920-wide design grid, then scale to the selected output pixels.
  const scale=width/1920,designHeight=height/scale;
  const rect=(x:number,y:number,w:number,h:number):Rect=>({x:x*scale,y:y*scale,w:w*scale,h:h*scale});
  const text=(x:number,y:number,w:number,size:number,lines=1):TextBox=>({x:x*scale,y:y*scale,w:w*scale,size:size*scale,lines});
  brand=text(80,64,720,22);title=text(80,148,710,64,3);description=text(80,472,710,28,3);
  area=rect(860,110,980,designHeight-400);summary=rect(860,designHeight-256,980,104);
  footerLine=rect(80,designHeight-112,1760,1);company=text(80,designHeight-88,580,26);contact=text(720,designHeight-84,1120,21,2);
  markScale=scale;
 }else if(height>=1620){
  // Keep the original 9:16 and 2:3 project layouts compatible.
  brand=box(80,65,920,22);title=box(80,142,920,66,3);description=box(80,424,920,27,3);
  area={x:80,y:540,w:920,h:height-980};summary={x:80,y:height-346,w:920,h:114};
  footerLine={x:80,y:height-183,w:920,h:1};company=box(80,height-150,920,28);contact=box(80,height-99,920,22,2);
 }else if(height>width){
  brand=box(64,44,952,22);title=box(64,108,952,56,3);description=box(64,356,952,26,3);
  area={x:64,y:490,w:952,h:height-824};summary={x:64,y:height-292,w:952,h:108};
  footerLine={x:64,y:height-153,w:952,h:1};company=box(64,height-131,952,26);contact=box(64,height-82,952,20,2);
 }else{
  brand=box(60,38,960,20);title=box(60,88,960,44,3);description=box(60,285,960,22,3);
  area={x:60,y:400,w:960,h:height-652};summary={x:60,y:height-226,w:960,h:90};
  footerLine={x:60,y:height-116,w:960,h:1};company=box(60,height-99,960,22);contact=box(60,height-62,960,18,2);
 }
 if(p.presentation==='campaign'&&hasUsableCreative(p)){
  const margin=width*.065,unit=Math.min(width,height)/1080,landscape=width>height;
  area={x:0,y:0,w:width,h:height};
  brand=box(margin,height*.05,width-margin*2,20*unit);
  title=box(margin,height*.105,landscape?width*.40:width-margin*2,50*unit,2);
  description=box(margin,height*.105+145*unit,landscape?width*.39:width-margin*2,24*unit,2);
  footerLine={x:margin,y:height-190*unit,w:width-margin*2,h:1};
  company=box(margin,height-170*unit,width-margin*2,25*unit);
  contact=box(margin,height-123*unit,width-margin*2,20*unit,3);
  summary={x:margin,y:height-305*unit,w:width-margin*2,h:95*unit};markScale=unit;
  const production=artDirectionFor(p.productProfile.category,p.format,p.campaign?.creative?.note??'');
  if(production.copyZone==='left'){
   title=box(margin,height*.13,width*.36,44*unit,3);
   description=box(margin,height*.13+200*unit,width*.36,22*unit,3);
  }else if(production.copyZone==='bottom'){
   const start=Math.max(height*.43,summary.y-310*unit);
   title=box(margin,start,width-margin*2,50*unit,2);
   description=box(margin,start+145*unit,width-margin*2,24*unit,2);
  }
 }
 const visual=visualAsset(p);
 const textOnly=isServiceCategory(p.productProfile.category)&&!visual;
 // A spec-free project gives the photo the space formerly reserved for specs.
 // Merely hiding existing specs keeps the photo placement unchanged.
 if(!(p.presentation==='campaign'&&hasUsableCreative(p))&&!dimensionAxes(p.productProfile).length)area={...area,h:footerLine.y-32*markScale-area.y};
 if(textOnly){
  const size=Math.min(width*.062,height*.08);
  title=box(brand.x,height*.26,width-brand.x*2,size,3);
  description=box(brand.x,title.y+size*4.2+32*markScale,width-brand.x*2,Math.min(width*.026,height*.032),4);
  if(p.dimensions.visible&&dimensionAxes(p.productProfile).length){
   const overlap=Math.max(0,description.y+description.size*1.4*description.lines+30*markScale-summary.y);
   title={...title,y:title.y-overlap};description={...description,y:description.y-overlap};
  }
 }
 const hasOffer=!!splitAdOffer(p.copy[p.locale].description).offer;
 const campaign=p.presentation==='campaign'&&hasUsableCreative(p);
 let offer=box(description.x,description.y+description.size*1.4*description.lines+14*markScale,description.w,36*markScale);
 if(hasOffer){
  if(!campaign&&!textOnly&&width<=height){description={...description,lines:2};offer=box(description.x,description.y+description.size*2.8+12*markScale,description.w,40*markScale);const extra=Math.max(0,offer.y+offer.size*1.4+24*markScale-area.y);area={...area,y:area.y+extra,h:area.h-extra};}
  if(campaign&&artDirectionFor(p.productProfile.category,p.format,p.campaign?.creative?.note??'').copyZone==='bottom'){
   title={...title,y:title.y-65*markScale};description={...description,y:description.y-65*markScale};offer={...offer,y:offer.y-65*markScale};
  }
 }
 // The label and value share the same spec block across all layouts.
 const specLabel=box(summary.x+28*markScale,summary.y+summary.h*.175,summary.w-56*markScale,18*markScale);
 const specValue=box(summary.x+28*markScale,summary.y+summary.h*.49,summary.w-56*markScale,(summary.h<100&&markScale===1?26:30)*markScale);
 if(!visual)return {width,height,area,photo:area,brand,title,description,offer,summary,specLabel,specValue,footerLine,company,contact,markScale,textOnly};
 const reference=boxProjectionReady(p)?{width:720,height:540}:visual;
 const fit=Math.min(area.w/reference.width,area.h/reference.height)*(p.presentation==='campaign'&&hasUsableCreative(p)?1:p.scale);
 const w=reference.width*fit,h=reference.height*fit;
 const photo={x:area.x+(area.w-w)/2,y:area.y+(area.h-h)/2,w,h};
 return {width,height,area,photo,brand,title,description,offer,summary,specLabel,specValue,footerLine,company,contact,markScale,textOnly};
}


