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
    method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(25000),
    headers: {Authorization: 'Key ' + key, 'Content-Type': 'application/json', ...headers},
    ...(body === undefined ? {} : {body: JSON.stringify(body)})
  });
  if (!response.ok) {
    const error = new Error('HIGGSFIELD_UNAVAILABLE');
    error.providerStatus = response.status;
    throw error;
  }
  return response.json();
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

export async function estimateHiggsfield(key, {endpoint, body}) {
  const result = await request(key, 'estimate/' + endpoint, body);
  if (!/^\d+(\.\d+)?$/.test(String(result.usd))) throw Error('INVALID_VIDEO_ESTIMATE');
  const micros = Math.ceil(Number(result.usd) * 1_000_000);
  if (!Number.isSafeInteger(micros) || micros < 1 || micros > 100_000_000) throw Error('INVALID_VIDEO_ESTIMATE');
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
    return {state: 'estimate_unavailable', httpStatus: error?.providerStatus ?? null};
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
