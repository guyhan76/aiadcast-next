import {apiIdentity,configuredApiOrigin} from './api-origin';
import {betaSession,type BetaSession} from './beta-session';
import {apiRequest} from './generation-client';
import {signInBoundary} from './sign-in-boundary';
import {offlineDemo} from './demo-mode';

export type KakaoIntent = 'login'|'link'|'signup';
type Start = {state:string;proof:string;expires:number;url:string};
export type PendingKakao = Omit<Start,'url'> & {receipt?:string;intent:KakaoIntent;owner:string;origin:string;destination:string};
type Result = {state:'pending'|'cancelled'|'failed'|'unknown'|'conflict'} | {state:'verified';session:BetaSession};
type Host = Window & {AiadcastNative?:{postMessage:(message:string)=>void};__AIADCAST_KAKAO_NATIVE__?:{packageId:string;pending?:PendingKakao}};
const host = window as Host;
const key = 'aiadcast.kakao-flow';
const owner = () => betaSession()?.user.id ?? 'guest';
const nonce = (v:unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);
export function kakaoDestination() {
  if (offlineDemo()) return;
  if (host.AiadcastNative) {
    const id = host.__AIADCAST_KAKAO_NATIVE__?.packageId;
    return id && /^com\.selluplabs\.aiadcast\.next(?:\.(?:dev|demo|preview))?$/.test(id) && configuredApiOrigin() ? id : undefined;
  }
  if (apiIdentity() === location.origin) return 'web';
}
function stored():PendingKakao|undefined {
  try {
    const local=JSON.parse(sessionStorage.getItem(key) ?? 'null') as PendingKakao|null;
    const native=host.__AIADCAST_KAKAO_NATIVE__?.pending;
    return local && native?.state===local.state && native.receipt ? {...local,receipt:native.receipt} : local ?? native;
  }
  catch { return; }
}
export function captureKakaoReturn() {
  const match=/^#kakao-return\/([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(location.hash);
  if(!match)return;
  const flow=pendingKakao();
  if(flow?.state===match[1] && flow.destination==='web')sessionStorage.setItem(key,JSON.stringify({...flow,receipt:match[2]}));
  history.replaceState(null,'',location.pathname+location.search+'#kakao-return');
}
export function clearKakao(flow = stored()) {
  if (flow && flow.destination !== 'web') {
    host.AiadcastNative?.postMessage(JSON.stringify({type:'kakao-clear',state:flow.state}));
    if (host.__AIADCAST_KAKAO_NATIVE__?.pending?.state === flow.state) delete host.__AIADCAST_KAKAO_NATIVE__.pending;
  }
  sessionStorage.removeItem(key);
}
window.addEventListener('aiadcast-session-change',()=>clearKakao());
window.addEventListener('aiadcast-kakao-open-failed',()=>clearKakao());
export function pendingKakao() {
  const f = stored();
  if (!f) return;
  if (!nonce(f.state) || !nonce(f.proof) || !Number.isFinite(f.expires) || f.expires <= Date.now() ||
      f.origin !== apiIdentity() || f.owner !== owner() || f.destination !== kakaoDestination() ||
      !['link','signup','login'].includes(f.intent) || (f.intent==='link') !== !!betaSession()) {
    clearKakao(f); return;
  }
  return f;
}
export async function startKakao(intent:KakaoIntent, active:()=>boolean) {
  const destination = kakaoDestination(), guard = signInBoundary();
  if (!destination || (intent==='link') !== !!betaSession()) throw Error('KAKAO_UNAVAILABLE');
  const flow = await apiRequest<Start>('/api/auth/kakao/start',{intent,destination});
  guard();
  if (!active()) return;
  const origin = apiIdentity();
  if (!nonce(flow.state) || !nonce(flow.proof) || !Number.isFinite(flow.expires) || flow.expires<=Date.now() ||
      flow.url !== origin+'/api/auth/kakao/authorize?state='+flow.state) throw Error('KAKAO_FLOW_INVALID');
  const record:PendingKakao = {state:flow.state,proof:flow.proof,expires:flow.expires,owner:owner(),origin,destination,intent};
  sessionStorage.setItem(key,JSON.stringify(record));
  if (destination === 'web') { location.assign(flow.url); return; }
  location.hash='kakao-return';
  window.dispatchEvent(new Event('aiadcast-kakao-started'));
  host.AiadcastNative!.postMessage(JSON.stringify({...record,type:'kakao-open'}));
}
let pending:{state:string;result:Promise<Result>}|undefined;
export function pollKakao(flow:PendingKakao) {
  if (pending?.state === flow.state) return pending.result;
  const result = apiRequest<Result>('/api/auth/kakao/poll',{state:flow.state,proof:flow.proof,receipt:pendingKakao()?.receipt});
  pending={state:flow.state,result};
  void result.finally(()=>{if(pending?.result===result)pending=undefined;}).catch(()=>{});
  return result;
}
