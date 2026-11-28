import {omniSceneTiming,validSceneCues} from '../src/video-omni.ts';
import {validVideoDuration} from '../src/video-duration.ts';
import {validManualPrompt,validVideoShots,timedShots} from '../src/video-prompt.ts';
import {getVideoFormat} from '../src/video-formats.ts';
import {adFields,findAdField} from '../src/ad-fields.ts';
import {resolveIndustryCategory,industryLabel,industryKindFor,industryAudience,industryDirections} from '../src/industry.ts';

// BytePlus ModelArk credentials stay on the generation server.
const tasks='https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';
export function seedanceConfig(env=process.env){
  const key=env.AIADCAST_SEEDANCE_API_KEY,model=env.AIADCAST_SEEDANCE_MODEL;
  const hold=Number(env.AIADCAST_SEEDANCE_MAX_JOB_MICROS),rate=Number(env.AIADCAST_SEEDANCE_USD_PER_MILLION_TOKENS);
  if(!key||!model||!Number.isSafeInteger(hold)||hold<1||hold>100_000_000||!Number.isFinite(rate)||rate<=0)return null;
  return {key,model,hold,rate};
}
function videoIndustry(brief){
  const field=adFields.find(f=>f.kind===brief.kind&&f.id===brief.fieldId);
  const category=resolveIndustryCategory(brief.category);
  const selection=category?findAdField(category,brief.industryDetail):undefined;
  if((brief.fieldId!==undefined&&!field)||(brief.category!==undefined&&!category)
    ||(brief.industryDetail!==undefined&&(!selection||selection.field.kind!==brief.kind||selection.field.id!==field?.id))
    ||(category&&!selection&&industryKindFor(category)!==brief.kind)
    ||(field&&category&&!field.items.some(item=>item.category===category)))throw Error('INVALID_VIDEO');
  if(!field&&!category)return undefined;
  return {field:field?.ko,industry:brief.industryDetail??(category?industryLabel(category):undefined),
    audience:category?industryAudience(category):undefined,shotFocus:category?industryDirections(category)[0].description:undefined};
}
export function seedancePayload(input,model){
  const {brief,seconds,music,voice,musicStyle,voiceStyle,narration,references}=input??{};
  if(!validVideoDuration(seconds)||!brief||!['product','service'].includes(brief.kind)||
    typeof music!=='boolean'||typeof voice!=='boolean'||!Array.isArray(references)||references.length>10)throw Error('INVALID_VIDEO');
  for(const [value,max] of [[brief.title,100],[brief.description,2000],[brief.emphasis,600],[narration,3000],[musicStyle,140],[voiceStyle,140],[input.suggestedVoice??'',3000]])
    if(typeof value!=='string'||value.length>max)throw Error('INVALID_VIDEO');
  if(input.sceneCues!==undefined&&(input.pilot!=='gemini'||input.promptMode!=='auto'||!validSceneCues(input.sceneCues)))throw Error('INVALID_VIDEO');
  const manual=input.manualPrompt!==undefined;
  const hasShots=input.shots!==undefined;
  // New clients declare the selected mode. Older clients used the presence of each field.
  if(input.promptMode!==undefined&&input.promptMode!==(manual?'manual':'auto'))throw Error('INVALID_VIDEO');
  if(manual&&(!validManualPrompt(input.manualPrompt)||hasShots))throw Error('INVALID_VIDEO');
  if((hasShots||input.promptMode==='auto')&&!validVideoShots(input.shots))throw Error('INVALID_VIDEO');
  if(!references.length&&(manual?brief.kind==='product':!brief.title.trim()||!brief.description.trim()))throw Error('INVALID_VIDEO');
  let total=0;
  for(const data of references){
    if(typeof data!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(data))throw Error('INVALID_VIDEO');
    total+=data.length;
  }
  if(total>14_000_000)throw Error('INVALID_VIDEO');
  const directions={
    product:'Show the full product, move closer to its material or logo, then hold the original product framing.',
    unboxing:'Use the first reference as the closed package and later references as the reveal. Show only supplied contents, keeping the packaging and arrangement faithful.',
    presenter:brief.kind==='service'?'Use a presenter-led introduction to the service. Illustrate how it is used based on the supplied facts. Do not invent testimonials or results.':'Use a presenter-led product introduction. Show the supplied product, then close on it. Do not invent personal endorsements or experiences.',
    service:'Introduce the service, illustrate one supplied detail, and finish with the supplied closing information.',
  };
  const style=brief.style??brief.kind;
  if(!Object.hasOwn(directions,style))throw Error('INVALID_VIDEO');
  const {ratio,width,height}=getVideoFormat(input.ratio);
  // Keep the original vertical prompt so retries match existing server fingerprints.
  if(input.promptPolicy!==undefined){
    if(input.promptPolicy!=='owner-only'||!manual||input.promptMode!=='manual')throw Error('INVALID_VIDEO');
    return {model,ratio,resolution:'720p',duration:seconds,generate_audio:true,content:[
      {type:'text',text:input.manualPrompt},...references.map(url=>({type:'image_url',role:'reference_image',image_url:{url}}))]};
  }
  const orientation=width===height?'square':width>height?'landscape':'vertical';
  const sceneDirection=manual
    ? ['Follow the owner’s creative direction, including their shot sequence and timing. Leave room for app-added captions.',input.manualPrompt]
    : ['Plan a clear opening, a demonstration or service scene, and a final hold. Leave space for captions, which the app adds separately. Do not draw lettering, numbers or contact cards.',
      ...(input.shots?['Follow these owner-reviewed shot directions in order, using the timings exactly:',timedShots(input.shots,seconds,input.alignedScenes?omniSceneTiming(seconds).stops:undefined)]:[directions[style]])];
  const prompt=[
    `Create a ${orientation} commercial. Use the supplied facts and reference images only. Preserve product appearance and brand identity. Never invent prices, benefits, guarantees or contact details.`,
    ...sceneDirection,
    'Use the industry and its audience as creative context for camera shots and narration. Never treat a category or shot suggestion as a verified product feature or service benefit.',
    JSON.stringify({subject:brief.kind,industryContext:videoIndustry(brief),name:brief.title,description:brief.description,highlight:brief.emphasis}),
    music?'Generate a matching original instrumental bed below speech. '+musicStyle:'No background music.',
    voice?(narration?'Speak this Korean voice-over faithfully and naturally: '+JSON.stringify(narration):'Write a concise natural Korean voice-over to fit the duration, informed by this outline and any readable source facts. Preserve qualifications such as 최대 and verify numbers against the supplied text. Outline: '+JSON.stringify(input.suggestedVoice||''))+' '+voiceStyle:'No speech or vocals.',
  ].join('\n');
  return {model,ratio,resolution:'720p',duration:seconds,generate_audio:music||voice,content:[
    {type:'text',text:prompt},...references.map(url=>({type:'image_url',role:'reference_image',image_url:{url}}))]};
}
export async function seedanceTask(config,method,idOrPayload){
  const create=method==='POST';
  if(!create&&!/^[a-zA-Z0-9_-]{1,150}$/.test(idOrPayload))throw Error('INVALID_TASK');
  const response=await fetch(create?tasks:tasks+'/'+idOrPayload,{method,redirect:'error',signal:AbortSignal.timeout(25000),
    headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json'},...(create?{body:JSON.stringify(idOrPayload)}:{})});
  if(!response.ok)throw Error('SEEDANCE_UNAVAILABLE');
  return response.json();
}
export async function seedanceMovie(url){
  const target=new URL(url);
  if(target.protocol!=='https:'||target.username||target.password)throw Error('INVALID_RESULT');
  // The URL comes from the authenticated provider status response, never request JSON.
  const response=await fetch(target,{redirect:'error',signal:AbortSignal.timeout(60000)});
  const limit=48*1024*1024;
  if(!response.ok||!response.body||Number(response.headers.get('content-length'))>limit)throw Error('VIDEO_DOWNLOAD_FAILED');
  const parts=[];let size=0;
  for await(const bytes of response.body){size+=bytes.length;if(size>limit)throw Error('VIDEO_DOWNLOAD_FAILED');parts.push(bytes);}
  const result=Buffer.concat(parts);if(result.toString('ascii',4,8)!=='ftyp')throw Error('INVALID_RESULT');
  return result;
}
