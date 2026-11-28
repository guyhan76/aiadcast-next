import {loadVideoScene,videoFormat} from './video-compose';
import {apiRequest} from './generation-client';

export async function openReviewVideo(file:Blob,signal:AbortSignal) {
  const scene=await loadVideoScene({kind:'video',name:'review',media:file},signal);
  return {video:scene.visual as HTMLVideoElement,dispose:scene.dispose};
}

async function seek(video:HTMLVideoElement,time:number,signal:AbortSignal){
  signal.throwIfAborted();
  if(Math.abs(video.currentTime-time)<.001 && !video.seeking)return;
  await new Promise<void>((resolve,reject)=>{
    const finish=(err?:Error)=>{
      clearTimeout(timer);video.removeEventListener('seeked',ready);signal.removeEventListener('abort',abort);
      if(err)reject(err);else resolve();
    };
    const ready=()=>finish(),abort=()=>finish(Error('CANCELLED'));
    const timer=setTimeout(()=>finish(Error('SEEK_TIMEOUT')),8000);
    signal.addEventListener('abort',abort,{once:true});video.addEventListener('seeked',ready,{once:true});video.currentTime=time;
  });
}

export async function sampleFrame(video:HTMLVideoElement,time:number,edge:number,signal:AbortSignal) {
  await seek(video,time,signal);
  const canvas=document.createElement('canvas'), scale=Math.min(1,edge/Math.max(video.videoWidth,video.videoHeight));
  canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('CANVAS_UNAVAILABLE');
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',.83);
}

export type ReviewIssue={time:number;note:string};
export async function reviewMovie(file:File,seconds:number,brief:string,language:'ko'|'en',signal:AbortSignal){
  const {video,dispose}=await openReviewVideo(file,signal);
  try{
    const duration=Number.isFinite(video.duration)?Math.min(video.duration,seconds):seconds;
    const times=[0,.8,...[.16,.29,.36,.48,.59,.69,.77,.87,.97].map(f=>Math.round(f*duration*100)/100)];
    const frames=[];
    for(const time of [...new Set(times.filter(t=>t<duration))].sort((a,b)=>a-b)){
      frames.push({time,image:await sampleFrame(video,time,384,signal)});
    }
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([frames,brief,language])));
    const requestId='review-'+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
    const reply=await apiRequest<{requestId:string;issues:ReviewIssue[]}>('/api/assistant',{requestId,kind:'video-review',frames,brief:brief.slice(0,4000),targetLocale:language},signal);
    if(reply.requestId!==requestId||!Array.isArray(reply.issues))throw Error('INVALID_REVIEW');
    return reply.issues;
  }finally{dispose();}
}

export type AVReviewIssue={from:number;to:number;category:'speech'|'sync'|'sound'|'visual';mode:RepairMode;note:string;evidence:string;confidence:number};
export type AVReview={requestId:string;audioStatus:'audible'|'silent'|'uncertain';issues:AVReviewIssue[]};
export async function reviewAudiovisual(file:File,seconds:number,brief:string,language:'ko'|'en',signal:AbortSignal):Promise<AVReview>{
  signal.throwIfAborted();
  if(file.size>9*1024*1024)throw Error('AV_FILE_TOO_LARGE');
  const mime=file.type.split(';')[0];
  if(!['video/mp4','video/webm'].includes(mime))throw Error('AV_UNSUPPORTED_FILE');
  const bytes=new Uint8Array(await file.arrayBuffer());
  signal.throwIfAborted();
  const chunks:string[]=[];
  for(let i=0;i<bytes.length;i+=16384)chunks.push(String.fromCharCode(...bytes.subarray(i,i+16384)));
  const data=btoa(chunks.join(''));
  const context=brief.slice(0,4000);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([data,mime,seconds,context,language])));
  const requestId='av-'+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  signal.throwIfAborted();
  const reply=await apiRequest<AVReview>('/api/assistant',{requestId,kind:'video-av-review',mime,data,seconds,brief:context,targetLocale:language,consent:true},signal);
  if(reply.requestId!==requestId||!['audible','silent','uncertain'].includes(reply.audioStatus)||!Array.isArray(reply.issues)||
    reply.issues.some(i=>!Number.isFinite(i.from)||!Number.isFinite(i.to)||i.from<0||i.to<=i.from||i.to>seconds||!['clip','audio','mute'].includes(i.mode)))throw Error('INVALID_REVIEW');
  return reply;
}

export type RepairMode='clip'|'audio'|'mute';
export async function renderRepair(original:File,seconds:number,from:number,to:number,mode:RepairMode,replacement:File|undefined,signal:AbortSignal,keepClipAudio=false):Promise<File>{
  if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to<=from||to>seconds||(!replacement&&mode!=='mute'))throw Error('INVALID_RANGE');
  const mime=videoFormat(true);
  if(!mime)throw Error('UNSUPPORTED');
  const audio=new AudioContext(),output=audio.createMediaStreamDestination();
  const disposals:Array<()=>void>=[];
  let stream:MediaStream|undefined,recorder:MediaRecorder|undefined,raf=0;
  try{
    await audio.resume();
    const source=await openReviewVideo(original,signal);disposals.push(source.dispose);
    const base=source.video;
    const duration=Number.isFinite(base.duration)?base.duration:seconds;
    if(from>=duration||to>duration+.15)throw Error('INVALID_RANGE');
    const baseGain=audio.createGain();
    audio.createMediaElementSource(base).connect(baseGain).connect(output);base.muted=false;
    let insert:HTMLMediaElement|undefined;
    if(replacement&&mode!=='mute'){
      const media=await openReviewVideo(replacement,signal);disposals.push(media.dispose);
      insert=media.video;
      if(Number.isFinite(insert.duration)&&insert.duration+.08<to-from)throw Error('CLIP_TOO_SHORT');
      if(mode==='clip'&&!media.video.videoWidth)throw Error('INVALID_CLIP');
      if(mode==='audio'||!keepClipAudio){audio.createMediaElementSource(insert).connect(output);insert.muted=false;}
    }
    const canvas=document.createElement('canvas');canvas.width=base.videoWidth;canvas.height=base.videoHeight;
    const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('NO_CANVAS');
    stream=canvas.captureStream(30);stream.addTrack(output.stream.getAudioTracks()[0]);
    const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6000000});recorder=rec;
    const chunks:Blob[]=[];
    return await new Promise<File>((resolve,reject)=>{
      let active=false,complete=false;
      const fail=()=>reject(Error('REPAIR_INTERRUPTED'));
      const visibility=()=>{if(document.hidden)fail();};
      const finish=()=>{if(rec.state==='recording'){complete=true;rec.stop();}};
      const timer=setTimeout(fail,(seconds+20)*1000);
      disposals.push(()=>{clearTimeout(timer);signal.removeEventListener('abort',fail);document.removeEventListener('visibilitychange',visibility);base.onended=null;base.onerror=null;});
      signal.addEventListener('abort',fail,{once:true});document.addEventListener('visibilitychange',visibility);
      rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};rec.onerror=fail;base.onerror=fail;
      rec.onstop=()=>{
        if(!complete||!chunks.length){fail();return;}
        const type=rec.mimeType.startsWith('video/mp4')?'video/mp4':'video/webm';
        resolve(new File(chunks,'aiadcast-'+crypto.randomUUID().slice(0,8)+'-01.'+type.split('/')[1],{type}));
      };
      function paint(){
        try{
          const t=base.currentTime,inside=t>=from&&t<to;
          baseGain.gain.value=inside&&!(mode==='clip'&&keepClipAudio)?0:1;
          if(inside!==active){
            active=inside;
            if(insert){if(inside)void insert.play().catch(fail);else insert.pause();}
          }
          const visual=inside&&mode==='clip'&&insert instanceof HTMLVideoElement?insert:base;
          const scale=Math.min(canvas.width/visual.videoWidth,canvas.height/visual.videoHeight);
          const w=visual.videoWidth*scale,h=visual.videoHeight*scale;
          ctx!.fillStyle='black';ctx!.fillRect(0,0,canvas.width,canvas.height);ctx!.drawImage(visual,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
          if(base.ended||t>=duration)finish();else raf=requestAnimationFrame(paint);
        }catch{fail();}
      }
      signal.throwIfAborted();base.onended=finish;rec.start(200);paint();void base.play().catch(fail);
    });
  }finally{
    cancelAnimationFrame(raf);if(recorder?.state==='recording')recorder.stop();
    stream?.getTracks().forEach(track=>track.stop());output.stream.getTracks().forEach(track=>track.stop());
    for(const dispose of disposals.reverse())dispose();await audio.close().catch(()=>{});
  }
}
