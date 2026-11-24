import {submissionStage} from './submission-observation.mjs';

const api = 'https://platform-backend.topview.ai/api/v1';
export const topviewModel = 'alibaba/wan-3.0';
export const legacyTopviewModel = 'topview/topview-t1';
export function topviewKey(env = process.env) {
  const key = env.TOPVIEW_API_PLATFORM_KEY?.trim();
  return key && /^[\x21-\x7e]+$/.test(key) ? key : null;
}

async function request(key, path, body, replayKey, probe = false) {
  const headers = {Authorization: 'Bearer ' + key};
  const form = body instanceof FormData;
  if (body && !form) headers['Content-Type'] = 'application/json';
  if (replayKey) headers['Idempotency-Key'] = replayKey;
  const response = await fetch(api + path, {method: body ? 'POST' : 'GET', headers, redirect:'error',
    body: form ? body : JSON.stringify(body), signal:AbortSignal.timeout(30000)});
  if (!response.ok) {
    const retryAfter=response.headers.get('retry-after');
    const seconds=retryAfter===null ? 0 : Number(retryAfter);
    const retryMs=Number.isFinite(seconds) ? Math.max(0,seconds*1000) : Math.max(0,Date.parse(retryAfter)-Date.now()) || 0;
    let diagnostic;
    if (probe) {
      const detail = await response.json().catch(()=>({}));
      // Only for the fixed synthetic quote. Never put provider URLs or credentials into logs.
      const reason = String(detail.message ?? detail.error?.message ?? '').replace(/https?:\/\/\S+/gi,'[url]').replace(/[a-zA-Z0-9_=-]{24,}/g,'[id]').slice(0,200);
      diagnostic = {code:typeof detail.code==='number'?detail.code:undefined,reason};
    }
    throw Object.assign(Error('TOPVIEW_UNAVAILABLE'), {providerStatus:response.status,retryMs,diagnostic});
  }
  const {data} = await response.json();
  if (!data || typeof data !== 'object') throw Error('INVALID_PROVIDER_RESPONSE');
  return data;
}

// Only reference preparation and quotes are eligible; a prediction is never retried here.
async function preflight(operation, action) {
  for (let attempt=1; ; attempt++) {
    try { return await action(); }
    catch (error) {
      const status=error.providerStatus;
      const network=error.name==='TimeoutError'||(error instanceof TypeError&&error.message==='fetch failed');
      const transient=network||[408,429,500,502,503,504].includes(status);
      const delay=Math.max(800,error.retryMs||0);
      if(attempt===1&&transient&&delay<=3000) {
        await new Promise(resolve=>setTimeout(resolve,delay));
        continue;
      }
      console.warn('Topview video preflight:',JSON.stringify({operation,httpStatus:status??null,attempt,network}));
      const code=status===413?'VIDEO_REFERENCE_SIZE':
        operation==='upload'&&[400,415,422].includes(status)?'VIDEO_REFERENCE_FORMAT':
        operation==='quote'&&[400,415,422].includes(status)?'VIDEO_PROVIDER_INPUT':
        status===429?'VIDEO_PROVIDER_LIMIT':status===423?'VIDEO_PROVIDER_PAUSED':null;
      if(code)error.videoPreflightCode=code;
      throw error;
    }
  }
}

function mediaUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw Error('INVALID_PROVIDER_URL');
  return url.href;
}

// Prepare a provider copy only when WAN cannot accept the original dimensions or PNG alpha.
async function wanImage(bytes, type) {
  const {default:sharp} = await import('sharp');
  try {
    const image = sharp(bytes,{limitInputPixels:40_000_000});
    const metadata = await image.metadata();
    const {width,height} = metadata.autoOrient ?? metadata;
    const {format,hasAlpha} = metadata;
    const short = Math.min(width,height), long = Math.max(width,height);
    if (short >= 240 && long <= 8000 && long <= 8*short && !(format==='png' && hasAlpha)) {
      return {bytes,type};
    }
    const scale = Math.min(8000/long,Math.max(1,240/short));
    const w = Math.round(width*scale), h = Math.round(height*scale);
    const targetWidth = Math.max(w,240,Math.ceil(h/8));
    const targetHeight = Math.max(h,240,Math.ceil(w/8));
    const normalized = await image.autoOrient().resize({
      width:targetWidth,height:targetHeight,fit:'contain',background:'white'
    }).flatten({background:'white'}).jpeg({quality:90}).toBuffer();
    return {bytes:normalized,type:'image/jpeg'};
  } catch {
    throw Object.assign(Error('INVALID_IMAGE'), {videoPreflightCode:'VIDEO_REFERENCE_FORMAT'});
  }
}

export async function uploadTopviewImages(key, content) {
  submissionStage('video_reference_upload');
  return Promise.all(content.slice(1).map(async ({image_url}) => {
    const [,type,encoded] = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image_url.url) || [];
    if (!encoded) throw Error('INVALID_IMAGE');
    const media = await wanImage(Buffer.from(encoded,'base64'),type);
    const form = new FormData();
    form.set('kind','image');
    form.set('file',new Blob([media.bytes],{type:media.type}),'reference.' + media.type.slice(6));
    return preflight('upload',async()=>mediaUrl((await request(key,'/media/files',form)).download_url));
  }));
}

// This affects generated pixels only. The user's shot, casting and audio directions stay intact.
export function topviewCleanFramePlan(plan){
  const [direction,...media]=plan.content;
  const frameRule='Frame text: Keep the filmed scene edge to edge through the very last frame. Any space requested for a later caption or price must show natural scenery, with no banner, white strip or card. Never invent or imitate text, pseudo-letters, numbers, prices, currency, watermarks or graphic overlays. Do not animate text or a price panel from a reference poster into the shot. Preserve real product markings visible on the garment or object. Only show an overlay if the user explicitly supplied the exact wording and asked for it to appear in the picture; omit it if it cannot be reproduced exactly.';
  return {...plan,content:[{...direction,text:direction.text+'\n\n'+frameRule},...media]};
}

export function topviewInput(plan, urls) {
  const mode = urls.length ? 'reference-to-video' : 'text-to-video';
  const input = {prompt:plan.content[0].text};
  if (urls.length) input.media = urls.map(url => ({type:'reference_image', url}));
  return {modelKey:`${topviewModel}/${mode}`, input:{input, parameters:{
    ratio:plan.ratio, resolution:plan.resolution.toUpperCase(), duration:plan.duration, audio:plan.generate_audio
  }}};
}

// Existing T1 jobs replay the original request body and idempotency key after a timeout.
export function legacyTopviewInput(plan, urls) {
  const modelKey = legacyTopviewModel + (urls.length ? '/omni-reference-to-video' : '/text-to-video');
  const {ratio,resolution,duration,generate_audio} = plan;
  return {modelKey,input:{ratio,resolution,duration,generate_audio,content:[
    plan.content[0], ...urls.map(url=>({type:'image_url',role:'reference_image',image_url:{url}}))]}};
}

function usdMicros(amount) {
  if (!/^\d+(?:\.\d+)?$/.test(String(amount))) throw Error('INVALID_BILLING_AMOUNT');
  const [whole, frac=''] = String(amount).split('.');
  const micros = Number(whole)*1e6 + Number(frac.slice(0,6).padEnd(6,'0')) + Number(/[1-9]/.test(frac.slice(6)));
  if (!Number.isSafeInteger(micros)) throw Error('INVALID_BILLING_AMOUNT');
  return micros;
}
export async function estimateTopview(key, input) {
  submissionStage('video_quote');
  const held=await preflight('quote',async()=>{
    const {reserveUsd}=await request(key,'/predictions/quote',input);
    const amount=usdMicros(reserveUsd);
    if(amount<=0||amount>100_000_000)throw Error('INVALID_QUOTE');
    return amount;
  });
  submissionStage('generation_admission');
  return held;
}
export async function submitTopview(key,{modelKey,input},replayKey) {
  const {id} = await request(key,'/models/'+modelKey+'/predictions',input,replayKey);
  if (typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,150}$/.test(id)) throw Error('INVALID_PROVIDER_RECEIPT');
  return id;
}
export async function pollTopview(key,id) {
  if (!/^[a-zA-Z0-9_-]{1,150}$/.test(id)) throw Error('INVALID_TASK');
  const data = await request(key,'/predictions/'+id);
  if (data.id!==id) throw Error('INVALID_PROVIDER_RECEIPT');
  if (data.status==='completed' && data.billing_state==='CAPTURED') {
    return {state:'ready',url:mediaUrl(data.outputs?.[0]),actualMicros:usdMicros(data.charged_usd)};
  }
  if (data.status==='failed' && data.billing_state==='RELEASED') return {state:'failed'};
  if (data.status==='payment_required') return {state:'payment_required'};
  if (['created','processing','completed','failed'].includes(data.status)) return {state:'running'};
  throw Error('INVALID_PROVIDER_STATUS');
}

export async function topviewConnection(env=process.env,checkReference=false) {
  const key=topviewKey(env);
  if (!key) return {state:'key_missing'};
  const plan={content:[{type:'text',text:'A plain ceramic cup on a studio table.'}],ratio:'9:16',resolution:'720p',duration:10,generate_audio:checkReference};
  try {
    let references=[];
    if(checkReference){
      const {default:sharp}=await import('sharp');
      const sample=await sharp({create:{width:320,height:320,channels:3,background:'#b99370'}}).jpeg().toBuffer();
      references=await uploadTopviewImages(key,[...plan.content,{image_url:{url:'data:image/jpeg;base64,'+sample.toString('base64')}}]);
    }
    const quote=await request(key,'/predictions/quote',topviewInput(plan,references),undefined,true);
    return {state:'estimate_verified',estimatedUsd:usdMicros(quote.estimatedUsd)/1e6,reserveUsd:usdMicros(quote.reserveUsd)/1e6};
  } catch(error) { return {state:'estimate_unavailable',httpStatus:error.providerStatus??null,...(error.diagnostic?{diagnostic:error.diagnostic}:{})}; }
}
