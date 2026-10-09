import type {Project} from './model.ts';
import {isImageFormat} from './formats.ts';
import {resolveIndustryCategory} from './industry.ts';
export const directionScopes=[['auto','요청 전체'],['background','배경'],['lighting','조명·분위기'],['composition','구도·연출'],['print','상품 인쇄'],['product-color','상품 색상'],['copy','광고 문구'],['format','비율·규격 표시']] as const;
export type DirectionScope=typeof directionScopes[number][0];
export type QuickEdit={kind:'background';value:string}|{kind:'title';value:string}|{kind:'format';value:Project['format']}|{kind:'dimensions';value:boolean};
export type DirectionTurn={id:string;text:string;scope:DirectionScope;allowAppearanceChange:boolean;state:'recorded'|'applied'|'withdrawn';createdAt:string;context:{sourceHash:string|null;locale:Project['locale'];category:string;productName:string};before:string};
export type Conversation={version:1;turns:DirectionTurn[]};
export const emptyConversation=():Conversation=>({version:1,turns:[]});
const scopeValid=(s:unknown):s is DirectionScope=>directionScopes.some(([id])=>id===s);
export function inferredScope(text:string,selected:DirectionScope):DirectionScope{
 if(selected!=='auto')return selected;
 // Convenience suggestions only. These do not grant permission to edit a product.
 if(/그대로|유지|하지|말고|않|keep|don't|do not/i.test(text))return 'auto';
 if(/인쇄|프린트|print(?:ing)?/i.test(text)&&/바꿔|변경|change|make/i.test(text))return 'print';
 if(/(?:상품|제품|용기|차량|product).{0,15}(?:색|color|colour)/i.test(text)&&/바꿔|변경|change|make/i.test(text))return 'product-color';
 return 'auto';
}
export const changesProduct=(scope:DirectionScope)=>scope==='print'||scope==='product-color';
export function parseConversation(raw:unknown):Conversation{
 if(raw===undefined)return emptyConversation();const c=raw as Conversation;
 if(!c||c.version!==1||!Array.isArray(c.turns)||c.turns.length>40)throw Error('대화 요청 형식을 확인해주세요.');
 const turns=c.turns.map(t=>{
  if(!t||typeof t.id!=='string'||t.id.length<1||t.id.length>80||typeof t.text!=='string'||!t.text.trim()||t.text.length>1200||!scopeValid(t.scope)||typeof t.allowAppearanceChange!=='boolean'||!['recorded','applied','withdrawn'].includes(t.state)||typeof t.createdAt!=='string'||!Number.isFinite(Date.parse(t.createdAt))||typeof t.before!=='string'||t.before.length>400)throw Error('대화 요청 항목을 확인해주세요.');
  const x=t.context;if(!x||!['ko','en'].includes(x.locale)||typeof x.category!=='string'||x.category.length>40||typeof x.productName!=='string'||x.productName.length>100||(x.sourceHash!==null&&(typeof x.sourceHash!=='string'||x.sourceHash.length>128)))throw Error('대화 요청의 원본 정보를 확인해주세요.');
  if(t.allowAppearanceChange&&!changesProduct(t.scope))throw Error('상품 변경 허용 범위를 확인해주세요.');
  return {id:t.id,text:t.text,scope:t.scope,allowAppearanceChange:t.allowAppearanceChange,state:t.state,createdAt:t.createdAt,context:{sourceHash:x.sourceHash,locale:x.locale,category:x.category,productName:x.productName},before:t.before};
 });
 if(new Set(turns.map(t=>t.id)).size!==turns.length)throw Error('중복된 대화 요청입니다.');
 return {version:1,turns};
}
const colors:Record<string,string>={'검정':'#171717','검은색':'#171717','검정색':'#171717','블랙':'#171717','black':'#171717','흰색':'#ffffff','화이트':'#ffffff','white':'#ffffff','베이지':'#f4f0e8','크림':'#f4f0e8','beige':'#f4f0e8','cream':'#f4f0e8','파란색':'#245fea','파랑':'#245fea','blue':'#245fea','빨간색':'#c23b32','빨강':'#c23b32','red':'#c23b32'};
// Deliberately narrow, fully matched commands. No LLM claim; mixed or ambiguous
// instructions remain recorded requests. Arbitrary conversation never becomes code.
export function quickEdit(text:string,scope:DirectionScope):QuickEdit|null{
 const t=text.trim().replace(/[.!。]+$/,'').trim();
 if(scope==='auto'||scope==='background'){
  const m=t.match(/^배경(?:색| 색상)?(?:을|은|만)?\s*(#[a-f\d]{6}|검정색|검은색|검정|블랙|흰색|화이트|베이지|크림|파란색|파랑|빨간색|빨강)(?:으로|로)?\s*(?:바꿔줘|바꿔주세요|변경해줘|변경해주세요|해줘|해주세요|설정해줘)$/i)||t.match(/^(?:set|change|make) (?:the )?background(?: color)?(?: to)? (#[a-f\d]{6}|black|white|beige|cream|blue|red)$/i);
  if(m)return {kind:'background',value:colors[m[1].toLowerCase()]??m[1].toLowerCase()};
 }
 if(scope==='auto'||scope==='copy'){
  const m=t.match(/^제목(?:을|은)?\s*["“]([^"”]{1,180})["”](?:으로|로)?\s*(?:바꿔줘|바꿔주세요|변경해줘|변경해주세요|해줘|해주세요)$/)||t.match(/^set (?:the )?title to "([^"\n]{1,180})"$/i);
  if(m)return {kind:'title',value:m[1]};
 }
 if(scope==='auto'||scope==='format'){
  const m=t.match(/^(?:비율(?:을|은)?\s*)?(1:1|4:5|3:4|9:16|2:3|16:9|1\.91:1)(?:로|으로)\s*(?:바꿔줘|바꿔주세요|해줘|변경해줘)$/)||t.match(/^set (?:the )?(?:ratio|format) to (1:1|4:5|3:4|9:16|2:3|16:9|1\.91:1)$/i);
  if(m&&isImageFormat(m[1]))return {kind:'format',value:m[1]};
  if(/^(?:규격(?:은|을)?\s*(?:숨겨줘|숨겨주세요|표시하지 마|표시하지마)|치수 표시 꺼줘|hide dimensions)$/i.test(t))return {kind:'dimensions',value:false};
  if(/^(?:규격(?:을)?\s*표시해줘|show dimensions)$/i.test(t))return {kind:'dimensions',value:true};
 }
 return null;
}
function priorValue(p:Project,edit:QuickEdit|null):string{
 if(!edit)return '';return edit.kind==='background'?JSON.stringify([p.background.color,p.background.image?.sha256??null,p.ink]):edit.kind==='title'?p.copy[p.locale].title:edit.kind==='format'?p.format:JSON.stringify([p.productProfile.specType,p.dimensions.visible]);
}
export function appendDirection(p:Project,text:string,scope:DirectionScope,allowAppearanceChange=false):Project{
 const c=parseConversation(p.conversation);const trimmed=text.trim();
 if(!scopeValid(scope))throw Error('변경할 범위를 확인해주세요.');
 if(!trimmed||trimmed.length>1200)throw Error('요청을 1~1,200자로 입력해주세요.');
 if(c.turns.length>=40)throw Error('한 프로젝트에 최대 40개 요청을 보관할 수 있습니다. 새 프로젝트로 이어가주세요.');
 const resolved=inferredScope(trimmed,scope);
 if(changesProduct(resolved)&&!allowAppearanceChange)throw Error('상품 인쇄·색상 변경은 별도 시안으로 허용한 범위를 확인해주세요.');
 const turn:DirectionTurn={id:crypto.randomUUID(),text:trimmed,scope:resolved,allowAppearanceChange:changesProduct(resolved)&&allowAppearanceChange,state:'recorded',createdAt:new Date().toISOString(),context:{sourceHash:p.product?.sha256??null,locale:p.locale,category:p.productProfile.category,productName:p.productName},before:priorValue(p,quickEdit(trimmed,resolved))};
 return {...p,conversation:{version:1,turns:[...c.turns,turn]}};
}
export function directionIsCurrent(p:Project,t:DirectionTurn){return t.context.sourceHash===(p.product?.sha256??null)&&t.context.locale===p.locale&&resolveIndustryCategory(t.context.category)===p.productProfile.category&&t.context.productName===p.productName;}
export function quickEditIssue(p:Project,t:DirectionTurn):string|null{
 const edit=quickEdit(t.text,t.scope);
 if(t.state!=='recorded'||!edit)return '이 요청은 바로 편집할 수 없습니다.';
 if(!directionIsCurrent(p,t)||priorValue(p,edit)!==t.before)return '요청 이후 원본이나 편집 내용이 바뀌었습니다. 현재 상태에서 다시 요청해주세요.';
 if(p.generation.mode==='creative')return '직접 편집 방식으로 전환한 뒤 변경안을 적용해주세요.';
 if(edit.kind==='background'&&p.background.image)return '배경 사진이 사용 중입니다. 배경 탭에서 사진을 해제한 뒤 다시 요청해주세요.';
 if(edit.kind==='dimensions'&&edit.value&&p.productProfile.specType==='none')return '규격 정보 사용을 켜고 실제 치수를 입력한 뒤 다시 요청해주세요.';
 return null;
}
export function editDescription(edit:QuickEdit){return edit.kind==='background'?`배경색 ${edit.value} · 가독성에 맞춰 글자색 조정`:edit.kind==='title'?`현재 언어의 제목: ${edit.value}`:edit.kind==='format'?`출력 비율 ${edit.value}`:edit.value?'입력한 규격 표시':'규격 표시 숨김 · 입력값 유지';}
export function applyQuickEdit(p:Project,id:string):Project{
 const c=parseConversation(p.conversation),t=c.turns.find(t=>t.id===id);if(!t)throw Error('요청을 찾지 못했습니다.');const issue=quickEditIssue(p,t);if(issue)throw Error(issue);const edit=quickEdit(t.text,t.scope)!;let next={...p};
 if(edit.kind==='background'){const rgb=[1,3,5].map(i=>parseInt(edit.value.slice(i,i+2),16));const brightness=(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722);next={...next,background:{...p.background,color:edit.value},ink:brightness<140?'light':'dark'};}
 if(edit.kind==='title')next={...next,copy:{...p.copy,[p.locale]:{...p.copy[p.locale],title:edit.value}}};
 if(edit.kind==='format')next={...next,format:edit.value};
 if(edit.kind==='dimensions')next={...next,dimensions:{...p.dimensions,visible:edit.value}};
 return {...next,conversation:{version:1,turns:c.turns.map(x=>x.id===id?{...x,state:'applied'}:x)}};
}
export function withdrawDirection(p:Project,id:string):Project{
 const c=parseConversation(p.conversation);return {...p,conversation:{version:1,turns:c.turns.map(t=>t.id===id&&t.state==='recorded'?{...t,state:'withdrawn'}:t)}};
}
export function conversationContract(p:Project){
 const c=parseConversation(p.conversation),pending=c.turns.filter(t=>t.state==='recorded');
 const stale=pending.filter(t=>!directionIsCurrent(p,t));if(stale.length)throw Error('대화 요청 이후 원본·광고 대상·언어가 바뀌었습니다. 이전 요청을 제외하거나 현재 자료로 다시 요청해주세요.');
 const active=pending.filter(t=>!quickEdit(t.text,t.scope));
 const permissions={print:active.some(t=>t.scope==='print'&&t.allowAppearanceChange),color:active.some(t=>t.scope==='product-color'&&t.allowAppearanceChange)};
 return {version:1,providerStatus:'not-connected',execution:'not-started',
  instructions:active.map(t=>({id:t.id,role:'user',text:t.text,scope:t.scope,sourceHash:t.context.sourceHash})),
  pendingQuickEditIds:pending.filter(t=>quickEdit(t.text,t.scope)).map(t=>t.id),
  productPolicy:{preserveSourceFile:true,preserveGeometry:p.generation.mode==='original'||permissions.print||permissions.color,allowPrintChange:permissions.print,allowColorChange:permissions.color,maskRequired:permissions.print||permissions.color,saveAsSeparateVariant:permissions.print||permissions.color},
  contextPolicy:'Earlier requests remain constraints unless withdrawn; unresolved conflicts require clarification before any paid generation.',
 };
}
