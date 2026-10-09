import fs from 'node:fs/promises';
import {chromium} from '@playwright/test';
// Minimal renderer for this project's authored brief (headings, paragraphs, lists,
// tables and inline emphasis). No uploaded patent text or personal addresses.
const source=await fs.readFile('docs/funding-technical-brief.md','utf8');
const standalone=await fs.readFile('release/aiadcast-studio.html','utf8');
const fontFaces=(standalone.match(/@font-face\{[^}]*\}/g)||[]).join('\n');
if(!fontFaces.includes('base64,'))throw Error('Build the standalone preview with embedded fonts first');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const inline=s=>escape(s).replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');
const lines=source.split('\n');let body='';
for(let i=0;i<lines.length;i++){
 const line=lines[i];if(!line.trim())continue;
 if(line.startsWith('|')){const rows=[];while(i<lines.length&&lines[i].startsWith('|')){const cells=lines[i].split('|').slice(1,-1).map(s=>s.trim());if(!cells.every(s=>/^[-:]+$/.test(s)))rows.push(cells);i++;}i--;body+='<table><thead><tr>'+rows[0].map(s=>'<th>'+inline(s)+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(1).map(row=>'<tr>'+row.map(s=>'<td>'+inline(s)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';continue;}
 if(line.startsWith('- ')){body+='<ul>';while(i<lines.length&&lines[i].startsWith('- ')){body+='<li>'+inline(lines[i].slice(2))+'</li>';i++;}i--;body+='</ul>';continue;}
 const h=line.match(/^(#{1,3}) (.*)/);body+=h?`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`:`<p>${inline(line)}</p>`;
}
const html=`<!doctype html><html lang="ko"><meta charset="UTF-8"><title>aiadcast 기술·사업 설명 초안</title><style>${fontFaces}
@page{size:A4;margin:18mm 17mm 20mm}*{box-sizing:border-box}body{font-family:'Noto Sans KR Variable',sans-serif;color:#242424;font-size:10pt;line-height:1.8;margin:0}header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #222;padding-bottom:12px;margin-bottom:25px}header b{font-size:23px;letter-spacing:-1.2px}header b span{color:#e87538}header small{font-size:9px;color:#666}h1{font-size:21pt;line-height:1.45;letter-spacing:-1px;margin:0 0 12px}h2{font-size:13pt;margin:25px 0 10px;padding-left:9px;border-left:3px solid #df713b;break-after:avoid}h3{font-size:11pt;break-after:avoid}p{margin:9px 0;orphans:3;widows:3}table{width:100%;border-collapse:collapse;margin:13px 0;font-size:8.5pt;line-height:1.7}th{text-align:left;background:#f0f0ed;padding:9px;font-weight:600}td{padding:9px;border-bottom:1px solid #ddd;vertical-align:top}tr{break-inside:avoid}thead{display:table-header-group}ul{padding-left:18px}li{margin:5px 0}code{font-family:inherit;font-size:.95em}strong{font-weight:650}
</style><body><header><b><span>ai</span>adcast</b><small>SELLUPLABS · DEVELOPMENT BRIEF · 2026.10.09</small></header>${body}</body></html>`;
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',args:['--disable-dev-shm-usage']});
try{const page=await browser.newPage();await page.setContent(html,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);await page.pdf({path:'release/aiadcast-technical-brief.pdf',format:'A4',printBackground:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font-family:sans-serif;font-size:8px;color:#777;margin:0 17mm;width:100%;display:flex;justify-content:space-between"><span>aiadcast · 개발 현황 설명 초안 / 상용 출시 전</span><span class="pageNumber"></span></div>'});console.log('Technical brief PDF created from authored development status.');}finally{await browser.close();}
