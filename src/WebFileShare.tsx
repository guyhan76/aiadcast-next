import {useEffect,useRef,useState} from 'react';
import {exportBatch} from './batch-export';
import {useUiLanguage} from './ui-language';

type SharePrompt={count:number;remaining:number;open:()=>void;cancel:()=>void};

function ShareDialog({prompt}:{prompt:SharePrompt}){
 const ref=useRef<HTMLDialogElement>(null),{t}=useUiLanguage();
 useEffect(()=>{const dialog=ref.current!;dialog.showModal();return ()=>dialog.close();},[]);
 return <dialog ref={ref} className="delivery-lightbox share-dialog" aria-label={t('원본 공유','Share originals')} onCancel={e=>{e.preventDefault();prompt.cancel();}}>
  <p>{prompt.count===prompt.remaining?t('원본 '+prompt.count+'장을 공유할 준비가 됐습니다.',prompt.count+' originals ready to share.'):
   t('남은 '+prompt.remaining+'장 중 '+prompt.count+'장을 공유합니다.', 'Share '+prompt.count+' of '+prompt.remaining+' remaining originals.')}</p>
  <div className="preview-actions"><button type="button" onClick={prompt.open}>{t('공유 창 열기','Open share sheet')}</button>
   <button type="button" onClick={prompt.cancel}>{t('취소','Cancel')}</button></div>
 </dialog>;
}

export function useWebFileShare(){
 const [prompt,setPrompt]=useState<SharePrompt>();
 function shareOnTap(files:File[],remaining:number,signal:AbortSignal){
  signal.throwIfAborted();
  return new Promise<void>((resolve,reject)=>{
   let started=false,settled=false;
   function finish(error?:unknown){
    if(settled)return;
    settled=true;
    signal.removeEventListener('abort',cancel);
    if(!signal.aborted)setPrompt(undefined);
    if(error)reject(error);else resolve();
   }
   const cancel=()=>finish(new DOMException('Cancelled','AbortError'));
   setPrompt({count:files.length,remaining,cancel,open:()=>{
    if(started||signal.aborted)return;
    started=true;
    void exportBatch(files,'share',signal).then(()=>finish(),finish);
   }});
   signal.addEventListener('abort',cancel,{once:true});
  });
 }
 async function share(files:File[],signal:AbortSignal,onOpened:(count:number)=>void){
  let start=0;
  while(start<files.length){
   signal.throwIfAborted();
   const remaining=files.length-start;
   let count=remaining,group=files.slice(start);
   // Browsers differ in both the number and the total size of files they accept.
   while(!navigator.canShare?.({files:group})){
    if(count===1)throw Error('SHARE_UNAVAILABLE');
    count=Math.ceil(count/2);group=files.slice(start,start+count);
   }
   if(start===0&&count===remaining&&navigator.userActivation?.isActive){
    try{await exportBatch(group,'share',signal);}
    catch(error){
     if(!(error instanceof DOMException&&error.name==='NotAllowedError'))throw error;
     await shareOnTap(group,remaining,signal);
    }
   }else await shareOnTap(group,remaining,signal);
   onOpened(count);start+=count;
  }
 }
 return {share,dialog:prompt?<ShareDialog prompt={prompt}/>:null};
}
