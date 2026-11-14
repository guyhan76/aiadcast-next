import {ApiFailure} from './generation-service.mjs';
export const generationStates=['accepted','ready','running','reserved','uncertain','failed','rejected','expired'];
export const generationStateSql="CASE WHEN g.error_code='PROVIDER_UNCERTAIN' THEN 'uncertain' WHEN g.error_code IS NOT NULL THEN 'failed' WHEN j.status='released' THEN CASE WHEN j.reason='customer_rejected' THEN 'rejected' ELSE 'expired' END WHEN j.status='reserved' THEN 'running' ELSE j.status END";
export function generationPageQuery(search,now=Date.now()){
 const p=new URLSearchParams(search),state=p.get('state')||'',days=p.get('days')||'all';
 if(!['all','7','30','90'].includes(days)||(state&&!generationStates.includes(state)))throw new ApiFailure('INVALID_HISTORY_FILTER',400);
 let cursor=null;try{if(p.get('cursor')){if(p.get('cursor').length>800)throw Error();cursor=JSON.parse(Buffer.from(p.get('cursor'),'base64url').toString());if(!Array.isArray(cursor)||cursor.length!==3||!Number.isSafeInteger(cursor[0])||cursor[0]<0||cursor.slice(1).some(v=>typeof v!=='string'||!v.length||v.length>100||!/^[-a-zA-Z0-9_]+$/.test(v)))throw Error();}}catch{throw new ApiFailure('INVALID_HISTORY_CURSOR',400);}
 return {state,since:days==='all'?0:now-Number(days)*86400000,cursor};
}
export function generationPage(rows){
 const items=rows.slice(0,10),last=items.at(-1);
 return {jobs:items.map(r=>({id:r.id,userId:r.user_id,userLabel:r.user_label,state:r.state,createdAt:new Date(Number(r.created_at)).toISOString(),model:r.model,outputFormat:r.format,errorCode:r.error_code,costMicros:r.cost==null?null:Number(r.cost)})),nextCursor:rows.length>10&&last?Buffer.from(JSON.stringify([Number(last.created_at),last.user_id,last.id])).toString('base64url'):null};
}
