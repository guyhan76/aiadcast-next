import {test,expect} from '@playwright/test';
import sharp from 'sharp';import {createHash} from 'node:crypto';import {readFile} from 'node:fs/promises';
import {starterProject,prepareCampaign} from '../src/consumer-campaign';
import {buildGenerationRequest} from '../src/generation';
import {generatedCompatibilityKey} from '../src/generated';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
import {restoreOwnedWorkspace} from './helpers/owned-workspace';
const bytes=await sharp({create:{width:864,height:1536,channels:3,background:'#6485a6'}}).png().toBuffer(),hash=createHash('sha256').update(bytes).digest('hex');
for(const language of ['ko','en'] as const)test(`accepted ad hides text editor and preserves existing layers and original export (${language})`,async({page})=>{
 const owner='accepted-owner';await protectedScreen(page,mockSession(owner));await page.addInitScript(language=>localStorage.setItem('aiadcast.ui-language',language),language);
 let writes=0;await page.route('**/api/**',r=>{if(new URL(r.request().url()).pathname==='/api/auth/session')return r.fallback();if(r.request().method()==='POST')writes++;return r.fulfill({status:503,json:{error:{code:'OFFLINE_FIXTURE'}}});});
 let p=starterProject('other');p.locale=language;p.productName='Hoodie';p.productProfile.material='Cotton hoodie';p.product={name:'original.png',data:'data:image/png;base64,'+bytes.toString('base64'),sha256:hash,width:864,height:1536};p=prepareCampaign(p);
 const request=buildGenerationRequest(p);p.generated={jobId:'accepted-fixture',mode:'creative',sourceHash:hash,asset:structuredClone(p.product!),role:'creative',model:'fixture',createdAt:'2026-10-24T15:00:00Z',acceptedAt:'2026-10-24T15:01:00Z',specificationKey:generatedCompatibilityKey(p),composition:'complete-ad',compositionKey:request.output.compositionKey};
 const layer={id:'saved-layer',text:'Preserved edit',x:0,y:0,width:1,height:1,size:.05,color:'#ffffff',cover:'#ff0000',bold:true,align:'left' as const};p.textEdit={source:structuredClone(p.product!),layers:[layer],saved:[{...layer,text:'Last saved copy'}]};
 await restoreOwnedWorkspace(page,p,owner);const accepted=page.locator('.accepted-ad');await expect(accepted).toBeVisible();await expect(page.locator('.dimension-guide')).toHaveCount(0);await expect(page.locator('.text-layer-section')).toHaveCount(0);await expect(page.getByText('글씨 편집',{exact:true})).toHaveCount(0);await expect(page.getByText(/글씨 편집 내용이 보관/)).toHaveCount(0);
 const options=page.locator('.new-ad-options'),toggle=options.locator(':scope > summary');
 await expect(toggle).toHaveText(language==='ko'?'다른 광고 이미지 만들기':'Create another ad image');
 await expect(options).not.toHaveAttribute('open','');await expect(toggle).toHaveAttribute('aria-expanded','false');
 await toggle.focus();await expect(toggle).toBeFocused();await page.keyboard.press('Enter');await expect(options).toHaveAttribute('open','');await expect(toggle).toHaveAttribute('aria-expanded','true');
 await page.keyboard.press('Space');await expect(options).not.toHaveAttribute('open','');
 for(let i=0;i<2;i++){await toggle.click();await expect(options).toHaveAttribute('open','');await toggle.click();await expect(options).not.toHaveAttribute('open','');}
 const style=await toggle.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,width:el.getBoundingClientRect().width,parent:el.parentElement!.getBoundingClientRect().width}));expect(style.background).toBe('rgb(31, 31, 29)');expect(style.color).toBe('rgb(255, 255, 255)');expect(Math.abs(style.width-style.parent)).toBeLessThan(3);expect(writes).toBe(0);
 await expect(accepted).toBeVisible();
 const button=accepted.getByRole('button',{name:language==='ko'?'이미지 저장 · 공유':'Save / share image',exact:true});await expect(button).toBeEnabled();
 const download=page.waitForEvent('download');await button.click();const result=await download,pixels=await sharp(await readFile((await result.path())!)).raw().toBuffer({resolveWithObject:true});expect([...pixels.data.subarray(0,3)]).toEqual([100,133,166]);
 const saved=await page.evaluate(({owner,id})=>new Promise<any>((resolve,reject)=>{const r=indexedDB.open('aiadcast-editor-'+owner,1);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects').objectStore('projects').get(id);q.onsuccess=()=>{resolve(q.result);db.close();};q.onerror=()=>reject(q.error);};}),{owner,id:p.id});expect(saved.textEdit).toEqual(p.textEdit);expect(saved.generated).toEqual(p.generated);
 await page.reload();await expect(accepted).toBeVisible();await expect(accepted.getByRole('button',{name:language==='ko'?'이미지 저장 · 공유':'Save / share image',exact:true})).toBeEnabled();await expect(page.locator('.text-layer-section')).toHaveCount(0);
 await page.getByRole('button',{name:language==='ko'?'입력 내용 수정':'Edit details',exact:true}).click();await expect(page.locator('.consumer-create')).toBeVisible();expect(writes).toBe(0);
});
