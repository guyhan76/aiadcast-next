import {useEffect,useRef,useState} from 'react';
import type {VideoDraft} from './VideoDurationEditor';
import {openReviewVideo,renderRepair,reviewMovie,sampleFrame,type ReviewIssue,type RepairMode} from './video-shot-repair';
import {videoFormat,type LoadedVideoScene} from './video-compose';
import type {VideoRequestStage} from './video-ai-client';
import {useUiLanguage} from './ui-language';
import {VideoCostDialog} from './VideoCostDialog';
import {styleForBrief} from './video-style';

type Generator=(draft:VideoDraft,seconds:number,signal:AbortSignal,onState:(stage:VideoRequestStage)=>void,scenes:LoadedVideoScene[])=>Promise<Blob>;
type Props={file:File;draft:VideoDraft;seconds:number;admin:boolean;availableCredits:number;prices?:Partial<Record<number,number>>;
  generate?:Generator;provider?:string;busy:boolean;onBusy:(busy:boolean)=>void;onApply:(file:File)=>void};

export function VideoShotRepair({file,draft,seconds,admin,availableCredits,prices,generate,provider,busy,onBusy,onApply}:Props){
  const {t,language}=useUiLanguage();
  const [from,setFrom]=useState(0),[to,setTo]=useState(Math.min(seconds,3));
  const [mode,setMode]=useState<RepairMode>('clip'),[replacement,setReplacement]=useState<File>();
  const [note,setNote]=useState(''),[status,setStatus]=useState(''),[issues,setIssues]=useState<ReviewIssue[]>();
  const [confirm,setConfirm]=useState(false);
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  const valid=Number.isFinite(from)&&Number.isFinite(to)&&from>=0&&to>from&&to<=seconds;
  const length=Math.max(10,Math.ceil(to-from)),cost=admin?0:prices?.[length];
  const supported=!!videoFormat(true)&&typeof AudioContext!=='undefined';
  const prompt=[draft.brief.title,draft.brief.description,draft.brief.emphasis,
    draft.promptMode==='manual'?draft.manualPrompt:draft.review?.shots.join('\n')].filter(Boolean).join('\n');
  async function run(label:string,work:(signal:AbortSignal)=>Promise<void>){
    if(controller.current||busy)return;
    const task=new AbortController();controller.current=task;onBusy(true);setStatus(label);
    try{await work(task.signal);}
    catch(err){if(!task.signal.aborted)setStatus(err instanceof Error&&err.message==='CLIP_TOO_SHORT'?
      t('선택한 구간보다 긴 파일을 넣어 주세요.','Choose a file that covers the interval.'):
      t('작업을 완료하지 못했어요. 원본을 다시 확인해 주세요.','Could not finish. The original is still available.'));}
    finally{controller.current=null;if(!task.signal.aborted)onBusy(false);}
  }
  async function makeClip(signal:AbortSignal){
    if(!generate||!valid)return;
    const {video,dispose}=await openReviewVideo(file,signal);
    let anchor:string;
    try{anchor=await sampleFrame(video,Math.max(0,from-.08),1024,signal);}finally{dispose();}
    const plan='Create a single replacement shot for the interval '+from+'–'+to+' seconds of this advertisement. The first reference shows its visual context. Use the remaining references for product identity. Start the correction immediately. Complete it in '+(to-from)+' seconds and hold the result. Keep prop identity and casting stable. Use quiet room tone unless speech or sound is requested. No added lettering.\nProduct: '+draft.brief.title+'\nApproved correction: '+note.trim();
    const sources=[{name:'cut-context.jpg',kind:'image' as const,media:anchor},...draft.sources.filter(source=>source.kind==='image').slice(0,3)];
    const clip=await generate({...draft,sources,promptMode:'manual',manualPrompt:plan,review:undefined,file:undefined},length,signal,()=>{},[]);
    signal.throwIfAborted();setReplacement(new File([clip],'replacement.mp4',{type:'video/mp4'}));setStatus(t('교체할 장면이 준비됐어요. 구간 적용을 눌러 주세요.','Replacement ready. Apply it to the interval.'));
  }
  return <details className="vd-prompt"><summary>{t('완성본 검수 · 구간 수정','Review and repair finished video')}</summary>
    <fieldset disabled={busy}><button type="button" className="vd-library" onClick={()=>void run(t('장면 확인 중…','Reviewing frames…'),async signal=>{
      const found=await reviewMovie(file,seconds,prompt,language,signal);signal.throwIfAborted();setIssues(found);
      setStatus(t('샘플 화면 검수가 끝났어요. 대사와 소리는 재생해 확인해 주세요.','Frame review complete. Play the video to check speech and sound.'));
    })}>{t('AI 화면 검수','Review sampled frames')}</button>
    {issues?.length===0&&<p>{t('샘플 화면에서 지적된 문제가 없어요.','No issue reported in the sampled frames.')}</p>}
    {issues?.map((item,i)=><button type="button" key={i} onClick={()=>{setFrom(Math.max(0,Math.floor(item.time)-1));setTo(Math.min(seconds,Math.ceil(item.time)+2));setNote(item.note);setReplacement(undefined);}}>{item.time}s · {item.note}</button>)}
    <label>{t('시작(초)','From (s)')}<input type="number" step=".1" min="0" max={seconds} value={Number.isFinite(from)?from:''} onChange={e=>{setFrom(e.currentTarget.valueAsNumber);setReplacement(undefined);}}/></label>
    <label>{t('끝(초)','To (s)')}<input type="number" step=".1" min="0" max={seconds} value={Number.isFinite(to)?to:''} onChange={e=>{setTo(e.currentTarget.valueAsNumber);setReplacement(undefined);}}/></label>
    <select aria-label={t('수정 방식','Repair mode')} value={mode} onChange={e=>{setMode(e.target.value as RepairMode);setReplacement(undefined);}}>
      <option value="clip">{t('장면 교체','Replace clip')}</option><option value="audio">{t('소리 교체','Replace audio')}</option><option value="mute">{t('구간 음소거','Mute interval')}</option></select>
    {mode!=='mute'&&<label>{t('교체 파일','Replacement file')}<input key={mode} type="file" accept={mode==='clip'?'video/*':'audio/*'} onChange={e=>setReplacement(e.target.files?.[0])}/></label>}
    {mode==='clip'&&generate&&<><label>{t('AI 장면 수정 지시','AI shot direction')}<textarea maxLength={1500} value={note} onChange={e=>setNote(e.target.value)} /></label>
      <button type="button" disabled={!supported||!valid||!note.trim()||cost===undefined||availableCredits<(cost??0)} onClick={()=>setConfirm(true)}>
        {t('교체 장면 생성','Generate replacement')} · {length}{t('초','s')} · {cost??'–'}{t('크레딧',' credits')}</button></>}
    {replacement&&<small>{replacement.name}</small>}
    <button type="button" className="vd-library" disabled={!supported||!valid||(mode!=='mute'&&!replacement)} onClick={()=>void run(t('구간 적용 중…','Applying edit…'),async signal=>{
      const edited=await renderRepair(file,seconds,from,to,mode,replacement,signal);signal.throwIfAborted();onApply(edited);
    })}>{t('구간 적용','Apply edit')}</button>
    {!supported&&<p>{t('구간 저장을 지원하는 Chrome에서 열어 주세요.','Open in Chrome with video export support.')}</p>}</fieldset>
    {status&&<p role="status">{status}</p>}
    {confirm&&cost!==undefined&&<VideoCostDialog style={styleForBrief(draft.brief)} admin={admin} ratio={draft.ratio} seconds={length} credits={cost} provider={provider} promptMode="manual" onCancel={()=>setConfirm(false)} onConfirm={()=>{setConfirm(false);void run(t('교체 장면 생성 중…','Generating replacement…'),makeClip);}}/>}
  </details>;
}
