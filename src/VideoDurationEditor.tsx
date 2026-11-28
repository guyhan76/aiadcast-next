import {openReviewVideo} from './video-shot-repair';
import {VideoShotRepair} from './VideoShotRepair';
import type {VideoRequestStage} from './video-ai-client';
import {validSceneCues} from './video-omni';
import {VideoPromptReview,type VideoReview} from './VideoPromptReview';
import {promptBrief,basicVideoShots,validManualPrompt,validVideoShots,type VideoPromptMode,type VideoPlanIdea,type PromptBrief} from './video-prompt';
import {AdIndustryFields} from './AdIndustryFields';
import {findAdField,formatIndustryDetail} from './ad-fields';
import {industryLabel} from './industry';
import {VideoCostDialog} from './VideoCostDialog';
import {videoStyles,styleForBrief,type VideoStyle} from './video-style';
import {VideoProductImport,type ProductImport} from './VideoProductImport';
import {VideoBriefFields} from './VideoBriefFields';
import {sceneCaptionAt,sceneCaptions,emptyVideoBrief,videoPlan,type VideoBrief} from './video-brief';
import {useEffect, useId, useMemo, useRef, useState, type CSSProperties} from 'react';
import {Box, PackageOpen, UserRound, Store, Check, ChevronLeft, ChevronRight, Clapperboard, Download, ImagePlus, Plus, X} from 'lucide-react';
import {useUiLanguage} from './ui-language';
import {recommendDuration, videoDurations, type VideoDuration, type VideoSource} from './video-duration';
import {defaultVideoRatio, getVideoFormat, videoFormats, type VideoRatio} from './video-formats';
import {drawAdFrame, loadVideoScene, captionGeneratedVideo, videoFormat, type LoadedVideoScene} from './video-compose';
import {exportBatch} from './batch-export';
import './video-duration.css';

export type VideoDraft = {productUrl?:string; sources:VideoSource[]; ratio:VideoRatio; manual:VideoDuration|null; brief:VideoBrief; caption:string; voiceText:string; musicStyle:string; voiceStyle:string; aiMusic:boolean; aiVoice:boolean; file?:File; promptMode:VideoPromptMode; manualPrompt:string; review?:VideoReview};
export function videoDraft(sources:VideoSource[]=[],brief:VideoBrief=emptyVideoBrief):VideoDraft {return {sources,promptMode:'auto',manualPrompt:'',ratio:defaultVideoRatio,manual:null,brief,caption:brief.savedCaption??'',voiceText:'',musicStyle:'',voiceStyle:'',aiMusic:true,aiVoice:true};}
type Props = {
  draft:VideoDraft; change:(draft:VideoDraft)=>void; onNew?:()=>void;
  generateAi?:(draft:VideoDraft,seconds:VideoDuration,signal:AbortSignal,onState:(s:VideoRequestStage)=>void,scenes:LoadedVideoScene[],pilot?:'gemini')=>Promise<Blob>;
  draftPrompt?:(brief:PromptBrief,scenes:LoadedVideoScene[],language:'ko'|'en',signal:AbortSignal,segmented?:boolean)=>Promise<VideoPlanIdea>;
  omniPilot?:boolean;
  primaryUnavailable?:boolean;
  admin:boolean; availableCredits:number;
  checkingAccess:boolean;
  provider?:string;
  aiPrices?:Partial<Record<VideoDuration,number>>;
};
function SceneThumbnail({scene}:{scene?:LoadedVideoScene}) {
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const canvas=ref.current, context=canvas?.getContext('2d');
    if(!canvas||!context)return;
    context.clearRect(0,0,canvas.width,canvas.height);
    if(!scene)return;
    const visual=scene.visual;
    const [width,height]=visual instanceof HTMLVideoElement
      ? [visual.videoWidth,visual.videoHeight] : [visual.naturalWidth,visual.naturalHeight];
    if(!width||!height)return;
    const scale=Math.min(canvas.width/width,canvas.height/height);
    const w=width*scale,h=height*scale;
    context.drawImage(visual,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
  },[scene]);
  return <canvas ref={ref} width={240} height={200} aria-hidden="true"/>;
}

export function VideoDurationEditor({draft,change,onNew,aiPrices,admin,omniPilot,primaryUnavailable,availableCredits,provider,generateAi,draftPrompt,checkingAccess}:Props) {
  const {t,text,language}=useUiLanguage(), {sources,manual,brief,caption,file:result}=draft;
  const {ratio,width,height}=getVideoFormat(draft.ratio);
  const input=useRef<HTMLInputElement>(null),canvas=useRef<HTMLCanvasElement>(null);
  const [scenes,setScenes]=useState(new Map<VideoSource,LoadedVideoScene>()),[bad,setBad]=useState('');
  const loaded=useMemo(()=>sources.flatMap(source=>{
    const scene=scenes.get(source);
    return scene?[scene]:[];
  }),[sources,scenes]);
  const [run,setRun]=useState<'save'|'ai'|'prompt'|null>(null);
  const [aiStage,setAiStage]=useState<VideoRequestStage|'finish'>('prepare');
  const [repairBusy,setRepairBusy]=useState(false),[beforeRepair,setBeforeRepair]=useState<File>();
  const [saved,setSaved]=useState(false), [showResult,setShowResult]=useState(!!result);
  const [promptError,setPromptError]=useState('');
  const [message,setMessage]=useState('');
  const [finishedUrl,setFinishedUrl]=useState(''),[selected,setSelected]=useState(0);
  const task=useRef<AbortController|null>(null);
  const [confirm,setConfirm]=useState<boolean|'gemini'>(false);
  const industryId=useId(), uploadHelpId=useId();
  const [advanced,setAdvanced]=useState(false);
  const style=styleForBrief(brief), service=brief.kind==='service';
  const styles:VideoStyle[]=['product','service','presenter'];
  if(style==='unboxing'||advanced)styles.push('unboxing');
  const selectedIndustry=brief.category?findAdField(brief.category,brief.industryDetail):undefined;
  const mediaHint=service&&style==='presenter'?t('서비스를 소개하는 영상 또는 현장 사진 (선택)','Footage or photos of the service (optional)'):t(videoStyles[style].media[0],videoStyles[style].media[1]);
  const styleIcons={product:Box,unboxing:PackageOpen,presenter:UserRound,service:Store};
  const clips=sources.filter(x=>x.kind==='video').length;
  const review=draft.review;
  const fallbackCaptions=useMemo(()=>sceneCaptions(brief,caption),[brief,caption]);
  const textOnly=service && !sources.length && !!brief.description.trim();
  const requestedLength=brief.description.match(/(?:^|[^\d])(1\d|2\d|30)\s*(?:초(?:짜리|\s*길이(?:의)?)?|[- ]seconds?)\s*(?:(?:UGC|TV\s*CF|상품|서비스|제품)\s*)?(?:광고|영상|ad\b|video\b)/i);
  const recommended=requestedLength?Number(requestedLength[1]):recommendDuration(sources.length-clips,clips,[style==='unboxing'?'언박싱':'',brief.title,brief.description,brief.emphasis,caption].join(' ')), seconds=manual??recommended;
  const charge=admin?0:aiPrices?.[seconds];
  const shortfall=charge!==undefined&&availableCredits!==undefined&&charge>availableCredits;
  const shotBrief=promptBrief(draft,seconds);
  const briefKey=JSON.stringify(shotBrief);
  const stale=!!draft.review&&(draft.review.briefKey!==briefKey||draft.review.sources.length!==sources.length||draft.review.sources.some((s,i)=>s.media!==sources[i].media||s.kind!==sources[i].kind));
  const promptMode=draft.promptMode??'auto';
  const manualPrompt=draft.manualPrompt??'';
  const useManual=promptMode==='manual';
  const currentReview=!useManual&&!stale?review:undefined;
  const captions=useManual||currentReview?.showCaptions===false?[]:[...(currentReview?.captions??fallbackCaptions)];
  const contact=currentReview?.contact??brief.contact;
  if(captions.length&&contact)captions[2]=[captions[2],contact].filter(Boolean).join('\n');
  const needOpenBox=style==='unboxing'&&!useManual&&sources.length<2;
  const ready=!needOpenBox&&(textOnly || (!!sources.length && loaded.length===sources.length && !bad));
  const format=videoFormat(!!currentReview?.music||!!currentReview?.voice);
  const servicePromptOnly=useManual&&service&&!sources.length;
  const planReady=!!currentReview&&validVideoShots(currentReview.shots)&&(!currentReview.voice||!!currentReview.narration.trim());
  const promptReady=useManual?validManualPrompt(manualPrompt):planReady;
  const canGenerateAi=!!generateAi&&promptReady&&(ready||servicePromptOnly);
  const omniReason=ratio!=='9:16'&&ratio!=='16:9'?t('세로 9:16 또는 가로 16:9를 선택해 주세요.','Choose portrait 9:16 or landscape 16:9.')
    :sources.length>6?t('Gemini 참조 자료는 최대 6개입니다.','Choose up to six references.')
    :!ready&&!servicePromptOnly?(bad?t('열 수 없는 자료를 교체해 주세요.','Replace the unreadable reference.'):!sources.length&&!service?t('상품 사진을 첨부해 주세요.','Add a product photo.'):needOpenBox?t('언박싱 사진을 두 장 이상 첨부해 주세요.','Add at least two unboxing photos.'):t('입력 정보와 첨부 자료를 확인해 주세요.','Check the brief and references.'))
    :!promptReady?(useManual?t('직접 입력한 프롬프트를 확인해 주세요.','Check the manual prompt.'):stale?t('입력 정보가 바뀌었어요. 영상 프롬프트를 다시 만들어 주세요.','Rebuild the video prompt for the changed inputs.'):!review?t('영상 프롬프트를 만들어 주세요.','Create a video prompt.'):t('장면 연출과 선택한 내레이션을 완성해 주세요.','Complete the shots and selected narration.'))
    :currentReview?.sceneCues&&!validSceneCues(currentReview.sceneCues)?t('각 장면의 현장음과 마지막 화면을 입력해 주세요.','Complete the sound and end frame of each scene.')
    :captions.some(line=>line.trim())&&!format?t('자막을 넣으려면 최신 Chrome에서 열어 주세요.','Open in a current Chrome browser to add captions.'):'';
  useEffect(()=>{
    const controller=new AbortController(),resources:LoadedVideoScene[]=[];
    setScenes(new Map());setBad('');
    void (async()=>{
      for(const source of sources) {
        try {
          const scene=await loadVideoScene(source,controller.signal);
          if(controller.signal.aborted){scene.dispose();return;}
          resources.push(scene);
          setScenes(previous=>new Map(previous).set(source,scene));
        } catch {
          if(controller.signal.aborted)return;
          setBad(source.name);
        }
      }
    })();
    return ()=>{controller.abort();resources.forEach(x=>x.dispose());};
  },[sources]);
  useEffect(()=>{
    if(!result){setFinishedUrl('');return;}
    const url=URL.createObjectURL(result);setFinishedUrl(url);return()=>URL.revokeObjectURL(url);
  },[result]);
  useEffect(()=>()=>task.current?.abort(),[]);
  useEffect(()=>{
    const ctx=canvas.current?.getContext('2d'), visual=scenes.get(sources[selected])?.visual;
    if(!ctx||run==='ai')return;
    if(!visual&&!textOnly){ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);return;}
    drawAdFrame(ctx,visual,sceneCaptionAt(captions,selected*seconds/Math.max(1,sources.length),seconds));
  },[scenes,selected,brief,caption,review,stale,useManual,textOnly,run,result,showResult,sources,ratio,seconds]);
  function edit(fields:Partial<VideoDraft>) {
    if(task.current||repairBusy)return;
    setBeforeRepair(undefined);
    if(fields.sources){
      const index=fields.sources.indexOf(sources[selected]);
      setSelected(Math.max(0,index));
    }
    setSaved(false);setMessage('');setPromptError('');change({...draft,file:undefined,...fields});
  }
  function selectStyle(next:VideoStyle) {
    const kind=next==='presenter'?brief.kind:next==='service'?'service':'product';
    edit({brief:{...brief,...(kind===brief.kind?{}:{fieldId:undefined,category:undefined,industryDetail:undefined}),kind,style:next}});
  }
  function applyProduct(product:ProductImport,url:string) {
    const remaining=sources.filter(source=>!source.importedProduct);
    const next=[...remaining];
    if(product.image&&next.length<10)next.push({kind:'image',name:product.title,media:product.image,importedProduct:true});
    edit({productUrl:url,caption:'',voiceText:'',brief:{...brief,savedCaption:undefined,title:product.title.trim(),description:[product.option,product.description].filter(Boolean).join('\n'),
      emphasis:[product.price,product.shipping].filter(Boolean).join(' · ')},sources:next});
  }
  function move(index:number, offset:number) {
    const next=[...sources], target=index+offset;
    if(target<0||target>=next.length)return;
    [next[index],next[target]]=[next[target],next[index]];
    edit({sources:next});
  }
  function addFiles(files:File[]) {
    const media=files.filter(f=>f.size>0 && /^(image|video)\//.test(f.type));
    if(media.length){
      const added=media.map((f):VideoSource=>({media:f,name:f.name,kind:f.type.startsWith('video/')?'video':'image'}));
      const next=[...sources,...added];
      edit({sources:next.slice(0,10)});
      if(next.length>10)setMessage(t('소재는 앞에서부터 10개까지 추가했어요.','Added the first 10 items.'));
    }
    if(media.length!==files.length)setMessage(t('사진이나 영상 파일을 선택해 주세요.','Choose a photo or video file.'));
  }
  async function saveVideo(){
    if(task.current||!result)return;
    const controller=new AbortController();
    task.current=controller;setRun('save');setMessage('');
    try{
      await exportBatch([result],'save',controller.signal);
      if(!controller.signal.aborted)setSaved(true);
    }catch{
      if(!controller.signal.aborted)setMessage(t('저장하지 못했어요. 다시 시도해 주세요.','Could not save the video. Please retry.'));
    }finally{
      if(task.current===controller){task.current=null;setRun(null);}
    }
  }
  async function buildPrompt(){
    if(useManual||task.current||!ready)return;
    const controller=new AbortController();
    task.current=controller;setRun('prompt');setPromptError('');
    try{
      const idea:VideoPlanIdea=draftPrompt?await draftPrompt(shotBrief,loaded,language,controller.signal,!!admin&&!!omniPilot):{shots:basicVideoShots(shotBrief,language)};
      controller.signal.throwIfAborted();
      const script=draft.voiceText||idea.audio?.narration||videoPlan(brief,caption,'').voice;
      change({...draft,file:undefined,review:{
        shots:idea.shots,sceneCues:idea.sceneCues,frameLayout:idea.frameLayout,briefKey,sources,
        captions:sceneCaptions(brief,caption),showCaptions:review?.showCaptions??false,contact:brief.contact,
        music:review?.music??draft.aiMusic,musicMood:draft.musicStyle||idea.audio?.musicMood||(style==='unboxing'?t('경쾌한 리듬','Upbeat rhythm'):t('차분한 연주곡','Soft instrumental')),
        narration:script.slice(0,600),voice:review?.voice??(draft.aiVoice&&!!draft.voiceText.trim())
      }});
    }catch{
      if(!controller.signal.aborted)setPromptError(t('구성안을 작성하지 못했어요. 잠시 후 다시 시도해 주세요.','Could not draft the plan. Please try again.'));
    }finally{if(task.current===controller){task.current=null;setRun(null);}}
  }
  async function makeAiVideo(pilot?:'gemini'){
    if(!generateAi||task.current||!canGenerateAi)return;
    const controller=new AbortController();
    task.current=controller;setRun('ai');setMessage('');setAiStage('prepare');setShowResult(false);
    let scene:LoadedVideoScene|undefined;
    try{
      const movie=await generateAi(draft,seconds,controller.signal,setAiStage,loaded,pilot);
      controller.signal.throwIfAborted();
      if(!captions.some(line=>line.trim())){
        change({...draft,file:new File([movie],'aiadcast-'+crypto.randomUUID()+'.mp4',{type:'video/mp4'})});
        setShowResult(true);setSaved(false);return;
      }
      if(!canvas.current)throw Error('NO_CANVAS');
      scene=await loadVideoScene({media:movie,name:'AI video',kind:'video'},controller.signal);
      setAiStage('finish');
      if(!(scene.visual instanceof HTMLVideoElement))throw Error('INVALID_RESULT');
      const file=await captionGeneratedVideo(canvas.current,scene.visual,seconds,captions,!!review?.music||!!review?.voice,controller.signal);
      controller.signal.throwIfAborted();
      change({...draft,file});setShowResult(true);setSaved(false);
    }catch(e){
      if(!controller.signal.aborted){
        const code=e instanceof Error?e.message:'';
        setMessage(code==='NO_TEST_CREDITS'?t('크레딧이 부족합니다. 충전 후 다시 시도해 주세요.','Top up your credits and try again.'):
          code==='VIDEO_PRICE_CHANGED'?t('영상 요금이 변경되었습니다. 화면을 다시 열어 확인해 주세요.','Reopen the video page to review the updated price.'):
          code==='VIDEO_REFERENCE_SIZE'?t('참조 이미지 용량을 합계 10MB 이내로 줄여 주세요.','Keep reference images under 10 MB in total.'):
          code==='VIDEO_REFERENCE_FORMAT'?t('AI 영상에는 JPG, PNG, WebP 사진을 넣어 주세요.','Use JPG, PNG or WebP for AI video.'):
          code==='VIDEO_WAIT'||code==='VIDEO_RESPONSE_TIMEOUT'?t('영상 상태를 확인하는 데 시간이 걸리고 있어요. 이 화면에서 같은 내용으로 다시 누르면 기존 작업을 확인합니다.','The video is taking longer to respond. Retry here with the same inputs to check the existing job.'):
          code==='VIDEO_SUBMISSION_UNCERTAIN'?t('요청 접수 여부를 확인 중이에요. 같은 내용으로 다시 열면 기존 요청을 확인합니다.','Submission is pending reconciliation. Retry with the same brief to check it.'):
          code==='VIDEO_PROVIDER_INPUT'?t('영상 공급사가 입력을 거절했습니다. 프롬프트와 참조 파일 형식을 확인해 주세요.','The provider rejected the input. Check your prompt and reference files.'):
          code==='VIDEO_PROVIDER_MODEL'?t('영상 모델을 찾을 수 없습니다. 공급사 모델 설정을 확인해 주세요.','The provider could not find this model. Check the model settings.'):
          code==='VIDEO_PROVIDER_LIMIT'||code==='VIDEO_PROVIDER_PAUSED'?t('공급사가 새 영상 접수를 일시 제한했습니다. 잠시 후 다시 시도해 주세요.','The provider is temporarily limiting submissions. Try again later.'):
          code==='VIDEO_PROVIDER_PERMISSION'?t('영상 공급사 키에서 선택한 모델의 생성·조회 권한을 확인해 주세요.','Check model generation and read permissions on the provider key.'):
          code==='VIDEO_PROVIDER_AUTH'?t('영상 공급사 API 키를 확인해 주세요.','Check the video provider API key.'):
          code==='VIDEO_PROVIDER_BALANCE'?t('영상 공급사의 API 가용 잔액이 부족합니다. 공급사 결제 화면에서 잔액과 영상 예약 금액을 확인해 주세요.','The available API balance is insufficient. Check the provider balance and reservation amount.'):
          code==='VIDEO_QUOTE_UNAVAILABLE'?t('영상 제작 견적을 받지 못했어요. 잠시 후 다시 시도해 주세요.','Could not obtain a video quote. Try again later.'):
          code==='BUDGET_UNAVAILABLE'?t('서버의 영상 제작 예산을 확인해 주세요.','Check the available video generation budget.'):
          code==='VIDEO_FAILED'?t('AI 영상 생성에 실패했어요. 자료를 확인한 뒤 다시 시도해 주세요.','AI generation failed. Review your inputs and retry.'):
          t('AI 영상을 완료하지 못했어요. 같은 내용으로 다시 시도해 주세요.','Could not finish the AI video. Retry with the same brief.'));
      }
    }finally{
      scene?.dispose();
      if(task.current===controller){task.current=null;setRun(null);}
    }
  }
  async function openFinished(file:File|undefined){
    if(!file||task.current||repairBusy)return;
    const controller=new AbortController();task.current=controller;setRun('save');
    let dispose:(()=>void)|undefined;
    try{
      const scene=await openReviewVideo(file,controller.signal);dispose=scene.dispose;
      const {duration,videoWidth,videoHeight}=scene.video;
      if(!Number.isFinite(duration)||duration<9.5||duration>30.5||!videoWidth||!videoHeight)throw Error('INVALID_CLIP');
      const ratio=videoFormats.reduce((best,item)=>Math.abs(item.width/item.height-videoWidth/videoHeight)<Math.abs(best.width/best.height-videoWidth/videoHeight)?item:best).ratio;
      controller.signal.throwIfAborted();
      change({...draft,file,ratio,manual:Math.min(30,Math.max(10,Math.round(duration)))});
      setBeforeRepair(undefined);setShowResult(true);setMessage('');setSaved(false);
    }catch{if(!controller.signal.aborted)setMessage(t('재생 가능한 10~30초 광고 영상을 선택해 주세요.','Select a playable 10–30 second ad.'));}
    finally{dispose?.();if(task.current===controller){task.current=null;setRun(null);}}
  }
  const step=result||run==='ai'||confirm?3:currentReview||useManual||run==='prompt'?2:1;
  const durationText=seconds+t('초','s');
  const uploadHelp=<details className="reference-file-info vd-upload-help" id={uploadHelpId}>
    <summary>{t('첨부 파일 기준','Supported files')}</summary>
    <p>{t('이미지 PNG · JPG · WebP','Images: PNG · JPG · WebP')}</p>
    <p>{t('영상 MP4 · WebM 등 기기에서 재생 가능한 형식','Videos: MP4, WebM or another format your device can play')}</p>
    <p>{t('최대 10개 · AI 참조 이미지 합계 10MB','Up to 10 items · 10 MB combined for AI reference images')}</p>
    <p>{t('영상은 첫 장면만 용량에 포함됩니다.','Only the first frame of each clip counts toward this limit.')}</p>
  </details>;
  return <section className="video-draft" aria-label={t('광고 영상 편집','Video ad editor')}>
    <div className="vd-heading"><h1>{t('광고 영상 만들기','Create an ad video')}</h1>{!result&&onNew&&<button type="button" className="fresh-ad-button" disabled={!!run||repairBusy} onClick={onNew}>{t('새 광고','New ad')}</button>}</div>
    <ol className="vd-steps" aria-label={t('영상 제작 단계','Video creation steps')}>
      {[t('정보 입력','Add details'),t('구성안 확인','Review plan'),t('영상 생성','Create video')].map((label,index)=>
        <li key={label} aria-current={step===index+1?'step':undefined}>{label}</li>)}
    </ol>
    <div className="vd-section-heading"><h2>{t('광고 소재','Ad media')}</h2><small>{mediaHint}</small></div>
    <input type="file" ref={input} className="vd-file" aria-describedby={uploadHelpId} aria-label={t('사진·영상 파일','Media files')} accept="image/*,video/*" multiple disabled={!!run||sources.length>=10}
      onChange={e=>{addFiles(Array.from(e.target.files??[]));e.target.value='';}}/>
    {!sources.length && <div className="reference-upload-zone vd-upload-zone">
      <button type="button" className="reference-add vd-upload" disabled={!!run||repairBusy} aria-describedby={uploadHelpId} onClick={()=>input.current?.click()}>
        <ImagePlus size={36} aria-hidden="true"/><span>{t('이미지·영상 첨부','Attach images or clips')}</span>
      </button>
      {uploadHelp}
    </div>}
    {(result||sources.length>0||textOnly||servicePromptOnly) && <>
      <div className="vd-stage" hidden={!advanced&&!result&&run!=='ai'||servicePromptOnly&&!textOnly&&!result&&run!=='ai'} style={{'--vd-aspect':width/height} as CSSProperties}>
        <canvas width={width} height={height} ref={canvas} hidden={!!result && showResult} aria-label={t('영상 미리보기','Video preview')}/>
        {result && showResult && finishedUrl && <video key={finishedUrl} src={finishedUrl} controls playsInline aria-label={t('완성한 영상','Finished video')}/>}
        {sources.length>0&&loaded.length!==sources.length&& !bad&&<small className="vd-stage-note">{t('소재 불러오는 중…','Loading media…')}</small>}
      </div>
      {result&&!showResult&&<button type="button" className="vd-library" onClick={()=>setShowResult(true)}>{t('완성 영상 보기','View finished video')}</button>}
      {bad&&<p role="alert">{t('열 수 없는 소재를 삭제하거나 교체해 주세요.','Remove or replace this unreadable file.')} {bad}</p>}
      {sources.length>0&&<div className="vd-tray"><div className="vd-tray-label"><strong>{t('소재','Media')} <small>{sources.length}/10</small></strong>
        {sources.length<10&&<button type="button" aria-describedby={uploadHelpId} disabled={!!run||repairBusy} onClick={()=>input.current?.click()}><Plus size={16}/>{t('추가','Add')}</button>}</div>
        <ol>{sources.map((source,index)=><li key={index}>
          <button type="button" className="vd-scene" aria-pressed={index===selected} disabled={!!run||repairBusy}
            onClick={()=>{setSelected(index);setShowResult(false);}} title={source.name}>
            <SceneThumbnail scene={scenes.get(source)}/>
            <span className="vd-scene-name">{index+1} · {source.name}</span>
          </button>
          <button type="button" className="vd-remove vd-delete" disabled={!!run||repairBusy} aria-label={source.name+' '+t('삭제','Remove')}
            onClick={()=>edit({sources:sources.filter((_,n)=>n!==index)})}><X size={15}/></button>
        </li>)}</ol>
        {sources.length>1&&<div className="vd-order">
          <button type="button" className="vd-remove" disabled={!!run||selected===0} aria-label={t('이 장면을 앞으로','Move this scene earlier')} onClick={()=>move(selected,-1)}><ChevronLeft size={16}/>{t('앞으로','Earlier')}</button>
          <button type="button" className="vd-remove" disabled={!!run||selected===sources.length-1} aria-label={t('이 장면을 뒤로','Move this scene later')} onClick={()=>move(selected,1)}>{t('뒤로','Later')}<ChevronRight size={16}/></button>
        </div>}
      </div>}
    </>}
    {sources.length>0&&uploadHelp}
    {needOpenBox&&sources.length===1&&<p role="status">{t('열린 박스 사진을 한 장 더 추가해 주세요.','Add one more photo showing the open box.')}</p>}
    {clips>0&&<small>{t('첨부 영상의 첫 장면을 AI 참조 이미지로 사용해요.','The first frame of each clip is used as a reference image.')}</small>}
    {!useManual&&!advanced&&<label className="vd-quick-request">{t('원하는 광고 한 줄','Describe your ad')}
      <textarea rows={2} maxLength={2000} value={brief.description} disabled={!!run||repairBusy}
        placeholder={t('예) 친구 둘이 마지막 피자 한 조각을 나누고 한 판 더 주문하는 광고','e.g. Two friends share the last slice and order another pizza.')}
        onChange={e=>edit({brief:{...brief,description:e.target.value}})}/></label>}
    <fieldset className="vd-style" disabled={!!run||repairBusy}><legend>{t('광고 유형','Ad type')}</legend>
      <div>{styles.map(key=>{
        const Icon=styleIcons[key], label=videoStyles[key].label;
        return <button type="button" key={key} aria-pressed={style===key} onClick={()=>selectStyle(key)}>
          <Icon size={19} aria-hidden="true"/>{t(label[0],label[1])}</button>;
      })}</div>
    </fieldset>
    <fieldset className="vd-duration" disabled={!!run||repairBusy}><legend>{t('영상 길이','Video length')}</legend>
      <div>{videoDurations.map(value=><button key={value} type="button" aria-pressed={seconds===value}
        onClick={()=>edit({manual:value})}>{value}{t('초','s')}</button>)}</div>
      {advanced&&<><label>{t('길이 조절','Adjust length')} · {durationText}
        <input type="range" min={10} max={30} step={1} value={seconds} onChange={e=>edit({manual:Number(e.target.value)})}/>
      </label>
      <button type="button" className="vd-recommend" aria-pressed={manual===null}
        onClick={()=>edit({manual:null})}>{manual===null&&<Check size={14}/>} {t('자동 추천','Recommended')} · {recommended}{t('초','s')}</button></>}
    </fieldset>
    <details className="vd-advanced" open={advanced} onToggle={e=>setAdvanced(e.currentTarget.open)}>
      <summary>{t('상세 설정','Advanced settings')}</summary>
    <fieldset className="vd-industry" disabled={!!run||repairBusy}><legend>{t('광고할 분야','Your industry')}</legend>
      <AdIndustryFields id={industryId} kind={brief.kind} fieldId={brief.fieldId??''} saved={selectedIndustry}
        legacy={brief.category&&!selectedIndustry?text(industryLabel(brief.category)):undefined}
        onKind={kind=>edit({brief:{...brief,kind,style:style==='presenter'?'presenter':undefined,fieldId:undefined,category:undefined,industryDetail:undefined}})}
        onField={fieldId=>edit({brief:{...brief,fieldId,category:undefined,industryDetail:undefined}})}
        onItem={(item,custom)=>edit({brief:{...brief,category:item.category,industryDetail:formatIndustryDetail(item,custom)}})}/>
    </fieldset>
    <div className="vd-brief-block"><h2>{service?t('서비스 정보','Service details'):t('상품 정보','Product details')}</h2>
      {!service&&<VideoProductImport initialUrl={draft.productUrl??''} disabled={!!run||repairBusy} hasInfo={!!(brief.title||brief.description||brief.emphasis||caption||draft.voiceText)}
        photoRoom={sources.filter(source=>!source.importedProduct).length<10} onApply={applyProduct}/>}
      <VideoBriefFields value={brief} disabled={!!run||repairBusy} change={brief=>edit({brief})}/></div>
    <fieldset className="vd-duration vd-ratios" disabled={!!run||repairBusy}><legend>{t('영상 규격','Video aspect ratio')}</legend>
      <div>{videoFormats.map(option=><button key={option.ratio} type="button" aria-pressed={ratio===option.ratio}
        onClick={()=>{if(ratio!==option.ratio)edit({ratio:option.ratio});}}>
        <span aria-hidden="true" style={{width:18*option.width/Math.max(option.width,option.height),height:18*option.height/Math.max(option.width,option.height)}}/>{option.ratio}
      </button>)}</div>
    </fieldset>
    </details>
    {admin&&omniPilot&&draftPrompt&&currentReview&&!currentReview.sceneCues&&<button type="button" className="vd-library" disabled={!!run||!ready} onClick={()=>void buildPrompt()}>{t('Gemini 구간 대본 만들기','Draft Gemini segment scripts')}</button>}
    <VideoPromptReview mode={promptMode} manualText={manualPrompt} seconds={seconds} ratio={ratio}
      onMode={promptMode=>edit({promptMode})} onManual={manualPrompt=>edit({manualPrompt})}
      review={review} ready={ready} busy={!!run||repairBusy} planning={run==='prompt'}
      stale={stale} onBuild={()=>void buildPrompt()} error={promptError}
      onChange={patch=>{if(review)edit({review:{...review,...patch}});}}/>
    {!generateAi&&!checkingAccess&&<p className="vd-format-note">{t('이 계정에서는 구성안까지 작성할 수 있어요. 현재 AI 영상 생성 연결을 사용할 수 없습니다.','You can prepare a plan. AI video generation is currently unavailable.')}</p>}
    {generateAi&&charge!==undefined&&<small className="vd-ai-price">{t('AI 생성 예상','AI generation estimate')} · {durationText} · {charge}{t('크레딧',' credits')}</small>}
      {shortfall&&<a className="vd-library" href="#checkout">{t('크레딧 충전','Top up credits')} · {t('현재 잔액','Balance')} {availableCredits}</a>}
    {message&&<p role="status">{message}</p>}
    {generateAi&&currentReview?.showCaptions&&!format&&ready&&<p role="status">{t('파일 제작은 최신 Chrome에서 열어주세요.','Open in a current Chrome browser to export.')}</p>}
    {result&&<VideoShotRepair key={result.name+'-'+result.lastModified} file={result} seconds={seconds} draft={draft} prices={aiPrices}
      generate={primaryUnavailable?undefined:generateAi} canReview={!!draftPrompt} provider={provider} admin={admin} availableCredits={availableCredits} busy={!!run||repairBusy} onBusy={setRepairBusy}
      onApply={file=>{setBeforeRepair(result);setRepairBusy(false);setSaved(false);setShowResult(true);change({...draft,file});}}/>}
    {result&&beforeRepair&&<button type="button" className="vd-library" disabled={repairBusy||!!run} onClick={()=>{change({...draft,file:beforeRepair});setBeforeRepair(undefined);setShowResult(true);setSaved(false);}}>{t('직전 수정 되돌리기','Undo last edit')}</button>}
    {(result||useManual||review)&& (result?<button type="button" className="vd-primary" disabled={!!run||repairBusy} onClick={()=>void saveVideo()}><Download size={18}/>{t('영상 저장','Save video')}</button>
      :<button type="button" className="vd-primary" disabled={primaryUnavailable||!!run||shortfall||charge===undefined||!canGenerateAi||(captions.some(line=>line.trim())&&!format)} onClick={()=>setConfirm(true)}>
        <Clapperboard size={18}/>{run==='ai'?(aiStage==='prepare'?t('사진과 프롬프트 준비 중…','Preparing media and prompt…'):aiStage==='submit'?t('제작 요청 보내는 중…','Sending video request…'):aiStage==='check'?t('요청 접수 확인 중…','Checking submission…'):aiStage==='queue'?t('AI 영상 생성 중…','Generating AI video…'):aiStage==='download'?t('영상 받는 중…','Downloading video…'):t('자막 입히는 중…','Adding captions…')):t('AI 영상 생성','Generate AI video')}</button>)}
    {admin&&omniPilot&&!result&&(useManual||review)&&<>
      <button type="button" className="vd-library" disabled={!!run||repairBusy||!canGenerateAi||!!omniReason}
        onClick={()=>setConfirm('gemini')}>{t('Gemini 비교 제작','Compare with Gemini')} · {durationText}</button>
      {omniReason&&<small role="status">{omniReason}</small>}
    </>}
    {result&&onNew&&<button type="button" className="vd-library" disabled={!!run||repairBusy} onClick={onNew}>{t('새 광고','New ad')}</button>}
    {!result&&<details className="vd-prompt"><summary>{t('기존 광고 영상 수정','Edit an existing ad')}</summary><input aria-label={t('완성 영상 파일','Finished video file')} type="file" accept="video/*" disabled={!!run||repairBusy} onChange={e=>{void openFinished(e.target.files?.[0]);e.target.value='';}}/></details>}
    {run==='ai'&&<button className="vd-cancel" type="button" onClick={()=>task.current?.abort()}>{t('대기 닫기','Stop waiting')}</button>}
    {saved&&<p role="status">{t('저장 요청을 완료했어요.','Video sent to your downloads.')}</p>}
    {confirm&&charge!==undefined&&<VideoCostDialog credits={charge} admin={admin} provider={confirm==='gemini'?'gemini':provider} style={style} promptMode={promptMode} ratio={ratio} seconds={seconds} onCancel={()=>setConfirm(false)} onConfirm={()=>{
      setConfirm(false);
      void makeAiVideo(confirm==='gemini'?'gemini':undefined);
    }}/>}
  </section>;
}
