import {formatBeats} from '../src/video-format-direction.ts';
import {higgsfieldModel,higgsfieldKey,higgsfieldInput,uploadHiggsfieldImages,estimateHiggsfield,submitHiggsfield,pollHiggsfield} from './higgsfield-video.mjs';
import {topviewModel,legacyTopviewModel,legacyTopviewInput,topviewKey,topviewCleanFramePlan,wanCutPlan,wanOpeningPlan,wanProductHookPlan,wanHookToActionPlan,wanReviewedBriefPlan,topviewInput,uploadTopviewImages,estimateTopview,submitTopview,pollTopview} from './topview-video.mjs';

// Keep v5 and older quote inputs stable when a stored job is replayed.
function formatReviewedPlan(plan,body) {
  const reviewed = wanReviewedBriefPlan(plan,body);
  if (!body?.shots || body.manualPrompt !== undefined) return reviewed;
  const [direction,...media] = reviewed.content;
  const format = formatBeats(body.brief,'en').join(' ');
  const guidance = 'Selected format, within the approved shots only: '+format+
    ' The approved opening, timings, casting exclusions and ending take priority. Do not add a scene or lettering.';
  return {...reviewed,content:[{...direction,text:direction.text+'\n'+guidance},...media]};
}

const providers={
  topview:{preparePlan:formatReviewedPlan,model:topviewModel,revision:'topview/'+topviewModel+'/format-brief-v6',key:topviewKey,input:topviewInput,upload:uploadTopviewImages,estimate:estimateTopview,submit:submitTopview,poll:pollTopview},
  higgsfield:{model:higgsfieldModel,revision:'higgsfield/'+higgsfieldModel,key:higgsfieldKey,input:higgsfieldInput,upload:uploadHiggsfieldImages,estimate:estimateHiggsfield,submit:submitHiggsfield,poll:pollHiggsfield}
};
const reviewedWan = {...providers.topview,revision:'topview/'+topviewModel+'/reviewed-brief-v5',preparePlan:wanReviewedBriefPlan};
const hookToActionWan = {...providers.topview,revision:'topview/'+topviewModel+'/hook-cta-v4',preparePlan:wanHookToActionPlan};
const productHookWan = {...providers.topview,revision:'topview/'+topviewModel+'/product-hook-v3',preparePlan:wanProductHookPlan};
const openingWan = {...providers.topview, revision:'topview/'+topviewModel+'/opening-v2', preparePlan:wanOpeningPlan};
const firstCutWan = {...providers.topview, revision:'topview/'+topviewModel+'/cuts-v1', preparePlan:wanCutPlan};
const originalWan = {...providers.topview, revision:'topview/'+topviewModel, preparePlan:topviewCleanFramePlan};
const legacyTopview = {...originalWan, model:legacyTopviewModel, revision:legacyTopviewModel, input:legacyTopviewInput};

export function quotedVideoProvider(name, savedRevision){
  if(name==='topview' && savedRevision===reviewedWan.revision) return reviewedWan;
  if(name==='topview' && savedRevision===legacyTopviewModel) return legacyTopview;
  if(name==='topview' && savedRevision===hookToActionWan.revision) return hookToActionWan;
  if(name==='topview' && savedRevision===productHookWan.revision) return productHookWan;
  if(name==='topview' && savedRevision===openingWan.revision) return openingWan;
  if(name==='topview' && savedRevision===firstCutWan.revision) return firstCutWan;
  if(name==='topview' && savedRevision===originalWan.revision) return originalWan;
  return Object.hasOwn(providers,name)?providers[name]:null;
}
