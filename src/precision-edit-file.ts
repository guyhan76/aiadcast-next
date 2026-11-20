import {exportErrors,importProject,type Asset,type Project} from './model';
import {getImageFormat} from './formats';
import {render} from './render';
import {renderTextLayers} from './text-layers';
import {aiDimensionRequested,aiDimensionReviewError} from './ai-dimension-display';
import {manualBaseExport} from './dimension-annotation';
import {isTextExample} from './generation-input';

export type EditInput={file?:File;data?:string;asset?:Asset;name?:string};

async function canvasInput(canvas:HTMLCanvasElement,name:string):Promise<EditInput>{
 const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('BACKUP_IMAGE')),'image/png'));
 return {file:new File([png],name+'.png',{type:'image/png'}),name};
}

export async function projectEditInput(project:Project):Promise<EditInput>{
 const name=project.name||project.productName||'aiadcast';
 const useAsset=(asset:Asset):EditInput=>({name,asset});
 const text=project.textEdit;
 if(text){
  if(!text.layers.length)return useAsset(text.source);
  if(text.source.width*text.source.height>8294400)throw Error('ORIGINAL_SIZE');
  const canvas=document.createElement('canvas');
  await renderTextLayers(canvas,text.source,text.layers);
  return canvasInput(canvas,name);
 }
 const generated=project.generated;
 if(aiDimensionRequested(project)&&generated&&aiDimensionReviewError(project))throw Error('BACKUP_REVIEW');
 if(generated?.composition==='complete-ad'){
  const format=getImageFormat(project.format),image=generated.asset;
  const hasLayers=project.exactTextVersion||project.dimensionControl||isTextExample(project)||project.dimensionAnnotation&&project.dimensionAnnotation.mode!=='none';
  if(!hasLayers&&(generated.editParent||format.width*image.height===format.height*image.width))return useAsset(image);
 }
 const manualBase=manualBaseExport(project);
 // Use the same composition as the saved advertisement, including local text and dimensions.
 const needsComposition=!!generated||!!project.dimensionControl||project.generation.mode==='original'&&!!(project.product||project.background.image);
 if(needsComposition&&!exportErrors(project,manualBase).length){
  const canvas=document.createElement('canvas');
  if(!(await render(canvas,project,undefined,manualBase)).length)return canvasInput(canvas,name);
 }
 if(generated||project.dimensionControl)throw Error('BACKUP_IMAGE');
 // A photo-only draft has no finished ad. Open the primary photograph at its own resolution.
 const photo=project.product??project.background.image;
 if(photo)return useAsset(photo);
 throw Error('BACKUP_EMPTY');
}

export async function precisionFileInput(file:File):Promise<EditInput>{
 if(file.type==='application/json'||/\.json$/i.test(file.name)){
  if(file.size>30*1024*1024)throw Error('BACKUP_SIZE');
  let project:Project;
  try{project=await importProject(JSON.parse(await file.text()));}catch{throw Error('BACKUP_INVALID');}
  return projectEditInput(project);
 }
 // Some document pickers return a generic MIME type for an image with a valid extension.
 if(!file.type||file.type==='application/octet-stream'){
  const extension=file.name.split('.').at(-1)?.toLowerCase();
  const mime=extension==='png'?'image/png':extension==='webp'?'image/webp':extension==='jpg'||extension==='jpeg'?'image/jpeg':undefined;
  if(mime)return {file:new File([file],file.name,{type:mime})};
 }
 return {file};
}
