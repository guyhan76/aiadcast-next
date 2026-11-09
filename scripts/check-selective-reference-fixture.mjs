// Offline evidence check. No API request, credential read or quality approval.
// Usage: node --experimental-strip-types scripts/check-selective-reference-fixture.mjs
//   [--preview new-preview.png] original.png candidate.png reference1.jpg ...
import {readFileSync,writeFileSync} from 'node:fs';
import {basename} from 'node:path';
import sharp from 'sharp';
import {hashBytes,validateImage,IMAGE_MODEL} from '../server/openai-image-adapter.mjs';
import {prepareSelectiveEdit,prepareSelectiveProviderInput,selectiveEditForm,compositeSelectiveEdit} from '../server/selective-image-edit.mjs';
const args=process.argv.slice(2),previewPath=args[0]==='--preview'?args.splice(0,2)[1]:null;
const [originalPath,candidatePath,...referencePaths]=args;
if(!originalPath||!candidatePath||!referencePaths.length)throw Error('Supply original, candidate and actual-product reference paths');
async function load(path){
 const bytes=readFileSync(path),meta=await sharp(bytes).metadata(),mime={png:'image/png',jpeg:'image/jpeg',webp:'image/webp'}[meta.format];
 return {...await validateImage(bytes,mime),bytes};
}
const original=await load(originalPath),candidate=await load(candidatePath),references=await Promise.all(referencePaths.map(load));
// Inspection bounds of this supplied single-shoe ad only. Not automatic segmentation
// or a quality-approved mask: inspect the exported shoe/copy boundary before use.
if(original.width!==941||original.height!==1672||candidate.width!==941||candidate.height!==1672)throw Error('Fixture requires reviewed 941x1672 advertisement');
const w=original.width,h=original.height,raw=Buffer.alloc(w*h*4,255);
const polygon=[[130,996],[318,944],[383,880],[492,773],[550,704],[620,705],[686,776],[756,782],[795,744],[858,747],[900,827],[920,1095],[900,1138],[130,1138]];
function inside(x,y){let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
 const [xi,yi]=polygon[i],[xj,yj]=polygon[j];if(((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)yes=!yes;
}return yes;}
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 // Preserve all feature-copy pixels even at the shoe edge.
 if(inside(x+.5,y+.5)&&!(x<380&&y<958))raw[(y*w+x)*4+3]=0;
}
const maskBytes=await sharp(raw,{raw:{width:w,height:h,channels:4}}).png().toBuffer();
const prepared=await prepareSelectiveEdit({...original,dataUrl:`data:image/png;base64,${original.bytes.toString('base64')}`},{width:w,height:h,sha256:hashBytes(maskBytes),data:`data:image/png;base64,${maskBytes.toString('base64')}`});
const provider=await prepareSelectiveProviderInput({...prepared,references,model:IMAGE_MODEL});
const form=selectiveEditForm({...provider,model:IMAGE_MODEL,prompt:'Correct only the selected shoe using the actual product photographs.'});
const a=await sharp(original.bytes).ensureAlpha().raw().toBuffer(),b=await sharp(candidate.bytes).ensureAlpha().raw().toBuffer();
let changedOutsideBefore=0;
for(let i=0;i<a.length;i+=4)if(raw[i+3]===255&&!a.subarray(i,i+4).equals(b.subarray(i,i+4)))changedOutsideBefore++;
const result=await compositeSelectiveEdit(prepared.source,prepared.mask,candidate,original.sha256);
// Explicit inspection copy only. Never overwrite source, candidate or prior evidence.
if(previewPath)writeFileSync(previewPath,result.bytes,{flag:'wx'});
console.log(JSON.stringify({
 version:1,execution:'offline-existing-image-fixture',providerCalls:0,semanticQuality:'not-assessed',visualApproval:false,
 original:{file:basename(originalPath),sha256:original.sha256,width:w,height:h},candidate:{file:basename(candidatePath),sha256:candidate.sha256},
 references:references.map((r,i)=>({file:basename(referencePaths[i]),sha256:r.sha256,width:r.width,height:r.height,mime:r.mime})),
 multipart:{images:form.getAll('image[]').length,firstImageIsAdvertisement:Buffer.from(await form.getAll('image[]')[0].arrayBuffer()).equals(provider.source.bytes),maskIsAdvertisementMask:Buffer.from(await form.get('mask').arrayBuffer()).equals(provider.mask.bytes),referencesUnchanged:await Promise.all(form.getAll('image[]').slice(1).map(async(file,i)=>Buffer.from(await file.arrayBuffer()).equals(references[i].bytes)))},
 rawCandidateChangedOutsideSelection:changedOutsideBefore,preservation:result.preservation,
 originalFileUnchanged:hashBytes(readFileSync(originalPath))===original.sha256,
 preview:previewPath?{file:basename(previewPath),sha256:result.sha256,reviewRequired:true}:null,
 limitations:['Fixture-specific mask is not automatic segmentation or a visual quality approval.',previewPath?'Composite exported only for visual inspection, not approved as an advertisement.':'Composite bytes are checked in memory, not exported or approved as an advertisement.','No live masked API, ledger settlement, production database or Android execution.']
},null,2));
