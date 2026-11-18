import {useEffect,useRef,useState} from 'react';
import {Check,Copy} from 'lucide-react';
import {apiRequest} from './generation-client';

type Order={order_no:string;product:string;ads:number;purchased_at:string;erase_at:string;currency:string|null;paid:string|null;refunded:string|null;estimated:string|null;delivered:number;returned:number;remaining:number|null;checked_at:string|null;refunds:{at:string;nanos:string}[]|null;refund_requests:string[];recorded_refunds?:{method:string;amount:number;at:string|null;recorded:string;reference:string}[]};
type Balance={paidOrders:number;krw:number|null;items:{orderNo:string;amountKrw:number|null}[]};
type CaseEvent={at:string;kind:string;detail:string;actor:string|null;outcome:string|null;amount:number|null;reference:string|null;processed_at?:string|null};
type Case={case_id:string;category:string;order_no:string|null;received_at:string;description:string;resolution:string|null;resolved_at:string|null;erase_at:string;
 refund_quote?:Balance|null;balance_review?:Balance|null;bank_requested?:boolean;requested_krw?:number|null;payout_bank?:string|null;payout_last4?:string|null;member_id?:string|null;member_name?:string|null;member_email?:string|null;
 member_orders?:number;test_purchases?:number;events?:CaseEvent[]};
type Bank={bank:string;holder:string;number:string};
type Result={orders:Order[];cases:Case[];refundBalance?:Balance};
const path='/api/membership/records';
const labels:Record<string,string>={defect:'광고 품질 신고',complaint:'일반 민원',dispute:'분쟁',refund:'환불 요청'};
const date=(s:string)=>new Date(s).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
function money(nanos:string|null,currency:string|null){
 if(nanos===null||!currency)return '확인 필요';
 return new Intl.NumberFormat('ko-KR',{style:'currency',currency}).format(Number(nanos)/1e9);
}
function OrderDetail({o,admin}:{o:Order;admin:boolean}){
 return <article className="commerce-order"><h3>{admin?'주문 '+o.order_no:'광고 '+o.ads+'장'}</h3>
 <p>{date(o.purchased_at)}{admin&&' · 광고 '+o.ads+'장'}</p>
 <details open={admin}><summary>결제 상세 보기</summary>{!admin&&<p>주문번호 {o.order_no}</p>}
 <dl><dt>실결제액</dt><dd>{money(o.paid,o.currency)}</dd>
 <dt>제공 완료</dt><dd>{o.delivered}장{o.remaining===null?' (기록 시작 이후)':''}{o.returned>0&&' · 품질 보상으로 돌려준 이용권 '+o.returned+'장'}</dd>
 <dt>미사용 유료 광고</dt><dd>{o.remaining===null?'이전 사용 이력 확인 필요':o.remaining+'장'}</dd>
 <dt>미사용분 예상 환불액</dt><dd>{money(o.estimated,o.currency)}</dd>
 <dt>결제처 확인 환불액</dt><dd>{money(o.refunded,o.currency)}{o.checked_at&&' · '+date(o.checked_at)}</dd></dl>
 {o.refund_requests.map((at,i)=><p key={i}>환불 요청 · {date(at)}</p>)}
 {o.refunds?.map((e,i)=><p key={i}>환불 완료 · {date(e.at)} · {money(e.nanos,o.currency)}</p>)}
 {o.recorded_refunds?.map((e,i)=><p key={i}>관리자 기록 · {outcomes[e.method]} · {won(e.amount)} · {date(e.at??e.recorded)} · 증빙 {e.reference}</p>)}
 <p>거래기록 보관 종료 {date(o.erase_at)}</p></details></article>;
}

const won=(value:number)=>value.toLocaleString('ko-KR')+'원';
const outcomes:Record<string,string>={reply:'답변 완료',original:'결제 취소로 환불',transfer:'계좌 환불',declined:'환불 대상 아님'};
function PurchaseChoice({orders}:{orders:Order[]}){
 if(!orders.length)return null;
 return <label>관련 구매 내역<select name="orderNo"><option value="">선택 안 함</option>{orders.map(o=><option key={o.order_no} value={o.order_no}>{date(o.purchased_at)} · 광고 {o.ads}장 · {money(o.paid,o.currency)}</option>)}</select></label>;
}
function BalanceAmount({balance}:{balance:Balance}){
 if(balance.krw===null)return <strong>결제 내역 확인 후 안내</strong>;
 return <strong>{won(balance.krw)}</strong>;
}
function BalanceReason({balance}:{balance:Balance}){
 if(!balance.paidOrders)return <>확인된 실결제 내역이 없습니다. 무료·테스트 이용권은 환불액에 포함되지 않습니다.</>;
 if(balance.krw===null)return <>구매 금액이나 사용 내역을 확인해야 하는 주문이 있습니다. 확인 후 처리 이력에 금액을 알려드립니다.</>;
 if(!balance.items.length)return <>확인된 구매에 환불할 잔액이 없습니다.</>;
 return <>구매 당시 결제한 금액을 기준으로 사용한 이용분과 이미 환불한 금액을 반영했습니다.</>;
}
function BankFields(){
 return <fieldset className="case-bank"><legend>환불받을 계좌</legend><label>은행명<input name="bank" maxLength={40} required/></label>
 <label>예금주<input name="holder" maxLength={60} required autoComplete="off"/></label><label>계좌번호<input name="number" type="text" inputMode="numeric" autoComplete="off" pattern="[0-9\- ]{7,30}" maxLength={30} required/></label></fieldset>;
}
function CaseCard({c,orders,admin,refresh}:{c:Case;orders:Order[];admin:boolean;refresh:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[edit,setEdit]=useState(false),[bank,setBank]=useState<Bank>(),[action,setAction]=useState('note'),[outcome,setOutcome]=useState('reply');
 const request=useRef<{input:string;id:string}|undefined>(undefined),lock=useRef(false);
 const active=!c.resolution,refund=c.category==='refund',order=orders.find(o=>o.order_no===c.order_no),events=c.events??[];
 const quote=c.refund_quote??c.balance_review;
 useEffect(()=>{if(bank){const t=setTimeout(()=>setBank(undefined),30000);return()=>clearTimeout(t);}},[bank]);
 async function perform(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn();}catch{setError('저장 또는 조회하지 못했습니다. 입력 내용과 최신 처리 상태를 확인해 주세요.');}finally{setBusy(false);lock.current=false;}}
 async function save(route:string,body:Record<string,unknown>){
  const input=JSON.stringify([route,body]);if(request.current?.input!==input)request.current={input,id:crypto.randomUUID()};
  await apiRequest(path+'/'+route,{caseId:c.case_id,...body,requestId:request.current.id});await refresh();request.current=undefined;
 }
 return <article className="case-card"><header><p className="case-reference">접수번호 <strong>{c.case_id}</strong></p>
 <h4>{labels[c.category]} <span className="case-state">{active?(events.some(e=>e.kind==='review')?'처리 중':'접수'):'처리 완료'}</span></h4></header>
 {admin&&<dl className="case-facts"><dt>신청자</dt><dd>{c.member_name||'회원 연결 정보 없음'}</dd>
 {c.member_id&&<><dt>가입 이메일</dt><dd>{c.member_email||'미등록'}</dd></>}</dl>}
 <p className="case-description">{c.description}</p>
 {(refund||order)&&<dl className="case-facts">
 {refund&&quote&&<><dt>{c.refund_quote?'접수 당시 예상 환불액':'현재 예상 환불액'}</dt><dd><BalanceAmount balance={quote}/><div><BalanceReason balance={quote}/></div></dd></>}
 {refund&&!quote&&<><dt>예상 환불액</dt><dd>{order?money(order.estimated,order.currency):'접수 당시 산정 기록 없음'}</dd></>}
 {!c.refund_quote&&c.requested_krw!=null&&<><dt>접수 당시 요청 금액</dt><dd>{won(c.requested_krw)}</dd></>}
 {order&&<><dt>구매 내역</dt><dd>광고 {order.ads}장 · {money(order.paid,order.currency)}</dd></>}
 {admin&&order&&<><dt>주문번호</dt><dd>{order.order_no}</dd></>}
 {quote&&quote.items.length>1&&<><dt>환불 검토 구매</dt><dd>{quote.items.length}건{admin&&quote.items.map(i=><div key={i.orderNo}>{i.orderNo} · {i.amountKrw===null?'금액 확인 필요':won(i.amountKrw)}</div>)}</dd></>}
 {admin&&refund&&c.member_id&&<><dt>회원 구매 내역</dt><dd>실결제 {c.member_orders??0}건 · 테스트 결제 {c.test_purchases??0}건</dd></>}
 {refund&&order&&<><dt>결제처 누적 환불액</dt><dd>{money(order.refunded,order.currency)}</dd></>}
 {refund&&(c.payout_bank||c.bank_requested)&&<><dt>환불계좌</dt><dd>{c.payout_bank?c.payout_bank+' · 끝 4자리 '+c.payout_last4:'계좌 등록 요청됨'}
 {admin&&active&&c.payout_last4&&<><button type="button" className="wallet-button wallet-secondary" disabled={busy} onClick={()=>bank?setBank(undefined):void perform(async()=>setBank(await apiRequest<Bank>(path+'/payout',{caseId:c.case_id})))}>{bank?'계좌번호 숨기기':'환불계좌 확인'}</button>
 {bank&&<span>{bank.bank} {bank.number} · 예금주 {bank.holder}</span>}</>}</dd></>}</dl>}
 <h5>처리 이력</h5><ol className="case-timeline"><li><strong>접수</strong><time>{date(c.received_at)}</time></li>
 {events.map((e,i)=><li key={i}><strong>{e.kind==='closed'?'처리 완료':e.kind==='member'?'신청자 정보 보완':'처리 중'}</strong><time>{date(e.at)}</time>
 {admin&&e.actor&&<span>담당자 {e.actor}</span>}<p>{e.detail}</p>
 {e.kind==='closed'&&refund&&e.outcome&&<span>{outcomes[e.outcome]}{e.amount!=null?' · '+won(e.amount):''}</span>}
 {e.processed_at&&<span>환불 실행 일시 {date(e.processed_at)}</span>}{e.reference&&<span>처리 증빙번호 {e.reference}</span>}</li>)}
 {c.resolution&&!events.some(e=>e.kind==='closed')&&<li><strong>처리 완료</strong>{c.resolved_at&&<time>{date(c.resolved_at)}</time>}<p>{c.resolution}</p></li>}</ol>
 {admin&&<p>보관 종료 {date(c.erase_at)}</p>}
 {error&&<p role="alert">{error}</p>}
 {!admin&&active&&refund&&(c.payout_bank||c.bank_requested)&&<><button type="button" className="wallet-button wallet-secondary" onClick={()=>setEdit(!edit)}>{edit?'닫기':c.payout_bank?'환불계좌 변경':'환불계좌 등록'}</button>
 {edit&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void perform(async()=>{await save('details',{payout:{bank:f.get('bank'),holder:f.get('holder'),number:f.get('number')}});setEdit(false);});}}>
 <BankFields/><button disabled={busy}>보완 내용 저장</button></form>}</>}
 {admin&&active&&c.category!=='defect'&&<form onSubmit={e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form);void perform(async()=>{
  const financial=action==='resolve'&&refund;
  const parts=c.refund_quote?.items??[];
  const allocations=financial&&parts.length>1&&['original','transfer'].includes(outcome)?parts.map((i,index)=>({orderNo:i.orderNo,amountKrw:Number(f.get('part'+index))})):undefined;
  await save(action,{allocations,requestBank:f.has('requestBank'),resolution:String(f.get('resolution')).trim(),outcome:financial?outcome:'reply',amountKrw:allocations?allocations.reduce((n,i)=>n+i.amountKrw,0):f.get('amount')?Number(f.get('amount')):null,reference:f.get('reference')||null,processedAt:f.get('processed')?new Date(f.get('processed')+':00+09:00').toISOString():null});form.reset();setAction('note');setOutcome('reply');setBank(undefined);
 });}}>
 <label>처리 단계<select value={action} onChange={e=>setAction(e.target.value)}><option value="note">처리 경과 기록</option><option value="resolve">처리 완료</option></select></label>
 {action==='resolve'&&refund&&<label>처리 방식<select value={outcome} onChange={e=>setOutcome(e.target.value)}>{Object.entries(outcomes).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>}
 {action==='resolve'&&refund&&['original','transfer'].includes(outcome)&&<><p>결제 취소 또는 이체가 끝난 뒤 실제 처리 금액과 증빙번호를 기록해 주세요.</p>
 {(c.refund_quote?.items.length??0)>1?c.refund_quote!.items.map((i,index)=><label key={i.orderNo}>{i.orderNo} 실제 환불액 (원)<input type="number" name={'part'+index} min="0" max="999999999" step="1" required/></label>):<label>실제 환불 금액 (원)<input type="number" name="amount" min="1" max="999999999" step="1" required/></label>}
 <label>환불 실행 일시 (한국시간)<input type="datetime-local" name="processed" required/></label>
 <label>처리 증빙번호<input name="reference" maxLength={100} required placeholder="결제 취소번호 또는 이체확인번호"/></label></>}
 {refund&&action==='note'&&!c.payout_last4&&!c.bank_requested&&<label><input type="checkbox" name="requestBank"/> 회원에게 환불계좌 등록 요청</label>}
 <label>{action==='resolve'?'처리 결과':'처리 내용'}<textarea name="resolution" required maxLength={800} placeholder="회원에게 공개할 처리 내용을 입력해 주세요."/></label>
 <button disabled={busy}>{action==='resolve'?'처리 완료 저장':'처리 경과 저장'}</button></form>}</article>;
}
export function CommerceRecords({admin=false}:{admin?:boolean}){
 const [data,setData]=useState<Result>(),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [kind,setKind]=useState('complaint'),[receipt,setReceipt]=useState(''),[copied,setCopied]=useState(false);
 const receiptBox=useRef<HTMLDivElement>(null),request=useRef(crypto.randomUUID()),lock=useRef(false),search=useRef('');
 useEffect(()=>{if(receipt)receiptBox.current?.focus();},[receipt]);
 async function lookup(){const result=admin?await apiRequest<Result>(path+'/lookup',{key:search.current,by:'receipt'}):await apiRequest<Result>(path+'/mine');setData(result);}
 async function run(fn:()=>Promise<void>){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');
  try{await fn();}catch{setError('처리 결과를 확인할 수 없습니다. 다시 조회해 주세요.');}finally{lock.current=false;setBusy(false);}
 }
 async function submit(form:HTMLFormElement){
  const f=new FormData(form);
  const r=await apiRequest<{caseId:string}>(path+'/cases',{category:kind,description:String(f.get('description')??'').trim()||(kind==='refund'?'미사용 유료 이용권 잔액 환불 요청':''),orderNo:f.get('orderNo')||null,requestId:request.current,...(kind==='refund'?{balanceRefund:true}:{})});
  setReceipt(r.caseId);setCopied(false);request.current=crypto.randomUUID();await lookup();
 }
 return <details className="admin-card commerce-records" onToggle={e=>{if(e.target===e.currentTarget&&e.currentTarget.open&&!data&&!busy)void run(lookup);}}>
 <summary>{admin?'거래·환불·분쟁 기록':'결제 내역 및 고객 문의'}</summary>
 {admin&&<form onSubmit={e=>{e.preventDefault();search.current=key.trim();void run(lookup);}}><label>접수번호<input value={key} placeholder="예: 20261118-0001" maxLength={160} onChange={e=>setKey(e.target.value)}/></label><button disabled={busy}>조회</button></form>}
 {busy&&<p role="status">처리 중…</p>}{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error} <button disabled={busy} onClick={()=>void run(lookup)}>다시 조회</button></p>}
 {!admin&&receipt&&<div className="case-confirmation" role="status" tabIndex={-1} ref={receiptBox}><p><Check size={20}/> 문의가 접수되었습니다</p><span>접수번호</span><strong>{receipt}</strong>
 <button className="wallet-button wallet-secondary" onClick={async()=>{try{await navigator.clipboard.writeText(receipt);setCopied(true);}catch{setMessage('표시된 접수번호를 길게 눌러 복사해 주세요.');}}}><Copy size={17}/>{copied?'복사했습니다':'접수번호 복사'}</button></div>}
 {data&&<>{(admin||data.cases.length>0)&&<h3>문의 처리 내역</h3>}{admin&&!data.cases.length&&<p>조회된 접수가 없습니다.</p>}
 {data.cases.map(c=><CaseCard key={c.case_id} c={c} orders={data.orders} admin={admin} refresh={lookup}/>)}
 {(admin||data.orders.length>0)&&<details className="case-orders"><summary>거래기록 ({data.orders.length}건)</summary>{!data.orders.length&&<p>조회된 거래가 없습니다.</p>}
 {data.orders.map(o=><div key={o.order_no}><OrderDetail o={o} admin={admin}/>{admin&&<button className="wallet-button wallet-secondary" disabled={busy} onClick={()=>void run(async()=>{await apiRequest(path+'/sync',{orderNo:o.order_no});await lookup();setMessage('결제처 환불 내역을 갱신했습니다.');})}>결제처 환불 내역 갱신</button>}</div>)}</details>}</>}
 {!admin&&(receipt?<button className="wallet-button wallet-secondary" onClick={()=>{setReceipt('');setKind('complaint');}}>다른 문의 접수</button>:<form className="case-form" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;void run(()=>submit(form));}}><h3>문의 접수</h3>
 <label>유형<select value={kind} onChange={e=>setKind(e.target.value)}>{['complaint','dispute','refund'].map(v=><option value={v} key={v}>{labels[v]}</option>)}</select></label>
 {kind==='refund'?<section className="refund-balance" aria-live="polite"><h4>예상 환불액</h4>{data?.refundBalance?<><BalanceAmount balance={data.refundBalance}/><p><BalanceReason balance={data.refundBalance}/></p></>:<p>잔액 조회 중…</p>}
 <p>카드로 결제했다면 카드 결제를 취소합니다. 계좌가 필요한 경우 접수 내역에서 안내합니다.</p></section>:<PurchaseChoice orders={data?.orders??[]}/>}
 <label>{kind==='refund'?'추가로 알릴 내용 (선택)':'접수 내용'}<textarea required={kind!=='refund'} name="description" maxLength={800} placeholder={kind==='refund'?'구매 내역이 보이지 않으면 결제일과 금액을 적어 주세요.':'문의 내용을 입력해 주세요.'}/></label>
 <button className="wallet-button wallet-primary" disabled={busy||(kind==='refund'&&!data?.refundBalance)}>{kind==='refund'?'환불 검토 요청하기':'접수하기'}</button></form>)}</details>;
}
