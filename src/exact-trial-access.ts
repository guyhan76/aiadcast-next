export type TrialDiagnostic={kind:'auth'|'forbidden'|'server'|'timeout'|'network'|'invalid'|'changed';status:number|null;code:string};
const allowed=new Set(['AUTH_REQUIRED','ADMIN_REQUIRED','EXACT_TEXT_TRIAL_FORBIDDEN','RATE_LIMITED','SERVER_BUSY','INTERNAL_ERROR','PAID_TRIAL_NOT_APPROVED','NOT_FOUND']);
export function trialHttpDiagnostic(status:number,body:unknown):TrialDiagnostic{
 const raw=(body as {error?:{code?:unknown}}|null)?.error?.code;
 return {kind:status===401?'auth':status===403?'forbidden':status>=500||status===429?'server':'invalid',status:Number.isInteger(status)&&status>=100&&status<=599?status:null,code:typeof raw==='string'&&allowed.has(raw)?raw:'UNCLASSIFIED_RESPONSE'};
}
export function validTrialCapability(c:unknown){const v=c as {version?:unknown;preparation?:unknown;generationEnabled?:unknown;reason?:unknown}|null;return v?.version===2&&v.preparation===true&&v.generationEnabled===false&&v.reason==='PAID_TRIAL_NOT_APPROVED';}
