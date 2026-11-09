import {useEffect,useRef,useState} from 'react';
import type {Project} from './model';
import {apiRequest,type ApiStatus,type GenerationJob,type CreditQuote} from './generation-client';
import {storageNamespace} from './beta-session';
import {SelectiveImageEditor} from './SelectiveImageEditor';
import {acceptedEditSourceMatches} from './selective-source';
import {useUiLanguage} from './ui-language';

export function AcceptedAdEdit({project}:{project:Project}){
 const {t}=useUiLanguage(),latest=useRef(project);latest.current=project;
 const request=useRef<AbortController|null>(null),alive=useRef(true),lock=useRef(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[editing,setEditing]=useState<{source:GenerationJob;quote:CreditQuote}>();
 useEffect(()=>{alive.current=true;const cancel=()=>{request.current?.abort();setEditing(undefined);};window.addEventListener('aiadcast-session-change',cancel);window.addEventListener('hashchange',cancel);return()=>{alive.current=false;request.current?.abort();window.removeEventListener('aiadcast-session-change',cancel);window.removeEventListener('hashchange',cancel);};},[]);
 async function open(){
  if(lock.current||!project.generated)return;lock.current=true;setBusy(true);setMessage('');
  const source=project,owner=storageNamespace(),controller=new AbortController();request.current=controller;
  const valid=()=>alive.current&&!controller.signal.aborted&&latest.current===source&&storageNamespace()===owner;
  try{
   const [status,result]=await Promise.all([apiRequest<ApiStatus>('/api/status',undefined,controller.signal),apiRequest<{job:GenerationJob}>(`/api/generations/${encodeURIComponent(source.generated!.jobId)}`,undefined,controller.signal)]);
   if(!valid())return;
   if(!status.generation.selectiveEdit||status.generation.selectiveEditProofVersion!==1||!status.generation.creditQuote){setMessage(t('부분수정 연결을 준비 중입니다. 원본은 보관되어 있습니다.','Area editing is not available yet. Your original is preserved.'));return;}
   if(!acceptedEditSourceMatches(source,result.job))throw Error('SOURCE_MISMATCH');
   setEditing({source:result.job,quote:status.generation.creditQuote});
  }catch{if(valid())setMessage(t('수정할 원본을 확인하지 못했습니다. 원본은 변경하지 않았습니다.','Could not verify this original. It has not been changed.'));}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <><button type="button" disabled={busy} onClick={()=>void open()}>{t('부분수정','Edit selected area')}</button>{message&&<p role="status">{message}</p>}{editing&&<SelectiveImageEditor source={editing.source} quote={editing.quote} project={project} onClose={()=>setEditing(undefined)}/>}</>;
}
