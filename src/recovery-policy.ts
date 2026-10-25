// Retry only read-side transport/server failures. Semantic misses are not proof
// that a generation never ran and must never lead to a generation retry.
export function retryRecoveryRead(input:{status?:number|null;code?:string;network?:boolean;timedOut?:boolean}):boolean{
 if(['INVALID_HISTORY','AMBIGUOUS_HISTORY','REQUEST_NOT_FOUND','SESSION_CHANGED'].includes(input.code??''))return false;
 if(input.status!==undefined&&input.status!==null&&input.status>=400)return input.status===408||input.status===429||input.status>=500;
 return input.network===true||input.timedOut===true;
}
export const recoveryDelays=[1000,2000] as const;
export const uncertainReadDelays=[2000,4000,8000] as const;
