import {useEffect,useState} from 'react';
import {VideoDurationEditor,type VideoDraft} from './VideoDurationEditor';
import {requestAiVideo,requestVideoPrompt} from './video-ai-client';
import {apiRequest} from './generation-client';
import type {VideoDuration} from './video-duration';

export function VideoAdPage({draft,change}:{draft:VideoDraft;change:(draft:VideoDraft)=>void}){
  const [prices,setPrices]=useState<Partial<Record<VideoDuration,number>>>({});
  const [assistant,setAssistant]=useState(false);
  const [trial,setTrial]=useState(false);
  const [higgsfield,setHiggsfield]=useState(false);
  useEffect(()=>{
    const c=new AbortController();
    void apiRequest<{assistant?:{available:boolean};videoTrial?:boolean;videoProvider?:string;videoDurationPrices?:Partial<Record<VideoDuration,number>>}>('/api/status',undefined,c.signal)
      .then(status=>{if(!c.signal.aborted){setAssistant(status.assistant?.available===true);setPrices(status.videoDurationPrices??{});setTrial(status.videoTrial===true);setHiggsfield(status.videoProvider==='higgsfield');}}).catch(()=>{});
    return()=>c.abort();
  },[]);
  return <VideoDurationEditor draft={draft} change={change} draftPrompt={assistant?requestVideoPrompt:undefined} aiPrices={prices} higgsfield={higgsfield} generateAi={trial?requestAiVideo:undefined}/>;
}
