import {useEffect,useRef,useState} from 'react';
import {ArrowUp,Check,MessageSquare,LockKeyhole,RotateCcw,Sparkles} from 'lucide-react';
import type {Project} from './model';
import {appendDirection,applyQuickEdit,changesProduct,directionIsCurrent,directionScopes,editDescription,emptyConversation,inferredScope,quickEdit,quickEditIssue,withdrawDirection} from './conversation';
import type {DirectionScope} from './conversation';
import './conversation.css';
const examples:[DirectionScope,string,string][]=[
 ['background','배경색 바꾸기','배경을 검정색으로 바꿔줘'],
 ['composition','고급스럽게 연출','상품은 그대로 두고, 밝은 쇼룸 배경과 부드러운 조명으로 고급스럽게 연출해줘.'],
 ['print','인쇄 색상 요청','인쇄 색상을 금색으로 변경해줘. 로고의 글자와 상품 형태는 유지해줘.'],
 ['copy','제목 바꾸기','제목을 "브랜드의 가치를 담다"로 바꿔줘'],
];
type Props={project:Project;change:(fn:(p:Project)=>Project)=>void};
export function CreativeDirector({project,change}:Props){
 const [draft,setDraft]=useState(''),[scope,setScope]=useState<DirectionScope>('auto'),[allow,setAllow]=useState(false),[error,setError]=useState('');
 const conversation=project.conversation??emptyConversation(),resolved=inferredScope(draft,scope),productChange=changesProduct(resolved);
 const historyRef=useRef<HTMLOListElement>(null);
 useEffect(()=>{const list=historyRef.current;if(list)list.scrollTop=list.scrollHeight;},[conversation.turns.length]);
 const active=conversation.turns.filter(t=>t.state==='recorded');
 function send(){try{const next=appendDirection(project,draft,scope,allow);change(()=>next);setDraft('');setAllow(false);setScope('auto');setError('');}catch(e){setError(e instanceof Error?e.message:'요청을 확인해주세요.');}}
 function apply(id:string){try{const next=applyQuickEdit(project,id);change(()=>next);setError('');}catch(e){setError(e instanceof Error?e.message:'변경안을 다시 확인해주세요.');}}
 return <section className="creative-director" id="creative-direction" aria-label="대화로 광고 요청">
  <div className="direction-heading"><div><span className="direction-kicker"><MessageSquare size={14}/>CREATIVE DIRECTION</span><h2>어떤 광고를 원하세요?</h2><p>배경, 인쇄 색상, 조명, 연출까지.<br className="mobile-only"/> 원하는 모습을 말로 남겨보세요.</p></div><span className="direction-availability">요청 준비 · AI 연결 전</span></div>
  <div className="direction-layout"><div className="direction-dialogue">
   {!conversation.turns.length&&<div className="direction-empty"><span className="direction-spark"><Sparkles size={21}/></span><h3>“상품은 그대로,<br/>배경만 더 특별하게.”</h3><p>처음부터 자세히 쓰지 않아도 됩니다.<br/>요청을 이어서 남기고 변경할 부분을 고르세요.</p></div>}
   {!!conversation.turns.length&&<ol ref={historyRef} className="direction-messages" aria-label="요청 이력">{conversation.turns.map((turn,index)=>{
    const edit=quickEdit(turn.text,turn.scope),issue=turn.state==='recorded'&&edit?quickEditIssue(project,turn):null,current=directionIsCurrent(project,turn);
    return <li key={turn.id} className={turn.state==='withdrawn'?'direction-withdrawn':''}><div className="direction-user"><div><span>나의 요청 {index+1}</span><span>{directionScopes.find(([id])=>id===turn.scope)?.[1]}</span></div><p>{turn.text}</p></div><div className="direction-response">
     {turn.state==='applied'?<><strong><Check size={15}/>빠른 편집 적용</strong><p>{edit&&editDescription(edit)}</p><small>사진 원본은 유지됩니다. 편집기의 ‘되돌리기’로 취소할 수 있습니다.</small></>:turn.state==='withdrawn'?<><strong>생성 요청에서 제외</strong><p>이 요청은 다음 생성 요청에 포함하지 않습니다.</p></>:edit?<><strong>빠른 편집 제안 · AI 미사용</strong><p>{editDescription(edit)}</p>{issue&&<small className="direction-warning">{issue}</small>}<div className="direction-response-actions"><button className="direction-apply" disabled={!!issue} onClick={()=>apply(turn.id)}>변경안 적용<Check size={14}/></button><button onClick={()=>change(p=>withdrawDirection(p,turn.id))}>이 요청 제외</button></div></>:<><strong>요청 기록됨 · 생성 전</strong><p>{turn.allowAppearanceChange?'선택한 상품 인쇄·색상 변경은 원본과 구분되는 별도 시안으로 준비합니다.':project.generation.mode==='creative'?'참고 자료와 요청을 바탕으로 새로운 광고 시안을 준비합니다. 실제 상품과 다르게 표현될 수 있습니다.':'실제 사진의 상품은 보호하고 요청한 배경·연출·문구를 준비합니다.'}</p><small>{current?'AI 연결 전입니다. 이 요청으로 이미지 생성이나 이용권 차감이 실행되지 않았습니다.':'원본·대상·언어가 바뀐 이전 요청입니다. 제외하고 현재 자료로 다시 요청해주세요.'}</small><button className="direction-withdraw" onClick={()=>change(p=>withdrawDirection(p,turn.id))}>이 요청 제외</button></>}
    </div></li>;
   })}</ol>}
  </div><div className="direction-compose">
   <div className="direction-examples"><span>이렇게 시작해보세요</span><div>{examples.map(([target,label,text])=><button key={label} onClick={()=>{setDraft(text);setScope(target);setAllow(false);setError('');}}>{label}<span>↗</span></button>)}</div></div>
   <label className="direction-input-label" htmlFor="direction-draft">원하는 광고 또는 수정 요청</label><textarea id="direction-draft" value={draft} maxLength={1200} rows={5} placeholder={'예: 실제 상품은 그대로 두고, 배경을 밝은 쇼룸으로 바꿔줘. 오른쪽에 광고 문구를 넣을 공간을 남겨줘.'} onChange={e=>{setDraft(e.target.value);setAllow(false);setError('');}} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/>
   <fieldset className="direction-scopes"><legend>변경할 범위</legend>{directionScopes.map(([id,label])=><button type="button" key={id} aria-pressed={scope===id} onClick={()=>{setScope(id);setAllow(false);setError('');}}>{label}</button>)}</fieldset>
   {productChange?<label className="direction-consent"><input type="checkbox" checked={allow} onChange={e=>setAllow(e.target.checked)}/><span><strong>{resolved==='print'?'상품 인쇄':'상품 색상'} 변경을 별도 시안으로 허용</strong><small>원본 파일과 형태를 보관하고, 선택한 부분을 바꾸는 요청입니다. 실제 인쇄 결과나 정확한 색상 재현을 보장하지는 않습니다.</small></span></label>:<p className="direction-protection"><LockKeyhole size={14}/>{project.generation.mode==='creative'?'창작 시안 요청 · 원본 파일과 규격 값 보관':'원본 상품 보호 · 규격 값 유지'}</p>}
   <div className="direction-send"><small>{draft.length} / 1,200 · Ctrl/⌘ + Enter</small><button onClick={send} disabled={!draft.trim()||conversation.turns.length>=40}>요청 남기기<ArrowUp size={17}/></button></div>
   {error&&<p role="alert" className="direction-error">{error}</p>}
   <p className="direction-help">간단한 배경색·제목·비율·규격 표시는 확인 후 바로 편집할 수 있습니다. 자연어 AI 응답·새 장면 생성은 연결 전입니다.</p>
   <div className="direction-save-note"><RotateCcw size={14}/><p>대화는 프로젝트와 함께 저장·백업됩니다. 앞선 요청을 바꾸려면 ‘이 요청 제외’ 후 새 요청을 남겨주세요.{active.length>0&&<span>대기 요청 {active.length}개 · PNG에는 현재 미리보기만 반영됩니다.</span>}</p></div>
  </div></div>
 </section>;
}
