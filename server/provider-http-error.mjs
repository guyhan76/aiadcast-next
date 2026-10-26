// Error bodies are transient: retain only these public, fixed provider enums.
const quota = new Set(['insufficient_quota','credit_balance_exhausted','organization_usage_limit_exceeded','organization_spend_limit_exceeded','project_spend_limit_exceeded','billing_hard_limit_reached','billing_limit_reached']);
const rate = new Set(['rate_limit_exceeded','rate_limit_error','slow_down']);
const allowed = new Set([...quota,...rate,'invalid_request_error','server_error','authentication_error','permission_error']);
export const safeProviderEnum = value => allowed.has(value) ? value : null;
export function retryAfterSeconds(value, now = Date.now()) {
 if(typeof value!=='string'||value.length>64)return null;
 const seconds=/^\d+(?:\.\d+)?$/.test(value)?Math.ceil(Number(value)):/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)?Math.ceil((Date.parse(value)-now)/1000):NaN;
 return Number.isSafeInteger(seconds)&&seconds>=0&&seconds<=86400?seconds:null;
}
export async function providerHttpError(response, {timeoutMs=500} = {}) {
 let reader,timer;
 const read=async()=>{
  reader=response.body?.getReader();if(!reader)return null;
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384)return null;chunks.push(Buffer.from(value));}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))?.error;
 };
 let error;
 try{error=await Promise.race([read(),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),timeoutMs);})]);}catch{}finally{clearTimeout(timer);try{void reader?.cancel().catch(()=>{});}catch{}}
 const providerErrorCode=safeProviderEnum(error?.code),providerErrorType=safeProviderEnum(error?.type);
 const values=[providerErrorCode,providerErrorType];
 const code=response.status!==429?'PROVIDER_REQUEST_FAILED':values.some(v=>quota.has(v))?'PROVIDER_QUOTA_EXHAUSTED':values.some(v=>rate.has(v))?'PROVIDER_TEMPORARY_RATE_LIMIT':'PROVIDER_429_UNCLASSIFIED';
 return {code,providerErrorCode,providerErrorType,retryAfterSeconds:retryAfterSeconds(response.headers.get('retry-after'))};
}
