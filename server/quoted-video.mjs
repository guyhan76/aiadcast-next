import {geminiOmni} from './gemini-omni-video.mjs';
import {commercialDirection,excludesPour} from '../src/video-commercial-direction.ts';
import {openingReference} from './video-photo-opening.mjs';
import {framingRule,lattePreparation} from '../src/video-subject-framing.ts';
import {formatBeats} from '../src/video-format-direction.ts';
import {higgsfieldModel,higgsfieldKey,higgsfieldInput,uploadHiggsfieldImages,estimateHiggsfield,submitHiggsfield,pollHiggsfield} from './higgsfield-video.mjs';
import {topviewModel,legacyTopviewModel,legacyTopviewInput,topviewKey,topviewCleanFramePlan,wanCutPlan,wanOpeningPlan,wanProductHookPlan,wanHookToActionPlan,wanReviewedBriefPlan,topviewInput,uploadTopviewImages,estimateTopview,submitTopview,pollTopview} from './topview-video.mjs';

// Keep v5 and older quote inputs stable when a stored job is replayed.
function formatReviewedPlan(plan,body,preparationDirection) {
  const reviewed = wanReviewedBriefPlan(plan,body,preparationDirection);
  if (!body?.shots || body.manualPrompt !== undefined) return reviewed;
  const [direction,...media] = reviewed.content;
  const format = formatBeats(body.brief,'en').join(' ');
  const guidance = 'Selected format, within the approved shots only: '+format+
    ' The approved opening, timings, casting exclusions and ending take priority. Do not add a scene or lettering.';
  return {...reviewed,content:[{...direction,text:direction.text+'\n'+guidance},...media]};
}

function subjectReviewedPlan(plan,body) {
  if (!body?.brief || body.manualPrompt !== undefined) return formatReviewedPlan(plan,body);
  const pour = lattePreparation(body.brief,'en')?.join(' ') ?? '';
  const formatted = formatReviewedPlan(plan,body,pour);
  const [direction,...media] = formatted.content;
  const rules = [framingRule(body.brief,'en'), body.shots ? '' : pour].filter(Boolean);
  if (!rules.length) return formatted;
  return {...formatted,content:[{...direction,text:[direction.text,...rules].join('\n')},...media]};
}

const providers={
  topview:{preparePlan:subjectReviewedPlan,model:topviewModel,revision:'topview/'+topviewModel+'/subject-framing-v7',key:topviewKey,input:topviewInput,upload:uploadTopviewImages,estimate:estimateTopview,submit:submitTopview,poll:pollTopview},
  higgsfield:{model:higgsfieldModel,revision:'higgsfield/'+higgsfieldModel,key:higgsfieldKey,input:higgsfieldInput,upload:uploadHiggsfieldImages,estimate:estimateHiggsfield,submit:submitHiggsfield,poll:pollHiggsfield}
};
const formatWan = {...providers.topview,revision:'topview/'+topviewModel+'/format-brief-v6',preparePlan:formatReviewedPlan};
const reviewedWan = {...providers.topview,revision:'topview/'+topviewModel+'/reviewed-brief-v5',preparePlan:wanReviewedBriefPlan};
const hookToActionWan = {...providers.topview,revision:'topview/'+topviewModel+'/hook-cta-v4',preparePlan:wanHookToActionPlan};
const productHookWan = {...providers.topview,revision:'topview/'+topviewModel+'/product-hook-v3',preparePlan:wanProductHookPlan};
const openingWan = {...providers.topview, revision:'topview/'+topviewModel+'/opening-v2', preparePlan:wanOpeningPlan};
const firstCutWan = {...providers.topview, revision:'topview/'+topviewModel+'/cuts-v1', preparePlan:wanCutPlan};
const originalWan = {...providers.topview, revision:'topview/'+topviewModel, preparePlan:topviewCleanFramePlan};
const legacyTopview = {...originalWan, model:legacyTopviewModel, revision:legacyTopviewModel, input:legacyTopviewInput};


const photoWan = {
  ...providers.topview,
  revision:'topview/'+topviewModel+'/photo-opening-v8',
  preparePlan(plan,body) {
    const reviewed=subjectReviewedPlan(plan,body);
    if (!body?.shots || body.manualPrompt!==undefined || body.brief?.kind!=='product' ||
        (body.brief.style??'product')!=='product' || reviewed.content.length<2) return reviewed;
    const [direction,...media]=reviewed.content;
    const text=direction.text+'\nStage the reviewed photo-based opening. Keep the actual product details recognizable from the first visible change into the final product shot. Reference screenshots supply food or object appearance only; omit app controls.';
    const layout=body.frameLayout;
    return {...reviewed,content:[{...direction,text},...media],
      ...(layout && ['crop','layers'].includes(layout.mode) && media.length<10 ? {frameLayout:layout} : {})};
  },
  async upload(key,content,plan) {
    if (!plan?.frameLayout) return uploadTopviewImages(key,content);
    const refs=content.slice(1).map(item=>item.image_url.url);
    const guide=await openingReference(plan.frameLayout,refs,plan.ratio);
    if (!guide) return uploadTopviewImages(key,content);
    return uploadTopviewImages(key,[...content,{image_url:{url:guide}}]);
  },
  input(plan,urls) {
    const payload=topviewInput(plan,urls);
    if (plan.frameLayout && urls.length===plan.content.length) {
      payload.input.input.prompt+='\nThe LAST reference is a composition guide for the opening only. Render those details in the original product lighting and move immediately. The preceding photos establish true appearance and the finished product.';
    }
    return payload;
  }
};

const commercialWan = {
  ...photoWan, revision:'topview/'+topviewModel+'/commercial-v9',
  preparePlan(plan,body) {
    if (!body?.brief || body.manualPrompt!==undefined || !body.shots) return photoWan.preparePlan(plan,body);
    let reviewed=photoWan.preparePlan(plan,body);
    if(excludesPour(body.brief)){
      reviewed=formatReviewedPlan(plan,body,'');
      const [direction,...images]=reviewed.content;
      reviewed={...reviewed,content:[{...direction,text:direction.text+'\n'+framingRule(body.brief,'en')},...images]};
    }
    const [direction,...images]=reviewed.content;
    const layout=body.frameLayout;
    const useLayout=body.brief.kind==='product' && images.length>0 && images.length<10 &&
      (layout?.mode==='crop'||(layout?.mode==='layers' && body.brief.style!=='presenter'));
    return {...reviewed,content:[{...direction,text:direction.text+'\n'+commercialDirection(body.brief)},...images],
      ...(useLayout?{frameLayout:layout}:{})};
  },
  input(plan,urls) {
    if(plan.frameLayout?.mode==='crop' && plan.content.length===2 && urls.length===2){
      const payload=topviewInput(plan,[]);
      payload.modelKey=topviewModel+'/image-to-video';
      payload.input.input.media=[{type:'first_frame',url:urls[1]}];
      return payload;
    }
    return photoWan.input(plan,urls);
  }
};

export function quotedVideoProvider(name, savedRevision){
  if(name==='gemini' && (!savedRevision || savedRevision===geminiOmni.revision)) return {...geminiOmni,preparePlan:(plan,body)=>body.manualPrompt!==undefined?plan:commercialWan.preparePlan(plan,body)};
  if(name==='topview' && (!savedRevision || savedRevision===commercialWan.revision)) return commercialWan;
  if(name==='topview' && savedRevision===photoWan.revision) return photoWan;
  if(name==='topview' && savedRevision===formatWan.revision) return formatWan;
  if(name==='topview' && savedRevision===reviewedWan.revision) return reviewedWan;
  if(name==='topview' && savedRevision===legacyTopviewModel) return legacyTopview;
  if(name==='topview' && savedRevision===hookToActionWan.revision) return hookToActionWan;
  if(name==='topview' && savedRevision===productHookWan.revision) return productHookWan;
  if(name==='topview' && savedRevision===openingWan.revision) return openingWan;
  if(name==='topview' && savedRevision===firstCutWan.revision) return firstCutWan;
  if(name==='topview' && savedRevision===originalWan.revision) return originalWan;
  return Object.hasOwn(providers,name)?providers[name]:null;
}
