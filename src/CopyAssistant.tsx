import {useEffect,useRef,useState} from 'react';
import {Check,Languages,Sparkles,X} from 'lucide-react';
import type {Locale,Project} from './model';
import {applyCopyProposal,copySnapshot,copySnapshotCurrent,makeCopyRequest,parseCopyProposal} from './ai-copy';
import type {CopyProposal,CopySnapshot} from './ai-copy';
import {useUiLanguage} from './ui-language';
import './copy-assistant.css';
import {apiUrl} from './generation-client';

type Props={project:Project;change:(fn:(project:Project)=>Project)=>void;locale?:Locale};
type Pending={proposal:CopyProposal;snapshot:CopySnapshot};
export default function CopyAssistant({project,change}:Props){
 const {t}=useUiLanguage();
 const [available,setAvailable]=useState(false),[busy,setBusy]=useState(false),[extra,setExtra]=useState(''),[target,setTarget]=useState<Locale>(project.locale==='ko'?'en':'ko');
 const [pending,setPending]=useState<Pending|null>(null),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const requestSequence=useRef(0);
 useEffect(()=>{
  const controller=new AbortController();
  fetch(apiUrl('/api/status'),{signal:controller.signal,credentials:'same-origin'}).then(async response=>response.ok?response.json():null).then(data=>setAvailable(data?.assistant?.available===true)).catch(()=>setAvailable(false));
  return()=>controller.abort();
 },[]);
 useEffect(()=>{requestSequence.current++;setBusy(false);setPending(null);setConfirmed(false);setError('');setNotice('');setExtra('');},[project.id]);
 const current=pending?copySnapshotCurrent(project,pending.snapshot):false;
 async function request(kind:'suggest'|'translate'){
  const active=++requestSequence.current;
  const targetLocale=kind==='translate'?target:project.locale;
  const body=makeCopyRequest(project,kind,targetLocale,extra),snapshot=copySnapshot(project,project.locale,targetLocale);
  setBusy(true);setError('');setNotice('');setPending(null);setConfirmed(false);
  try{
   const response=await fetch(apiUrl('/api/assistant'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Aiadcast-Client':'local-studio'},body:JSON.stringify(body),signal:AbortSignal.timeout(60_000)});
   const data=await response.json();
   if(!response.ok)throw Error(typeof data?.error==='string'?data.error:'ASSISTANT_UNAVAILABLE');
   const proposal=parseCopyProposal(data,body);
   if(active===requestSequence.current)setPending({proposal,snapshot});
  }catch{
   if(active===requestSequence.current)setError(t('문구 제안을 가져오지 못했습니다. 현재 문구는 그대로이며, 자동으로 다시 요청하지 않습니다. 잠시 후 연결 상태를 확인해주세요.','We could not retrieve a suggestion. Your copy is unchanged and no automatic retry was made. Check the connection before trying again.'));
  }finally{if(active===requestSequence.current)setBusy(false);}
 }
 function apply(){
  if(!pending||!confirmed||!current)return;
  const selected=pending;
  change(previous=>applyCopyProposal(previous,selected.proposal,selected.snapshot,true));
  setPending(null);setConfirmed(false);setNotice(t('확인한 문구를 적용했습니다. 편집기의 되돌리기로 취소할 수 있습니다.','Your reviewed copy has been applied. Use Undo in the editor to revert it.'));
 }
 const changedNumbers=pending&&(pending.proposal.review.numericChanges.added.length>0||pending.proposal.review.numericChanges.omitted.length>0);
 return <section className="copy-assistant" aria-label={t('AI 광고 문구 도우미','AI copy assistant')}>
  <div className="copy-assistant-heading"><div><span><Sparkles size={14}/>COPY ASSISTANT</span><h3>{t('한 줄의 생각을, 광고 문구로.','Turn an idea into your message.')}</h3></div><small>{available?t('연결됨','Connected'):t('테스트 연결 준비 중','Test connection pending')}</small></div>
  <p>{t('제목과 설명을 제안받고 확인한 뒤 적용하세요. 연락처·웹사이트 등 별도 입력값은 바뀌지 않습니다.','Review suggestions for your headline and description before applying them. Separate contact and website fields stay unchanged.')}</p>
  <details><summary>{t('추가할 상품 정보가 있나요? (선택)','Add product facts or a direction (optional)')}</summary><label><span className="sr-only">{t('문구에 참고할 추가 정보','Additional copy context')}</span><textarea value={extra} maxLength={1000} rows={3} onChange={event=>setExtra(event.target.value)} placeholder={t('예: 금요일 신메뉴 출시. 가격은 6,000원. 따뜻한 분위기로.','For example: Our new menu launches Friday. Price: $6. A warm, welcoming tone.')}/></label></details>
  <div className="copy-assistant-actions"><button type="button" disabled={!available||busy} onClick={()=>void request('suggest')}><Sparkles size={15}/>{busy?t('제안 준비 중…','Preparing…'):t('문구 제안받기','Suggest copy')}</button><div><label><span className="sr-only">{t('번역할 광고 언어','Target ad language')}</span><select value={target} onChange={event=>{setTarget(event.target.value as Locale);setPending(null);setConfirmed(false);}}><option value="ko">한국어</option><option value="en">English</option></select></label><button type="button" disabled={!available||busy||target===project.locale} onClick={()=>void request('translate')}><Languages size={15}/>{t('번역 제안','Translate copy')}</button></div></div>
  <small className="copy-assistant-privacy">{t('버튼을 누르면 상품명·현재 제목·설명·추가 정보가 AI에 전송됩니다. 앱 언어 변경만으로 요청하지 않습니다.','Only clicking a button sends your product name, current copy and optional context to AI. Changing the app language does not send a request.')}</small>
  {!available&&<p className="copy-assistant-offline">{t('문구 도우미는 운영 테스트 연결 후 사용할 수 있습니다. 직접 문구를 편집하고 저장하는 기능은 지금 이용할 수 있습니다.','The assistant will be available when its test connection is enabled. You can edit and save copy manually now.')}</p>}
  {error&&<p className="copy-assistant-error" role="alert">{error}</p>}
  {notice&&<p className="copy-assistant-notice" role="status">{notice}</p>}
  {pending&&<div className="copy-assistant-proposal"><div className="copy-assistant-proposal-head"><strong>{t('적용 전 미리보기','Preview before applying')}</strong><button type="button" aria-label={t('문구 제안 닫기','Dismiss suggestion')} onClick={()=>{setPending(null);setConfirmed(false);}}><X size={17}/></button></div><span>{pending.proposal.targetLocale==='ko'?'한국어':'English'}</span><h4>{pending.proposal.proposal.title}</h4><p>{pending.proposal.proposal.description}</p>
   {changedNumbers&&<div className="copy-numeric-review"><strong>{t('가격·날짜·수량을 다시 확인하세요.','Double-check prices, dates and quantities.')}</strong>{pending.proposal.review.numericChanges.added.length>0&&<p>{t('새로 표시되거나 표기가 달라진 값: ','New or differently formatted values: ')}{pending.proposal.review.numericChanges.added.join(', ')}</p>}{pending.proposal.review.numericChanges.omitted.length>0&&<p>{t('빠지거나 표기가 달라진 원래 값: ','Original values missing or reformatted: ')}{pending.proposal.review.numericChanges.omitted.join(', ')}</p>}<small>{t('단순 표기 비교이며, 번역된 숫자 표기도 차이로 표시될 수 있습니다.','This is a format comparison, not a fact check. Translated number formats may be flagged.')}</small></div>}
   {!current&&<p role="alert" className="copy-assistant-error">{t('요청 후 문구나 상품 정보가 바뀌었습니다. 현재 내용으로 다시 제안받아주세요.','Your copy or product information changed after this request. Request a new suggestion using the current content.')}</p>}
   <label className="copy-assistant-confirm"><input type="checkbox" checked={confirmed} disabled={!current} onChange={event=>setConfirmed(event.target.checked)}/><span>{t('가격·기간·효능 등 사실과 맞춤법을 확인했습니다.','I checked spelling and factual claims, including prices, dates and benefits.')}</span></label><button className="copy-assistant-apply" type="button" disabled={!confirmed||!current} onClick={apply}><Check size={15}/>{t('확인한 문구 적용','Apply reviewed copy')}</button>
  </div>}
 </section>;
}
