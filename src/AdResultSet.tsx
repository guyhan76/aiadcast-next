import {useEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import type {Project} from './model';
import {projects} from './storage';
import {storageNamespace} from './beta-session';
import {orderedResults} from './result-set';
import {useUiLanguage} from './ui-language';
import './result-set.css';

type ItemProps={project:Project;autoRequest?:string;onAutoHandled:()=>void;onResultReady:(projectId:string,data:string)=>void;onQueueCancelled:()=>void};
export function AdResultSet({project,change,autoRequest,onAutoHandled,children}:{project:Project;change:(fn:(p:Project)=>Project)=>void;autoRequest?:string;onAutoHandled:()=>void;children:(props:ItemProps)=>ReactNode}) {
 const {t}=useUiLanguage(),owner=useRef(storageNamespace()),alive=useRef(true),running=useRef(false),consumed=useRef(''),advanced=useRef(new Set<string>());
 const latest=useRef(project);latest.current=project;
 const [items,setItems]=useState<Project[]>([]),[ready,setReady]=useState(false),[error,setError]=useState(''),[intent,setIntent]=useState<string>(),[sequence,setSequence]=useState(false),[previews,setPreviews]=useState<Record<string,string>>({});
 const valid=()=>alive.current&&owner.current===storageNamespace();
 function stop(){running.current=false;setSequence(false);setIntent(undefined);}
 useEffect(()=>{alive.current=true;let cancelled=false;void projects().then(values=>{if(!cancelled&&valid()){const ordered=orderedResults(latest.current,values);if(ordered.length!==latest.current.resultSet?.projectIds.length)throw Error('INCOMPLETE_RESULT_SET');setItems(ordered);setReady(true);}}).catch(()=>{if(!cancelled)setError(t('이미지 목록을 불러오지 못했습니다. 기존 광고는 보존됩니다.','Could not load the image list. Existing ads are preserved.'));});const hidden=()=>{if(document.visibilityState==='hidden')stop();};const exit=()=>{alive.current=false;running.current=false;};document.addEventListener('visibilitychange',hidden);window.addEventListener('aiadcast-session-change',exit);window.addEventListener('pagehide',stop);return()=>{cancelled=true;exit();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('aiadcast-session-change',exit);window.removeEventListener('pagehide',stop);};},[]);
 useEffect(()=>{setItems(old=>old.map(p=>p.id===project.id?project:p));},[project]);
 useEffect(()=>{if(!ready||!autoRequest||consumed.current===autoRequest||!valid()||document.visibilityState!=='visible')return;consumed.current=autoRequest;advanced.current.clear();running.current=true;setSequence(true);setIntent(autoRequest);onAutoHandled();},[ready,autoRequest]);
 function select(next:Project){stop();change(()=>next);}
 function completed(projectId:string,data:string){
  if(!valid()||projectId!==latest.current.id)return;
  setPreviews(old=>old[projectId]===data?old:{...old,[projectId]:data});
  if(!running.current||document.visibilityState!=='visible'||advanced.current.has(projectId))return;
  advanced.current.add(projectId);
  const index=items.findIndex(p=>p.id===projectId),next=items[index+1];
  if(index<0||!next){stop();return;}
  // Each item goes through GenerationPanel's existing recovery, quote and budget admission.
  // No network request is manufactured here and no uncertain item is skipped.
  change(()=>next);setIntent(crypto.randomUUID());
 }
 return <div className="ad-result-set"><div className="result-picker" role="group" aria-label={t('수정할 광고 이미지 선택','Choose an ad image to edit')}>{items.map((p,index)=><button type="button" key={p.id} aria-pressed={p.id===project.id} aria-label={t(`${index+1}번 광고 선택`,`Select ad ${index+1}`)} onClick={()=>select(p)}>{(previews[p.id]??p.generated?.asset.data)&&<img src={previews[p.id]??p.generated?.asset.data} alt=""/>}<span>{index+1}</span></button>)}</div>{sequence&&<button type="button" onClick={stop}>{t('남은 이미지 생성 멈추기','Stop remaining images')}</button>}{error&&<p role="alert">{error}</p>}{ready&&children({project,autoRequest:intent,onAutoHandled:()=>setIntent(undefined),onResultReady:completed,onQueueCancelled:stop})}</div>;
}
