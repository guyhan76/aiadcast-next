import {sceneCaptionAt} from './video-brief';
import type {VideoDuration, VideoSource} from './video-duration';

import {prepareAdSound} from './video-sound';

type Visual = HTMLImageElement | HTMLVideoElement;
const fps = 24;
export type LoadedVideoScene = {visual: Visual; dispose: () => void};

export function videoFormat(withSound=false) {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return undefined;
  const formats=withSound ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1.42E01E,opus','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/mp4','video/webm'] :
    ['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  return formats.find(format => MediaRecorder.isTypeSupported(format));
}

export async function loadVideoScene(source: VideoSource, signal: AbortSignal): Promise<LoadedVideoScene> {
  signal.throwIfAborted();
  const url = typeof source.media === 'string' ? source.media : URL.createObjectURL(source.media);
  const visual = source.kind === 'video' ? document.createElement('video') : new Image();
  if (visual instanceof HTMLVideoElement) {visual.preload='auto'; visual.muted=true; visual.playsInline=true;}
  function dispose() {
    if (visual instanceof HTMLVideoElement) {visual.pause(); visual.removeAttribute('src'); visual.load();}
    else visual.removeAttribute('src');
    if (typeof source.media !== 'string') URL.revokeObjectURL(url);
  }
  try {
    await new Promise<void>((resolve,reject) => {
      const readyEvent = visual instanceof HTMLVideoElement ? 'loadeddata' : 'load';
      function cleanup() {
        clearTimeout(timer); signal.removeEventListener('abort',abort);
        visual.removeEventListener(readyEvent,ready); visual.removeEventListener('error',fail);
      }
      function ready() {cleanup(); resolve();}
      function fail() {cleanup(); reject(Error(source.name));}
      function abort() {cleanup(); reject(new DOMException('Cancelled','AbortError'));}
      const timer = setTimeout(fail,20000);
      visual.addEventListener(readyEvent,ready); visual.addEventListener('error',fail);
      signal.addEventListener('abort',abort,{once:true}); visual.src=url;
    });
    return {visual,dispose};
  } catch (e) {dispose(); throw e;}
}

export function drawAdFrame(ctx: CanvasRenderingContext2D, visual: Visual | undefined, caption: string, zoom = 1) {
  const {width,height}=ctx.canvas;
  const video = visual instanceof HTMLVideoElement;
  const w = video ? visual.videoWidth : visual?.naturalWidth, h = video ? visual.videoHeight : visual?.naturalHeight;
  ctx.fillStyle='#191916'; ctx.fillRect(0,0,width,height);
  if (visual && w && h) {
    const scale = Math.min(width/w,height/h) * (video ? 1 : zoom);
    ctx.drawImage(visual,(width-w*scale)/2,(height-h*scale)/2,w*scale,h*scale);
  }
  if (!caption.trim()) return;
  let size=visual?38:54, lines:string[]=[];
  const maxHeight=visual?height*.48:height*.66;
  for(;size>=16;size-=2){
    ctx.font='bold '+size+'px sans-serif';lines=[];
    for(const paragraph of caption.trim().split('\n')){
      let line='';
      for(const char of paragraph){
        if(line && ctx.measureText(line+char).width>width-104){lines.push(line);line='';}
        line+=char;
      }
      lines.push(line);
    }
    if(lines.length*size*1.35<maxHeight||size===16)break;
  }
  ctx.textAlign='center';ctx.textBaseline='middle';
  const spacing=size*1.35, boxHeight=lines.length*spacing+28;
  const y=visual?height-Math.round(height*.12)-boxHeight:(height-boxHeight)/2;
  if(visual){ctx.fillStyle='rgba(17,18,17,.86)';ctx.fillRect(32,y,width-64,boxHeight);}
  ctx.fillStyle='white';lines.forEach((line,i)=>ctx.fillText(line,width/2,y+14+(i+.5)*spacing));
}

export async function captionGeneratedVideo(canvas:HTMLCanvasElement, video:HTMLVideoElement, seconds:VideoDuration,
  captions:readonly string[], withSound:boolean, signal:AbortSignal):Promise<File> {
  signal.throwIfAborted();
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw Error('NO_CANVAS');
  const format=videoFormat(withSound);
  if(!format)throw Error('UNSUPPORTED');
  const stream=canvas.captureStream(fps);
  let visual=video;
  let removeListeners:(()=>void)|undefined;
  const chunks:Blob[]=[];
  let mix:Awaited<ReturnType<typeof prepareAdSound>>|undefined;
  let recorder:MediaRecorder|undefined, frame=0;
  try {
    if(withSound){
      mix=await prepareAdSound({music:'off',original:true},[video],seconds,true,signal);
      signal.throwIfAborted();
      visual=mix.visuals[0] as HTMLVideoElement;
      stream.addTrack(mix.track);
    }
    const recording=new MediaRecorder(stream,{mimeType:format,videoBitsPerSecond:2500000});
    recorder=recording;
    const result=await new Promise<File>((resolve,reject)=>{
      let finished=false;
      function fail() {reject(Error('RECORDING_FAILED'));}
      function abort() {reject(new DOMException('Cancelled','AbortError'));}
      function visibility() {if(document.hidden)reject(Error('HIDDEN'));}
      const clean=()=>{
        signal.removeEventListener('abort',abort);document.removeEventListener('visibilitychange',visibility);
      };
      signal.addEventListener('abort',abort,{once:true}); document.addEventListener('visibilitychange',visibility);
      removeListeners=clean;
      recording.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recording.onerror=fail;
      recording.onstop=()=>{
        if(!finished||!chunks.length){fail();return;}
        const mp4=recording.mimeType.startsWith('video/mp4');
        resolve(new File(chunks,'aiadcast-'+crypto.randomUUID().slice(0,8)+'-01.'+(mp4?'mp4':'webm'),{type:mp4?'video/mp4':'video/webm'}));
      };
      const start=performance.now();
      function paint(now:number) {
        if(signal.aborted)return;
        try {
          const time=Math.min(seconds,(now-start)/1000);
          drawAdFrame(ctx!,visual,sceneCaptionAt(captions,time,seconds));
          if(time>=seconds){finished=true;recording.stop();}
          else frame=requestAnimationFrame(paint);
        } catch {fail();}
      }
      drawAdFrame(ctx,visual,sceneCaptionAt(captions,0,seconds));
      recording.start(250);mix?.start(fail);
      visual.currentTime=0;void visual.play().catch(fail);paint(start);
    });
    return result;
  } finally {
    removeListeners?.();cancelAnimationFrame(frame);
    if(recorder && recorder.state!=='inactive')recorder.stop();
    stream.getTracks().forEach(track=>track.stop());
    mix?.close();
    visual.pause();
  }
}
