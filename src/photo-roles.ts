import type {Asset,Project} from './model.ts';

export type PhotoRole='subject'|'style';
export const photoRole=(p:Project,hash:string):PhotoRole=>p.referenceRoles?.[hash]??'subject';
export function parsePhotoRoles(value:unknown,assets:Asset[]):Record<string,PhotoRole>|undefined{
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>10)throw Error('사진 용도를 확인해주세요.');
 const entries=Object.entries(value);
 if(entries.some(([hash,role])=>!assets.some(a=>a.sha256===hash)||!['subject','style'].includes(role)))throw Error('사진 용도와 첨부 사진이 일치하지 않습니다.');
 return Object.fromEntries(entries) as Record<string,PhotoRole>;
}
export function withPhotoRole(p:Project,hash:string,role:PhotoRole):Project{
 if(![p.product,...p.references??[]].some(a=>a?.sha256===hash)||!['subject','style'].includes(role))throw Error('사진 용도를 확인해주세요.');
 return {...p,referenceRoles:{...p.referenceRoles,[hash]:role}};
}
export function stylePhotoHashes(p:Project):string[]{
 return [p.product,...p.references??[]].filter((a):a is Asset=>!!a&&photoRole(p,a.sha256)==='style').map(a=>a.sha256);
}
export const needsPhotoPurposeServer=(p:Project,supported?:boolean)=>p.generation.mode==='creative'&&stylePhotoHashes(p).length>0&&supported!==true;
