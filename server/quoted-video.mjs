import {higgsfieldModel,higgsfieldKey,higgsfieldInput,uploadHiggsfieldImages,estimateHiggsfield,submitHiggsfield,pollHiggsfield} from './higgsfield-video.mjs';
import {topviewModel,legacyTopviewModel,legacyTopviewInput,topviewKey,topviewCleanFramePlan,wanCutPlan,topviewInput,uploadTopviewImages,estimateTopview,submitTopview,pollTopview} from './topview-video.mjs';

const providers={
  topview:{preparePlan:wanCutPlan,model:topviewModel,revision:'topview/'+topviewModel+'/cuts-v1',key:topviewKey,input:topviewInput,upload:uploadTopviewImages,estimate:estimateTopview,submit:submitTopview,poll:pollTopview},
  higgsfield:{model:higgsfieldModel,revision:'higgsfield/'+higgsfieldModel,key:higgsfieldKey,input:higgsfieldInput,upload:uploadHiggsfieldImages,estimate:estimateHiggsfield,submit:submitHiggsfield,poll:pollHiggsfield}
};
const originalWan = {...providers.topview, revision:'topview/'+topviewModel, preparePlan:topviewCleanFramePlan};
const legacyTopview = {...originalWan, model:legacyTopviewModel, revision:legacyTopviewModel, input:legacyTopviewInput};

export function quotedVideoProvider(name, savedRevision){
  if(name==='topview' && savedRevision===legacyTopviewModel) return legacyTopview;
  if(name==='topview' && savedRevision===originalWan.revision) return originalWan;
  return Object.hasOwn(providers,name)?providers[name]:null;
}
