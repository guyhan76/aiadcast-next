import {imageFile,referenceAssets,withReferences} from './model.ts';
import type {Asset,Project} from './model.ts';
import {maximumReferenceBytes,maximumReferencePhotos,referenceBytes} from './reference-limits.ts';

export type ReferenceImportIssue={name:string;code:'count'|'file-size'|'total-size'|'duplicate'|'invalid';message:string};
export async function importReferenceFiles(project:Project,files:readonly File[],readImage:(file:File)=>Promise<Asset>=imageFile){
 const assets=[...referenceAssets(project)],initialCount=assets.length;
 const issues:ReferenceImportIssue[]=[];
 for(const file of files){
  const reject=(code:ReferenceImportIssue['code'],message='')=>issues.push({name:file.name,code,message});
  if(assets.length>=maximumReferencePhotos){reject('count');continue;}
  if(file.size>maximumReferenceBytes){reject('file-size');continue;}
  // Do not read/decode large files that cannot fit. Keep all accepted bytes
  // untouched: no hidden resizing, lossy recompression or changes to print.
  if(file.size+referenceBytes(assets)>maximumReferenceBytes){reject('total-size');continue;}
  try{
   const asset=await readImage(file);
   if(assets.some(a=>a.sha256===asset.sha256)){reject('duplicate');continue;}
   if(referenceBytes([...assets,asset])>maximumReferenceBytes){reject('total-size');continue;}
   withReferences(project,[...assets,asset]);
   assets.push(asset);
  }catch(error){reject('invalid',error instanceof Error?error.message:'파일을 읽지 못했습니다.');}
 }
 return {assets,addedCount:assets.length-initialCount,issues};
}
