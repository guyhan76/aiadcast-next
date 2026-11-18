import {useState} from 'react';
import {apiRequest} from './generation-client';

type Order={order_no:string;product:string;ads:number;purchased_at:string;erase_at:string;currency:string|null;paid:string|null;refunded:string|null;estimated:string|null;delivered:number;returned:number;remaining:number|null;checked_at:string|null;refunds:{at:string;nanos:string}[]|null;refund_requests:string[]};
type Case={case_id:string;category:string;order_no:string|null;received_at:string;description:string;resolution:string|null;resolved_at:string|null;erase_at:string};
type Result={orders:Order[];cases:Case[]};
const path='/api/membership/records';
const labels:Record<string,string>={defect:'광고 품질 신고',complaint:'일반 불만',dispute:'분쟁',refund:'환불 요청'};
const date=(s:string)=>new Date(s).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
function money(nanos:string|null,currency:string|null){
 if(nanos===null||!currency)return '확인 필요';
 return new Intl.NumberFormat('ko-KR',{style:'currency',currency}).format(Number(nanos)/1e9);
}
function OrderDetail({o}:{o:Order}){
 return <article><h3>주문 {o.order_no}</h3>
 <p>광고 {o.ads}장 · {o.product} · {date(o.purchased_at)}</p>
 <dl><dt>실결제액</dt><dd>{money(o.paid,o.currency)}</dd>
 <dt>제공 완료</dt><dd>{o.delivered}장{o.remaining===null?' (기록 시작 이후)':''}{o.returned>0&&' · 품질 보상으로 돌려준 이용권 '+o.returned+'장'}</dd>
 <dt>미사용 유료 광고</dt><dd>{o.remaining===null?'이전 사용 이력 확인 필요':o.remaining+'장'}</dd>
 <dt>미사용분 예상 환불액</dt><dd>{money(o.estimated,o.currency)}</dd>
 <dt>실제 환불액</dt><dd>{money(o.refunded,o.currency)}{o.checked_at&&' · 결제처 확인 '+date(o.checked_at)}</dd></dl>
 {o.refund_requests.map((at,i)=><p key={i}>환불 요청 · {date(at)}</p>)}
 {o.refunds?.map((e,i)=><p key={i}>환불 완료 · {date(e.at)} · {money(e.nanos,o.currency)}</p>)}
 <small>거래기록 보관 종료 {date(o.erase_at)}</small></article>;
}
export function CommerceRecords({admin=false}:{admin?:boolean}){
 const [data,setData]=useState<Result>(),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [kind,setKind]=useState('complaint'),[description,setDescription]=useState(''),[order,setOrder]=useState(''),[answers,setAnswers]=useState<Record<string,string>>({});
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const lookup=async()=>setData(admin?await apiRequest<Result>(path+'/lookup',{key:key.trim()}):await apiRequest<Result>(path+'/mine'));
 async function run(fn:()=>Promise<void>){
  if(busy)return;
  setBusy(true);setError('');setMessage('');
  try{await fn();}catch{setData(undefined);setError('처리 상태를 확인할 수 없습니다. 번호와 로그인 상태를 확인한 뒤 다시 조회해 주세요.');}finally{setBusy(false);}
 }
 async function submit(){
  const r=await apiRequest<{caseId:string}>(path+'/cases',{category:kind,description,orderNo:order.trim()||null,requestId});
  setMessage('접수번호 '+r.caseId+' · 탈퇴 후 문의할 때 이 번호를 알려 주세요.');setDescription('');setOrder('');setRequestId(crypto.randomUUID());await lookup();
 }
 return <details className="admin-card commerce-records" onToggle={e=>{if(e.currentTarget.open&&!data&&!busy)void run(lookup);}}>
 <summary>{admin?'거래·환불·분쟁 기록':'결제 내역 및 고객 문의'}</summary>
 {admin&&<form onSubmit={e=>{e.preventDefault();void run(lookup);}}><label>주문번호 또는 접수번호<input value={key} maxLength={160} onChange={e=>setKey(e.target.value.trimStart())}/></label><button disabled={busy}>조회</button></form>}
 {busy&&<p role="status">처리 중…</p>}{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error} <button disabled={busy} onClick={()=>void run(lookup)}>다시 조회</button></p>}
 {data&&<><h3>거래기록</h3>{!data.orders.length&&<p>조회된 거래가 없습니다.</p>}
 {data.orders.map(o=><div key={o.order_no}><OrderDetail o={o}/>{admin&&<button disabled={busy} onClick={()=>void run(async()=>{
  await apiRequest(path+'/sync',{orderNo:o.order_no});await lookup();setMessage('결제처 내역을 갱신했습니다.');
 })}>결제처 환불 내역 갱신</button>}</div>)}
 <h3>불만·분쟁 접수 내역</h3>{!data.cases.length&&<p>조회된 접수가 없습니다.</p>}
 {data.cases.map(c=><article key={c.case_id}><h4>{labels[c.category]} · {c.resolution?'처리 완료':'접수'}</h4>
 <p>접수번호 {c.case_id}<br/>접수 {date(c.received_at)}{c.order_no&&<><br/>주문 {c.order_no}</>}</p><p>{c.description}</p>
 {c.resolution&&<p>처리 결과 · {c.resolution}{c.resolved_at&&' · '+date(c.resolved_at)}</p>}
 <small>보관 종료 {date(c.erase_at)}</small>
 {admin&&!c.resolution&&c.category!=='defect'&&<form onSubmit={e=>{e.preventDefault();void run(async()=>{
  await apiRequest(path+'/resolve',{caseId:c.case_id,resolution:answers[c.case_id]});await lookup();setMessage('처리 결과를 저장했습니다.');
 });}}><label>처리 결과<textarea required maxLength={800} value={answers[c.case_id]??''} onChange={e=>setAnswers({...answers,[c.case_id]:e.target.value})}/></label><button disabled={busy||!answers[c.case_id]?.trim()}>처리 완료</button></form>}</article>)}</>}
 <form onSubmit={e=>{e.preventDefault();void run(submit);}}><h3>{admin?'문의 대리 접수':'문의 접수'}</h3>
 <label>유형<select value={kind} onChange={e=>setKind(e.target.value)}>{['complaint','dispute','refund'].map(v=><option value={v} key={v}>{labels[v]}</option>)}</select></label>
 <label>관련 주문번호 (선택)<input value={order} onChange={e=>setOrder(e.target.value)} maxLength={160}/></label>
 <label>접수 내용<textarea required maxLength={800} value={description} onChange={e=>setDescription(e.target.value)} placeholder="결제 카드번호나 비밀번호를 제외하고 입력해 주세요."/></label>
 <button disabled={busy||!description.trim()}>접수하기</button></form></details>;
}
