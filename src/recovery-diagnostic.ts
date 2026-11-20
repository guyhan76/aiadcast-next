// Only fixed codes and HTTP status may leave recovery diagnostics. Never retain
// response bodies, error messages, URLs, job/account IDs or authorization data.
export type RecoveryDiagnostic={step:'history'|'request'|'job';status:number|null;code:string};
const allowed=new Set(['ADMISSION_PENDING','AUTH_REQUIRED','FORBIDDEN','DENIED','JOB_NOT_FOUND','NOT_FOUND','INVALID_PROJECT_ID','REQUEST_PROJECT_MISMATCH','RATE_LIMITED','TOO_MANY_REQUESTS','INTERNAL_ERROR','INVALID_HISTORY','AMBIGUOUS_HISTORY','REQUEST_NOT_FOUND','SESSION_CHANGED','API_UNAVAILABLE','INVALID_RESPONSE']);
export function recoveryDiagnostic(input:{step:'history'|'request'|'job';status?:number|null;code?:string;aborted?:boolean;network?:boolean}):RecoveryDiagnostic{
 const status=typeof input.status==='number'&&Number.isInteger(input.status)&&input.status>=100&&input.status<=599?input.status:null;
 const code=input.aborted?'LOOKUP_TIMEOUT':allowed.has(input.code??'')?input.code!:status!==null&&status>=400?'HTTP_ERROR':input.network&&status===null?'NETWORK_ERROR':'INVALID_RESPONSE';
 return {step:input.step,status,code};
}
