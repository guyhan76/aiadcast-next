import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// One best-effort wake-up, never a session exchange or repeated redirect loop.
const returnScript=`(()=>{
 const link=document.querySelector('.return'),status=document.querySelector('[role=status]');
 const fallback=()=>{link.hidden=false;status.textContent=link.dataset.fallback;};
 let timer=setTimeout(fallback,1500),lastClick=-Infinity;
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);}else{fallback();}});
 window.addEventListener('pageshow',event=>{if(event.persisted)fallback();});
 link.addEventListener('click',event=>{const now=Date.now();if(now-lastClick<1500){event.preventDefault();return;}lastClick=now;});
 try{window.location.assign(link.href);}catch{clearTimeout(timer);fallback();}
})();`;
export const googleReturnCsp="default-src 'none'; script-src 'sha256-"+createHash('sha256').update(returnScript).digest('base64')+"'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

// Use the same supplied outlines and original colors as BrandLogo.tsx.
const wordmark=readFileSync(new URL('../src/assets/aiadcast-wordmark.svg',import.meta.url),'utf8')
 .replace('viewBox="0 0 1179 341" width="1179" height="341"','viewBox="83.43 83.43 1013.14 174.6" width="1013.14" height="174.6" aria-hidden="true" focusable="false"');

export function googleUiLanguage(preference,acceptLanguage=''){
 if(preference==='ko'||preference==='en')return preference;
 // Older installed apps do not send an app language yet. Respect their request locale.
 const supported=String(acceptLanguage).split(',').map((part,index)=>{
  const [tag,...parameters]=part.trim().toLowerCase().split(';');
  const q=parameters.find(p=>p.trim().startsWith('q='));
  return {language:tag.split('-')[0],quality:q?Number(q.trim().slice(2)):1,index};
 }).filter(p=>['ko','en'].includes(p.language)&&p.quality>0&&p.quality<=1)
 .sort((a,b)=>b.quality-a.quality||a.index-b.index);
 return supported[0]?.language??'en';
}

export function googleReturnPage(target,language='en'){
 // The link only wakes the installed app; it never carries authentication credentials.
 if(!/^com\.selluplabs\.aiadcast\.next(?:\.(?:demo|dev|preview))?:\/\/google\/return$/.test(target))throw Error('GOOGLE_NATIVE_INVALID');
 const ko=language==='ko',lang=ko?'ko':'en';
 const message=ko?'aiadcast를 여는 중…':'Opening aiadcast…';
 const fallback=ko?'앱이 열리지 않으면 아래 버튼을 눌러주세요.':'If the app did not open, tap below.';
 const button=ko?'aiadcast로 돌아가기':'Return to aiadcast';
 return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${button}</title>
<style>*{box-sizing:border-box}body{margin:0;background:#faf8f5;color:#202124;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Noto Sans KR",sans-serif}main{min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:24px}.card{width:min(100%,380px);text-align:center}h1{margin:0 0 20px;display:flex;justify-content:center}h1 svg{display:block;width:min(100%,232px);height:auto}p{margin:0;font-size:16px;line-height:1.7;word-break:keep-all}.return{display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;margin-top:28px;padding:12px 20px;border:1px solid #747775;border-radius:28px;background:#fff;color:#1f1f1f;font:600 17px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Noto Sans KR",sans-serif;text-decoration:none}[hidden]{display:none!important}.return:focus-visible{outline:3px solid #E8722A;outline-offset:4px}</style><noscript><style>.return[hidden]{display:flex!important}[role=status]{display:none}</style></noscript>
</head><body><main><section class="card"><h1 aria-label="aiadcast">${wordmark}</h1><p role="status">${message}</p><a class="return" hidden data-fallback="${fallback}" href="${target}">${button}</a></section></main><script>${returnScript}</script></body></html>`;
}
