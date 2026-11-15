import type {SelectivePreservation} from './selective-preservation';
import type {AiDimensionDisplay,AiDimensionReview} from './ai-dimension-display';
import type {DimensionPlan} from './dimension-generation';
import type {PlanarReport} from './planar-proportion';
import {offlineDemo} from './demo-mode';
import {demoRequest} from './local-demo';
import type {MarketingPlan} from './marketing-plan';
import {betaSession,setBetaSession} from './beta-session';
import {configuredApiOrigin} from './api-origin';
import {loadImage} from './model';
import {maximumReferenceBytes} from './reference-limits';
import type {Asset} from './model';
export type GenerationJob={downloadExpiresAt?:string;preservation?:SelectivePreservation;selectiveEdit?:{sourceProjectId:string;sourceJobId:string;sourceHash:string;maskHash:string;prompt:string;version:1};requestFingerprint?:string;dimensionDisplay?:AiDimensionDisplay;dimensionReview?:AiDimensionReview;inputMode?:'text-example';dimensionPlan?:DimensionPlan;planarReport?:PlanarReport;planarOriginal?:{dataUrl:string;sha256:string;width:number;height:number};creditUnit?:'legacy-ticket'|'credit-v2';creditCaptured?:boolean;defectReport?:{state:string};creditPolicy?:'admin-unlimited'|'legacy-accept-v1'|'delivered-2026-10-18';creditCost?:number;id:string;projectId:string;requestId?:string;requestIds?:string[];state:'running'|'ready'|'accepted'|'rejected'|'failed'|'uncertain'|'expired'|'refunded';mode:'original'|'creative';sourceHash:string|null;createdAt:string;model:string;artifactId:string|null;artifact:{id:string;sha256:string;dataUrl:string;width:number;height:number;role:'background'|'creative'}|null;errorCode:string|null;marketingPlan?:MarketingPlan|null;composition?:'complete-ad'|'photo-plate';compositionKey?:string};
export type CreditQuote={unit:'legacy-ticket'|'credit-v2';amount:number;policy:string};
export type ApiStatus={mode:'local-development'|'invite-beta'|'offline-demo';commercialReady:false;generation:{batchVersion?:1;selectiveEditProofVersion?:1;selectiveEdit?:boolean;creditQuote?:CreditQuote;enabled:boolean;model:string;reason:string|null;perRequestReservationUsd?:number;exactAdText?:boolean;plannedAdText?:boolean;manualDimensionOverlay?:boolean;aiDimensionDisplay?:boolean;photoPurposes?:boolean;textExamples?:boolean;planarControl?:boolean;dimensionVariants?:boolean};wallet:{credits?:{available:number;reserved:number};available:number;reserved:number;kind:string;unlimited?:boolean};budget:{limitMicros:number;spentMicros:number;heldMicros:number};assistant?:{available:boolean}};
export function apiUrl(path:string){
 // A public endpoint is configuration, never an API credential. Local builds use Vite's loopback proxy.
 const origin=configuredApiOrigin();
 if(origin)return new URL(path,origin).href;
 return path;
}
export class ApiRequestFailure extends Error {constructor(public code:string,public status:number){super(code);}}
export async function apiRequest<T>(path:string,body?:unknown,signal?:AbortSignal,onResponse?:(status:number)=>void):Promise<T>{
 if(offlineDemo()){if(signal?.aborted)throw new DOMException('Aborted','AbortError');const token=betaSession()?.token;try{const result=await demoRequest(path,body);if(!offlineDemo()||token!==betaSession()?.token)throw Error('SESSION_CHANGED');if(signal?.aborted)throw new DOMException('Aborted','AbortError');return result as T;}catch(e){const value=e as {code?:string;status?:number};if(value.code==='AUTH_REQUIRED'&&value.status===401&&token&&offlineDemo()&&token===betaSession()?.token)setBetaSession(null,'login');if(value.code)throw new ApiRequestFailure(value.code,value.status??400);throw e;}}
 const session=betaSession(),url=apiUrl(path);
 const auth:Record<string,string>=session?{Authorization:`Bearer ${session.token}`}:{ };
 const response=await fetch(url,{method:body===undefined?'GET':'POST',credentials:'same-origin',redirect:'error',...(path==='/api/account/capabilities'?{cache:'no-store' as const}:{}),headers:body===undefined?auth:{...auth,'Content-Type':'application/json','X-Aiadcast-Client':'local-studio'},body:body===undefined?undefined:JSON.stringify(body),signal:signal??AbortSignal.timeout(30_000)});
 onResponse?.(response.status);
 if(!response.headers.get('content-type')?.includes('application/json'))throw Error('API_UNAVAILABLE');
 const data=await response.json();if(apiUrl(path)!==url||(betaSession()?.token??null)!==(session?.token??null))throw Error('SESSION_CHANGED');if(response.status===401&&data?.error?.code==='AUTH_REQUIRED'&&session)setBetaSession(null,'login');if(!response.ok)throw new ApiRequestFailure(data?.error?.code??'API_UNAVAILABLE',response.status);
 if(path==='/api/status'&&(typeof data?.generation?.enabled!=='boolean'||!Number.isFinite(data?.wallet?.available)||!Number.isFinite(data?.wallet?.reserved)||!Number.isFinite(data?.budget?.limitMicros)))throw Error('API_UNAVAILABLE');
 if(path==='/api/status'&&data.generation.creditQuote){const q=data.generation.creditQuote,c=data.wallet.credits;if(!['legacy-ticket','credit-v2'].includes(q.unit)||!c||![c.available,c.reserved].every(v=>Number.isSafeInteger(v)&&v>=0)||q.unit==='credit-v2'&&(q.amount!==10||q.policy!=='delivered-2026-10-18'))throw Error('API_UNAVAILABLE');}
 return data as T;
}
type DeliveredArtifact=Pick<GenerationJob,'artifact'|'artifactId'|'id'>;

export async function verifiedOriginalBlob(job:DeliveredArtifact):Promise<Blob>{
 const a=job.artifact;
 if(!a||typeof a.dataUrl!=='string'||a.dataUrl.length>14_000_000)throw Error('INVALID_ARTIFACT');
 const prefix=/^data:(image\/(?:png|jpeg|webp));base64,/.exec(a.dataUrl);
 if(!prefix)throw Error('INVALID_ARTIFACT');
 const encoded=a.dataUrl.slice(prefix[0].length);
 if(!encoded.length||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw Error('INVALID_ARTIFACT');
 const raw=atob(encoded);
 if(raw.length>maximumReferenceBytes||a.width*a.height>30_000_000)throw Error('INVALID_ARTIFACT');
 const bytes=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==a.sha256||hash!==a.id||hash!==job.artifactId)throw Error('ARTIFACT_MISMATCH');
 const blob=new Blob([bytes],{type:prefix[1]});
 // blob URLs are local to this document, including under the Android WebView asset loader.
 const url=URL.createObjectURL(blob);
 try{
  const image=await loadImage(url);
  if(image.naturalWidth!==a.width||image.naturalHeight!==a.height)throw Error('ARTIFACT_MISMATCH');
 }finally{URL.revokeObjectURL(url);}
 return blob;
}
export async function verifiedArtifact(job:DeliveredArtifact):Promise<Asset>{
 await verifiedOriginalBlob(job);
 const a=job.artifact!;
 return {name:`aiadcast-${job.id}.png`,data:a.dataUrl,width:a.width,height:a.height,sha256:a.sha256};
}
