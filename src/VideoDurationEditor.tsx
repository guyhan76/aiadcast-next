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
import {Box, PackageOpen, UserRound, Store, Check, ChevronLeft, ChevronRight, Clapperboard, Download, ImagePlus, LoaderCircle, Pause, Play, Plus, X} from 'lucide-react';
import {useUiLanguage} from './ui-language';
import {recommendDuration, videoDurations, type VideoDuration, type VideoSource} from './video-duration';
import {defaultVideoRatio, getVideoFormat, videoFormats, type VideoRatio} from './video-formats';
import {drawAdFrame, loadVideoScene, playAdTimeline, videoFormat, type LoadedVideoScene} from './video-compose';
import {exportBatch} from './batch-export';
import {defaultVideoSound,usesSound,type VideoSound} from './video-sound';
import {VideoSoundControls} from './VideoSoundControls';
import './video-duration.css';

export type VideoDraft = {productUrl?:string; sources:VideoSource[]; ratio:VideoRatio; manual:VideoDuration|null; brief:VideoBrief; caption:string; voiceText:string; musicStyle:string; voiceStyle:string; aiMusic:boolean; aiVoice:boolean; sound:VideoSound; file?:File; promptMode:VideoPromptMode; manualPrompt:string; review?:VideoReview};
export function videoDraft(sources:VideoSource[]=[],brief:VideoBrief=emptyVideoBrief):VideoDraft {return {sources,promptMode:'auto',manualPrompt:'',ratio:defaultVideoRatio,manual:null,brief,caption:brief.savedCaption??'',voiceText:'',musicStyle:'',voiceStyle:'',aiMusic:true,aiVoice:true,sound:{...defaultVideoSound,music:'built-in'}};}
type Props = {
  draft:VideoDraft; change:(draft:VideoDraft)=>void;
  generateAi?:(draft:VideoDraft,seconds:VideoDuration,signal:AbortSignal,onState:(s:'queue'|'download')=>void)=>Promise<Blob>;
  draftPrompt?:(brief:PromptBrief,scenes:LoadedVideoScene[],language:'ko'|'en',signal:AbortSignal)=>Promise<VideoPlanIdea>;
  higgsfield?:boolean;
  aiPrices?:Partial<Record<VideoDuration,number>>;
};
export function VideoDurationEditor({draft,change,aiPrices,higgsfield,generateAi,draftPrompt}:Props) {
  const {t,text,language}=useUiLanguage(), {sources,manual,brief,caption,sound,file:result}=draft;
  const {ratio,width,height}=getVideoFormat(draft.ratio);
  const input=useRef<HTMLInputElement>(null),canvas=useRef<HTMLCanvasElement>(null);
  const [loaded,setLoaded]=useState<LoadedVideoScene[]>([]),[bad,setBad]=useState('');
  const [run,setRun]=useState<'preview'|'encode'|'save'|'ai'|'prompt'|null>(null), [time,setTime]=useState(0);
  const [aiStage,setAiStage]=useState<'queue'|'download'|'finish'>('queue');
  const [saved,setSaved]=useState(false), [showResult,setShowResult]=useState(!!result);
  const [promptError,setPromptError]=useState('');
  const [message,setMessage]=useState('');
  const [finishedUrl,setFinishedUrl]=useState(''),[selected,setSelected]=useState(0);
  const task=useRef<AbortController|null>(null);
  const [confirm,setConfirm]=useState<'local'|'ai'|null>(null);
  const industryId=useId();
  const style=styleForBrief(brief), service=brief.kind==='service';
  const styles:VideoStyle[]=service?['service','presenter']:['product','unboxing','presenter'];
  const selectedIndustry=brief.category?findAdField(brief.category,brief.industryDetail):undefined;
  const layout=service&&style==='presenter'?{
    media:['서비스를 소개하는 영상 또는 현장 사진 (선택)','Footage or photos of the service (optional)'],
    scenes:[['오프닝','Introduction'],['서비스 이용 장면','Using the service'],['마무리 안내','Closing message']]
  }:videoStyles[style];
  const styleIcons={product:Box,unboxing:PackageOpen,presenter:UserRound,service:Store};
  const clips=sources.filter(x=>x.kind==='video').length;
  const [localOnly,setLocalOnly]=useState(false);
  const device=!!clips||localOnly||!generateAi;
  const review=draft.review;
  const fallbackCaptions=useMemo(()=>sceneCaptions(brief,caption),[brief,caption]);
  const textOnly=service && !sources.length && !!brief.title.trim() && !!brief.description.trim();
  const recommended=recommendDuration(sources.length-clips,clips,[style==='unboxing'?'언박싱':'',brief.title,brief.description,brief.emphasis,caption].join(' ')), seconds=manual??recommended;
  const shotBrief=promptBrief(draft,seconds);
  const briefKey=JSON.stringify(shotBrief);
  const stale=!!draft.review&&(draft.review.briefKey!==briefKey||draft.review.sources!==sources||draft.review.device!==device);
  const promptMode=draft.promptMode??'auto';
  const manualPrompt=draft.manualPrompt??'';
  const useManual=promptMode==='manual';
  const currentReview=!useManual&&!stale?review:undefined;
  const captions=useManual||currentReview?.showCaptions===false?[]:[...(currentReview?.captions??fallbackCaptions)];
  const contact=currentReview?.contact??brief.contact;
  if(captions.length&&contact)captions[2]=[captions[2],contact].filter(Boolean).join('\n');
  const needOpenBox=style==='unboxing'&&!useManual&&clips===0&&sources.length<2;
  const ready=!needOpenBox&&(textOnly || (!!sources.length && loaded.length===sources.length && !bad)), audible=usesSound(sound,clips>0);
  const format=videoFormat(device?audible:!!currentReview?.music||!!currentReview?.voice);
  const servicePromptOnly=useManual&&service&&!sources.length;
  const planReady=!!currentReview&&validVideoShots(currentReview.shots)&&(device||!currentReview.voice||!!currentReview.narration.trim());
  const promptReady=useManual?validManualPrompt(manualPrompt):planReady;
  const localReady=ready&&planReady&&(sources.length>0||captions.some(line=>line.trim()));
  const canGenerateAi=!clips&&promptReady&&(ready||servicePromptOnly);
  useEffect(()=>{
    const controller=new AbortController(),resources:LoadedVideoScene[]=[];
    setLoaded([]);setBad('');setTime(0);
    void (async()=>{
      try {
        for(const source of sources) {
          const scene=await loadVideoScene(source,controller.signal);
          if(controller.signal.aborted){scene.dispose();return;}
          resources.push(scene);
        }
        if(!controller.signal.aborted)setLoaded(resources);
      } catch(e){if(!controller.signal.aborted)setBad(e instanceof Error ? e.message : t('파일 오류','File error'));}
    })();
    return ()=>{controller.abort();resources.forEach(x=>x.dispose());};
  },[sources]);
  useEffect(()=>{
    if(!result){setFinishedUrl('');return;}
    const url=URL.createObjectURL(result);setFinishedUrl(url);return()=>URL.revokeObjectURL(url);
  },[result]);
  useEffect(()=>()=>task.current?.abort(),[]);
  useEffect(()=>{
    const ctx=canvas.current?.getContext('2d'), visual=loaded[selected]?.visual;
    if(!ctx||(!visual&&!textOnly)||run==='ai'||run==='encode'||run==='preview')return;
    const paint=()=>drawAdFrame(ctx,visual,sceneCaptionAt(captions,selected*seconds/Math.max(1,sources.length),seconds));
    paint();
    if(visual instanceof HTMLVideoElement){visual.addEventListener('seeked',paint);visual.currentTime=0;return()=>visual.removeEventListener('seeked',paint);}
  },[loaded,selected,brief,caption,review,stale,useManual,textOnly,run,result,showResult,sources.length,ratio,seconds]);
  function edit(fields:Partial<VideoDraft>) {
    if(task.current)return;
    if(fields.sources){
      const index=fields.sources.indexOf(sources[selected]);
      setSelected(Math.max(0,index));
    }
    setSaved(false);setMessage('');setPromptError('');setTime(0);change({...draft,file:undefined,...fields});
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
  async function perform(mode:'preview'|'encode'|'save') {
    if(task.current||(mode==='save'?!result:!ready||!canvas.current)||(mode==='encode'&&!localReady))return;
    const controller=new AbortController();task.current=controller;setRun(mode);setMessage('');
    try {
      if(mode==='save'&&result){await exportBatch([result],'save',controller.signal);if(!controller.signal.aborted)setSaved(true);}
      else {
        setTime(0);setSelected(0);
        const file=await playAdTimeline(canvas.current!,loaded,seconds,captions,sound,controller.signal,mode==='encode',setTime,style);
        if(file&&!controller.signal.aborted){change({...draft,file});setShowResult(true);setSaved(false);}
      }
    } catch(e) {
      if(!controller.signal.aborted)setMessage(e instanceof Error&&e.message==='AUDIO_FILE'
        ?t('소리 파일을 열 수 없어요. MP3, M4A 또는 WAV 파일로 다시 시도해 주세요.','Could not open the sound file. Try an MP3, M4A or WAV file.')
        :e instanceof Error&&e.message==='HIDDEN'
        ?t('화면이 닫혀 제작을 멈췄어요. 다시 시작해 주세요.','The page was hidden. Start again to finish the video.')
        :mode==='save'?t('저장하지 못했어요. 다시 시도해 주세요.','Could not save the video. Please retry.')
        :t('영상을 처리하지 못했어요. 파일을 확인하고 다시 시도해 주세요.','Could not process the video. Check the media and retry.'));
    } finally {if(task.current===controller){task.current=null;setRun(null);if(controller.signal.aborted)setTime(0);}}
  }
  async function buildPrompt(){
    if(useManual||task.current||!ready)return;
    const controller=new AbortController();
    task.current=controller;setRun('prompt');setPromptError('');
    try{
      const idea:VideoPlanIdea=device
        ? {shots:[t(layout.scenes[0][0],layout.scenes[0][1]),t(layout.scenes[1][0],layout.scenes[1][1]),t(layout.scenes[2][0],layout.scenes[2][1])]}
        : draftPrompt?await draftPrompt(shotBrief,loaded,language,controller.signal):{shots:basicVideoShots(shotBrief,language)};
      controller.signal.throwIfAborted();
      const script=draft.voiceText||idea.audio?.narration||videoPlan(brief,caption,'').voice;
      const recommendVoice=style==='presenter'||(idea.audio?.recommendVoice??service);
      change({...draft,file:undefined,review:{
        shots:idea.shots,briefKey,sources,device,
        captions:fallbackCaptions,showCaptions:true,contact:brief.contact,
        music:draft.aiMusic,musicMood:draft.musicStyle||idea.audio?.musicMood||(style==='unboxing'?t('경쾌한 리듬','Upbeat rhythm'):t('차분한 연주곡','Soft instrumental')),
        narration:script.slice(0,600),voice:draft.aiVoice&&!!script&&(recommendVoice||!!draft.voiceText)
      }});
    }catch{
      if(!controller.signal.aborted)setPromptError(t('구성안을 작성하지 못했어요. 잠시 후 다시 시도해 주세요.','Could not draft the plan. Please try again.'));
    }finally{if(task.current===controller){task.current=null;setRun(null);}}
  }
  async function makeAiVideo(){
    if(!generateAi||task.current||device||!canGenerateAi)return;
    const controller=new AbortController();
    task.current=controller;setRun('ai');setMessage('');setAiStage('queue');setShowResult(false);
    let scene:LoadedVideoScene|undefined;
    try{
      const movie=await generateAi(draft,seconds,controller.signal,setAiStage);
      controller.signal.throwIfAborted();
      if(!captions.some(line=>line.trim())){
        change({...draft,file:new File([movie],'aiadcast-'+crypto.randomUUID()+'.mp4',{type:'video/mp4'})});
        setShowResult(true);setSaved(false);return;
      }
      if(!canvas.current)throw Error('NO_CANVAS');
      scene=await loadVideoScene({media:movie,name:'AI video',kind:'video'},controller.signal);
      setAiStage('finish');setTime(0);
      const file=await playAdTimeline(canvas.current,[scene],seconds,captions,{music:'off',original:!!review?.music||!!review?.voice},controller.signal,true,setTime,style);
      controller.signal.throwIfAborted();
      if(file){change({...draft,file});setShowResult(true);setSaved(false);}
    }catch(e){
      if(!controller.signal.aborted){
        const code=e instanceof Error?e.message:'';
        setMessage(code==='VIDEO_REFERENCE_SIZE'?t('참조 이미지 용량을 합계 10MB 이내로 줄여 주세요.','Keep reference images under 10 MB in total.'):
          code==='VIDEO_REFERENCE_FORMAT'?t('AI 영상에는 JPG, PNG, WebP 사진을 넣어 주세요.','Use JPG, PNG or WebP for AI video.'):
          code==='VIDEO_SUBMISSION_UNCERTAIN'?t('요청 접수 여부를 확인 중이에요. 같은 내용으로 다시 열면 기존 요청을 확인합니다.','Submission is pending reconciliation. Retry with the same brief to check it.'):
          code==='VIDEO_PROVIDER_AUTH'?t('힉스필드 API 키를 확인해 주세요.','Check the Higgsfield API key.'):
          code==='VIDEO_PROVIDER_BALANCE'?t('힉스필드 API 잔액과 모델 사용 권한을 확인해 주세요.','Check the Higgsfield API balance and model access.'):
          code==='VIDEO_QUOTE_UNAVAILABLE'?t('힉스필드 견적을 받지 못했어요. 잠시 후 다시 시도해 주세요.','Could not obtain a Higgsfield quote. Try again later.'):
          code==='BUDGET_UNAVAILABLE'?t('서버의 영상 제작 예산을 확인해 주세요.','Check the available video generation budget.'):
          code==='VIDEO_FAILED'?t('AI 영상 생성에 실패했어요. 자료를 확인한 뒤 다시 시도해 주세요.','AI generation failed. Review your inputs and retry.'):
          t('AI 영상을 완료하지 못했어요. 같은 내용으로 다시 시도해 주세요.','Could not finish the AI video. Retry with the same brief.'));
      }
    }finally{
      scene?.dispose();
      if(task.current===controller){task.current=null;setRun(null);}
    }
  }
  const step=result||run==='ai'||run==='encode'||confirm?3:currentReview||useManual||run==='prompt'?2:1;
  const durationText=seconds+t('초','s');
  return <section className="video-draft" aria-label={t('광고 영상 편집','Video ad editor')}>
    <div className="vd-heading"><h1>{t('광고 영상 만들기','Create an ad video')}</h1></div>
    <ol className="vd-steps" aria-label={t('영상 제작 단계','Video creation steps')}>
      {[t('정보 입력','Add details'),t('구성안 확인','Review plan'),t('영상 생성','Create video')].map((label,index)=>
        <li key={label} aria-current={step===index+1?'step':undefined}>{label}</li>)}
    </ol>
    <fieldset className="vd-industry" disabled={!!run}><legend>{t('광고할 분야','Your industry')}</legend>
      <AdIndustryFields id={industryId} kind={brief.kind} fieldId={brief.fieldId??''} saved={selectedIndustry}
        legacy={brief.category&&!selectedIndustry?text(industryLabel(brief.category)):undefined}
        onKind={kind=>edit({brief:{...brief,kind,style:style==='presenter'?'presenter':undefined,fieldId:undefined,category:undefined,industryDetail:undefined}})}
        onField={fieldId=>edit({brief:{...brief,fieldId,category:undefined,industryDetail:undefined}})}
        onItem={(item,custom)=>edit({brief:{...brief,category:item.category,industryDetail:formatIndustryDetail(item,custom)}})}/>
    </fieldset>
    <div className="vd-brief-block"><h2>{service?t('서비스 정보','Service details'):t('상품 정보','Product details')}</h2>
      {!service&&<VideoProductImport initialUrl={draft.productUrl??''} disabled={!!run} hasInfo={!!(brief.title||brief.description||brief.emphasis||caption||draft.voiceText)}
        photoRoom={sources.filter(source=>!source.importedProduct).length<10} onApply={applyProduct}/>}
      <VideoBriefFields value={brief} disabled={!!run} change={brief=>edit({brief})}/></div>
    <fieldset className="vd-style" disabled={!!run}><legend>{t('영상 형식','Video style')}</legend>
      <div>{styles.map(key=>{
        const Icon=styleIcons[key], label=videoStyles[key].label;
        return <button type="button" key={key} aria-pressed={style===key} onClick={()=>edit({brief:{...brief,style:key}})}>
          <Icon size={19} aria-hidden="true"/>{t(label[0],label[1])}</button>;
      })}</div>
    </fieldset>
    <fieldset className="vd-duration vd-ratios" disabled={!!run}><legend>{t('영상 규격','Video aspect ratio')}</legend>
      <div>{videoFormats.map(option=><button key={option.ratio} type="button" aria-pressed={ratio===option.ratio}
        onClick={()=>{if(ratio!==option.ratio)edit({ratio:option.ratio});}}>
        <span aria-hidden="true" style={{width:18*option.width/Math.max(option.width,option.height),height:18*option.height/Math.max(option.width,option.height)}}/>{option.ratio}
      </button>)}</div>
    </fieldset>
    <div className="vd-section-heading"><h2>{t('광고 소재','Ad media')}</h2><small>{t(layout.media[0],layout.media[1])}</small></div>
    <input type="file" ref={input} className="vd-file" aria-label={t('사진·영상 파일','Media files')} accept="image/*,video/*" multiple disabled={!!run||sources.length>=10}
      onChange={e=>{addFiles(Array.from(e.target.files??[]));e.target.value='';}}/>
    {!sources.length && <button type="button" className="vd-upload" disabled={!!run} onClick={()=>input.current?.click()}>
      <span className="vd-upload-icon"><ImagePlus size={30}/></span><strong>{t('참조 이미지·영상 넣기','Add reference images or clips')}</strong>
      <small>{t('한 번에 최대 10개','Up to 10 items')}</small></button>}
    {(sources.length>0||textOnly||servicePromptOnly) && <>
      <div className="vd-stage" hidden={servicePromptOnly&&!textOnly&&!result&&run!=='ai'} style={{'--vd-aspect':width/height} as CSSProperties}>
        <canvas width={width} height={height} ref={canvas} hidden={!!result && showResult} aria-label={t('영상 미리보기','Video preview')}/>
        {result && showResult && finishedUrl && <video key={finishedUrl} src={finishedUrl} controls playsInline aria-label={t('완성한 영상','Finished video')}/>}
        {(!result || !showResult) && ready && !useManual && run!=='encode'&&run!=='ai'&&<button type="button" className="vd-play" aria-label={run==='preview'?t('정지','Stop'):t('미리보기','Preview')} disabled={!!run&&run!=='preview'} onClick={()=>run==='preview'?task.current?.abort():void perform('preview')}>
          {run==='preview'?<Pause size={16}/>:<Play size={16}/>}<span>{Math.floor(time)} / {durationText}</span></button>}
        {sources.length>0&&loaded.length!==sources.length&& !bad&&<small className="vd-stage-note">{t('소재 불러오는 중…','Loading media…')}</small>}
      </div>
      {result&&!showResult&&<button type="button" className="vd-library" onClick={()=>setShowResult(true)}>{t('완성 영상 보기','View finished video')}</button>}
      {bad&&<p role="alert">{t('열 수 없는 소재를 삭제하거나 교체해 주세요.','Remove or replace this unreadable file.')} {bad}</p>}
      {sources.length>0&&<div className="vd-tray"><div className="vd-tray-label"><strong>{t('소재','Media')} <small>{sources.length}/10</small></strong>
        {sources.length<10&&<button type="button" disabled={!!run} onClick={()=>input.current?.click()}><Plus size={16}/>{t('추가','Add')}</button>}</div>
        <ol>{sources.map((s,i)=><li key={i}><button className="vd-scene" aria-pressed={i===selected} disabled={!!run} onClick={()=>{setSelected(i);setShowResult(false);setTime(0);}} title={s.name}>{i+1} · {s.name}</button>{sources.length>1&&i===selected&&<>
          <button className="vd-remove" disabled={!!run||i===0} aria-label={t('이 장면을 앞으로','Move this scene earlier')} onClick={()=>move(i,-1)}><ChevronLeft size={16}/></button>
          <button className="vd-remove" disabled={!!run||i===sources.length-1} aria-label={t('이 장면을 뒤로','Move this scene later')} onClick={()=>move(i,1)}><ChevronRight size={16}/></button></>}<button disabled={!!run} className="vd-remove" aria-label={s.name+' '+t('삭제','Remove')} onClick={()=>edit({sources:sources.filter((_,n)=>n!==i)})}><X size={15}/></button></li>)}</ol>
      </div>}
    </>}
    {needOpenBox&&sources.length===1&&<p role="status">{t('열린 박스 사진을 한 장 더 추가해 주세요.','Add one more photo showing the open box.')}</p>}
    {device&&style==='presenter'&&<p className="vd-format-note">{t('기기 편집은 올린 사진이나 촬영 영상을 사용해요. 목소리는 녹음 파일로 추가할 수 있어요.','Device editing uses your photos or footage. Add a recording for the voice-over.')}</p>}
    <fieldset className="vd-duration" disabled={!!run}><legend>{t('영상 길이','Video length')}</legend>
      <div>{videoDurations.map(value=><button key={value} type="button" aria-pressed={seconds===value}
        onClick={()=>edit({manual:value})}>{value}{t('초','s')}</button>)}</div>
      <button type="button" className="vd-recommend" aria-pressed={manual===null}
        onClick={()=>edit({manual:null})}>{manual===null&&<Check size={14}/>} {t('자동 추천','Recommended')} · {recommended}{t('초','s')}</button>
    </fieldset>
    <VideoPromptReview mode={promptMode} manualText={manualPrompt} seconds={seconds} ratio={ratio}
      onMode={promptMode=>edit({promptMode})} onManual={manualPrompt=>edit({manualPrompt})}
      review={review} ready={ready} busy={!!run} planning={run==='prompt'} allowModeChoice={useManual||(!clips&&!localOnly)} device={device}
      stale={stale} onBuild={()=>void buildPrompt()} error={promptError}
      onChange={patch=>{if(review)edit({review:{...review,...patch}});}}>
      {device&&<VideoSoundControls sound={sound} hasClips={clips>0} disabled={!!run} change={next=>edit({sound:next})}/>}
    </VideoPromptReview>
    {useManual&&device&&<p>{clips?t('직접 입력한 프롬프트로 제작하려면 첨부 영상을 빼고 사진을 사용해 주세요.','Remove video clips and use photos to generate from your prompt.'):t('이 계정에서는 직접 입력한 프롬프트로 AI 영상을 생성할 수 없어요.','AI video generation from a custom prompt is unavailable for this account.')}</p>}
    {device&&currentReview&&!sources.length&&!captions.some(line=>line.trim())&&<p role="status">{t('사진 없이 기기에서 편집하려면 장면 자막을 한 줄 이상 넣어 주세요.','Add at least one scene caption to edit on this device without photos.')}</p>}
    {!useManual&&device&&<div className="vd-checkout"><span>{t('기기 편집','Device editing')} · {audible?t('소리 켜짐','Sound on'):t('무음','Silent')}</span><b>{t('0크레딧','0 credits')}</b></div>}
    {typeof aiPrices?.[seconds]==='number'&&<small className="vd-ai-price">{t('AI 생성 예상','AI generation estimate')} · {durationText} · {aiPrices[seconds]}{t('크레딧',' credits')}</small>}
    {message&&<p role="status">{message}</p>}
    {(!device&&!useManual&&currentReview?.showCaptions||device)&&!format&&ready&&<p role="status">{t('파일 제작은 최신 Chrome에서 열어주세요.','Open in a current Chrome browser to export.')}</p>}
    {result?<button type="button" className="vd-primary" disabled={!!run} onClick={()=>void perform('save')}><Download size={18}/>{t('영상 저장','Save video')}</button>
      :!device?<button type="button" className="vd-primary" disabled={!!run||!canGenerateAi||(captions.some(line=>line.trim())&&!format)} onClick={()=>setConfirm('ai')}>
        <Clapperboard size={18}/>{run==='ai'?(aiStage==='queue'?t('AI 영상 생성 중…','Generating AI video…'):aiStage==='download'?t('영상 받는 중…','Downloading video…'):t('자막 입히는 중…','Adding captions…')):t('AI 영상 생성','Generate AI video')}</button>
      :!useManual&&<button type="button" className="vd-primary" disabled={!localReady||!!run||!format} onClick={()=>setConfirm('local')}>
        {run==='encode'?<LoaderCircle className="vd-spinner" size={18}/>:<Clapperboard size={18}/>}
        {run==='encode'?t('영상 만드는 중','Creating video')+' · '+Math.floor(time)+' / '+durationText:t('영상 만들기','Create video')}</button>}
    {run==='ai'&&<button className="vd-cancel" type="button" onClick={()=>task.current?.abort()}>{t('대기 닫기','Stop waiting')}</button>}
    {run==='encode'&&<button type="button" className="vd-cancel" onClick={()=>task.current?.abort()}>{t('제작 취소','Cancel creation')}</button>}
    {generateAi&&!clips&&!useManual&&<button type="button" className="vd-recommend vd-switch-method" disabled={!!run} onClick={()=>{setLocalOnly(!localOnly);setMessage('');}}>
      {localOnly?t('AI 영상 제작으로 돌아가기','Return to AI creation'):t('사진으로 기기 편집하기','Edit photos on this device')}</button>}
    {saved&&<p role="status">{t('저장 요청을 완료했어요.','Video sent to your downloads.')}</p>}
    {confirm&&<VideoCostDialog higgsfield={higgsfield} style={style} promptMode={promptMode} ratio={ratio} seconds={seconds} ai={confirm==='ai'} onCancel={()=>setConfirm(null)} onConfirm={()=>{
      setConfirm(null);
      if(confirm==='ai')void makeAiVideo();else void perform('encode');
    }}/>}
  </section>;
}
