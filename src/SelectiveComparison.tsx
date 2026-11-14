import {useState} from 'react';
import type {CSSProperties} from 'react';
import {comparisonViewport,type SelectivePreservation} from './selective-preservation';
import {useUiLanguage} from './ui-language';

export function SelectiveComparison({original,result,width,height,bounds}:{original:string;result:string;width:number;height:number;bounds?:SelectivePreservation['bounds']}){
 const {t}=useUiLanguage(),[split,setSplit]=useState(50),[zoom,setZoom]=useState(false);
 const view=comparisonViewport(width,height,zoom?bounds:undefined);
 const imageStyle:CSSProperties={width:`${100*width/view.width}%`,left:`${-100*view.x/view.width}%`,top:`${-100*view.y/view.height}%`};
 return <div className="selective-comparison">
  <p>{t('왼쪽 원본 · 오른쪽 수정본','Original on the left · Edit on the right')}</p>
  <div className="selective-wipe" style={{aspectRatio:`${view.width}/${view.height}`}}>
   <img src={original} alt={t('원본','Before')} style={imageStyle}/>
   <div className="selective-wipe-after" style={{clipPath:`inset(0 0 0 ${split}%)`}}><img src={result} alt={t('수정 결과','After')} style={imageStyle}/></div>
   <span aria-hidden="true" className="selective-wipe-line" style={{left:`${split}%`}}/>
  </div>
  <label>{t('원본과 수정본 비교','Compare original and edit')}<input type="range" min="0" max="100" value={split} onChange={e=>setSplit(Number(e.target.value))}/></label>
  {bounds&&<button type="button" aria-pressed={zoom} onClick={()=>setZoom(v=>!v)}>{zoom?t('광고 전체 비교','Compare full ad'):t('수정 부분 확대','Enlarge edited area')}</button>}
 </div>;
}
