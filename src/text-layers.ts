import type {Asset} from './model.ts';
export type TextLayer={id:string;text:string;x:number;y:number;width:number;height:number;size:number;color:string;bold:boolean;align:'left'|'center'|'right';cover:string|null};
export type TextEdit={source:Asset;layers:TextLayer[];saved:TextLayer[]};
export function parseTextLayers(raw:unknown):TextLayer[]{
 if(!Array.isArray(raw)||raw.length>20)throw Error('글씨는 최대 20개입니다.');
 if(new Set(raw.map(v=>v?.id)).size!==raw.length)throw Error('글씨 레이어 ID가 중복되었습니다.');
 return raw.map(v=>{if(!v||typeof v.id!=='string'||v.id.length>100||typeof v.text!=='string'||v.text.length>500||!/^#[a-f0-9]{6}$/i.test(v.color)||!(v.cover===null||/^#[a-f0-9]{6}$/i.test(v.cover))||typeof v.bold!=='boolean'||!['left','center','right'].includes(v.align)||!['x','y','width','height','size'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k]))||v.x<0||v.y<0||v.width<=0||v.height<=0||v.x+v.width>1.000001||v.y+v.height>1.000001||v.size<.005||v.size>.2)throw Error('글씨 영역과 내용을 확인해주세요.');return {id:v.id,text:v.text,x:v.x,y:v.y,width:v.width,height:v.height,size:v.size,color:v.color,cover:v.cover,bold:v.bold,align:v.align};});
}
export async function parseTextEdit(raw:unknown,asset:(v:unknown)=>Promise<Asset|null>):Promise<TextEdit|undefined>{if(raw===undefined)return;const r=raw as TextEdit;if(!r)throw Error('글씨 편집 형식을 확인해주세요.');const source=await asset(r.source);if(!source)throw Error('원본 광고가 없습니다.');return {source,layers:parseTextLayers(r.layers),saved:parseTextLayers(r.saved)};}
export function layerRect(l:TextLayer,w:number,h:number){const x=Math.round(l.x*w),y=Math.round(l.y*h);return {x,y,width:Math.min(w-x,Math.round(l.width*w)),height:Math.min(h-y,Math.round(l.height*h))};}
// Local raster composition only. Clip every edit, including glyph antialiasing, to its explicit rectangle.
export async function renderTextLayers(canvas:HTMLCanvasElement,source:Asset,layers:TextLayer[]){
 const valid=parseTextLayers(layers);
 if(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(source.data)||source.data.length>14_000_000||source.width*source.height>30_000_000||source.width<1||source.height<1)throw Error('지원하는 크기의 원본 이미지를 확인해주세요.');
 const img=new Image();img.src=source.data;await img.decode();
 if(img.naturalWidth!==source.width||img.naturalHeight!==source.height)throw Error('원본 해상도가 일치하지 않습니다.');
 await Promise.all(valid.map(l=>document.fonts.load(`${l.bold?700:400} ${Math.max(1,Math.round(l.size*source.height))}px "Noto Sans KR Variable"`,l.text||'가')));
 canvas.width=source.width;canvas.height=source.height;const ctx=canvas.getContext('2d');if(!ctx)throw Error('이미지를 표시하지 못했습니다.');ctx.drawImage(img,0,0);
 for(const l of valid){const r=layerRect(l,canvas.width,canvas.height),size=Math.max(1,Math.round(l.size*canvas.height));ctx.save();ctx.beginPath();ctx.rect(r.x,r.y,r.width,r.height);ctx.clip();if(l.cover){ctx.fillStyle=l.cover;ctx.fillRect(r.x,r.y,r.width,r.height);}ctx.font=`${l.bold?700:400} ${size}px "Noto Sans KR Variable", sans-serif`;ctx.textBaseline='top';ctx.textAlign=l.align;ctx.fillStyle=l.color;const x=r.x+(l.align==='center'?r.width/2:l.align==='right'?r.width:0);l.text.split('\n').forEach((line,i)=>ctx.fillText(line,x,r.y+i*size*1.3));ctx.restore();}
}
