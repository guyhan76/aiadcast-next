import {validManualPrompt,validVideoShots,validVideoAudio,type VideoPlanIdea,type VideoShots,type PromptBrief} from './video-prompt';
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

export async function requestAiVideo(draft:VideoDraft,seconds:VideoDuration,signal:AbortSignal,onState:(s:'queue'|'download')=>void,scenes:LoadedVideoScene[],expectedCredits?:number){
  const session=betaSession();
  const references:string[]=[];let bytes=0;
  for(const [index,source] of draft.sources.entries()){
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
  const payload=manual
    ? {...directions,promptPolicy:'owner-only',brief:{kind:draft.brief.kind,title:'',description:'',emphasis:''},seconds,
       music:true,voice:true,musicStyle:'',voiceStyle:'',narration:'',suggestedVoice:'',references}
    : {...directions,brief:draft.brief,seconds,music:review!.music,voice:review!.voice,
       musicStyle:review!.music?review!.musicMood:'',voiceStyle:review!.voice?draft.voiceStyle:'',
       narration:review!.voice?review!.narration:'',suggestedVoice:'',references};
  const ratio=draft.ratio??defaultVideoRatio;
  // Preserve the request key for vertical jobs already submitted by older clients.
  const id=await requestId(JSON.stringify(ratio===defaultVideoRatio?payload:{...payload,ratio}));
  signal.throwIfAborted();
  const submitted=await apiRequest<{id:string}>('/api/videos',{...payload,ratio,promptMode,requestId:id,expectedCredits},signal);
  if(submitted.id!==id)throw Error('VIDEO_TASK_MISMATCH');
  const path='/api/videos/'+encodeURIComponent(id);
  onState('queue');
  const deadline=Date.now()+10*60_000;
  for(;;){
    const status=await apiRequest<{state:string;code?:string}>(path,undefined,signal);
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
  const response=await fetch(apiUrl(path+'/file'),{headers:session?{Authorization:'Bearer '+session.token}:{},redirect:'error',signal});
  if(!response.ok||response.headers.get('content-type')!=='video/mp4')throw Error('VIDEO_DOWNLOAD_FAILED');
  const media=await response.blob();if(betaSession()?.token!==session?.token)throw Error('SESSION_CHANGED');
  return media;
}

export async function requestVideoPrompt(brief:PromptBrief,scenes:LoadedVideoScene[],language:'ko'|'en',signal:AbortSignal):Promise<VideoPlanIdea>{
  const session=betaSession();
  const references=scenes.map(({visual})=>referenceJpeg(visual,512));
  const input={kind:'video-prompt',planVersion:1,targetLocale:language,brief,references};
  const id=await requestId(JSON.stringify(input),'aiadcast.video-prompt.');
  signal.throwIfAborted();
  const result=await apiRequest<{requestId:string;shots:unknown;audio?:unknown}>('/api/assistant',{...input,requestId:id},signal).catch(error=>{
    // A rate-limited attempt is recorded as failed with no provider charge.
    const key=storageKey('aiadcast.video-prompt.');
    if(error instanceof ApiRequestFailure&&error.code==='PROVIDER_RATE_LIMITED'&&sessionStorage.getItem(key)?.endsWith(':'+id))sessionStorage.removeItem(key);
    throw error;
  });
  if(session?.token!==betaSession()?.token||result.requestId!==id||!validVideoShots(result.shots))throw Error('INVALID_VIDEO_PROMPT');
  if(result.audio!==undefined&&!validVideoAudio(result.audio))throw Error('INVALID_VIDEO_PROMPT');
  return {shots:result.shots,audio:result.audio};
}
