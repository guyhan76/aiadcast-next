import {useEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {Minus,Plus,X} from 'lucide-react';
import {useUiLanguage} from './ui-language';
import './image-review.css';

export function ImageReview({children,label,onClose}:{children:ReactNode;label:string;onClose:()=>void}){
 const {t}=useUiLanguage(),dialog=useRef<HTMLDialogElement>(null),[zoom,setZoom]=useState(false);
 useEffect(()=>{
  const element=dialog.current!,opener=document.activeElement as HTMLElement|null;element.showModal();
  const previous=document.body.style.overflow;document.body.style.overflow='hidden';
  const back=(event:Event)=>{if(!element.open)return;event.preventDefault();event.stopImmediatePropagation();onClose();};
  window.addEventListener('aiadcast-native-back',back,true);
  return()=>{element.close();document.body.style.overflow=previous;window.removeEventListener('aiadcast-native-back',back,true);if(opener?.isConnected)opener.focus({preventScroll:true});};
 },[]);
 return <dialog ref={dialog} className="image-review-dialog" aria-label={label} onCancel={e=>{e.preventDefault();onClose();}}>
  <div className="image-review-toolbar"><strong>{label}</strong><button type="button" aria-label={zoom?t('축소','Zoom out'):t('확대','Zoom in')} onClick={()=>setZoom(v=>!v)}>{zoom?<Minus size={18}/>:<Plus size={18}/>} {zoom?'100%':'200%'}</button><button type="button" aria-label={t('확대 보기 닫기','Close enlarged view')} onClick={onClose}><X size={22}/></button></div>
  <div className="image-review-scroll"><div className={`image-review-content${zoom?' zoomed':''}`}>{children}</div></div>
 </dialog>;
}
