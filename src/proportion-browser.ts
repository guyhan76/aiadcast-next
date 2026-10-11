import {detectSilhouette,assessView,summarizeViews} from './automatic-proportion';
import {loadImage,referenceAssets,type Asset,type Project} from './model';
export async function analysePhoto(asset:Asset){const image=await loadImage(asset.data),fit=Math.min(1,512/image.naturalWidth,512/image.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*fit);canvas.height=Math.round(image.naturalHeight*fit);const c=canvas.getContext('2d',{willReadFrequently:true})!;c.drawImage(image,0,0,canvas.width,canvas.height);return detectSilhouette(c.getImageData(0,0,canvas.width,canvas.height));}
export async function preflightProportions(project:Project){
 const settings=project.proportionViews;if(!settings?.confirmed||project.productProfile.specType==='none')return null;
 const dimensions={width:Number(project.dimensions.width),depth:Number(project.dimensions.depth),height:Number(project.dimensions.height)};
 const rows=await Promise.all(referenceAssets(project).map(async p=>assessView(await analysePhoto(p),settings.views[p.sha256]??'unconfirmed',dimensions,true)));
 return summarizeViews(rows,project.productProfile.specType);
}
