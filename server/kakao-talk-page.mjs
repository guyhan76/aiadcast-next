import {createHash} from 'node:crypto';

const sdk = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.5/kakao.min.js';
const integrity = 'sha384-v6JKY3z4FUkWq21oZDHZe74YvuPk/WUrVLrDHTBojHXClOSa3iXy7sCXPY1jkFbj';
const script = `const {key,state,callback}=document.querySelector('main').dataset;
try {
  Kakao.init(key);
  Kakao.Auth.authorize({throughTalk:true,state,redirectUri:callback}).catch(()=>{});
} catch {
  location.replace(document.querySelector('a').href);
}`;
export const kakaoTalkCsp = "default-src 'none'; script-src "+sdk+" 'sha256-"+createHash('sha256').update(script).digest('base64')+"'; style-src 'unsafe-inline'; connect-src https://kauth.kakao.com; base-uri 'none'; frame-ancestors 'none'";
const attr = s => String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');

export function kakaoTalkPage({state,javascriptKey,callbackUri}) {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>카카오톡으로 로그인</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;font:16px/1.6 system-ui,sans-serif;color:#202124}main{text-align:center;padding:24px}a{display:inline-block;padding:12px;color:#383838}</style>
<main data-key="${attr(javascriptKey)}" data-state="${attr(state)}" data-callback="${attr(callbackUri)}"><p role="status">카카오톡에서 로그인을 확인해 주세요.</p>
<a href="/api/auth/kakao/authorize?state=${attr(state)}">카카오계정으로 로그인</a></main>
<script src="${sdk}" integrity="${integrity}" crossorigin="anonymous"></script><script>${script}</script></html>`;
}
