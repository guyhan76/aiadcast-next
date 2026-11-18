import {wordmark} from './google-return-page.mjs';
import {createHash} from 'node:crypto';
const sdk = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.5/kakao.min.js';
const integrity = 'sha384-v6JKY3z4FUkWq21oZDHZe74YvuPk/WUrVLrDHTBojHXClOSa3iXy7sCXPY1jkFbj';
const script = `const button=document.querySelector('button'),status=document.querySelector('[role=status]');
if(!window.Kakao){status.textContent='카카오 로그인을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.';}
else{Kakao.init(button.dataset.key);button.disabled=false;button.onclick=()=>{Kakao.Auth.authorize({state:button.dataset.state,redirectUri:button.dataset.redirect});};}`;
const hash = createHash('sha256').update(script).digest('base64');
export const kakaoPagePolicy = "default-src 'none'; script-src "+sdk+" 'sha256-"+hash+"'; style-src 'unsafe-inline'; connect-src https://kauth.kakao.com https://kapi.kakao.com; frame-src https://kauth.kakao.com https://accounts.kakao.com https://talk-apps.kakao.com kakaotalk:; form-action https://kauth.kakao.com; base-uri 'none'; frame-ancestors 'none'";
const attr = value => String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export function kakaoLaunchPage({state,intent,javascriptKey,redirectUri}) {
  const action = {login:'카카오 로그인',signup:'카카오로 회원가입',link:'현재 계정에 카카오 연결'}[intent];
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${action} · aiadcast</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;font:16px/1.6 system-ui,sans-serif;color:#202124;background:#faf8f5}main{width:min(90%,360px);text-align:center}h1{margin:0 0 24px;font-size:32px}h1 svg{width:min(220px,80%);height:auto}button{width:100%;min-height:52px;border:0;border-radius:12px;color:#191919;background:#fee500;font:600 17px system-ui;cursor:pointer}button:disabled{opacity:.6}a{display:inline-block;padding:12px;color:#464646}</style>
<main><h1 aria-label="aiadcast">${wordmark}</h1><button disabled data-state="${attr(state)}" data-key="${attr(javascriptKey)}" data-redirect="${attr(redirectUri)}">${action}</button><p role="status"></p><a href="${attr(redirectUri)}?error=access_denied&amp;state=${attr(state)}">취소</a></main>
<script src="${sdk}" integrity="${integrity}" crossorigin="anonymous"></script><script>${script}</script></html>`;
}
