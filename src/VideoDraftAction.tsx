import {createContext,useContext,useEffect,useRef,useState} from 'react';
import {projectVideoBrief,type VideoBrief} from './video-brief';
import type {Project} from './model';
import type {VideoSource} from './video-duration';
import {useUiLanguage} from './ui-language';

export const OpenVideoDraft=createContext<((sources:VideoSource[],brief?:VideoBrief)=>void)|null>(null);
type Props={getSources:(signal:AbortSignal)=>VideoSource[]|Promise<VideoSource[]>;disabled?:boolean;project?:Project};
export function VideoDraftAction({getSources,disabled,project}:Props){
  const {t}=useUiLanguage(),openDraft=useContext(OpenVideoDraft);
  const [busy,setBusy]=useState(false),[error,setError]=useState(false);
  const pending=useRef<AbortController|null>(null);
  useEffect(()=>{
    function stop(){pending.current?.abort();pending.current=null;setBusy(false);setError(false);}
    window.addEventListener('aiadcast-session-change',stop);
    return()=>{window.removeEventListener('aiadcast-session-change',stop);pending.current?.abort();};
  },[]);
  async function open(){
    if(!openDraft||pending.current)return;
    const c=new AbortController();pending.current=c;setBusy(true);setError(false);
    try{
      const sources=await getSources(c.signal);c.signal.throwIfAborted();
      if(!sources.length)throw Error('MISSING');
      openDraft(sources,sources[0].brief??projectVideoBrief(project,sources[0].name));
    }catch{if(!c.signal.aborted)setError(true);}
    finally{if(!c.signal.aborted){pending.current=null;setBusy(false);}}
  }
  if(!openDraft)return null;
  return <><button type="button" disabled={busy||disabled} className="video-open" onClick={()=>void open()}>{t('영상으로 만들기','Make a video')}</button>
    {error&&<p role="alert">{t('광고 원본을 불러오지 못했어요. 다시 시도해 주세요.','Could not open the original ad. Please retry.')}</p>}</>;
}
