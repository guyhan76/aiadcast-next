import {useEffect,useRef,useState} from 'react';
import {apiRequest} from './generation-client';
import {betaSession,watchSessionExpiry} from './beta-session';
import {useUiLanguage} from './ui-language';
import './marketing-summary.css';
type Binding={generationId:string;artifactHash:string};
type Recommendation={id:string;generationId:string;artifactHash:string;snapshotHash:string;locale:'ko'|'en';state:string;output:null|{provenance:'mock-ai';channels:{channel:string;reason:string;usage:string}[];keywords:string[];confidence:'unverified';searchVolumeVerified:false}};
const states=['pending','uncertain','failed','expired','completed','output_ready_usage_pending'];
function valid(v:any):v is Recommendation{
 if(!v||typeof v.id!=='string'||typeof v.generationId!=='string'||!(/^[a-f0-9]{64}$/).test(v.artifactHash)||!(/^[a-f0-9]{64}$/).test(v.snapshotHash)||!['ko','en'].includes(v.locale)||!states.includes(v.state))return false;
 const o=v.output;if(o===null)return true;
 const text=(s:any,max:number)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
 return o?.provenance==='mock-ai'&&o.confidence==='unverified'&&o.searchVolumeVerified===false&&Array.isArray(o.channels)&&o.channels.length>0&&o.channels.length<=3&&o.channels.every((c:any)=>['instagram','website','blog','lookbook','brochure'].includes(c.channel)&&text(c.reason,300)&&text(c.usage,300))&&Array.isArray(o.keywords)&&o.keywords.length>0&&o.keywords.length<=6&&o.keywords.every((k:any)=>text(k,100));
}
// Read-only local integration. No production caller supplies enabled=true.
// Never POST, reserve, retry a provider, or alter image export/acceptance here.
function ActiveGuide({binding,enabled=false}:{binding:Binding;enabled?:boolean}){
 const {language,t}=useUiLanguage(),[job,setJob]=useState<Recommendation|null>(null),[status,setStatus]=useState('idle'),[owner,setOwner]=useState<string|null>(betaSession()?.token??null),request=useRef<AbortController|null>(null);
 const key=JSON.stringify([binding.generationId,binding.artifactHash,language,owner]);const [loadedKey,setLoadedKey]=useState('');
 useEffect(()=>{const clear=()=>{request.current?.abort();request.current=null;setJob(null);setStatus('idle');setLoadedKey('');setOwner(betaSession()?.token??null);};window.addEventListener('aiadcast-session-change',clear);const stop=watchSessionExpiry(clear);return()=>{stop();window.removeEventListener('aiadcast-session-change',clear);request.current?.abort();};},[]);
 useEffect(()=>{request.current?.abort();request.current=null;setJob(null);setStatus('idle');setLoadedKey('');},[key,enabled]);
 async function read(){if(!enabled||request.current||!owner||owner!==betaSession()?.token)return;const controller=new AbortController();request.current=controller;setStatus('loading');setJob(null);setLoadedKey(key);const timer=setTimeout(()=>controller.abort(),10000);
  try{const data=await apiRequest<{recommendation:unknown}>(`/api/generations/${encodeURIComponent(binding.generationId)}/recommendations`,undefined,controller.signal);if(request.current!==controller||owner!==betaSession()?.token)return;
   const v=data.recommendation;if(v===null){setStatus('missing');return;}if(!valid(v)||v.generationId!==binding.generationId||v.artifactHash!==binding.artifactHash)throw Error('MISMATCH');if(v.locale!==language){setStatus('language');return;}setJob(v);setStatus('ready');
  }catch{if(request.current===controller)setStatus('error');}finally{clearTimeout(timer);if(request.current===controller)request.current=null;}
 }
 if(!enabled)return null;
 const visible=loadedKey===key&&owner===betaSession()?.token?job:null;
 const names:Record<string,string>={instagram:t('인스타그램','Instagram'),website:t('상품 상세페이지','Product page'),blog:t('블로그','Blog'),lookbook:t('룩북','Lookbook'),brochure:t('소개 자료','Sales material')};
 return <section className="marketing-summary" aria-label={t('AI 활용 추천 모의 검증','AI usage recommendation mock review')}>
 <p>{t('모의 추천 · 실제 AI 분석이 아닙니다.','Mock recommendation · Not real AI analysis.')}</p>
 <button type="button" disabled={!owner||status==='loading'} onClick={()=>void read()}>{t('저장된 추천 확인','Check saved recommendation')}</button>
 {loadedKey===key&&<p role="status">{status==='loading'?t('확인 중…','Checking…'):status==='missing'?t('저장된 추천이 없습니다. 새 요청은 실행하지 않습니다.','No saved recommendation. No new request is started.'):status==='language'?t('다른 언어로 저장된 추천입니다. 새로 생성하지 않습니다.','The saved recommendation uses another language. No regeneration is started.'):status==='error'?t('추천을 확인하지 못했습니다. 광고 저장·공유는 계속할 수 있습니다.','Could not read the recommendation. You can still save and share the ad.'):visible?.state==='failed'?t('추천을 제공하지 못했습니다. 광고 저장·공유는 계속할 수 있습니다.','Recommendation failed. You can still save and share the ad.'):visible&&!visible.output?t('추천 처리 결과를 확인 중입니다. 새 요청은 실행하지 않습니다.','Recommendation outcome is unresolved. No new request is started.'):''}</p>}
 {visible?.output&&<><ul className="marketing-channels">{visible.output.channels.map(c=><li key={c.channel}><strong>{names[c.channel]}</strong><p>{c.usage}</p><p>{c.reason}</p></li>)}</ul><h4>{t('관련 검색어 후보','Related search phrases')}</h4><ul className="marketing-keywords">{visible.output.keywords.map(k=><li key={k}>{k}</li>)}</ul><p>{t('저장된 광고 기준 제안입니다. 검색량과 성과는 검증되지 않았습니다.','Suggestions refer to the saved ad. Search volume and performance are unverified.')}</p></>}
 </section>;
}

export function RecommendationGuide(props:{binding:Binding;enabled?:boolean}){return props.enabled===true?<ActiveGuide {...props}/>:null;}
