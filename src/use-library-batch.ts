import {useEffect,useRef,useState} from 'react';
import type {AdBatch} from './batch-price';
import {apiRequest,verifiedArtifact,type GenerationJob} from './generation-client';
import {readLibraryBatch,type BatchSummary} from './library-batches';

type Status=ReturnType<typeof readLibraryBatch>['state']|'checking';

export function useLibraryBatch(batch?:AdBatch){
 const ref=useRef<HTMLButtonElement>(null);
 const [status,setStatus]=useState<Status>('checking'),[image,setImage]=useState('');
 const id=batch?.id,count=batch?.count,slots=batch?.savedSlots?.join(',')??'';
 useEffect(()=>{
  if(!id||!count||!ref.current)return;
  const request={id,count,savedSlots:slots?slots.split(',').map(Number):[]};
  const controller=new AbortController(),signal=controller.signal;
  let timer:ReturnType<typeof setTimeout>,visible=false,busy=false,settled=false,coverHash='';
  const foreground=()=>document.visibilityState!=='hidden';
  async function refresh(){
   clearTimeout(timer);
   if(busy||signal.aborted||!visible||!foreground())return;
   busy=true;
   let checked=false;
   try{
    const summary=await apiRequest<BatchSummary>('/api/ad-batches/'+id,undefined,signal);
    if(signal.aborted)return;
    const {state,cover}=readLibraryBatch(request,summary);
    checked=true;
    setStatus(state);
    if(cover?.artifactId && cover.artifactId!==coverHash){
     const {job}=await apiRequest<{job:GenerationJob}>('/api/generations/'+encodeURIComponent(cover.id),undefined,signal);
     if(job.id!==cover.id||job.projectId!==cover.projectId||job.artifact?.sha256!==cover.artifactId||!['ready','accepted'].includes(job.state))return;
     const asset=await verifiedArtifact(job);
     if(signal.aborted)return;
     setImage(asset.data);coverHash=asset.sha256;
    }
    settled=state!=='running'&&state!=='unknown';
   }catch{
    if(!signal.aborted&&!checked)setStatus(previous=>previous==='running'?'unknown':previous);
   }
   finally{
    busy=false;
    if(!signal.aborted&&visible&&!settled&&foreground())timer=setTimeout(refresh,10000);
   }
  }
  const resume=()=>{if(!settled)void refresh();};
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
   visible=entries.some(entry=>entry.isIntersecting);
   if(visible)resume();else clearTimeout(timer);
  }):undefined;
  if(observer)observer.observe(ref.current);else{visible=true;resume();}
  document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);
  return ()=>{controller.abort();clearTimeout(timer);observer?.disconnect();document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);};
 },[id,count,slots]);
 return {ref,status,image};
}
