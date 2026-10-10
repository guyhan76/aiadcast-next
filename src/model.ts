import {parsePublishing} from './publishing.ts';
import type {Publishing} from './publishing.ts';
import {defaultGeneration,parseGeneration} from './generation.ts';
import {isImageFormat} from './formats.ts';
import type {ImageFormat} from './formats.ts';
import type {GenerationSettings} from './generation.ts';
import {defaultProfile,dimensionAxes,isServiceCategory,parseProfile} from './product.ts';
import type {ProductProfile} from './product.ts';
import {defaultCampaign,parseCampaign} from './campaign.ts';
import type {Campaign} from './campaign.ts';
import {defaultReferenceCheck,parseReferenceCheck} from './specification.ts';
import type {ReferenceCheck} from './specification.ts';
import {parseConversation} from './conversation.ts';
import type {Conversation} from './conversation.ts';
import {hasUsableCreative,parseGenerated} from './generated.ts';
import type {GeneratedAsset} from './generated.ts';
import {boxProjectionError,parseBoxProjection} from './box-projection.ts';
import type {BoxProjection} from './box-projection.ts';
export type Locale = 'ko' | 'en';
export type Axis = 'width' | 'depth' | 'height';
export type Point = {x:number;y:number};
export type Asset = {name:string;data:string;width:number;height:number;sha256:string};
export type Copy = {title:string;description:string;company:string;contact:string;website:string};
export type Project = {
 version:1;id:string;name:string;updatedAt:string;locale:Locale;format:ImageFormat;
 product:Asset|null;productName:string;productProfile:ProductProfile;generation:GenerationSettings;scale:number;
 background:{color:string;image:Asset|null};ink:'dark'|'light';
 publishing?:Publishing;campaign?:Campaign;referenceCheck?:ReferenceCheck;conversation?:Conversation;generated?:GeneratedAsset;boxProjection?:BoxProjection;
 dimensions:{width:string;depth:string;height:string;visible:boolean;lines:boolean;anchors:Record<Axis,[Point,Point]>};
 copy:Record<Locale,Copy>;
};
export function newProject():Project {
 return {version:1,id:crypto.randomUUID(),name:'새 프로젝트',updatedAt:new Date().toISOString(),locale:'ko',format:'9:16',product:null,productName:'',productProfile:defaultProfile(),generation:defaultGeneration(),scale:1,background:{color:'#f4f0e8',image:null},ink:'dark',dimensions:{width:'300',depth:'200',height:'100',visible:true,lines:false,anchors:{width:[{x:.1,y:.78},{x:.72,y:.94}],depth:[{x:.72,y:.94},{x:.94,y:.73}],height:[{x:.94,y:.73},{x:.94,y:.12}]}},copy:{ko:{title:'브랜드의 가치를,\n분명하게 전하세요.',description:'광고 문구를 입력하고\n원하는 배경과 사진으로 꾸며보세요.',company:'selluplabs',contact:'',website:''},en:{title:'Your story.\nClearly told.',description:'Tell customers what you offer.\nAdd a message that fits your brand.',company:'selluplabs',contact:'',website:''}}};
}
export const labels={ko:{width:'가로',depth:'세로',height:'높이',spec:'상품 규격'},en:{width:'Width',depth:'Depth',height:'Height',spec:'PRODUCT DIMENSIONS'}};
export const axes:Axis[]=['width','depth','height'];
export async function imageFile(file:File):Promise<Asset> {
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('PNG, JPG, WebP 사진을 선택해주세요.');
 if(file.size>10*1024*1024)throw new Error('사진은 10 MB 이하로 추가해주세요.');
 const bytes=await file.arrayBuffer();
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('파일을 읽지 못했습니다.'));reader.readAsDataURL(file);});
 const img=await loadImage(data);
 if(img.naturalWidth*img.naturalHeight>30_000_000)throw new Error('3,000만 화소 이하의 사진을 사용해주세요.');
 return {name:file.name,data,width:img.naturalWidth,height:img.naturalHeight,sha256};
}
export async function loadImage(data:string):Promise<HTMLImageElement> {const img=new Image();img.src=data;await img.decode();return img;}
export function exportErrors(p:Project) {
 const errors:string[]=[];
 const projectionError=boxProjectionError(p);if(projectionError)errors.push(projectionError);
 if(p.generation?.mode==='creative'&&!hasUsableCreative(p))errors.push('새 광고 결과가 아직 준비되지 않았거나 원본·규격이 변경되었습니다. AI 연결 후 현재 조건으로 생성하고 결과를 승인해주세요.');
 if(!p.product&&!isServiceCategory(p.productProfile.category))errors.push('원본 상품 사진을 먼저 추가해주세요.');
 if(!p.copy[p.locale].title.trim())errors.push('제목을 입력해주세요.');
 if(p.dimensions.visible && dimensionAxes(p.productProfile).some(a=>!/^\d+(\.\d{1,3})?$/.test(p.dimensions[a])||Number(p.dimensions[a])<=0||Number(p.dimensions[a])>100000))errors.push('규격은 0보다 크고 100,000 mm 이하인 숫자로 입력해주세요. 소수점은 세 자리까지 가능합니다.');
 return errors;
}
// Project imports are picked and validated, never executed or inserted as HTML.
export async function importProject(raw:unknown):Promise<Project> {
 if(!raw||typeof raw!=='object')throw new Error('프로젝트 파일 형식이 올바르지 않습니다.');
 const r=raw as Project;const base=newProject();
 const string=(s:unknown,max=400)=>{if(typeof s!=='string'||s.length>max)throw new Error('프로젝트의 문구 형식을 확인해주세요.');return s;};
 const asset=async (value:unknown)=>{if(value===null)return null;const a=value as Asset;if(!a||typeof a.data!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(a.data)||a.data.length>14_000_000)throw new Error('프로젝트의 사진 형식을 확인해주세요.');const response=await fetch(a.data);return imageFile(new File([await response.blob()],string(a.name,200),{type:a.data.slice(5,a.data.indexOf(';'))}));};
 if(r.version!==1||!['ko','en'].includes(r.locale)||!isImageFormat(r.format)||!['dark','light'].includes(r.ink)||!r.background||!/^#[a-fA-F0-9]{6}$/.test(r.background.color)||!Number.isFinite(r.scale)||r.scale<.5||r.scale>1||!r.dimensions||typeof r.dimensions.visible!=='boolean'||typeof r.dimensions.lines!=='boolean'||!r.copy)throw new Error('지원하지 않는 프로젝트 형식입니다.');
 const p:Project={...base,campaign:r.campaign===undefined?defaultCampaign():parseCampaign(r.campaign),referenceCheck:r.referenceCheck===undefined?defaultReferenceCheck():parseReferenceCheck(r.referenceCheck),name:string(r.name,80),productName:string(r.productName,100),productProfile:parseProfile(r.productProfile),generation:parseGeneration(r.generation),locale:r.locale,format:r.format,ink:r.ink,scale:r.scale,background:{color:r.background.color,image:await asset(r.background.image)},product:await asset(r.product)};
 for(const lang of ['ko','en'] as const){if(!r.copy[lang])throw new Error('언어별 문구가 누락되었습니다.');for(const field of ['title','description','company','contact','website'] as const)p.copy[lang][field]=string(r.copy[lang][field]);}
 for(const axis of axes){p.dimensions[axis]=string(r.dimensions[axis],20);const points=r.dimensions.anchors?.[axis];if(!Array.isArray(points)||points.length!==2||points.some(pt=>!pt||!Number.isFinite(pt.x)||!Number.isFinite(pt.y)||pt.x<0||pt.x>1||pt.y<0||pt.y>1))throw new Error('치수선 위치가 올바르지 않습니다.');p.dimensions.anchors[axis]=points.map(pt=>({x:pt.x,y:pt.y})) as [Point,Point];}
 p.dimensions.visible=r.dimensions.visible;p.dimensions.lines=r.dimensions.lines;p.conversation=parseConversation(r.conversation);p.generated=await parseGenerated(r.generated,asset);p.boxProjection=parseBoxProjection(r.boxProjection);p.publishing=parsePublishing(r.publishing);return p;
}
