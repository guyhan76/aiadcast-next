import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {googleReturnPage,googleReturnCsp} from '../server/google-return-page.mjs';
const target='com.selluplabs.aiadcast.next.demo://google/return';
function browser({throws=false}={}){
 const html=googleReturnPage(target),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 const events={},timers=new Map(),calls=[],status={},link={href:target,hidden:true,dataset:{fallback:'Return fallback'},addEventListener:(name,fn)=>events[name]=fn};
 let now=0;
 const document={hidden:false,querySelector:s=>s==='.return'?link:status,addEventListener:(name,fn)=>events[name]=fn};
 runInNewContext(script,{document,window:{location:{assign:url=>{calls.push(url);if(throws)throw Error('blocked');}},addEventListener:(name,fn)=>events[name]=fn},Date:{now:()=>now},setTimeout:(fn,ms)=>{assert.equal(ms,1500);timers.set(1,fn);return 1;},clearTimeout:id=>timers.delete(id)});
 return {html,script,events,timers,calls,status,link,document,advance:()=>now+=1500};
}
test('automatic handoff uses only the fixed wake-up URI; CSP authorizes exactly the static script',()=>{
 const b=browser();assert.deepEqual(b.calls,[target]);assert.equal(b.link.hidden,true);
 const hash=createHash('sha256').update(b.script).digest('base64');
 assert.ok(googleReturnCsp.includes("script-src 'sha256-"+hash+"'"));
 assert.ok(!googleReturnCsp.includes("script-src 'unsafe-inline'"));
 for(const directive of ["default-src 'none'","base-uri 'none'","frame-ancestors 'none'","form-action 'none'"])assert.ok(googleReturnCsp.includes(directive));
 b.timers.get(1)();assert.equal(b.link.hidden,false);assert.equal(b.status.textContent,'Return fallback');assert.deepEqual(b.calls,[target]);
});
test('successful app opening cancels fallback timer; browser back/restore never automatically reopens the app',()=>{
 const b=browser();b.document.hidden=true;b.events.visibilitychange();assert.equal(b.timers.size,0);assert.equal(b.link.hidden,true);
 b.document.hidden=false;b.events.visibilitychange();assert.equal(b.link.hidden,false);
 b.events.pageshow({persisted:true});assert.deepEqual(b.calls,[target]);
});
test('blocked navigation has an immediate usable fallback and repeated clicks are coalesced',()=>{
 const b=browser({throws:true});assert.equal(b.link.hidden,false);assert.equal(b.timers.size,0);
 let prevented=0;const click={preventDefault:()=>prevented++};b.events.click(click);b.events.click(click);assert.equal(prevented,1);b.advance();b.events.click(click);assert.equal(prevented,1);assert.deepEqual(b.calls,[target]);
});
test('no-script fallback and both languages retain the official wordmark without credentials',()=>{
 for(const lang of ['en','ko']){const html=googleReturnPage(target,lang);assert.ok(html.includes('<noscript>'));assert.ok(html.includes('fill="#E8722A"'));assert.ok(html.includes('fill="#1F1F1D"'));assert.ok(html.includes('href="'+target+'"'));assert.ok(!html.includes('?token='));}
});
