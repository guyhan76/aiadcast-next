// Persist only bounded, non-sensitive evidence of a client submission attempt.
// A sent attempt is not proof of server admission, provider dispatch or billing.
const codes=new Set(['AUTH_REQUIRED','FORBIDDEN','SERVER_BUSY','TOO_MANY_REQUESTS','INTERNAL_ERROR','CREDIT_RESERVATION_FAILED','CREDIT_QUOTE_CHANGED','BUDGET_NOT_AVAILABLE','STORAGE_LIMIT','STORAGE_CAPACITY_UNAVAILABLE','IDEMPOTENCY_CONFLICT','GENERATION_ALREADY_RUNNING','REQUEST_TOO_LARGE','INVALID_REQUEST','INVALID_JSON','SESSION_CHANGED','API_UNAVAILABLE','NETWORK_ERROR','SUBMISSION_TIMEOUT','HTTP_ERROR','INVALID_RESPONSE']);
export type SubmissionDiagnostic={status:number|null;code:string;at:string};
export function submissionDiagnostic(input:{status?:number|null;code?:string;timedOut?:boolean;network?:boolean},at=new Date().toISOString()):SubmissionDiagnostic{
 const status=typeof input.status==='number'&&Number.isInteger(input.status)&&input.status>=100&&input.status<=599?input.status:null;
 return {status,code:input.timedOut?'SUBMISSION_TIMEOUT':codes.has(input.code??'')?input.code!:status!==null&&status>=400?'HTTP_ERROR':input.network?'NETWORK_ERROR':'INVALID_RESPONSE',at};
}
export function parseSubmissionDiagnostic(value:unknown):SubmissionDiagnostic|undefined{
 if(!value||typeof value!=='object')return;
 const v=value as SubmissionDiagnostic;
 if(!codes.has(v.code)||!(v.status===null||Number.isInteger(v.status)&&v.status>=100&&v.status<=599)||typeof v.at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v.at))return;
 return {status:v.status,code:v.code,at:v.at};
}
