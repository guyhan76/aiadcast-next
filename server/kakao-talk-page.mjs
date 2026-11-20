import {kakaoReturnPage,googleReturnCsp} from './google-return-page.mjs';
import {createHash} from 'node:crypto';

const sdk = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.5/kakao.min.js';
const integrity = 'sha384-v6JKY3z4FUkWq21oZDHZe74YvuPk/WUrVLrDHTBojHXClOSa3iXy7sCXPY1jkFbj';
const script = `const {key,state,callback}=document.querySelector('main').dataset;
const status=document.querySelector('[role=status]');
const account=document.querySelector('#account');
const sdk=document.createElement('script');
let waitingForSdk=true;
let switchTimer;
function waitForTalk() {
  clearTimeout(switchTimer);
  account.hidden=true;
  status.textContent='카카오톡에서 확인하면 aiadcast로 자동으로 돌아옵니다.';
  if (!document.hidden) switchTimer=setTimeout(()=>{
    status.textContent='카카오톡이 열리지 않았나요? 카카오계정으로도 로그인할 수 있습니다.';
    account.hidden=false;
  },12000);
}
function offerAccount() {
  waitingForSdk=false;
  clearTimeout(startupTimer);
  status.textContent='카카오톡을 열 수 없습니다. 카카오계정으로 로그인해 주세요.';
  account.hidden=false;
}
const startupTimer=setTimeout(offerAccount,8000);
sdk.onload=()=>{
  if (!waitingForSdk) return;
  waitingForSdk=false;
  clearTimeout(startupTimer);
  try {
    Kakao.init(key);
    // The SDK delivers both approval and cancellation to the registered callback.
    Promise.resolve(Kakao.Auth.authorize({throughTalk:true,state,redirectUri:callback})).catch(()=>{});
    waitForTalk();
    document.addEventListener('visibilitychange',waitForTalk);
  } catch { offerAccount(); }
};
sdk.onerror=()=>{if (waitingForSdk) offerAccount();};
sdk.src='${sdk}';
sdk.integrity='${integrity}';
sdk.crossOrigin='anonymous';
document.head.append(sdk);`;
export const kakaoTalkCsp = "default-src 'none'; script-src "+sdk+" 'sha256-"+createHash('sha256').update(script).digest('base64')+"'; style-src 'unsafe-inline'; connect-src https://kauth.kakao.com; base-uri 'none'; frame-ancestors 'none'";
const attr = s => String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');

export function kakaoTalkPage({state,javascriptKey,callbackUri}) {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>카카오톡으로 로그인</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;font:16px/1.6 system-ui,sans-serif;color:#202124}main{text-align:center;padding:24px;word-break:keep-all}a{display:inline-block;padding:12px;color:#383838}[hidden]{display:none}</style>
<noscript><style>#account[hidden]{display:inline-block}[role=status]{display:none}</style></noscript>
<main data-key="${attr(javascriptKey)}" data-state="${attr(state)}" data-callback="${attr(callbackUri)}"><p role="status">카카오톡을 여는 중입니다…</p>
<a id="account" hidden href="/api/auth/kakao/authorize?state=${attr(state)}">카카오계정으로 로그인</a></main>
<script>${script}</script></html>`;
}

const returnCookie = '__Host-aiadcast-kakao-return';
const privateHeaders = {'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};

export function kakaoBrowserReceipt(req,state) {
  if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) return;
  const prefix = returnCookie + '=' + state + '.';
  return (req.headers.cookie ?? '').split(';').map(item => item.trim()).find(item => item.startsWith(prefix))?.slice(prefix.length);
}

export function sendKakaoReturn(req,res,state,{destination,receipt,completed}) {
  if (completed) {
    res.writeHead(200,{...privateHeaders,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':googleReturnCsp});
    res.end(kakaoReturnPage(destination+'://kakao/return'));
    return;
  }
  const fragment = state + '.' + receipt;
  if (destination === 'web') {
    res.writeHead(303,{...privateHeaders,Location:'/#kakao-return/'+fragment});res.end();return;
  }
  // Only a browser that actually received the callback can resume from its launch URL.
  const headers = {...privateHeaders,'Set-Cookie':returnCookie+'='+fragment+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600'};
  if ((req.headers['user-agent'] ?? '').endsWith(' AiadcastKakaoReturn/1')) {
    res.writeHead(303,{...headers,Location:'/api/auth/kakao/app-return#'+fragment});res.end();return;
  }
  res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':googleReturnCsp});
  res.end(kakaoReturnPage(destination+'://kakao/return#'+fragment));
}

export function sendKakaoRestart(res) {
  res.writeHead(410,{...privateHeaders,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});
  res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>카카오 로그인</title><style>body{max-width:24rem;margin:30vh auto;padding:1.5rem;font:1rem/1.6 system-ui;color:#202124;word-break:keep-all}h1{font-size:1.35rem}</style><h1>aiadcast 앱으로 돌아가 주세요</h1><p>앱에 로그인 화면이 보이면 ‘카카오로 계속하기’를 눌러 새로 시작해 주세요.</p></html>');
}
