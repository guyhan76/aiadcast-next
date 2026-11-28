import {validSceneCues,type SceneCue} from './video-omni';
import {validManualPrompt,validVideoShots,validVideoAudio,type VideoPlanIdea,type PhotoFrameLayout,type VideoShots,type PromptBrief} from './video-prompt';
import type {LoadedVideoScene} from './video-compose';
import {ApiRequestFailure,apiRequest,apiUrl} from './generation-client';
import {betaSession} from './beta-session';
import type {VideoDraft} from './VideoDurationEditor';
import type {VideoDuration} from './video-duration';
import {defaultVideoRatio} from './video-formats';

const storageKey=(prefix='aiadcast.video-request.')=> prefix+(betaSession()?.user.id??'local');
async function requestId(input:string,prefix?:string){
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input))),b=>b.toString(16).padStart(2,'0')).join('');
  // A retry of the same brief must reuse the original billable provider submission.
  const key=storageKey(prefix),saved=sessionStorage.getItem(key)?.split(':');
  if(saved?.[0]===hash&&saved[1])return saved[1];
  const id=crypto.randomUUID();sessionStorage.setItem(key,hash+':'+id);return id;
}

function referenceJpeg(visual:LoadedVideoScene['visual'],maxEdge:number){
  const video=visual instanceof HTMLVideoElement;
  const width=video?visual.videoWidth:visual.naturalWidth, height=video?visual.videoHeight:visual.naturalHeight;
  if(!width||!height)throw Error('VIDEO_REFERENCE_FORMAT');
  const scale=Math.min(1,maxEdge/Math.max(width,height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('VIDEO_REFERENCE_FORMAT');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(visual,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',.82);
}

export type VideoRequestStage = 'prepare'|'submit'|'check'|'queue'|'download';

async function timedVideoRequest<T>(signal:AbortSignal,ms:number,work:(requestSignal:AbortSignal)=>Promise<T>):Promise<T>{
  signal.throwIfAborted();
  const controller=new AbortController();
  const abort=()=>controller.abort(signal.reason);
  signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(new Error('VIDEO_RESPONSE_TIMEOUT')),ms);
  try{return await work(controller.signal);}
  catch(error){if(controller.signal.aborted)throw controller.signal.reason;throw error;}
  finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}

export async function requestAiVideo(draft:VideoDraft,seconds:VideoDuration,signal:AbortSignal,onState:(s:VideoRequestStage)=>void,scenes:LoadedVideoScene[],expectedCredits?:number,pilot?:'gemini'){
  const session=betaSession();
  const references:string[]=[];let bytes=0;
  const opening=draft.promptMode!=='manual'&&draft.review?.openingStill?.active?draft.review.openingStill:undefined;
  const ordered=draft.sources.map((source,index)=>({source,index}));
  if(opening&&ordered[opening.index]){
    ordered.splice(opening.index,1);
    ordered.unshift({source:{kind:'image',name:'opening.jpg',media:opening.data},index:opening.index});
  }
  for(const {source,index} of ordered){
    let media:Blob;
    if(source.kind==='video'){
      const visual=scenes[index]?.visual;
      if(!(visual instanceof HTMLVideoElement))throw Error('VIDEO_REFERENCE_FORMAT');
      media=await (await fetch(referenceJpeg(visual,1536),{signal})).blob();
    }else if(typeof source.media==='string'){
      if(!/^data:image\//.test(source.media))throw Error('VIDEO_REFERENCE_FORMAT');
      media=await (await fetch(source.media,{signal})).blob();
    }else media=source.media;
    if(!['image/png','image/webp','image/jpeg'].includes(media.type))throw Error('VIDEO_REFERENCE_FORMAT');
    bytes+=media.size;if(bytes>10*1024*1024)throw Error('VIDEO_REFERENCE_SIZE');
    const data=await new Promise<string>((resolve,reject)=>{
      const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('VIDEO_REFERENCE_FORMAT'));reader.readAsDataURL(media);
    });
    signal.throwIfAborted();references.push(data);
  }
  let directions:{manualPrompt:string}|{shots:VideoShots};
  const promptMode=draft.promptMode??'auto';
  if(promptMode==='manual'){
    if(!validManualPrompt(draft.manualPrompt))throw Error('VIDEO_PROMPT_REQUIRED');
    directions={manualPrompt:draft.manualPrompt};
  }else{
    if(promptMode!=='auto'||!draft.review||!validVideoShots(draft.review?.shots))throw Error('VIDEO_PROMPT_REQUIRED');
    directions={shots:draft.review.shots};
  }
  const review=draft.review;
  const manual=promptMode==='manual';
  const creativePayload=manual
    ? {...directions,promptPolicy:'owner-only',brief:{kind:draft.brief.kind,style:draft.brief.style,title:'',description:'',emphasis:''},seconds,
       music:true,voice:true,musicStyle:'',voiceStyle:'',narration:'',suggestedVoice:'',references}
    : {...directions,...(review?.sceneCues?{alignedScenes:true,...(pilot==='gemini'?{sceneCues:review.sceneCues}:{})}:{}),...(opening?{reviewedOpening:true}:!review?.openingStill&&review?.frameLayout && review.frameLayout.mode!=='original'?{frameLayout:review.frameLayout}:{}),brief:draft.brief,seconds,music:review!.music,voice:review!.voice,
       musicStyle:review!.music?review!.musicMood:'',voiceStyle:review!.voice?draft.voiceStyle:'',
       narration:review!.voice?review!.narration:'',suggestedVoice:'',references};
  const ratio=draft.ratio??defaultVideoRatio;
  const payload=pilot?{...creativePayload,pilot}:creativePayload;
  // Preserve the request key for vertical jobs already submitted by older clients.
  const id=await requestId(JSON.stringify(ratio===defaultVideoRatio?payload:{...payload,ratio}));
  signal.throwIfAborted();
  const path='/api/videos/'+encodeURIComponent(id);
  onState('submit');
  let acknowledged=false;
  try{
    const submitted=await timedVideoRequest(signal,120_000,s=>apiRequest<{id:string}>('/api/videos',{...payload,ratio,promptMode,requestId:id,expectedCredits},s));
    if(submitted.id!==id)throw Error('VIDEO_TASK_MISMATCH');
    acknowledged=true;
  }catch(error){
    signal.throwIfAborted();
    if(!(error instanceof TypeError)&&!(error instanceof Error&&['VIDEO_RESPONSE_TIMEOUT','API_UNAVAILABLE'].includes(error.message)))throw error;
  }
  onState(acknowledged?'queue':'check');
  const deadline=Date.now()+(pilot&&seconds>15?30:10)*60_000;
  for(;;){
    let status:{state:string;code?:string};
    try{
      status=await timedVideoRequest(signal,30_000,s=>apiRequest<{state:string;code?:string}>(path,undefined,s));
    }catch(error){
      signal.throwIfAborted();
      if(!acknowledged)throw Error('VIDEO_SUBMISSION_UNCERTAIN');
      if(error instanceof TypeError||(error instanceof Error&&['VIDEO_RESPONSE_TIMEOUT','API_UNAVAILABLE'].includes(error.message)))throw Error('VIDEO_WAIT');
      throw error;
    }
    if(!acknowledged){acknowledged=true;onState('queue');}
    if(status.state==='ready')break;
    if(status.state==='failed'){sessionStorage.removeItem(storageKey());throw Error(status.code??'VIDEO_FAILED');}
    if(status.state==='uncertain')throw Error('VIDEO_SUBMISSION_UNCERTAIN');
    if(status.state!=='running'||Date.now()>=deadline)throw Error('VIDEO_WAIT');
    await new Promise<void>((resolve,reject)=>{
      const abort=()=>{clearTimeout(timer);reject(signal.reason);};
      const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},2500);
      signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
    });
  }
  onState('download');
  return downloadVideoOriginal(id,signal,session?.token);
}

export async function requestVideoPrompt(brief:PromptBrief,scenes:LoadedVideoScene[],language:'ko'|'en',signal:AbortSignal,segmented=false):Promise<VideoPlanIdea>{
  const session=betaSession();
  const references=scenes.map(({visual})=>referenceJpeg(visual,512));
  const input={kind:'video-prompt',...(segmented?{segmented:true}:{}),planVersion:references.length&&(brief.style==='presenter'||brief.style==='product')?4:brief.kind==='product'?2:1,targetLocale:language,brief,references};
  const planIdentity=['shot-direction-v10',input];
  const id=await requestId(JSON.stringify(planIdentity),'aiadcast.video-prompt.');
  signal.throwIfAborted();
  const result=await apiRequest<{requestId:string;shots:unknown;sceneCues?:SceneCue[];audio?:unknown;frameLayout?:PhotoFrameLayout}>('/api/assistant',{...input,requestId:id},signal).catch(error=>{
    // A rate-limited attempt is recorded as failed with no provider charge.
    const key=storageKey('aiadcast.video-prompt.');
    if(error instanceof ApiRequestFailure&&error.code==='PROVIDER_RATE_LIMITED'&&sessionStorage.getItem(key)?.endsWith(':'+id))sessionStorage.removeItem(key);
    throw error;
  });
  if(session?.token!==betaSession()?.token||result.requestId!==id||!validVideoShots(result.shots))throw Error('INVALID_VIDEO_PROMPT');
  if(result.audio!==undefined&&!validVideoAudio(result.audio))throw Error('INVALID_VIDEO_PROMPT');
  if(segmented&&!validSceneCues(result.sceneCues))throw Error('INVALID_VIDEO_PROMPT');
  return {shots:result.shots,sceneCues:result.sceneCues,audio:result.audio,frameLayout:result.frameLayout};
}

export async function downloadVideoOriginal(id:string,signal:AbortSignal,token:string|undefined){
  if(!token||token!==betaSession()?.token)throw Error('SESSION_CHANGED');
  const path='/api/videos/'+encodeURIComponent(id);
  const media=await timedVideoRequest(signal,120_000,async requestSignal=>{
    const response=await fetch(apiUrl(path+'/file'),{headers:{Authorization:'Bearer '+token},redirect:'error',signal:requestSignal});
    if(!response.ok||response.headers.get('content-type')!=='video/mp4')throw Error('VIDEO_DOWNLOAD_FAILED');
    return response.blob();
  });
  if(betaSession()?.token!==token)throw Error('SESSION_CHANGED');
  return media;
}
