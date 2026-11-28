import {useState} from 'react';
import {ChevronDown,RefreshCw} from 'lucide-react';
import {apiRequest} from './generation-client';
import {useAdminRead} from './use-admin-read';
import {useUiLanguage} from './ui-language';
import './member-history.css';

type AuditEvent={receipt:string;kind:'joined'|'requested'|'completed'|'retry';happened_at:string};
type Audit={events:AuditEvent[];members:{id:string;joined_at:string|null;role:string;storage_plan:'free'|'standard'}[]};

function groupByReceipt(events:AuditEvent[]){
 const groups=new Map<string,AuditEvent[]>();
 // The API returns newest first. Give the final state priority if timestamps coincide.
 const priority={completed:3,retry:2,requested:1,joined:0};
 for(const event of [...events].sort((a,b)=>Date.parse(b.happened_at)-Date.parse(a.happened_at)||priority[b.kind]-priority[a.kind])){
  const group=groups.get(event.receipt);
  if(group)group.push(event);
  else groups.set(event.receipt,[event]);
 }
 return Array.from(groups.values());
}

export function MemberHistory({labels}:{labels:{id:string;label:string}[]}){
 const {t,language}=useUiLanguage();
 const [view,setView]=useState<'history'|'members'>('history');
 const [data,setData]=useState<Audit|null>(null);
 const [visible,setVisible]=useState(5);
 const [saving,setSaving]=useState(false),[planError,setPlanError]=useState('');
 const read=useAdminRead<Audit>(setData,value=>Array.isArray(value?.events)&&Array.isArray(value?.members));
 const refresh=()=>read.read('/api/membership/admin');
 async function changePlan(userId:string,plan:string){
  setSaving(true);setPlanError('');
  try{
   await apiRequest('/api/membership/plan',{userId,plan});
   await refresh();
  }catch{setPlanError(t('등급을 변경하지 못했습니다. 다시 시도해 주세요.','Could not change the plan. Please try again.'));}
  finally{setSaving(false);}
 }
 const locale=language==='ko'?'ko-KR':'en-GB';
 const dateOptions:Intl.DateTimeFormatOptions={timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'};
 const date=new Intl.DateTimeFormat(locale,dateOptions);
 const stamp=new Intl.DateTimeFormat(locale,{...dateOptions,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const precise=new Intl.DateTimeFormat(locale,{...dateOptions,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const names={joined:t('가입 완료','Joined'),requested:t('탈퇴 접수','Withdrawal requested'),completed:t('삭제 완료','Deletion complete'),retry:t('삭제 재시도 중','Retrying deletion')};
 const groups=groupByReceipt(data?.events??[]);
 return <details className="admin-card member-history" onToggle={event=>{
  if(event.target===event.currentTarget&&event.currentTarget.open&&!saving)void refresh();
 }}>
  <summary>{t('회원 관리','Membership management')}</summary>
  <div className="member-history-toolbar">
   <div className="member-history-views" role="group" aria-label={t('회원 관리 보기','Membership views')}>
    <button type="button" aria-pressed={view==='history'} onClick={()=>setView('history')}>{t('가입·탈퇴 이력','Activity')}</button>
    <button type="button" aria-pressed={view==='members'} onClick={()=>setView('members')}>{t('회원 등급','Member plans')}</button>
   </div>
   <button className="member-history-refresh" type="button" aria-label={t('회원 관리 새로고침','Refresh membership')} title={t('새로고침','Refresh')} disabled={read.pending||saving} onClick={()=>void refresh()}><RefreshCw size={17} aria-hidden="true"/></button>
  </div>
  {read.error&&<p role="alert">{t(read.error,'Could not load membership data. Please refresh.')}</p>}
  {!data&&read.pending&&<p role="status">{t('불러오는 중…','Loading…')}</p>}
  {data&&view==='history'&&<>
   {groups.length===0&&<p>{t('가입·탈퇴 이력이 없습니다.','No membership activity yet.')}</p>}
   <ul className="member-history-list">{groups.slice(0,visible).map(events=>{
    const latest=events[0],joined=latest.kind==='joined',numbered=/^\d+$/.test(latest.receipt);
    const heading=<span className="member-history-heading"><strong>{names[latest.kind]}</strong><time dateTime={latest.happened_at}>{stamp.format(new Date(latest.happened_at))}</time></span>;
    return <li key={latest.receipt}>{joined?<div className="member-history-entry">{heading}</div>:
     <details className="member-history-case">
      <summary><span>{heading}{numbered&&<small>{t('처리번호','Receipt')} {latest.receipt}</small>}</span><ChevronDown size={16} aria-hidden="true"/></summary>
      <div className="member-history-steps">
       {!numbered&&<small>{t('처리번호','Receipt')} {latest.receipt}</small>}
       {events.slice().reverse().map(event=><div key={event.kind}><span>{names[event.kind]}</span><time dateTime={event.happened_at}>{precise.format(new Date(event.happened_at))}</time></div>)}
      </div>
     </details>}</li>;
   })}</ul>
   {groups.length>visible&&<button className="member-history-more" type="button" onClick={()=>setVisible(n=>n+5)}>{t('이력 더 보기','Show more activity')}</button>}
  </>}
  {data&&view==='members'&&<>
   {data.members.length===0&&<p>{t('등록된 회원이 없습니다.','No members yet.')}</p>}
   <ul className="member-history-list">{data.members.map(member=>{
    const name=labels.find(item=>item.id===member.id)?.label||t('회원','Member')+' · '+member.id.slice(-8);
    return <li className="member-plan-row" key={member.id}>
     <div><strong>{name}</strong>{member.joined_at&&<small>{t('가입','Joined')} <time dateTime={member.joined_at}>{date.format(new Date(member.joined_at))}</time></small>}</div>
     {member.role==='admin'?<span className="member-plan-admin">{t('관리자','Admin')}</span>:
      <select aria-label={name+' '+t('회원 등급','membership plan')} value={member.storage_plan} disabled={saving||read.pending} onChange={e=>void changePlan(member.id,e.target.value)}>
       <option value="free">{t('무료회원','Free')}</option><option value="standard">{t('일반회원','Standard')}</option>
      </select>}
    </li>;
   })}</ul>
   {planError&&<p role="alert">{planError}</p>}
  </>}
 </details>;
}
