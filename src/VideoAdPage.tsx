import {useEffect,useState} from 'react';
import {VideoDurationEditor,type VideoDraft} from './VideoDurationEditor';
import {requestAiVideo,requestVideoPrompt} from './video-ai-client';
import {apiRequest} from './generation-client';
import type {VideoDuration} from './video-duration';

export function VideoAdPage({draft,change,onNew}:{draft:VideoDraft;change:(draft:VideoDraft)=>void;onNew:()=>void}){
  const [prices,setPrices]=useState<Partial<Record<VideoDuration,number>>>({});
  const [balance,setBalance]=useState(0);
  const [omniPilot,setOmniPilot]=useState(false);
  const [admin,setAdmin]=useState(false);
  const [assistant,setAssistant]=useState(false);
  const [trial,setTrial]=useState<boolean|null>(null);
  const [provider,setProvider]=useState<string>();
  useEffect(()=>{
    const c=new AbortController();
    void apiRequest<{wallet?:{credits?:{available:number};unlimited?:boolean};assistant?:{available:boolean};videoTrial?:boolean;videoProvider?:string;omniPilot?:boolean;videoDurationPrices?:Partial<Record<VideoDuration,number>>}>('/api/status',undefined,c.signal)
      .then(status=>{if(!c.signal.aborted){setAssistant(status.assistant?.available===true);setPrices(status.videoDurationPrices??{});setOmniPilot(status.omniPilot===true);setAdmin(status.wallet?.unlimited===true);setBalance(status.wallet?.credits?.available??0);setTrial(status.videoTrial===true);setProvider(status.videoProvider);}}).catch(()=>{if(!c.signal.aborted)setTrial(false);});
    const refreshBalance=()=>{void apiRequest<{wallet:{credits?:{available:number}}}>('/api/status',undefined,c.signal)
      .then(status=>{if(!c.signal.aborted&&status.wallet.credits)setBalance(status.wallet.credits.available);}).catch(()=>{});};
    window.addEventListener('aiadcast-opening-image-accepted',refreshBalance);
    return()=>{c.abort();window.removeEventListener('aiadcast-opening-image-accepted',refreshBalance);};
  },[]);
  return <VideoDurationEditor onNew={onNew} draft={draft} change={change} draftPrompt={assistant?requestVideoPrompt:undefined} aiPrices={prices} admin={admin} omniPilot={omniPilot} availableCredits={balance} provider={provider} checkingAccess={trial===null} primaryUnavailable={!trial} generateAi={trial||omniPilot?async(draft,seconds,signal,onState,scenes,pilot)=>{
    const movie=await requestAiVideo(draft,seconds,signal,onState,scenes,admin?0:prices[seconds],pilot);
    void apiRequest<{wallet:{credits:{available:number}}}>('/api/status',undefined,signal).then(s=>setBalance(s.wallet.credits.available)).catch(()=>{});
    return movie;
  }:undefined}/>;
}
