import {useEffect,useRef,useState} from 'react';
import {apiRequest} from './generation-client';
import {betaSession} from './beta-session';
import {exportBatch} from './batch-export';
import {downloadVideoOriginal} from './video-ai-client';
import {useUiLanguage} from './ui-language';
import './video-project-history.css';

type VideoRow={id:string;expires_at:number};

function VideoOriginal({id}:{id:string}){
 const {t}=useUiLanguage();
 const [media,setMedia]=useState<{file:File;url:string}>();
 const [failed,setFailed]=useState(false),[attempt,retry]=useState(0);
 const [saveState,setSaveState]=useState<'idle'|'saving'|'saved'|'error'>('idle');
 const lifetime=useRef<AbortController|null>(null);
 useEffect(()=>{
  const controller=new AbortController();
  lifetime.current=controller;
  let url='';
  setFailed(false);
  void downloadVideoOriginal(id,controller.signal,betaSession()?.token).then(blob=>{
   if(controller.signal.aborted)return;
   const file=new File([blob],'aiadcast-'+id+'.mp4',{type:'video/mp4'});
   url=URL.createObjectURL(file);
   setMedia({file,url});
  }).catch(()=>{if(!controller.signal.aborted)setFailed(true);});
  return ()=>{controller.abort();if(url)URL.revokeObjectURL(url);};
 },[id,attempt]);
 async function save(){
  const signal=lifetime.current?.signal;
  if(!media||!signal||signal.aborted||saveState==='saving')return;
  setSaveState('saving');
  try{await exportBatch([media.file],'save',signal);if(!signal.aborted)setSaveState('saved');}
  catch{if(!signal.aborted)setSaveState('error');}
 }
 if(failed)return <p role="alert">{t('영상 원본을 열지 못했습니다.','Could not open the original video.')} <button onClick={()=>retry(v=>v+1)}>{t('다시 시도','Retry')}</button></p>;
 if(!media)return <p role="status">{t('영상을 불러오는 중…','Loading video…')}</p>;
 return <div className="video-project-player">
  <video controls playsInline preload="metadata" src={media.url} aria-label={t('영상 원본','Original video')}/>
  <button type="button" disabled={saveState==='saving'} onClick={()=>void save()}>{t('원본 저장','Save original')}</button>
  {saveState==='saved'&&<span role="status">{t('저장을 요청했습니다.','Save requested.')}</span>}
  {saveState==='error'&&<span role="alert">{t('저장하지 못했습니다. 다시 시도해 주세요.','Could not save. Please retry.')}</span>}
 </div>;
}

export function VideoProjectHistory(){
 const {language,t}=useUiLanguage();
 const [videos,setVideos]=useState<VideoRow[]>(),[failed,setFailed]=useState(false);
 const [attempt,retry]=useState(0),[selected,setSelected]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  setFailed(false);
  void apiRequest<{videos:VideoRow[]}>('/api/videos',undefined,controller.signal).then(data=>{
   if(!controller.signal.aborted)setVideos(data.videos.filter(row=>row.expires_at>Date.now()));
  }).catch(()=>{if(!controller.signal.aborted)setFailed(true);});
  return ()=>controller.abort();
 },[attempt]);
 useEffect(()=>{
  if(!videos?.length)return;
  const expires=Math.min(...videos.map(row=>Number(row.expires_at)));
  const timer=setTimeout(()=>setVideos(rows=>rows?.filter(row=>row.expires_at>Date.now())),Math.max(1,expires-Date.now()+1));
  return ()=>clearTimeout(timer);
 },[videos]);
 const stamp=(ms:number)=>new Date(ms).toLocaleString(language==='ko'?'ko-KR':'en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
 return <section className="download-library video-projects" aria-label={t('생성한 영상','Generated videos')}>
  <p>{t('영상 생성 후 24시간 동안 재생 저장할 수 있습니다.','Original videos are available for 24 hours from the generation request.')}</p>
  {failed?<p role="alert">{t('영상 목록을 불러오지 못했습니다.','Could not load your videos.')} <button onClick={()=>retry(v=>v+1)}>{t('다시 시도','Retry')}</button></p>
   :!videos?<p role="status">{t('불러오는 중…','Loading…')}</p>
   :videos.length===0?<p>{t('보관 중인 영상이 없습니다.','No videos currently available.')}</p>
   :<ul className="ad-cards">{videos.map(row=><li key={row.id} className="ad-card">
    <strong>{t('광고영상','Video ad')} · {stamp(row.expires_at-86400000)}</strong>
    <small>{t('보관 기한','Available until')} · {stamp(Number(row.expires_at))}</small>
    <button type="button" aria-expanded={selected===row.id} onClick={()=>setSelected(selected===row.id?'':row.id)}>{selected===row.id?t('닫기','Close'):t('영상 보기','View video')}</button>
    {selected===row.id&&<VideoOriginal id={row.id}/>}
   </li>)}</ul>}
 </section>;
}
