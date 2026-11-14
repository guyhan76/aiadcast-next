import {test,expect} from '@playwright/test';
import sharp from 'sharp';import {createHash} from 'node:crypto';
import {starterProject,prepareCampaign} from '../src/consumer-campaign';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
import {restoreOwnedWorkspace} from './helpers/owned-workspace';
const bytes=await sharp({create:{width:12,height:12,channels:3,background:'white'}}).png().toBuffer();
for(const language of ['ko','en'] as const)for(const scenario of ['missing','failed-history','normal','running','budget','checking'] as const)test(`${scenario} disabled explanation and read-only recovery (${language})`,async({page})=>{
 const owner='diagnostic-owner';await protectedScreen(page,mockSession(owner));await page.addInitScript(l=>localStorage.setItem('aiadcast.ui-language',l),language);
 let p=starterProject('other');p.productName='Cream';p.productProfile.material='50ml';p.locale=language;
 if(scenario!=='missing')p.product={name:'photo.png',data:'data:image/png;base64,'+bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex'),width:12,height:12};p=prepareCampaign(p);
 let posts=0,fail=scenario==='failed-history',hold=scenario==='checking',reads=0;
 const job={id:'existing-job',projectId:p.id,state:'running',mode:'creative',sourceHash:p.product?.sha256,createdAt:'2026-10-25T00:00:00Z',model:'mock',artifactId:null,artifact:null,errorCode:null};
 await page.route('**/api/**',async r=>{const path=new URL(r.request().url()).pathname;if(path==='/api/auth/session')return r.fallback();if(r.request().method()==='POST')posts++;
 if(path==='/api/status')return r.fulfill({json:{mode:'invite-beta',commercialReady:false,generation:{enabled:scenario!=='budget',model:'mock',reason:scenario==='budget'?'BUDGET_NOT_AVAILABLE':null,photoPurposes:true},wallet:{available:0,reserved:0,unlimited:true,kind:'test'},budget:{limitMicros:500000,spentMicros:500000,heldMicros:0}}});
 if(path==='/api/generations'){reads++;while(hold&&!page.isClosed())await new Promise(resolve=>setTimeout(resolve,30));return fail?r.fulfill({status:403,json:{error:{code:'DENIED'}}}):r.fulfill({json:{jobs:scenario==='running'?[job]:[]}});}
 if(path==='/api/generations/existing-job')return r.fulfill({json:{job,wallet:{available:0,reserved:0,unlimited:true,kind:'test'}}});
 return r.fulfill({status:404,json:{error:{code:'NOT_FOUND'}}});});
 await restoreOwnedWorkspace(page,p,owner);const options=page.locator('.new-ad-options');await options.locator(':scope > summary').click();const panel=options.locator('.generation-panel'),button=panel.locator('.generate-button');
 if(scenario==='missing'){await expect(panel.getByRole('status',{name:language==='ko'?'입력 확인 필요':'Input needs attention'})).toContainText(language==='ko'?'상품·공간 사진':'product or location photo');await expect(button).toBeDisabled();await panel.getByRole('button',{name:language==='ko'?'입력 확인하기':'Review inputs',exact:true}).click();await expect(page.locator('.consumer-create')).toBeVisible();}
 if(scenario==='failed-history'){await expect(panel.getByRole('alert')).toContainText(language==='ko'?'기존 작업을 확인하지 못했습니다':'Could not check existing work');await expect(button).toBeDisabled();fail=false;const check=panel.getByRole('button',{name:language==='ko'?'기존 결과 다시 확인':'Check existing results again'});hold=true;await check.click();await expect(check).toBeDisabled();const before=reads;await check.evaluate((el:HTMLButtonElement)=>{el.click();el.click();});expect(reads).toBe(before);hold=false;await expect(button).toBeEnabled();}
 if(scenario==='normal')await expect(button).toBeEnabled();
 if(scenario==='running'){await expect(button).toBeDisabled();await expect(button).toContainText(language==='ko'?'시안 제작 중':'Creating your visual');}
 if(scenario==='budget')await expect(panel.getByText(language==='ko'?'생성 예산이 부족합니다. 관리자에게 확인해주세요. 추가 결제로 해결되지 않습니다.':'Generation budget is unavailable. Contact your administrator; another purchase will not resolve this.',{exact:true})).toBeVisible();
 if(scenario==='checking'){await expect(button).toBeDisabled();await expect(panel.getByText(language==='ko'?'이전 생성 요청을 확인 중입니다. 확인 후 생성할 수 있습니다.':'Checking previous requests before allowing generation.',{exact:true})).toBeVisible();hold=false;await expect(button).toBeEnabled();}
 expect(posts).toBe(0);hold=false;
});
