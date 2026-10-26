import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {starterProject,prepareCampaign} from '../src/consumer-campaign';
import {generatedCompatibilityKey} from '../src/generated';
import {completeAdKey} from '../src/complete-ad';
import {generationMatchKey} from '../src/generation-match';
import {buildGenerationRequest} from '../src/generation';
import {protectedScreen,mockSession,authenticatedSession} from './helpers/authenticated-session';
import {restoreOwnedWorkspace} from './helpers/owned-workspace';
const bytes=await sharp({create:{width:12,height:12,channels:3,background:'#336699'}}).png().toBuffer();
const hash=createHash('sha256').update(bytes).digest('hex');
async function setup(page:Page,language:'ko'|'en'='ko'){
 const owner='automatic-recovery-owner';await protectedScreen(page,mockSession(owner));await page.addInitScript(l=>localStorage.setItem('aiadcast.ui-language',l),language);
 let p=starterProject('other');p.productName='Cream';p.productProfile.material='50ml';p.locale=language;p.product={name:'photo.png',data:'data:image/png;base64,'+bytes.toString('base64'),sha256:hash,width:12,height:12};p=prepareCampaign(p);
 const pending={jobId:'existing-job',requestId:'original-request',key:generatedCompatibilityKey(p),inputKey:JSON.stringify(buildGenerationRequest(p))};
 const wallet={available:3,reserved:1,kind:'test'};
 const job={id:pending.jobId,projectId:p.id,requestId:pending.requestId,state:'ready',mode:'creative',sourceHash:hash,createdAt:'2026-10-25T00:00:00.000Z',model:'mock',artifactId:hash,artifact:{id:hash,sha256:hash,dataUrl:'data:image/png;base64,'+bytes.toString('base64'),width:12,height:12,role:'creative'},errorCode:null,composition:'complete-ad',compositionKey:completeAdKey(p),requestFingerprint:createHash('sha256').update(generationMatchKey(buildGenerationRequest(p))).digest('hex')};
 const state={statusReads:0,holdStatus:false,reads:0,historyReads:0,writes:0,failures:0,errorStatus:503,network:false,hold:false,job,historyJobs:null as null|typeof job[],lookup:'unsupported',lookupReads:0,posted:[] as any[],postConflict:false,postNetwork:false};
 await page.route('**/api/**',async r=>{
 const path=new URL(r.request().url()).pathname;if(path==='/api/auth/session')return r.fallback();if(r.request().method()!=='GET')state.writes++;
 if(path==='/api/status'){state.statusReads++;while(state.holdStatus&&!page.isClosed())await new Promise(resolve=>setTimeout(resolve,20));return r.fulfill({json:{generation:{enabled:true,model:'mock',photoPurposes:true},wallet,budget:{limitMicros:5000000,spentMicros:0,heldMicros:500000}}});}
 if(path.startsWith('/api/generation-requests/')){state.lookupReads++;if(state.lookup==='unsupported')return r.fulfill({status:404,json:{error:{code:'NOT_FOUND'}}});return r.fulfill({json:{version:1,requestId:pending.requestId,projectId:state.lookup==='wrong-project'?'wrong-project':p.id,state:state.lookup==='found'?'found':'not-recorded',jobId:state.lookup==='found'?job.id:null}});}
 if(path==='/api/generations'&&r.request().method()==='POST'){state.posted.push(r.request().postDataJSON());if(state.postNetwork)return r.abort('failed');if(state.postConflict){state.lookup='found';return r.fulfill({status:409,json:{error:{code:'IDEMPOTENCY_CONFLICT'}}});}return r.fulfill({status:202,json:{job:state.job,wallet}});}
 if(path.startsWith('/api/generations')){const attempt=path==='/api/generations'?++state.historyReads:++state.reads;const responseJob=state.job;while(state.hold&&!page.isClosed())await new Promise(resolve=>setTimeout(resolve,20));
 if(attempt<=state.failures){if(state.network)return r.abort('failed');return r.fulfill({status:state.errorStatus,json:{error:{code:state.errorStatus===401?'AUTH_REQUIRED':state.errorStatus===404?'JOB_NOT_FOUND':'INTERNAL_ERROR'}}});}
 return r.fulfill({json:path==='/api/generations'?{jobs:state.historyJobs??[responseJob]}:{job:responseJob,wallet}});}
 return r.fulfill({status:404,json:{error:{code:'NOT_FOUND'}}});});
 return {owner,p,pending,state,open:async()=>{await restoreOwnedWorkspace(page,p,owner,'studio',pending);const options=page.locator('.new-ad-options');if(!await options.evaluate(el=>(el as HTMLDetailsElement).open))await options.locator(':scope > summary').click();return options.locator('.generation-panel');}};
}
for(const language of ['ko','en'] as const)test(`transient lookup recovers matching complete image automatically (${language})`,async({page})=>{
 const s=await setup(page,language);s.state.failures=2;const panel=await s.open();
 await expect(panel.locator('.generation-ad-preview')).toBeVisible();expect(s.state.reads).toBe(3);expect(s.state.writes).toBe(0);
 await expect(panel.locator('.recovery-diagnostic')).toHaveCount(0);
 expect(await page.evaluate(({owner,id})=>JSON.parse(localStorage.getItem(owner+':aiadcast.pending-generation.'+id)!).requestId,{owner:s.owner,id:s.p.id})).toBe(s.pending.requestId);
});
test('network recovery is GET-only and a settled lookup stops automatic reads',async({page})=>{
 const s=await setup(page);s.state.failures=1;s.state.network=true;await page.clock.install({time:new Date('2026-10-25T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-25T00:01:00Z'));const panel=await s.open();
 await expect.poll(()=>s.state.reads).toBe(1);await page.clock.fastForward(1001);await expect(panel.locator('.generation-ad-preview')).toBeVisible();
 await page.clock.fastForward(60000);expect(s.state.reads).toBe(2);expect(s.state.writes).toBe(0);
});
for(const status of [401,404])test(`definite ${status} does not loop or clear the pending identity`,async({page})=>{
 const s=await setup(page);s.state.failures=99;s.state.errorStatus=status;await page.clock.install({time:new Date('2026-10-25T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-25T00:01:00Z'));
 if(status===401){await restoreOwnedWorkspace(page,s.p,s.owner,'studio',s.pending);await expect(page).toHaveURL(/#login$/);expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();}
 else {const panel=await s.open();await expect(panel.getByRole('alert')).toBeVisible();await expect(panel.locator('.generate-button')).toBeDisabled();}
 await page.clock.fastForward(60000);await page.evaluate(()=>window.dispatchEvent(new Event('online')));expect(s.state.reads).toBe(1);expect(s.state.writes).toBe(0);
 expect(await page.evaluate(({owner,id})=>JSON.parse(localStorage.getItem(owner+':aiadcast.pending-generation.'+id)!).requestId,{owner:s.owner,id:s.p.id})).toBe(s.pending.requestId);
});
test('one network-restored recovery is bounded and cannot restart a paid request',async({page})=>{
 const s=await setup(page);s.state.failures=99;await page.clock.install({time:new Date('2026-10-25T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-25T00:01:00Z'));const panel=await s.open();
 await expect.poll(()=>s.state.reads).toBe(1);await page.clock.fastForward(1001);await expect.poll(()=>s.state.reads).toBe(2);await page.clock.fastForward(2001);await expect(panel.getByRole('alert')).toBeVisible();expect(s.state.reads).toBe(3);
 s.state.failures=0;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(panel.locator('.generation-ad-preview')).toBeVisible();expect(s.state.reads).toBe(4);
 await page.evaluate(()=>{window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('online'));});await page.clock.fastForward(60000);expect(s.state.reads).toBe(4);expect(s.state.writes).toBe(0);
});
test('uncertain request receives only three bounded automatic reads and remains blocked',async({page})=>{
 const s=await setup(page);s.state.job={...s.state.job,state:'uncertain',artifact:null as any,artifactId:null as any,errorCode:'PROVIDER_UNCERTAIN'};await page.clock.install({time:new Date('2026-10-25T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-25T00:01:00Z'));await page.addInitScript(()=>{const original=window.setTimeout;(window as any).pollTimers=[];window.setTimeout=((handler:TimerHandler,delay?:number,...args:any[])=>{if([2000,4000,8000].includes(delay??0))(window as any).pollTimers.push(delay);return original(handler,delay,...args);}) as typeof window.setTimeout;});const panel=await s.open();
 await expect.poll(()=>s.state.reads).toBe(1);
 // Wait for each response to schedule its next timer before advancing time.
 for(const delay of [2000,4000,8000]){await expect.poll(()=>page.evaluate(d=>(window as any).pollTimers?.includes(d),delay)).toBe(true);const before=s.state.reads;await page.clock.fastForward(delay+1);await expect.poll(()=>s.state.reads).toBe(before+1);}
 await expect(panel.getByRole('alert')).toContainText('결과 확인이 지연');await page.clock.fastForward(120000);expect(s.state.reads).toBe(4);expect(s.state.writes).toBe(0);
 await expect(panel.locator('.generation-ad-preview')).toHaveCount(0);
});
test('changed creative brief cannot show an earlier response as the current result',async({page})=>{
 const s=await setup(page);s.p.generation.brief+=' Different requested scene';const panel=await s.open();
 await expect.poll(()=>s.state.reads).toBe(1);await expect(panel.locator('.generation-ad-preview')).toHaveCount(0);expect(s.state.writes).toBe(0);
 expect(await page.evaluate(({owner,id})=>JSON.parse(localStorage.getItem(owner+':aiadcast.pending-generation.'+id)!).inputKey,{owner:s.owner,id:s.p.id})).toBe(s.pending.inputKey);
});
test('leaving the project cancels late reads and never sends a generation request',async({page})=>{
 const s=await setup(page);s.state.hold=true;await s.open();await expect.poll(()=>s.state.reads).toBe(1);
 await page.getByRole('link',{name:'aiadcast 홈',exact:true}).click();s.state.hold=false;await expect(page).toHaveURL(/#home$/);await expect(page.locator('.generation-ad-preview')).toHaveCount(0);expect(s.state.writes).toBe(0);
});

test('request key lookup recovers a result missing from the recent history window without a POST',async({page})=>{
 const s=await setup(page);s.state.historyJobs=[];s.state.lookup='found';const {jobId,...pending}=s.pending;
 await restoreOwnedWorkspace(page,s.p,s.owner,'studio',pending);await expect(page.locator('.generation-ad-preview')).toBeVisible();
 expect(s.state.lookupReads).toBe(1);expect(s.state.reads).toBe(1);expect(s.state.writes).toBe(0);
});
test('direct lookup of an uncertain job outside recent history keeps generation blocked',async({page})=>{
 const s=await setup(page);s.state.historyJobs=[];s.state.lookup='found';s.state.job={...s.state.job,state:'uncertain',artifact:null as any,artifactId:null as any,errorCode:'PROVIDER_UNCERTAIN'};const {jobId,...pending}=s.pending;
 await restoreOwnedWorkspace(page,s.p,s.owner,'studio',pending);await expect.poll(()=>s.state.reads).toBeGreaterThan(0);
 await expect(page.locator('.generate-button')).toHaveCount(0);await expect(page.locator('.generation-ad-preview')).toHaveCount(0);expect(s.state.writes).toBe(0);
 const saved=await page.evaluate(({owner,id})=>JSON.parse(localStorage.getItem(owner+':aiadcast.pending-generation.'+id)!),{owner:s.owner,id:s.p.id});expect(saved.jobId).toBe(jobId);expect(saved.requestId).toBe(s.pending.requestId);
});
for(const language of ['ko','en'] as const)test(`one explicit form click resumes an unrecorded request without a second click (${language})`,async({page})=>{
 const s=await setup(page,language);s.state.historyJobs=[];s.state.lookup='not-recorded';const {jobId,...pending}=s.pending;
 await restoreOwnedWorkspace(page,s.p,s.owner,'studio',pending);await expect.poll(()=>s.state.lookupReads).toBe(1);expect(s.state.writes).toBe(0);
 await page.getByRole('button',{name:language==='ko'?'입력 내용 수정':'Edit details',exact:true}).click();
 // A late original accepted response must not leave the form intent queued.
 s.state.job={...s.state.job,state:'accepted'};
 await page.locator('.consumer-create').getByRole('button',{name:language==='ko'?'광고 생성':'Generate ad',exact:true}).click();
 await expect(page.locator('.generation-ad-preview')).toBeVisible();expect(s.state.posted).toHaveLength(1);expect(s.state.posted[0].requestId).toBe(s.pending.requestId);
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.reload();await expect.poll(()=>s.state.reads).toBeGreaterThan(0);expect(s.state.posted).toHaveLength(1);
});
test('a failed form dispatch consumes intent and missing lookup cannot automatically POST again',async({page})=>{
 const s=await setup(page);s.state.historyJobs=[];s.state.lookup='not-recorded';s.state.postNetwork=true;const {jobId,...pending}=s.pending;
 await restoreOwnedWorkspace(page,s.p,s.owner,'studio',pending);await expect.poll(()=>s.state.lookupReads).toBe(1);
 await page.getByRole('button',{name:'입력 내용 수정',exact:true}).click();await page.locator('.consumer-create').getByRole('button',{name:'광고 생성',exact:true}).click();
 await expect.poll(()=>s.state.lookupReads).toBeGreaterThanOrEqual(3);await expect(page.locator('.generate-button')).toBeEnabled();expect(s.state.posted).toHaveLength(1);expect(s.state.posted[0].requestId).toBe(s.pending.requestId);
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.reload();await expect.poll(()=>s.state.lookupReads).toBeGreaterThanOrEqual(4);expect(s.state.posted).toHaveLength(1);
});
for(const language of ['ko','en'] as const)test(`unrecorded pending request waits for an explicit click and keeps its original key (${language})`,async({page})=>{
 const s=await setup(page,language);s.state.historyJobs=[];s.state.lookup='not-recorded';const {jobId,...pending}=s.pending;
 await restoreOwnedWorkspace(page,s.p,s.owner,'studio',pending);const options=page.locator('.new-ad-options');if(!await options.evaluate(el=>(el as HTMLDetailsElement).open))await options.locator(':scope > summary').click();
 const button=options.locator('.generate-button');await expect(button).toBeEnabled();expect(s.state.writes).toBe(0);
 await expect(options).toContainText(language==='ko'?'자동으로 생성하지 않습니다':'Generation will not restart automatically');
 await page.reload();const reloaded=page.locator('.new-ad-options');if(!await reloaded.evaluate(el=>(el as HTMLDetailsElement).open))await reloaded.locator(':scope > summary').click();await expect(button).toBeEnabled();expect(s.state.writes).toBe(0);
 await button.evaluate((el:HTMLButtonElement)=>{el.click();el.click();});await expect.poll(()=>s.state.posted.length).toBe(1);
 expect(s.state.posted[0].requestId).toBe(s.pending.requestId);await expect(page.locator('.generation-ad-preview')).toBeVisible();
});
test('late original request with changed inputs conflicts safely and cannot display the old image as current',async({page})=>{
 const s=await setup(page);s.p.generation.brief+=' New requested scene';s.state.historyJobs=[];s.state.lookup='not-recorded';s.state.postConflict=true;const {jobId,...pending}=s.pending;
 await restoreOwnedWorkspace(page,s.p,s.owner,'studio',pending);const options=page.locator('.new-ad-options');if(!await options.evaluate(el=>(el as HTMLDetailsElement).open))await options.locator(':scope > summary').click();
 await expect(options.locator('.generate-button')).toBeEnabled();await options.locator('.generate-button').click();await expect.poll(()=>s.state.reads).toBe(1);
 expect(s.state.posted).toHaveLength(1);expect(s.state.posted[0].requestId).toBe(s.pending.requestId);await expect(page.locator('.generation-ad-preview')).toHaveCount(0);
 const record=await page.evaluate(({owner,id})=>JSON.parse(localStorage.getItem(owner+':aiadcast.pending-generation.'+id)!),{owner:s.owner,id:s.p.id});expect(record.key).toBe('');expect(record.requestId).toBe(s.pending.requestId);
});
test('malformed direct lookup remains blocked without a POST or clearing the pending key',async({page})=>{
 const s=await setup(page);s.state.historyJobs=[];s.state.lookup='wrong-project';const {jobId,...pending}=s.pending;
 await restoreOwnedWorkspace(page,s.p,s.owner,'studio',pending);const options=page.locator('.new-ad-options');if(!await options.evaluate(el=>(el as HTMLDetailsElement).open))await options.locator(':scope > summary').click();
 await expect(options.locator('.generate-button')).toBeDisabled();await expect(options.getByRole('alert')).toBeVisible();expect(s.state.writes).toBe(0);
});
test('marker-loss requires the full server fingerprint before showing a recovered result',async({page})=>{
 const s=await setup(page);await restoreOwnedWorkspace(page,s.p,s.owner,'studio');
 await expect(page.locator('.generation-ad-preview')).toBeVisible();expect(s.state.writes).toBe(0);
 const record=await page.evaluate(({owner,id})=>JSON.parse(localStorage.getItem(owner+':aiadcast.pending-generation.'+id)!),{owner:s.owner,id:s.p.id});
 expect(record.recovered).toBe(true);expect(record.inputKey).toBe(s.pending.inputKey);
});
test('marker-loss cannot promote a legacy or different-snapshot result to current preview',async({page})=>{
 const s=await setup(page);s.state.job.requestFingerprint='f'.repeat(64);await restoreOwnedWorkspace(page,s.p,s.owner,'studio');
 await expect.poll(()=>s.state.reads).toBe(1);expect(s.state.historyReads).toBe(1);await expect(page.locator('.generation-ad-preview')).toHaveCount(0);expect(s.state.writes).toBe(0);
});
for(const earlierState of ['ready','uncertain'] as const)test(`multiple saved jobs with earlier ${earlierState} report semantic ambiguity, not transport failure`,async({page})=>{
 const s=await setup(page);s.state.historyJobs=[s.state.job,{...s.state.job,id:'earlier-job-123',requestId:'earlier-request',state:earlierState,requestFingerprint:'f'.repeat(64),artifact:null as any,artifactId:null as any}];
 await restoreOwnedWorkspace(page,s.p,s.owner,'studio');
 const options=page.locator('.new-ad-options');if(!await options.evaluate(el=>(el as HTMLDetailsElement).open))await options.locator(':scope > summary').click();
 const details=page.locator('.recovery-diagnostic');await details.locator('summary').click();
 await expect(details).toContainText('HTTP 200');await expect(details).toContainText('AMBIGUOUS_HISTORY');
 await expect(page.locator('.generate-button')).toBeDisabled();await expect(page.locator('.generation-ad-preview')).toHaveCount(0);
 expect(s.state.historyReads).toBe(1);expect(s.state.reads).toBe(0);expect(s.state.writes).toBe(0);
});
test('earlier accepted history does not block the one unfinished result after marker loss',async({page})=>{
 const s=await setup(page);s.state.historyJobs=[s.state.job,{...s.state.job,id:'accepted-job-123',requestId:'accepted-request',state:'accepted',requestFingerprint:'f'.repeat(64)}];
 await restoreOwnedWorkspace(page,s.p,s.owner,'studio');await expect(page.locator('.generation-ad-preview')).toBeVisible();
 expect(s.state.historyReads).toBe(1);expect(s.state.reads).toBe(1);expect(s.state.writes).toBe(0);
});
test('re-login retains the original pending request and resumes reads only',async({page})=>{
 const s=await setup(page);s.state.failures=99;s.state.errorStatus=401;await restoreOwnedWorkspace(page,s.p,s.owner,'studio',s.pending);await expect(page).toHaveURL(/#login$/);
 const replacement=mockSession(s.owner,'member','b');await authenticatedSession(page,replacement,{seed:false});s.state.failures=0;
 await page.evaluate(session=>{sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(session));window.dispatchEvent(new CustomEvent('aiadcast-session-change',{detail:{returnPage:'studio'}}));},replacement);
 await expect(page.locator('.generation-ad-preview')).toBeVisible();expect(s.state.writes).toBe(0);
 expect(await page.evaluate(({owner,id})=>JSON.parse(localStorage.getItem(owner+':aiadcast.pending-generation.'+id)!).requestId,{owner:s.owner,id:s.p.id})).toBe(s.pending.requestId);
});

test('switching projects leaves the earlier request intact and displays only the new project match',async({page})=>{
 const s=await setup(page);s.state.hold=true;await s.open();await expect.poll(()=>s.state.reads).toBe(1);
 await page.getByRole('link',{name:'aiadcast 홈',exact:true}).click();
 const second=structuredClone(s.p);second.id='second-project-123';second.productName='Different product';second.generation.brief+=' Different second project';
 const pending={jobId:'second-job-123',requestId:'second-request-123',key:generatedCompatibilityKey(second),inputKey:JSON.stringify(buildGenerationRequest(second))};
 s.state.job={...s.state.job,id:pending.jobId,projectId:second.id,requestId:pending.requestId,compositionKey:completeAdKey(second),requestFingerprint:createHash('sha256').update(generationMatchKey(buildGenerationRequest(second))).digest('hex')};s.state.hold=false;
 await restoreOwnedWorkspace(page,second,s.owner,'studio',pending);await expect(page.locator('.generation-ad-preview')).toBeVisible();await expect(page.locator('.result-name')).toContainText('Different product');expect(s.state.writes).toBe(0);
 const saved=await page.evaluate(({owner,first,second})=>[first,second].map(id=>JSON.parse(localStorage.getItem(owner+':aiadcast.pending-generation.'+id)!).requestId),{owner:s.owner,first:s.p.id,second:second.id});expect(saved).toEqual([s.pending.requestId,pending.requestId]);
});

test('fresh form submission sends one request without another result-page click',async({page})=>{
 const s=await setup(page);s.state.historyJobs=[];await restoreOwnedWorkspace(page,s.p,s.owner,'studio');await expect.poll(()=>s.state.historyReads).toBe(1);expect(s.state.posted).toHaveLength(0);
 await page.getByRole('button',{name:'입력 내용 수정',exact:true}).click();await page.locator('.consumer-create').getByRole('button',{name:'광고 생성',exact:true}).evaluate((button:HTMLButtonElement)=>{button.click();button.click();});await expect(page.locator('.generation-ad-preview')).toBeVisible();expect(s.state.posted).toHaveLength(1);
});
test('leaving while explicit form intent waits for lookup cancels it across back navigation',async({page})=>{
 const s=await setup(page);s.state.historyJobs=[];s.state.lookup='not-recorded';const {jobId,...pending}=s.pending;await restoreOwnedWorkspace(page,s.p,s.owner,'studio',pending);await expect.poll(()=>s.state.lookupReads).toBe(1);
 await page.getByRole('button',{name:'입력 내용 수정',exact:true}).click();s.state.hold=true;const before=s.state.historyReads;await page.locator('.consumer-create').getByRole('button',{name:'광고 생성',exact:true}).click();await expect.poll(()=>s.state.historyReads).toBeGreaterThan(before);
 await page.getByRole('link',{name:'aiadcast 홈',exact:true}).click();await expect(page).toHaveURL(/#home$/);s.state.hold=false;await page.goBack();await expect(page).toHaveURL(/#studio$/);await expect.poll(()=>s.state.lookupReads).toBeGreaterThanOrEqual(2);await expect(page.locator('.generate-button')).toBeEnabled();expect(s.state.posted).toHaveLength(0);
});

for(const language of ['ko','en'] as const)for(const delayedRecovery of [false,true])test(`readiness timeout cancels queued intent even with delayed recovery (${language}, ${delayedRecovery})`,async({page})=>{
 const s=await setup(page,language);s.state.historyJobs=[];await restoreOwnedWorkspace(page,s.p,s.owner,'studio');await expect.poll(()=>s.state.historyReads).toBe(1);
 await page.getByRole('button',{name:language==='ko'?'입력 내용 수정':'Edit details',exact:true}).click();
 await page.clock.install();s.state.holdStatus=true;s.state.hold=delayedRecovery;const before=s.state.statusReads;
 await page.locator('.consumer-create').getByRole('button',{name:language==='ko'?'광고 생성':'Generate ad',exact:true}).click();await expect.poll(()=>s.state.statusReads).toBeGreaterThan(before);await page.clock.fastForward(16000);
 await expect(page.getByText(language==='ko'?'생성 준비 상태를 15초 안에 확인하지 못했습니다. 다시 확인해주세요.':'Could not check generation readiness within 15 seconds. Please check again.',{exact:true})).toBeVisible();
 expect(s.state.posted).toHaveLength(0);s.state.hold=false;s.state.holdStatus=false;
 const retry=page.getByRole('button',{name:language==='ko'?'다시 확인':'Check again',exact:true});await retry.evaluate((b:HTMLButtonElement)=>{b.click();b.click();});
 await expect(page.locator('.generate-button')).toBeEnabled();await page.clock.fastForward(2000);expect(s.state.posted).toHaveLength(0);
 await page.locator('.generate-button').click();await expect(page.locator('.generation-ad-preview')).toBeVisible();expect(s.state.posted).toHaveLength(1);
 await page.reload();await expect.poll(()=>s.state.reads).toBeGreaterThan(0);expect(s.state.posted).toHaveLength(1);
});
