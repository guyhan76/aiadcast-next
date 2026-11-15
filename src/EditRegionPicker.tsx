import {useRef,useState,type CSSProperties,type PointerEvent} from 'react';
import {useUiLanguage} from './ui-language';

export type SelectedRegion=[number,number,number,number];
type Point=[number,number];
const clamp=(value:number)=>Math.max(0,Math.min(1000,Math.round(value)));
function rectangle(a:Point,b:Point):SelectedRegion{
 return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];
}
function styleFor([l,t,r,b]:SelectedRegion):CSSProperties{
 return {left:l/10+'%',top:t/10+'%',width:(r-l)/10+'%',height:(b-t)/10+'%'};
}
export function EditRegionPicker({original,width,height,regions,onChange}:{original:string;width:number;height:number;regions:SelectedRegion[];onChange:(regions:SelectedRegion[])=>void}){
 const {t}=useUiLanguage();
 const [anchor,setAnchor]=useState<Point|null>(null),[cursor,setCursor]=useState<Point>([500,500]);
 const contact=useRef<{start:Point;id:number}|null>(null);
 function point(e:PointerEvent<HTMLDivElement>):Point{
  const bounds=e.currentTarget.getBoundingClientRect();
  return [clamp((e.clientX-bounds.left)*1000/bounds.width),clamp((e.clientY-bounds.top)*1000/bounds.height)];
 }
 function commit(start:Point,end:Point){
  const box=rectangle(start,end);
  if(box[2]-box[0]<3||box[3]-box[1]<3)return false;
  onChange([...regions,box]);setAnchor(null);return true;
 }
 return <section className="edit-picker">
  <p>{t('바꿀 부분의 두 모서리를 누르거나 드래그하세요. 여러 곳을 선택할 수 있습니다.','Tap two opposite corners or drag. You can select several areas.')}</p>
  <div className="edit-picker-frame" style={{width:'min(100%, '+(40*width/height)+'dvh)',aspectRatio:width+'/'+height}} role="group" tabIndex={0} aria-label={t('수정 영역 선택. 방향키로 이동하고 Enter로 모서리 선택','Edit area. Use arrows to move and Enter to mark a corner')}
   onPointerDown={e=>{if(!e.isPrimary||e.button!==0||regions.length>=12)return;const start=point(e);e.currentTarget.setPointerCapture(e.pointerId);contact.current={start,id:e.pointerId};setCursor(start);if(!anchor)setAnchor(start);}}
   onPointerMove={e=>{if(e.pointerId===contact.current?.id)setCursor(point(e));}}
   onPointerUp={e=>{const drag=contact.current;if(!drag||drag.id!==e.pointerId)return;contact.current=null;const end=point(e);setCursor(end);commit(anchor??drag.start,end);}}
   onPointerCancel={()=>{contact.current=null;setAnchor(null);}}
   onKeyDown={e=>{if(e.key==='Escape'&&anchor){e.preventDefault();e.stopPropagation();setAnchor(null);return;}
    if(e.key==='Enter'||e.key===' '){e.preventDefault();if(regions.length>=12)return;if(anchor)commit(anchor,cursor);else setAnchor(cursor);return;}
    const delta:Record<string,Point>={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]};
    const step=delta[e.key];if(step){e.preventDefault();setCursor(([x,y])=>[clamp(x+step[0]),clamp(y+step[1])]);}
   }}>
   <img src={original} alt={t('원본 광고','Original ad')} draggable={false}/>
   {regions.map((box,i)=><span className="edit-area-box" key={i} style={styleFor(box)}/>)}
   {anchor&&<span className="edit-area-box provisional" style={styleFor(rectangle(anchor,cursor))}/>}
   <span className={'edit-area-cursor'+(anchor?' active':'')} style={{left:cursor[0]/10+'%',top:cursor[1]/10+'%'}}/>
  </div>
  <div className="edit-picker-tools"><span aria-live="polite">{t('선택한 영역 '+regions.length+'개',regions.length+' areas selected')}</span>
   <button type="button" disabled={!anchor&&!regions.length} onClick={()=>{if(anchor)setAnchor(null);else onChange(regions.slice(0,-1));}}>{t('선택 취소','Undo selection')}</button></div>
 </section>;
}
