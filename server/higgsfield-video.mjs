const api = 'https://api.higgsfield.ai';
export const higgsfieldModel = 'bytedance/seedance-2.5';

export function higgsfieldKey(env = process.env) {
  const key = env.HF_CREDENTIALS?.trim();
  return key && /^[\x21-\x7e]+$/.test(key) ? key : null;
}

export function activeVideoProvider(env = process.env) {
  return env.AIADCAST_VIDEO_PROVIDER ?? (env.HF_CREDENTIALS ? 'higgsfield' : 'byteplus');
}

function mediaUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw Error('INVALID_PROVIDER_URL');
  return url.href;
}

// Only call this helper with API paths selected on the server. Storage PUTs have their own headers.
async function request(key, path, body, headers = {}) {
  const response = await fetch(api + '/' + path, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'manual', signal: AbortSignal.timeout(25000),
    headers: {Authorization: 'Key ' + key, 'Content-Type': 'application/json', ...headers},
    ...(body === undefined ? {} : {body: JSON.stringify(body)})
  });
  if (!response.ok) {
    const error = new Error('HIGGSFIELD_UNAVAILABLE');
    error.providerStatus = response.status;
    throw error;
  }
  try {
    return await response.json();
  } catch {
    const error = new Error('INVALID_PROVIDER_JSON');
    error.providerStatus = response.status;
    throw error;
  }
}

async function upload(key, data) {
  const split = data.indexOf(',');
  const type = data.slice(5, data.indexOf(';'));
  const signed = await request(key, 'files/generate-upload-url', {content_type: type});
  const headers = new Headers(signed.upload_headers);
  if (headers.has('authorization') || headers.has('cookie')) throw Error('INVALID_UPLOAD_HEADERS');
  const url = mediaUrl(signed.public_url);
  const response = await fetch(mediaUrl(signed.upload_url), {
    method: 'PUT', headers, body: Buffer.from(data.slice(split + 1), 'base64'),
    credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw Error('VIDEO_UPLOAD_FAILED');
  return url;
}

export async function uploadHiggsfieldImages(key, content) {
  return Promise.all(content.slice(1).map(ref => upload(key, ref.image_url.url)));
}

export function higgsfieldInput(plan, urls) {
  const operation = urls.length ? 'reference-to-video' : 'text-to-video';
  const body = {prompt: plan.content[0].text, duration: plan.duration, resolution: plan.resolution,
    aspect_ratio: plan.ratio, output_format: 'mp4', generate_audio: plan.generate_audio};
  if (urls.length) body.image_urls = urls;
  return {endpoint: higgsfieldModel + '/' + operation, body};
}

// Only the structure of a pricing response is diagnostic. Never copy arbitrary response values.
function priceSchema(value, depth = 0) {
  if (value === null) return 'null';
  if (typeof value !== 'object') return typeof value;
  if (depth >= 3) return Array.isArray(value) ? 'array' : 'object';
  if (Array.isArray(value)) return value.length ? [priceSchema(value[0], depth + 1)] : [];
  return Object.fromEntries(Object.entries(value).filter(([name]) => /^[a-z][a-z_]{0,35}$/i.test(name))
    .slice(0,20).map(([name, field]) => [name, priceSchema(field, depth + 1)]));
}

export async function estimateHiggsfield(key, {endpoint, body}) {
  const result = await request(key, 'estimate/' + endpoint, body);
  const value = String(result?.usd ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(value)) {
    const error = new Error('ESTIMATE_USD_MISSING');
    error.priceSchema = priceSchema(result);
    throw error;
  }
  const micros = Math.ceil(Number(value) * 1_000_000);
  if (!Number.isSafeInteger(micros) || micros < 1 || micros > 100_000_000) throw Error('ESTIMATE_USD_OUT_OF_RANGE');
  return micros;
}

// Verifies the selected account using a price estimate only. No media or customer input is sent.
export async function higgsfieldConnection(env = process.env) {
  if (activeVideoProvider(env) !== 'higgsfield') {
    return {state: env.HF_CREDENTIALS ? 'other_provider_selected' : 'key_missing'};
  }
  const key = higgsfieldKey(env);
  if (!key) return {state: env.HF_CREDENTIALS?.trim() ? 'key_format_invalid' : 'key_missing'};
  const input = higgsfieldInput({
    content: [{type: 'text', text: 'A single product on a studio table.'}],
    ratio: '9:16', duration: 10, resolution: '720p', generate_audio: false
  }, []);
  try {
    const micros = await estimateHiggsfield(key, input);
    return {state: 'estimate_verified', usd: micros / 1_000_000};
  } catch (error) {
    // Only classify known reasons. Raw vendor responses, URLs and arbitrary error strings stay private.
    const reasons = ['ESTIMATE_USD_MISSING', 'ESTIMATE_USD_OUT_OF_RANGE', 'INVALID_PROVIDER_JSON'];
    if (reasons.includes(error.message)) return {state: 'estimate_unavailable', reason: error.message, httpStatus: error.providerStatus ?? 200, ...(error.priceSchema ? {schema: error.priceSchema} : {})};
    if (error.providerStatus) return {state: 'estimate_unavailable', httpStatus: error.providerStatus};
    const code = error.cause?.code;
    const networkReason = typeof code === 'string' && /^[A-Z0-9_]{2,60}$/.test(code) ? code : 'NETWORK_ERROR';
    return {state: 'estimate_unavailable', reason: error.name === 'TimeoutError' ? 'TIMEOUT' : networkReason};
  }
}

export async function submitHiggsfield(key, {endpoint, body}, replayKey) {
  const result = await request(key, endpoint, body, {'Idempotency-Key': replayKey, 'Hf-Expires-After': '86400'});
  if (typeof result.request_id !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(result.request_id)) throw Error('INVALID_PROVIDER_RECEIPT');
  return result.request_id;
}

export async function pollHiggsfield(key, id) {
  if (!/^[a-zA-Z0-9_-]{1,150}$/.test(id)) throw Error('INVALID_TASK');
  const result = await request(key, 'requests/' + id + '/status');
  if (result.request_id !== id) throw Error('INVALID_PROVIDER_RECEIPT');
  if (result.status === 'completed') return {state: 'ready', url: mediaUrl(result.video?.url)};
  if (['failed', 'nsfw', 'canceled'].includes(result.status)) return {state: 'failed'};
  if (['queued', 'in_progress'].includes(result.status)) return {state: 'running'};
  throw Error('INVALID_PROVIDER_STATUS');
}
