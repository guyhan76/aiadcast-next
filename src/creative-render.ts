import type {Project} from './model.ts';
import {creativeLooks,creativeSettings} from './creative.ts';

// Optional vector decoration behind existing layers; never redraws the product.
export function paintCreativeFrame(ctx:CanvasRenderingContext2D,p:Project,width:number,height:number){
 if(!p.campaign?.creative)return;
 const settings=creativeSettings(p),look=creativeLooks.find(l=>l.id===settings.look)!;
 if(!look)return;
 const unit=Math.min(width,height)/1080;
 ctx.save();ctx.strokeStyle=look.accent;ctx.fillStyle=look.accent;ctx.lineWidth=unit;
 if(settings.look==='editorial'){
  ctx.fillRect(26*unit,60*unit,4*unit,98*unit);
  ctx.globalAlpha=.5;ctx.fillRect(width-64*unit,44*unit,26*unit,2*unit);
 }else if(settings.look==='signature'){
  ctx.globalAlpha=.5;ctx.strokeRect(26*unit,26*unit,width-52*unit,height-52*unit);
  ctx.globalAlpha=.85;ctx.fillRect(width-87*unit,59*unit,32*unit,2*unit);
 }else if(settings.look==='natural'){
  ctx.globalAlpha=.055;ctx.beginPath();ctx.ellipse(width*.92,height*.87,width*.3,height*.25,-.5,0,2*Math.PI);ctx.fill();
  ctx.globalAlpha=.5;ctx.fillRect(28*unit,61*unit,3*unit,52*unit);
 }else{
  ctx.globalAlpha=.5;
  for(const [x,y,dx,dy] of [[26*unit,26*unit,1,1],[width-26*unit,26*unit,-1,1],[26*unit,height-26*unit,1,-1],[width-26*unit,height-26*unit,-1,-1]]){
   ctx.beginPath();ctx.moveTo(x,y+44*unit*dy);ctx.lineTo(x,y);ctx.lineTo(x+44*unit*dx,y);ctx.stroke();
  }
  ctx.globalAlpha=.06;ctx.beginPath();ctx.arc(width*.94,height*.88,width*.19,0,2*Math.PI);ctx.stroke();
 }
 ctx.restore();
}
