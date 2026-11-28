export type VideoSound = {
  music: 'off' | 'built-in' | 'file';
  musicFile?: File;
  voice?: File;
  original: boolean;
};
export const defaultVideoSound: VideoSound = {music:'off',original:true};

export function usesSound(sound:VideoSound, hasClip:boolean) {
  return sound.music==='built-in' || sound.music==='file' && !!sound.musicFile || !!sound.voice || hasClip && sound.original;
}

// Original instrumental: short plucked keys, a soft bass and a four-bar phrase.
function scheduleMusic(ctx:AudioContext, bus:GainNode, start:number, seconds:number) {
  const beat=60/100, roots=[50,55,52,57], intervals=[0,7,12,16,7,12,19,14];
  function note(midi:number,at:number,length:number,level:number,type:OscillatorType) {
    const tone=ctx.createOscillator(), shape=ctx.createGain();
    tone.type=type;tone.frequency.value=440*Math.pow(2,(midi-69)/12);
    shape.gain.setValueAtTime(.0001,at);shape.gain.exponentialRampToValueAtTime(level,at+.015);
    shape.gain.exponentialRampToValueAtTime(.0001,at+length);
    tone.connect(shape).connect(bus);tone.start(at);tone.stop(at+length+.01);
    tone.onended=()=>{tone.disconnect();shape.disconnect();};
  }
  for(let i=0;i*beat/2<seconds;i++){
    const root=roots[Math.floor(i/8)%roots.length], offset=i*beat/2;
    if(i%2===0)note(root-12,start+offset,.42,.22,'sine');
    if(i%8!==6)note(root+intervals[i%8],start+offset,.33,.16,'triangle');
  }
}

async function loadSoundElement(element:HTMLMediaElement,url:string,signal:AbortSignal) {
  signal.throwIfAborted();
  await new Promise<void>((resolve,reject)=>{
    const finish=(error?:Error)=>{
      clearTimeout(timer);
      element.removeEventListener('loadeddata',ready); element.removeEventListener('error',fail);
      signal.removeEventListener('abort',abort);
      if(error)reject(error);else resolve();
    };
    const ready=()=>finish(),fail=()=>finish(Error('AUDIO_FILE')),abort=()=>finish(new DOMException('Cancelled','AbortError'));
    const timer=setTimeout(fail,18000);
    element.preload='auto';element.addEventListener('loadeddata',ready);
    element.addEventListener('error',fail);signal.addEventListener('abort',abort,{once:true});
    element.src=url;element.load();
  });
}

export async function prepareAdSound(sound:VideoSound, visuals:(HTMLVideoElement|HTMLImageElement)[],
  seconds:number,capture:boolean,signal:AbortSignal) {
  const ctx=new AudioContext();
  const destination=ctx.createMediaStreamDestination(),master=ctx.createGain();
  master.connect(capture?destination:ctx.destination);
  const musicBus=ctx.createGain(),originalBus=ctx.createGain();
  musicBus.connect(master);originalBus.connect(master);
  const elements:HTMLMediaElement[]=[], localUrls:string[]=[];
  const sceneVisuals=[...visuals];
  function close() {
    signal.removeEventListener('abort',close);
    for(const el of elements){el.onerror=null;el.onended=null;el.pause();el.removeAttribute('src');el.load();}
    for(const url of localUrls)URL.revokeObjectURL(url);
    destination.stream.getTracks().forEach(track=>track.stop());
    if(ctx.state!=='closed')void ctx.close().catch(()=>{});
  }
  async function attach(el:HTMLMediaElement,url:string,bus:AudioNode) {
    elements.push(el);
    ctx.createMediaElementSource(el).connect(bus);
    await loadSoundElement(el,url,signal);
    return el;
  }
  async function fileSource(file:File,bus:AudioNode) {
    const url=URL.createObjectURL(file);localUrls.push(url);
    return attach(new Audio(),url,bus);
  }
  // WebViews may keep a resume request pending after the user leaves the page.
  signal.addEventListener('abort',close,{once:true});
  try {
    await ctx.resume();
    signal.throwIfAborted();
    const music=sound.music==='file' && sound.musicFile?await fileSource(sound.musicFile,musicBus):undefined;
    if(music)music.loop=true;
    const voice=sound.voice?await fileSource(sound.voice,master):undefined;
    if(sound.original){
      for(const [i,v] of visuals.entries()){
        if(!(v instanceof HTMLVideoElement))continue;
        const copy=document.createElement('video');copy.playsInline=true;
        await attach(copy,v.currentSrc,originalBus);
        sceneVisuals[i]=copy;
      }
    }
    signal.throwIfAborted();
    const bed=sound.music==='built-in' ? .82 : .38;
    const clipLevel=sound.music==='off' ? .86 : .60;
    function start(onError:()=>void) {
      const now=ctx.currentTime;
      // Reserve headroom for the narration. Restore the bed once the recording ends.
      musicBus.gain.value=voice?bed*.25:bed;originalBus.gain.value=voice ? .13 : clipLevel;
      if(voice)voice.onended=()=>{
        musicBus.gain.setTargetAtTime(bed,ctx.currentTime,.12);
        originalBus.gain.setTargetAtTime(clipLevel,ctx.currentTime,.12);
      };
      master.gain.setValueAtTime(.001,now);master.gain.linearRampToValueAtTime(.9,now+.04);
      master.gain.setValueAtTime(.9,now+seconds-.22);master.gain.linearRampToValueAtTime(.001,now+seconds);
      if(sound.music==='built-in')scheduleMusic(ctx,musicBus,now,seconds);
      for(const el of [music,voice])if(el){
        el.onerror=onError;
        void el.play().catch(e=>{if(e.name!=='AbortError')onError();});
      }
    }
    return {visuals:sceneVisuals,track:destination.stream.getAudioTracks()[0],start,close};
  } catch(e){close();throw e;}
}
