import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ApiFailure, GenerationService } from './generation-service.mjs';
import { OpenAIImageAdapter } from './openai-image-adapter.mjs';
import { assistCopy } from './text-assistant.mjs';

export const DEFAULT_ORIGINS = ['http://localhost:5180','http://127.0.0.1:5180','http://localhost:4180','http://127.0.0.1:4180','http://localhost:5173','http://127.0.0.1:5173','http://localhost:4173','http://127.0.0.1:4173'];
function loopbackHost(host) { return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host ?? ''); }
function localOrigin(origin) {
  try { const u = new URL(origin); return u.protocol === 'http:' && loopbackHost(u.host) && u.origin === origin; }
  catch { return false; }
}
const errorLabels = {
  GENERATION_DISABLED: '실제 AI 생성 테스트가 아직 활성화되지 않았습니다.',
  PROVIDER_NOT_CONFIGURED: '새 앱 전용 AI 연결 설정이 필요합니다.',
  BUDGET_NOT_AVAILABLE: '설정된 테스트 비용 한도를 확인해주세요.',
  NO_TEST_CREDITS: '개발 테스트 이용권을 모두 사용했습니다. 실제 결제는 연결되지 않았습니다.',
  GENERATION_ALREADY_RUNNING: '진행 중인 광고를 먼저 확인해주세요.',
  PROVIDER_UNCERTAIN: '공급사 처리 상태를 확인 중입니다. 자동 재생성하지 않으며 테스트 이용권을 복원했습니다.',
  REVIEW_REQUIRED_AFTER_REJECTIONS: '동일한 요청이 두 번 반려되었습니다. 조건을 조정하거나 결과를 검토해주세요.',
  REGION_EDIT_NOT_AVAILABLE: '선택 영역 AI 편집은 아직 연결되지 않았습니다.',
};
function sendJson(res, status, value, origin) {
  const payload = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(payload),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin', ...(origin ? { 'Access-Control-Allow-Origin':origin, 'Vary':'Origin' } : {}) });
  res.end(payload);
}
async function readJson(req) {
  if (!/^application\/json(?:\s*;.*)?$/i.test(req.headers['content-type'] ?? '')) throw new ApiFailure('JSON_REQUIRED', 415);
  const max = 14_100_000;
  if (Number(req.headers['content-length'] ?? 0) > max) throw new ApiFailure('REQUEST_TOO_LARGE', 413);
  let length = 0; const parts = [];
  for await (const part of req) {
    length += part.length;
    if (length > max) throw new ApiFailure('REQUEST_TOO_LARGE', 413);
    parts.push(part);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw new ApiFailure('INVALID_JSON'); }
}
export function createGenerationHttpServer({ service, allowedOrigins = DEFAULT_ORIGINS, nodeEnvironment = process.env.NODE_ENV } = {}) {
  if (nodeEnvironment === 'production') throw Error('PRODUCTION_REQUIRES_AUTH_PAYMENTS_AND_RELEASE_GATES');
  if (!service || allowedOrigins.some(o => !localOrigin(o))) throw Error('LOCAL_ORIGINS_REQUIRED');
  const allowed = new Set(allowedOrigins);
  let inFlightBodies = 0;
  const http = createServer(async (req, res) => {
    const origin = req.headers.origin;
    const ownOrigin = `http://${req.headers.host}`;
    try {
      if (!loopbackHost(req.headers.host) || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) throw new ApiFailure('LOCAL_ACCESS_ONLY', 403);
      if ((origin && !allowed.has(origin) && origin !== ownOrigin) || req.headers['sec-fetch-site'] === 'cross-site') throw new ApiFailure('ORIGIN_NOT_ALLOWED', 403);
      if (req.method === 'OPTIONS') {
        if (!origin) throw new ApiFailure('ORIGIN_NOT_ALLOWED', 403);
        res.writeHead(204, { 'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,X-Aiadcast-Client','Access-Control-Max-Age':'600','Vary':'Origin' }); res.end(); return;
      }
      const url = new URL(req.url, ownOrigin);
      if (req.method === 'GET' && url.pathname === '/api/status') { sendJson(res, 200, service.status(), origin); return; }
      const selectiveLookup=/^\/api\/selective-edits\/requests\/([A-Za-z0-9_-]{8,100})$/.exec(url.pathname);
      if(req.method==='GET'&&selectiveLookup){sendJson(res,200,service.selectiveRequestStatus(selectiveLookup[1],url.searchParams.get('sourceJobId')),origin);return;}
      const batch=/^\/api\/ad-batches\/(ads-[a-f0-9]{64})$/.exec(url.pathname);
      if(req.method==='GET'&&batch){sendJson(res,200,service.batchSummary(batch[1]),origin);return;}
      if (req.method === 'GET' && url.pathname === '/api/generations') { sendJson(res, 200, service.history(url.searchParams.has('projectId') ? url.searchParams.get('projectId') : undefined), origin); return; }
      const requestLookup = /^\/api\/generation-requests\/([A-Za-z0-9_-]{8,100})$/.exec(url.pathname);
      if (req.method === 'GET' && requestLookup) { sendJson(res, 200, service.requestStatus(requestLookup[1],url.searchParams.get('projectId')), origin); return; }
      const route = /^\/api\/generations\/([A-Za-z0-9_-]{8,100})(?:\/(accept|reject|report))?$/.exec(url.pathname);
      if (req.method === 'GET' && route && !route[2]) { sendJson(res, 200, { job:service.job(route[1]),wallet:service.wallet() }, origin); return; }
      if (req.method === 'POST') {
        if (req.headers['x-aiadcast-client'] !== 'local-studio') throw new ApiFailure('CLIENT_HEADER_REQUIRED', 403);
        if (inFlightBodies >= 2) throw new ApiFailure('TOO_MANY_REQUESTS', 429);
        let body;
        inFlightBodies++;
        try { body = await readJson(req); } finally { inFlightBodies--; }
        if (url.pathname === '/api/generations' && body?.request?.output?.exactText !== undefined) throw new ApiFailure('PAID_TRIAL_NOT_APPROVED',403);
        if (url.pathname === '/api/selective-edits') { sendJson(res,202,await service.createSelectiveEdit(body),origin);return; }
        if (url.pathname === '/api/generations') { sendJson(res, 202, await service.create(body), origin); return; }
        if (route?.[2] === 'accept') { sendJson(res, 200, service.accept(route[1], body?.artifactId, body?.dimensionReview), origin); return; }
        if (route?.[2] === 'report') { sendJson(res, 200, service.reportDefect(route[1], body), origin); return; }
        if (route?.[2] === 'reject') { sendJson(res, 200, service.reject(route[1]), origin); return; }
        if (url.pathname === '/api/assistant' && typeof service.assist === 'function') { sendJson(res, 200, await service.assist(body), origin); return; }
      }
      throw new ApiFailure('NOT_FOUND', 404);
    } catch (error) {
      const known = error instanceof ApiFailure;
      const code = known ? error.code : 'INTERNAL_ERROR';
      // Never put stack traces, request bodies, filesystem paths or upstream errors in HTTP responses.
      if (!res.headersSent) sendJson(res, known ? error.status : 500, { error: { code, message: errorLabels[code] ?? '요청을 처리하지 못했습니다. 입력과 연결 상태를 확인해주세요.' } }, origin && allowed.has(origin) ? origin : null);
      else res.end();
    }
  });
  http.requestTimeout = 30_000; http.headersTimeout = 10_000; http.keepAliveTimeout = 5_000;
  return http;
}
export function localServerConfiguration(env = process.env) {
  if (env.NODE_ENV === 'production' || (env.AIADCAST_SERVER_HOST && env.AIADCAST_SERVER_HOST !== '127.0.0.1')) throw Error('LOCAL_DEVELOPMENT_SERVER_ONLY');
  const port = Number(env.AIADCAST_SERVER_PORT ?? 8787);
  const budgetUsd = Number(env.AIADCAST_NEXT_TEST_BUDGET_USD ?? 0);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535 || !Number.isFinite(budgetUsd) || budgetUsd < 0 || budgetUsd > 100 || !Number.isSafeInteger(Math.round(budgetUsd * 1e6))) throw Error('INVALID_LOCAL_SERVER_CONFIGURATION');
  const allowedOrigins = env.AIADCAST_NEXT_LOCAL_ORIGINS ? env.AIADCAST_NEXT_LOCAL_ORIGINS.split(',').map(s => s.trim()) : DEFAULT_ORIGINS;
  return { host:'127.0.0.1',port,databasePath:resolve(env.AIADCAST_NEXT_LOCAL_DATABASE ?? 'release/local-runtime/aiadcast-next.sqlite'),enabled:env.AIADCAST_NEXT_ENABLE_GENERATION === 'true',assistantEnabled:env.AIADCAST_NEXT_ENABLE_ASSISTANT === 'true',budgetMicros:Math.round(budgetUsd * 1e6),apiKey:env.AIADCAST_NEXT_LOCAL_OPENAI_API_KEY,allowedOrigins };
}
async function main() {
  const config = localServerConfiguration();
  const service = new GenerationService({ databasePath:config.databasePath,enabled:config.enabled,assistantEnabled:config.assistantEnabled,budgetMicros:config.budgetMicros,providerConfigured:Boolean(config.apiKey),adapter:new OpenAIImageAdapter({ apiKey:config.apiKey }),assistantAdapter:options => assistCopy({ ...options,apiKey:config.apiKey }) });
  const http = createGenerationHttpServer({ service,allowedOrigins:config.allowedOrigins });
  http.listen(config.port,config.host,() => { console.log(`aiadcast local development API started on port ${config.port}; commercial billing disabled; generation ${service.status().generation.enabled ? 'explicitly enabled' : 'disabled'}.`); });
  let closing = false;
  const close = () => { if (closing) return; closing = true; http.close(async () => { await service.close(); process.exit(0); }); };
  process.once('SIGINT',close); process.once('SIGTERM',close);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Local API startup failed. Check local configuration and database lock. No credential details are logged.'); process.exitCode=1; });
