import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {normalizeGenerationRequest} from '../server/generation-service.mjs';
import {generationMatchKey} from '../src/generation-match';
import {test,expect} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';

test('category menus separate products and services and keep every image count',async({page})=>{
  await protectedScreen(page,mockSession('preview-release'));
  await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
  await page.goto('/#create');
  const form=page.locator('.consumer-create');
  const picker=form.locator('.ad-field-picker');
  await expect(picker.getByRole('searchbox')).toHaveCount(0);
  const products=picker.getByRole('button',{name:'상품',exact:true});
  const services=picker.getByRole('button',{name:'서비스',exact:true});
  const heading=await form.locator('[data-order="1"] h2').boundingBox(),button=await products.boundingBox();
  expect(button!.y-(heading!.y+heading!.height)).toBeGreaterThanOrEqual(16);
  await products.click();
  await expect(products).toHaveAttribute('aria-pressed','true');
  const fields=picker.getByLabel('분야',{exact:true}), items=picker.getByLabel('세부 업종',{exact:true});
  await fields.selectOption('fashion');
  await items.selectOption('shoes');
  await expect(items).toHaveValue('shoes');
  await services.click();
  await expect(services).toHaveCSS('color','rgb(255, 255, 255)');
  const contrast=await services.evaluate(button=>{
    const style=getComputedStyle(button);
    const luminance=(color:string)=>{
      const channels=(color.match(/\d+/g)??[]).slice(0,3).map(value=>{
        const channel=Number(value)/255;
        return channel<=0.04045 ? channel/12.92 : ((channel+0.055)/1.055)**2.4;
      });
      return 0.2126*channels[0]+0.7152*channels[1]+0.0722*channels[2];
    };
    const fg=luminance(style.color), bg=luminance(style.backgroundColor);
    return (Math.max(fg,bg)+0.05)/(Math.min(fg,bg)+0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await expect(products).toHaveAttribute('aria-pressed','false');
  await expect(fields.locator('option[value="fashion"]')).toHaveCount(0);
  for(const [field,item] of [['lease-rental','auto-lease'],['logistics','parcel'],['brand-pr','brand-story']]){
    await fields.selectOption(field);
    await items.selectOption(item);
    await expect(items).toHaveValue(item);
  }
  const section=form.locator('[data-order="9"]');
  await expect(section.getByRole('heading',{name:/생성 장수/})).toBeVisible();
  for(const n of [1,2,4,6,8,10]){
    const option=section.getByRole('button',{name:String(n),exact:true});
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed','true');
    await expect(section.getByRole('button',{pressed:true})).toHaveCount(1);
  }
});

test('confirm the complete credit amount before submitting a batch',async({page})=>{
 await protectedScreen(page,mockSession('batch-member'));
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 let writes=0,id='';const jobs:any[]=[];
 const png=await sharp({create:{width:864,height:1536,channels:4,background:'#325484'}}).png().toBuffer(),hash=createHash('sha256').update(png).digest('hex');
 await page.route('**/api/ad-batches/*',r=>r.fulfill({json:{id,jobs:jobs.map(j=>({...j,artifact:null}))}}));
 await page.route('**/api/generations/mock-ad-*',r=>r.fulfill({json:{job:jobs.find(j=>r.request().url().endsWith(j.id))}}));
 await page.addInitScript(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async({files}:{files:File[]})=>{sessionStorage.setItem('shared-names',JSON.stringify(files.map(f=>f.name)));}});});
 await page.route('**/api/status',route=>route.fulfill({json:{generation:{enabled:true,batchVersion:1,creditQuote:{unit:'credit-v2',amount:10,policy:'delivered-2026-10-18'}},wallet:{available:0,reserved:0,credits:{available:80,reserved:0}},budget:{limitMicros:8000000}}}));
 await page.route('**/api/generations',route=>{if(route.request().method()==='POST'){writes++;const body=route.request().postDataJSON();expect(body.batch.count).toBe(4);expect(body.batch.quote.creditsUsed).toBe(40);id=body.batch.id;
 const fingerprint=createHash('sha256').update(generationMatchKey(normalizeGenerationRequest(body.request))).digest('hex');
 for(let index=0;index<4;index++)jobs.push({id:'mock-ad-'+index,projectId:id+'-'+(index+1),mode:'creative',state:'ready',sourceHash:null,requestFingerprint:fingerprint,artifactId:hash,composition:'complete-ad',compositionKey:body.request.output.compositionKey,model:'test',createdAt:new Date().toISOString(),creditUnit:'credit-v2',artifact:{id:hash,sha256:hash,width:864,height:1536,role:'creative',dataUrl:'data:image/png;base64,'+png.toString('base64')}});
 return route.fulfill({json:{id}});}return route.fulfill({json:{jobs:[]}});});
 await page.goto('/#create');const form=page.locator('.consumer-create');
 await form.getByRole('button',{name:'서비스',exact:true}).click();
 await form.getByLabel('분야',{exact:true}).selectOption('logistics');await form.getByLabel('세부 업종',{exact:true}).selectOption('parcel');
 await form.getByRole('textbox',{name:'서비스명',exact:true}).fill('택배');await form.getByRole('textbox',{name:'상세설명',exact:true}).fill('지역 택배 배송 서비스');
 await form.getByRole('button',{name:'10',exact:true}).click();await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toContainText('20크레딧이 부족');await expect(dialog.getByRole('button',{name:'확인',exact:true})).toBeDisabled();
 await dialog.getByRole('button',{name:'취소'}).click();expect(writes).toBe(0);
 await form.getByRole('button',{name:'4',exact:true}).click();await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 await expect(dialog).toContainText('이미지 4장');await expect(dialog.locator('dd')).toHaveText(['80','40','40']);expect(writes).toBe(0);
 await dialog.getByRole('button',{name:'확인',exact:true}).click();await expect.poll(()=>writes).toBe(1);
 const results=page.locator('.batch-results');await expect(results.locator('.batch-grid img')).toHaveCount(4);
 await results.getByLabel('전체 선택',{exact:true}).check();await expect(results.getByRole('button',{name:'선택 저장 (4)'})).toBeEnabled();
 await results.getByLabel('광고 2',{exact:true}).uncheck();await results.getByLabel('광고 4',{exact:true}).uncheck();
 const download=page.waitForEvent('download');await results.getByRole('button',{name:'선택 저장 (2)'}).click();expect((await download).suggestedFilename()).toBe('aiadcast-images.zip');
 await results.getByRole('button',{name:'선택 공유 (2)'}).click();
 const names=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('shared-names')??'[]'));expect(names).toHaveLength(2);expect(names[0]).toMatch(/-01\.png$/);expect(names[1]).toMatch(/-03\.png$/);
 expect(writes).toBe(1);
});

test('open a device image and paint a precision edit on mobile and desktop',async({page})=>{
 await protectedScreen(page,mockSession('device-editor'));
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 await page.route('**/api/status',r=>r.fulfill({json:{generation:{enabled:true,selectiveEdit:true,selectiveEditProofVersion:1,creditQuote:{unit:'credit-v2',amount:10,policy:'delivered-2026-10-18'}},wallet:{available:0,reserved:0,credits:{available:30,reserved:0}},budget:{limitMicros:1000000}}}));
 const png=await sharp({create:{width:128,height:96,channels:4,background:'#578aac'}}).png().toBuffer();
 let submissions=0;
 await page.route('**/api/selective-edits/upload',async r=>{
  submissions++;
  const body=r.request().postDataJSON();
  expect(body.original.width).toBe(128);expect(body.original.height).toBe(96);
  expect(body.mask.width).toBe(128);expect(body.creditQuote.amount).toBe(10);
  const raw=await sharp(Buffer.from(body.mask.data.split(',')[1],'base64')).ensureAlpha().raw().toBuffer();
  const alpha=Array.from(raw).filter((_,i)=>i%4===3);expect(alpha).toContain(0);expect(alpha).toContain(255);
  await r.fulfill({status:409,json:{error:{code:'GENERATION_ALREADY_RUNNING'}}});
 });
 await page.goto('/#projects');
 await expect(page.getByRole('button',{name:'기기 사진 정밀 편집'})).toBeVisible();
 await page.getByLabel('편집할 기기 사진').setInputFiles({name:'sky.png',mimeType:'image/png',buffer:png});
 const dialog=page.getByRole('dialog',{name:'정밀 편집'});
 await expect(dialog.getByAltText('원본 광고')).toBeVisible();
 await dialog.getByLabel('수정 영역 칠하기').click({position:{x:20,y:20}});
 await dialog.getByLabel('수정 요청',{exact:true}).fill('하늘에 구름 추가');
 const submit=dialog.getByRole('button',{name:'정밀 편집 요청'});
 await expect(submit).toBeDisabled();
 await dialog.getByRole('checkbox').check();await submit.click();await expect.poll(()=>submissions).toBe(1);
 await expect(submit).toBeEnabled();
});
