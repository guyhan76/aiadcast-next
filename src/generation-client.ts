import type {DimensionPlan} from './dimension-generation';
import type {PlanarReport} from './planar-proportion';
import {offlineDemo} from './demo-mode';
import {demoRequest} from './local-demo';
import type {MarketingPlan} from './marketing-plan';
import {betaSession} from './beta-session';
import {configuredApiOrigin} from './api-origin';
import {imageFile} from './model';
import type {Asset} from './model';
export type GenerationJob={dimensionPlan?:DimensionPlan;planarReport?:PlanarReport;planarOriginal?:{dataUrl:string;sha256:string;width:number;height:number};creditPolicy?:'admin-unlimited';creditCost?:number;id:string;projectId:string;requestId?:string;requestIds?:string[];state:'running'|'ready'|'accepted'|'rejected'|'failed'|'uncertain'|'expired'|'refunded';mode:'original'|'creative';sourceHash:string|null;createdAt:string;model:string;artifactId:string|null;artifact:{id:string;sha256:string;dataUrl:string;width:number;height:number;role:'background'|'creative'}|null;errorCode:string|null;marketingPlan?:MarketingPlan|null;composition?:'complete-ad'|'photo-plate';compositionKey?:string};
export type ApiStatus={mode:'local-development'|'invite-beta'|'offline-demo';commercialReady:false;generation:{enabled:boolean;model:string;reason:string|null;photoPurposes?:boolean;planarControl?:boolean;dimensionVariants?:boolean};wallet:{available:number;reserved:number;kind:string;unlimited?:boolean};budget:{limitMicros:number;spentMicros:number;heldMicros:number};assistant?:{available:boolean}};
export function apiUrl(path:string){
 // A public endpoint is configuration, never an API credential. Local builds use Vite's loopback proxy.
 const origin=configuredApiOrigin();
 if(origin)return new URL(path,origin).href;
 return path;
}
export class ApiRequestFailure extends Error {constructor(public code:string,public status:number){super(code);}}
export async function apiRequest<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T>{
 if(offlineDemo()){if(signal?.aborted)throw new DOMException('Aborted','AbortError');const token=betaSession()?.token;try{const result=await demoRequest(path,body);if(!offlineDemo()||token!==betaSession()?.token)throw Error('SESSION_CHANGED');if(signal?.aborted)throw new DOMException('Aborted','AbortError');return result as T;}catch(e){const value=e as {code?:string;status?:number};if(value.code)throw new ApiRequestFailure(value.code,value.status??400);throw e;}}
 const session=betaSession(),url=apiUrl(path);
 const auth:Record<string,string>=session?{Authorization:`Bearer ${session.token}`}:{ };
 const response=await fetch(url,{method:body===undefined?'GET':'POST',credentials:'same-origin',redirect:'error',headers:body===undefined?auth:{...auth,'Content-Type':'application/json','X-Aiadcast-Client':'local-studio'},body:body===undefined?undefined:JSON.stringify(body),signal:signal??AbortSignal.timeout(30_000)});
 if(!response.headers.get('content-type')?.includes('application/json'))throw Error('API_UNAVAILABLE');
 const data=await response.json();if(apiUrl(path)!==url||(betaSession()?.token??null)!==(session?.token??null))throw Error('SESSION_CHANGED');if(!response.ok)throw new ApiRequestFailure(data?.error?.code??'API_UNAVAILABLE',response.status);
 if(path==='/api/status'&&(typeof data?.generation?.enabled!=='boolean'||!Number.isFinite(data?.wallet?.available)||!Number.isFinite(data?.wallet?.reserved)||!Number.isFinite(data?.budget?.limitMicros)))throw Error('API_UNAVAILABLE');
 return data as T;
}
export async function verifiedArtifact(job:GenerationJob):Promise<Asset>{
 const artifact=job.artifact;if(!artifact||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(artifact.dataUrl)||artifact.dataUrl.length>14_000_000)throw Error('INVALID_ARTIFACT');
 const response=await fetch(artifact.dataUrl);const blob=await response.blob();const asset=await imageFile(new File([blob],`aiadcast-${job.id}.png`,{type:blob.type}));
 if(asset.sha256!==artifact.sha256||asset.sha256!==artifact.id||asset.sha256!==job.artifactId||asset.width!==artifact.width||asset.height!==artifact.height)throw Error('ARTIFACT_MISMATCH');
 return asset;
}

