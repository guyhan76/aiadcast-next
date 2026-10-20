import {useEffect,useRef,useState} from 'react';
import {useUiLanguage} from './ui-language';
let pending=false;
let ask:((action:()=>void)=>void)|undefined;
export function setUnacceptedPreview(value:boolean){pending=value;}
export function requestPreviewLeave(action:()=>void){if(pending&&ask)ask(action);else action();}
export function PreviewLeaveGuard(){
 const {t}=useUiLanguage(),dialog=useRef<HTMLDialogElement>(null),next=useRef<(()=>void)|null>(null);
 const [open,setOpen]=useState(false);
 useEffect(()=>{
  ask=action=>{next.current=action;setOpen(true);};let hash=location.hash,bypass=false;
  const click=(event:MouseEvent)=>{const a=(event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement|null;if(!pending||!a||a.hasAttribute('download')||a.href===location.href)return;event.preventDefault();event.stopImmediatePropagation();requestPreviewLeave(()=>a.click());};
  const back=(event:Event)=>{if(!pending||dialog.current?.open)return;event.preventDefault();event.stopImmediatePropagation();requestPreviewLeave(()=>window.dispatchEvent(new Event('aiadcast-native-back',{cancelable:true})));};
  const changed=(event:HashChangeEvent)=>{if(!pending||bypass){bypass=false;hash=location.hash;return;}const target=location.hash;event.stopImmediatePropagation();history.replaceState(null,'',location.pathname+location.search+hash);requestPreviewLeave(()=>{bypass=true;location.hash=target;});};
  const unload=(event:BeforeUnloadEvent)=>{if(pending){event.preventDefault();event.returnValue='';}};
  document.addEventListener('click',click,true);window.addEventListener('hashchange',changed,true);window.addEventListener('aiadcast-native-back',back,true);window.addEventListener('beforeunload',unload);
  return()=>{ask=undefined;pending=false;document.removeEventListener('click',click,true);window.removeEventListener('hashchange',changed,true);window.removeEventListener('aiadcast-native-back',back,true);window.removeEventListener('beforeunload',unload);};
 },[]);
 useEffect(()=>{if(open&&!dialog.current?.open)dialog.current?.showModal();},[open]);
 function stay(){next.current=null;setOpen(false);dialog.current?.close();}
 function leave(){const action=next.current;pending=false;stay();action?.();}
 return <dialog ref={dialog} aria-label={t('미확정 시안 나가기','Leave unaccepted preview')} onCancel={e=>{e.preventDefault();stay();}}><p>{t('사용 확정 전입니다. 나가면 이 시안은 내 프로젝트에 저장되지 않습니다.','This preview is not accepted. If you leave, it will not be saved in My Projects.')}</p><button onClick={stay}>{t('계속 보기','Keep viewing')}</button><button onClick={leave}>{t('저장하지 않고 나가기','Leave without saving')}</button></dialog>;
}
