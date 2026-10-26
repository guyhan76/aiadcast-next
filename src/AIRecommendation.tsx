import {useEffect,useRef,useState} from 'react';
import {apiRequest,ApiRequestFailure} from './generation-client';
import {storageNamespace,betaSession} from './beta-session';
import {useUiLanguage} from './ui-language';
import './marketing-summary.css';
type Binding={generationId:string;artifactHash:string};
type Result={id:string;generationId:string;artifactHash:string;locale:string;state:string;output:null|{provenance:'openai';confidence:'unverified';searchVolumeVerified:false;channels:{channel:string;reason:string;usage:string}[];keywords:string[]}};
function priorRequest(key:string){try{return localStorage.getItem(key);}catch{return 'STORAGE_UNAVAILABLE';}}
function valid(v:any,b:Binding):v is Result{const text=(s:any,n:number)=>typeof s==='string'&&s.trim().length>0&&s.length<=n;
 if(!v||!text(v.id,100)||v.generationId!==b.generationId||v.artifactHash!==b.artifactHash||!['ko','en'].includes(v.locale)||!['pending','completed','failed','uncertain','expired','output_ready_usage_pending'].includes(v.state))return false;
 const o=v.output;return o===null||o?.provenance==='openai'&&o.confidence==='unverified'&&o.searchVolumeVerified===false&&Array.isArray(o.channels)&&o.channels.length>0&&o.channels.length<=3&&o.channels.every((c:any)=>['instagram','website','blog','lookbook','brochure'].includes(c.channel)&&text(c.reason,300)&&text(c.usage,300))&&Array.isArray(o.keywords)&&o.keywords.length>0&&o.keywords.length<=6&&o.keywords.every((k:any)=>text(k,100));
}
export function AIRecommendation({binding}: {binding:Binding}){
 const {language,t}=useUiLanguage(),[job,setJob]=useState<Result|null>(null),[state,setState]=useState('loading'),[available,setAvailable]=useState(false),[attempt,setAttempt]=useState(0);
 const active=useRef<AbortController|null>(null),epoch=useRef(0),lock=useRef(false),owner=storageNamespace(),identity=JSON.stringify([owner,binding.generationId,binding.artifactHash,language]);
 const endpoint=`/api/generations/${encodeURIComponent(binding.generationId)}/recommendations`;
 const requestKey=owner+':aiadcast.recommendation.'+binding.generationId+'.'+binding.artifactHash+'.'+language;
 useEffect(()=>{let alive=true;const current=++epoch.current;lock.current=false;setJob(null);setAvailable(false);setState('loading');let timer:ReturnType<typeof setTimeout>|undefined;let count=0;
  async function read(){const c=new AbortController();active.current=c;const timeout=setTimeout(()=>c.abort(),10000);try{const r=await apiRequest<{enabled?:boolean;customerCharge?:number;recommendation:unknown}>(endpoint,undefined,c.signal);if(!alive||current!==epoch.current||owner!==storageNamespace())return;
   setAvailable(r.enabled===true&&r.customerCharge===0);if(r.recommendation===null){setJob(null);setState(priorRequest(requestKey)?'unknown':'missing');return;}
   if(!valid(r.recommendation,binding))throw Error('INVALID_RECOMMENDATION');const value=r.recommendation;setJob(value);setState(value.locale===language?'ready':'language');
   if(['pending','uncertain','output_ready_usage_pending'].includes(value.state)&&++count<5)timer=setTimeout(read,Math.min(2000*count,10000));
  }catch(e){if(alive&&current===epoch.current){setState(e instanceof ApiRequestFailure&&['RECOMMENDATIONS_DISABLED','RECOMMENDATION_SCHEMA_REQUIRED','RECOMMENDATION_LIVE_POLICY_NOT_APPROVED','NOT_FOUND'].includes(e.code)?'disabled':'error');}}finally{clearTimeout(timeout);if(active.current===c)active.current=null;}}
  void read();return()=>{alive=false;epoch.current++;clearTimeout(timer);active.current?.abort();active.current=null;};
 },[identity,attempt]);
 async function start(){if(lock.current||!available||job||state!=='missing'||!betaSession()||priorRequest(requestKey))return;const e=epoch.current,c=new AbortController();lock.current=true;active.current=c;setState('requesting');const timer=setTimeout(()=>c.abort(),35000);
  try{const requestId=crypto.randomUUID();localStorage.setItem(requestKey,requestId);const r=await apiRequest<Result>(endpoint,{requestId,locale:language},c.signal);if(e!==epoch.current||owner!==storageNamespace())return;if(!valid(r,binding))throw Error('INVALID_RECOMMENDATION');setJob(r);setState(r.locale===language?'ready':'language');}
  catch{if(e===epoch.current)setState('unknown');}finally{clearTimeout(timer);if(e===epoch.current){lock.current=false;active.current=null;setAttempt(x=>x+1);}}
 }
 const output=state==='ready'&&job?.locale===language?job.output:null;
 const names:Record<string,string>={instagram:t('인스타그램','Instagram'),website:t('상품 상세페이지','Product page'),blog:t('블로그','Blog'),lookbook:t('룩북','Lookbook'),brochure:t('소개 자료','Sales material')};
 return <details className="marketing-analysis ai-recommendation"><summary>{t('AI 활용 추천','AI usage recommendations')}</summary><section className="marketing-summary">
 {output?<><ul>{output.channels.map(c=><li key={c.channel}><strong>{names[c.channel]}</strong><p>{c.usage}</p><p>{c.reason}</p></li>)}</ul><h4>{t('관련 검색어 후보','Related search phrases')}</h4><ul className="marketing-keywords">{output.keywords.map(k=><li key={k}>{k}</li>)}</ul><p>{t('생성 당시 정보와 완성 광고 기반 AI 제안입니다. 검색량·순위·성과는 검증되지 않았습니다.','AI suggestions based on the saved inputs and finished ad. Search volume, rankings and performance are unverified.')}</p></>:<p role="status">{state==='disabled'?t('AI 추천 준비 중입니다. 광고 저장·공유는 가능합니다.','AI recommendations are not enabled yet. You can save and share your ad.'):state==='missing'?t('이 광고의 AI 활용 방법과 관련 검색어를 요청할 수 있습니다.','Request AI usage suggestions and related search phrases for this ad.'):state==='language'?t('다른 언어로 저장된 추천입니다. 자동으로 다시 요청하지 않습니다.','A recommendation is saved in another language. No automatic new request.'):state==='loading'||state==='requesting'?t('추천을 확인하고 있습니다…','Checking recommendations…'):job?.state==='failed'?t('추천을 제공하지 못했습니다. 광고 저장·공유는 가능합니다.','Recommendation failed. You can save and share your ad.'):t('추천 결과를 확인하지 못했습니다. 자동으로 다시 요청하지 않습니다. 광고 저장·공유는 가능합니다.','The recommendation is unconfirmed. No automatic new request. You can save and share your ad.')}</p>}
 {available&&state==='missing'&&!job&&<><p>{t('상품 정보와 완성 광고를 AI에 전달합니다. 첫 추천은 별도 이용권 차감 없이 서버 API 예산을 사용합니다.','Product information and the finished ad are sent to AI. The first recommendation uses the server API budget without an additional credit charge.')}</p><button onClick={()=>void start()}>{t('AI 추천 받기','Get AI recommendations')}</button></>}
 {['unknown','error','language'].includes(state)||job&&['pending','uncertain','output_ready_usage_pending'].includes(job.state)?<button disabled={state==='loading'||state==='requesting'} onClick={()=>setAttempt(x=>x+1)}>{t('저장된 추천 확인','Check saved recommendation')}</button>:null}
 </section></details>;
}
