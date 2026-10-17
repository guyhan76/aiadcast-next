import {parseAnnotation,type DimensionAnnotation} from './dimension-annotation.ts';
import type {PhotoView} from './automatic-proportion.ts';
import {parsePhotoRoles,photoRole,type PhotoRole} from './photo-roles.ts';
import {validMillimeters,type DimensionUnit} from './dimension-units.ts';
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
import {maximumReferenceBytes,maximumReferencePhotos,referenceBytes} from './reference-limits.ts';
export type Locale = 'ko' | 'en';
export type Axis = 'width' | 'depth' | 'height';
export type Point = {x:number;y:number};
export type Asset = {name:string;data:string;width:number;height:number;sha256:string};
export type Copy = {title:string;description:string;company:string;contact:string;website:string;email?:string};
export type FooterField = 'company'|'contact'|'email'|'website';
export type Project = {
 version:1;id:string;name:string;updatedAt:string;locale:Locale;format:ImageFormat;
 product:Asset|null;references?:Asset[];referenceRoles?:Record<string,PhotoRole>;footer?:Record<FooterField,boolean>;presentation?:'campaign';productName:string;productProfile:ProductProfile;generation:GenerationSettings;scale:number;
 background:{color:string;image:Asset|null};ink:'dark'|'light';
 dimensionAnnotation?:DimensionAnnotation;publishing?:Publishing;campaign?:Campaign;referenceCheck?:ReferenceCheck;conversation?:Conversation;generated?:GeneratedAsset;boxProjection?:BoxProjection;
 dimensions:{displayUnit?:DimensionUnit;width:string;depth:string;height:string;visible:boolean;lines:boolean;anchors:Record<Axis,[Point,Point]>};
 proportionViews?:{confirmed:boolean;views:Record<string,PhotoView>;resultView?:PhotoView};
 copy:Record<Locale,Copy>;
};
export function newProject():Project {
 return {version:1,id:crypto.randomUUID(),name:'새 프로젝트',updatedAt:new Date().toISOString(),locale:'ko',format:'9:16',product:null,productName:'',productProfile:defaultProfile(),generation:defaultGeneration(),scale:1,background:{color:'#f4f0e8',image:null},ink:'dark',dimensions:{width:'300',depth:'200',height:'100',visible:true,lines:false,anchors:{width:[{x:.1,y:.78},{x:.72,y:.94}],depth:[{x:.72,y:.94},{x:.94,y:.73}],height:[{x:.94,y:.73},{x:.94,y:.12}]}},copy:{ko:{title:'브랜드의 가치를,\n분명하게 전하세요.',description:'광고 문구를 입력하고\n원하는 배경과 사진으로 꾸며보세요.',company:'selluplabs',contact:'',website:''},en:{title:'Your story.\nClearly told.',description:'Tell customers what you offer.\nAdd a message that fits your brand.',company:'selluplabs',contact:'',website:''}}};
}
export const labels={ko:{width:'가로',depth:'세로',height:'높이',spec:'상품 규격'},en:{width:'Width',depth:'Depth',height:'Height',spec:'PRODUCT DIMENSIONS'}};
export const axes:Axis[]=['width','depth','height'];
export async function imageFile(file:File):Promise<Asset> {
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('PNG, JPG, WebP 사진을 선택해주세요.');
 if(file.size>maximumReferenceBytes)throw new Error('사진은 10 MB 이하로 추가해주세요.');
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
 if(p.generation?.mode==='creative'&&!hasUsableCreative(p))errors.push('새 광고 결과가 아직 준비되지 않았거나 원본·규격·문구·연락처가 변경되었습니다. AI 연결 후 현재 조건으로 생성하고 결과를 승인해주세요.');
 if(!p.product&&!isServiceCategory(p.productProfile.category))errors.push('원본 상품 사진을 먼저 추가해주세요.');
 if(p.generation.mode==='original'&&p.product&&photoRole(p,p.product.sha256)==='style')errors.push('실사 그대로 사용하려면 실제 상품·공간 사진을 대표로 지정해주세요.');
 if(!p.copy[p.locale].title.trim())errors.push('제목을 입력해주세요.');
 if(p.dimensions.visible && dimensionAxes(p.productProfile).some(a=>!validMillimeters(p.dimensions[a])))errors.push('규격은 0보다 크고 100,000 mm 이하인 숫자로 입력해주세요.');
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
 p.references=[];if(r.references!==undefined){if(!Array.isArray(r.references)||r.references.length>9)throw Error('참조사진은 최대 10장입니다.');for(const ref of r.references){const a=await asset(ref);if(!a)throw Error('참조사진을 확인해주세요.');p.references.push(a);}}
 validateReferences(p);
 p.referenceRoles=parsePhotoRoles(r.referenceRoles,referenceAssets(p));
 if(r.proportionViews!==undefined){const v=r.proportionViews;if(!v||typeof v.confirmed!=='boolean'||!v.views||Array.isArray(v.views)||Object.keys(v.views).length>10||(v.resultView!==undefined&&!['unconfirmed','front','side','top','perspective'].includes(v.resultView))||Object.entries(v.views).some(([hash,view])=>!referenceAssets(p).some(a=>a.sha256===hash)||!['unconfirmed','front','side','top','perspective'].includes(view)))throw Error('사진 촬영면 정보를 확인해주세요.');p.proportionViews={confirmed:v.confirmed,views:{...v.views},...(v.resultView?{resultView:v.resultView}:{})};}
 if(r.footer!==undefined){if(!r.footer||typeof r.footer!=='object'||['company','contact','email','website'].some(k=>typeof r.footer![k as FooterField]!=='boolean'))throw Error('하단 표시 설정을 확인해주세요.');p.footer={company:r.footer.company,contact:r.footer.contact,email:r.footer.email,website:r.footer.website};}
 if(r.presentation==='campaign')p.presentation='campaign';
 for(const lang of ['ko','en'] as const)if(r.copy[lang].email!==undefined)p.copy[lang].email=string(r.copy[lang].email,100);
 if(r.dimensions.displayUnit!==undefined){if(!['cm','mm','inch'].includes(r.dimensions.displayUnit))throw Error('규격 단위를 확인해주세요.');p.dimensions.displayUnit=r.dimensions.displayUnit;}
 p.dimensions.visible=r.dimensions.visible;p.dimensions.lines=r.dimensions.lines;p.conversation=parseConversation(r.conversation);p.generated=await parseGenerated(r.generated,asset);p.boxProjection=parseBoxProjection(r.boxProjection);p.publishing=parsePublishing(r.publishing);p.dimensionAnnotation=parseAnnotation(r.dimensionAnnotation);return p;
}

export const referenceAssets=(p:Project):Asset[]=>[...(p.product?[p.product]:[]),...(p.references??[])];
export function validateReferences(p:Project){
 const assets=referenceAssets(p);
 if(assets.length>maximumReferencePhotos||(!p.product&&assets.length))throw Error('참조사진은 대표 사진을 포함해 최대 10장입니다.');
 if(new Set(assets.map(a=>a.sha256)).size!==assets.length)throw Error('같은 사진이 중복되어 있습니다.');
 if(referenceBytes(assets)>maximumReferenceBytes)throw Error('참조사진 전체 용량은 10 MB 이하로 선택해주세요.');
}
export function withReferences(p:Project,assets:Asset[]):Project{
 const next={...p,product:assets[0]??null,references:assets.slice(1),...(p.proportionViews?{proportionViews:{confirmed:p.proportionViews.confirmed,views:Object.fromEntries(Object.entries(p.proportionViews.views).filter(([hash])=>assets.some(a=>a.sha256===hash)))}}:{})};validateReferences(next);
 if(p.referenceRoles)next.referenceRoles=Object.fromEntries(Object.entries(p.referenceRoles).filter(([hash])=>assets.some(a=>a.sha256===hash)));
 if(next.product?.sha256!==p.product?.sha256&&next.boxProjection)next.boxProjection={...next.boxProjection,confirmedSourceHash:null,markedCorners:[]};
 return next;
}
export const footerVisible=(p:Project,field:FooterField)=>p.footer?.[field]??true;

