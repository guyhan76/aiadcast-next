import {useEffect,useState} from 'react';
import {VideoDurationEditor,type VideoDraft} from './VideoDurationEditor';
import {requestAiVideo,requestVideoPrompt} from './video-ai-client';
import {apiRequest} from './generation-client';
import type {VideoDuration} from './video-duration';

export function VideoAdPage({draft,change,onNew}:{draft:VideoDraft;change:(draft:VideoDraft)=>void;onNew:()=>void}){
  const [prices,setPrices]=useState<Partial<Record<VideoDuration,number>>>({});
  const [balance,setBalance]=useState(0);
  const [admin,setAdmin]=useState(false);
  const [assistant,setAssistant]=useState(false);
  const [trial,setTrial]=useState<boolean|null>(null);
  const [provider,setProvider]=useState<string>();
  useEffect(()=>{
    const c=new AbortController();
    void apiRequest<{wallet?:{credits?:{available:number};unlimited?:boolean};assistant?:{available:boolean};videoTrial?:boolean;videoProvider?:string;videoDurationPrices?:Partial<Record<VideoDuration,number>>}>('/api/status',undefined,c.signal)
      .then(status=>{if(!c.signal.aborted){setAssistant(status.assistant?.available===true);setPrices(status.videoDurationPrices??{});setAdmin(status.wallet?.unlimited===true);setBalance(status.wallet?.credits?.available??0);setTrial(status.videoTrial===true);setProvider(status.videoProvider);}}).catch(()=>{if(!c.signal.aborted)setTrial(false);});
    return()=>c.abort();
  },[]);
  return <VideoDurationEditor onNew={onNew} draft={draft} change={change} draftPrompt={assistant?requestVideoPrompt:undefined} aiPrices={prices} admin={admin} availableCredits={balance} provider={provider} checkingAccess={trial===null} generateAi={trial?async(draft,seconds,signal,onState,scenes)=>{
    const movie=await requestAiVideo(draft,seconds,signal,onState,scenes,admin?0:prices[seconds]);
    void apiRequest<{wallet:{credits:{available:number}}}>('/api/status',undefined,signal).then(s=>setBalance(s.wallet.credits.available)).catch(()=>{});
    return movie;
  }:undefined}/>;
}
