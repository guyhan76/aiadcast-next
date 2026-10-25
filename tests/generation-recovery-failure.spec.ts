import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {starterProject,prepareCampaign} from '../src/consumer-campaign';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
import {restoreOwnedWorkspace} from './helpers/owned-workspace';
const bytes=await sharp({create:{width:12,height:12,channels:3,background:'white'}}).png().toBuffer();
for(const language of ['ko','en'] as const)for(const failure of ['404','network','malformed','wrong-project','missing-request'] as const)test(`pending ${failure} is failed, not loading; read-only recovery (${language})`,async({page})=>{
 const owner='recovery-failure-owner';await protectedScreen(page,mockSession(owner));await page.addInitScript(l=>localStorage.setItem('aiadcast.ui-language',l),language);
 let p=starterProject('other');p.productName='Cream';p.productProfile.material='50ml';p.locale=language;p.product={name:'photo.png',data:'data:image/png;base64,'+bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex'),width:12,height:12};p=prepareCampaign(p);
 const pending={jobId:failure==='missing-request'?'':'existing-job',requestId:'original-request',key:'original-key'};
 let failed=true,hold=false,reads=0,writes=0;
 const wallet={available:3,reserved:1,kind:'test'};
 const job={id:'existing-job',projectId:p.id,requestId:pending.requestId,state:'uncertain',mode:'creative',sourceHash:p.product.sha256,createdAt:'2026-10-25T00:00:00Z',model:'mock',artifactId:null,artifact:null,errorCode:'PROVIDER_UNCERTAIN'};
 await page.route('**/api/**',async r=>{
 const path=new URL(r.request().url()).pathname;if(path==='/api/auth/session')return r.fallback();if(r.request().method()!=='GET')writes++;
 if(path==='/api/status')return r.fulfill({json:{generation:{enabled:true,model:'mock',photoPurposes:true},wallet,budget:{limitMicros:5000000,spentMicros:0,heldMicros:500000}}});
 if(path.startsWith('/api/generations')){reads++;while(hold&&!page.isClosed())await new Promise(resolve=>setTimeout(resolve,20));
 if(failed){if(failure==='network')return r.abort('failed');if(failure==='404')return r.fulfill({status:404,json:{error:{code:'JOB_NOT_FOUND'}}});if(failure==='malformed')return r.fulfill({json:{job:null}});if(failure==='wrong-project')return r.fulfill({json:{job:{...job,projectId:'different-project'},wallet}});return r.fulfill({json:{jobs:[]}});}
 return r.fulfill({json:path==='/api/generations'?{jobs:[job]}:{job,wallet}});}
 return r.fulfill({status:404,json:{error:{code:'NOT_FOUND'}}});});
 await restoreOwnedWorkspace(page,p,owner,'studio',pending);
 const options=page.locator('.new-ad-options');if(!await options.evaluate(el=>(el as HTMLDetailsElement).open))await options.locator(':scope > summary').click();
 const panel=options.locator('.generation-panel');
 await expect(panel.getByRole('alert')).toContainText(language==='ko'?'기존 작업을 확인하지 못했습니다':'Could not check existing work');
 const loading=panel.getByText(language==='ko'?'이전 요청 상태를 확인하고 있습니다. 중복 생성을 막기 위해 새 요청을 보류합니다.':'Checking the earlier request. New requests are paused to prevent duplicate generation.',{exact:true});
 await expect(loading).toHaveCount(0);
 await expect(panel.locator('.generate-button')).toBeDisabled();
 const stored=()=>page.evaluate(({owner,id})=>JSON.parse(localStorage.getItem(owner+':aiadcast.pending-generation.'+id)!),{owner,id:p.id});
 expect((await stored()).requestId).toBe(pending.requestId);
 failed=false;hold=true;const check=panel.getByRole('button',{name:language==='ko'?'기존 결과 다시 확인':'Check existing results again'});await check.click();await expect(check).toBeDisabled();await expect(loading).toBeVisible();await expect(panel.getByRole('alert')).toHaveCount(0);
 const before=reads;await check.evaluate((el:HTMLButtonElement)=>{el.click();el.click();});expect(reads).toBe(before);hold=false;
 await expect(loading).toHaveCount(0);await expect(check).toBeEnabled();expect(writes).toBe(0);expect((await stored()).requestId).toBe(pending.requestId);
 // A successful read of an uncertain job never authorizes a new generation.
 await expect(panel.locator('.generate-button')).toHaveCount(0);
});
