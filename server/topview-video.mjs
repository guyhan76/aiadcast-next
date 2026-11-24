import {submissionStage} from './submission-observation.mjs';

const api = 'https://platform-backend.topview.ai/api/v1';
export const topviewModel = 'topview/topview-t1';
export function topviewKey(env = process.env) {
  const key = env.TOPVIEW_API_PLATFORM_KEY?.trim();
  return key && /^[\x21-\x7e]+$/.test(key) ? key : null;
}

async function request(key, path, body, replayKey) {
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
    throw Object.assign(Error('TOPVIEW_UNAVAILABLE'), {providerStatus:response.status,retryMs});
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

export async function uploadTopviewImages(key, content) {
  submissionStage('video_reference_upload');
  return Promise.all(content.slice(1).map(async ({image_url}) => {
    const [,type,encoded] = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image_url.url) || [];
    if (!encoded) throw Error('INVALID_IMAGE');
    const form = new FormData();
    form.set('kind','image');
    form.set('file',new Blob([Buffer.from(encoded,'base64')],{type}),'reference.' + type.slice(6));
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
  const modelKey = topviewModel + (urls.length ? '/omni-reference-to-video' : '/text-to-video');
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

export async function topviewConnection(env=process.env,referenceUrl) {
  const key=topviewKey(env);
  if (!key) return {state:'key_missing'};
  const plan={content:[{type:'text',text:'A plain ceramic cup on a studio table.'}],ratio:'9:16',resolution:'720p',duration:referenceUrl?15:10,generate_audio:!!referenceUrl};
  try {
    const quote=await request(key,'/predictions/quote',topviewInput(plan,referenceUrl?[referenceUrl]:[]));
    return {state:'estimate_verified',estimatedUsd:usdMicros(quote.estimatedUsd)/1e6,reserveUsd:usdMicros(quote.reserveUsd)/1e6};
  } catch(error) { return {state:'estimate_unavailable',httpStatus:error.providerStatus??null}; }
}
