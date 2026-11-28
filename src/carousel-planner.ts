import {apiRequest,ApiRequestFailure} from './generation-client';
import {dimensionInputHash} from './ai-dimension-display';
import {betaSession} from './beta-session';
import {photoRole} from './photo-roles';
import {loadImage,referenceAssets,type Project} from './model';
import {referenceJpeg} from './reference-jpeg';
import {creativeSettings} from './creative';
import {validStoryPlan,isCarouselCount,carouselCount} from './story-carousel';

export async function planCarousel(project:Project){
  const count=project.requestedImageCount??carouselCount;
  if(!isCarouselCount(count))throw Error('INVALID_IMAGE_COUNT');
  const brief=[project.productName,project.productProfile.industryDetail,project.productProfile.material,creativeSettings(project).note].filter(Boolean).join('\n');
  const subject=referenceAssets(project).find(asset=>photoRole(project,asset.sha256)!=='style');
  const photo=subject?referenceJpeg(await loadImage(subject.data),448):undefined;
  const input={kind:'carousel-plan',targetLocale:project.locale,count,brief,photo};
  const key='aiadcast.carousel.'+await dimensionInputHash(JSON.stringify([betaSession()?.user.id,project.id,input]));
  const requestId=sessionStorage.getItem(key)??crypto.randomUUID();
  sessionStorage.setItem(key,requestId);
  const result=await apiRequest<{requestId:string;plan:unknown}>('/api/assistant',{...input,requestId},AbortSignal.timeout(65_000)).catch(error=>{
    if(error instanceof ApiRequestFailure && error.code==='PROVIDER_RATE_LIMITED' && sessionStorage.getItem(key)===requestId)sessionStorage.removeItem(key);
    throw error;
  });
  if(result.requestId!==requestId||!validStoryPlan(result.plan,count))throw Error('INVALID_STORY_PLAN');
  return result.plan;
}
