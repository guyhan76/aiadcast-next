import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {test,expect,type Page} from '@playwright/test';
import {normalizeGenerationRequest} from '../server/generation-service.mjs';
import {generationMatchKey} from '../src/generation-match';
import type {StoryPlan} from '../src/story-carousel';
import {protectedScreen,mockSession} from './helpers/authenticated-session';

function storyPlan(count:number):StoryPlan{
  return {continuity:'같은 매장의 친구 둘과 흰 접시 한 개',cards:Array.from({length:count},(_,i)=>({
    caption:i===count-1?'한 판 더 주세요':`피자 이야기 ${i+1}`,
    scene:`같은 피자 매장에서 이어지는 장면 ${i+1}`
  }))};
}

async function carouselFixture(page:Page,credits=100){
  await protectedScreen(page,mockSession('carousel-owner'));
  await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
  const png=await sharp({create:{width:320,height:400,channels:4,background:'#a8472f'}}).png().toBuffer();
  const hash=createHash('sha256').update(png).digest('hex');
  // Transport-only images and a simulated wallet; no provider or paid API can be called.
  const submissions:any[]=[],plans:any[]=[],jobs:any[]=[];
  let batchId='';
  await page.route('**/api/status',r=>r.fulfill({json:{generation:{enabled:true,batchVersion:1},wallet:{available:0,reserved:0,credits:{available:credits,reserved:0}},budget:{limitMicros:1000000},assistant:{available:true}}}));
  await page.route('**/api/assistant',r=>{
    const body=r.request().postDataJSON();plans.push(body);
    return r.fulfill({json:{requestId:body.requestId,plan:storyPlan(body.count)}});
  });
  await page.route('**/api/ad-batches/*',r=>r.fulfill({json:{id:batchId,jobs:jobs.map(job=>({...job,artifact:null}))}}));
  await page.route('**/api/generations/carousel-card-*',r=>r.fulfill({json:{job:jobs.find(job=>r.request().url().endsWith(job.id))}}));
  await page.route('**/api/generations/carousel-card-*/accept',r=>{
    const id=new URL(r.request().url()).pathname.split('/').at(-2),job=jobs.find(job=>job.id===id);
    expect(r.request().postDataJSON().artifactId).toBe(job.artifactId);
    job.state='accepted';return r.fulfill({json:{job}});
  });
  await page.route('**/api/generations',r=>{
    if(r.request().method()!=='POST')return r.fulfill({json:{jobs:[]}});
    const body=r.request().postDataJSON();submissions.push(body);batchId=body.batch.id;
    const fingerprint=createHash('sha256').update(generationMatchKey(normalizeGenerationRequest(body.request))).digest('hex');
    for(let i=0;i<body.batch.count;i++)jobs.push({
      id:'carousel-card-'+i,projectId:batchId+'-'+(i+1),mode:'creative',state:'ready',sourceHash:null,
      requestFingerprint:fingerprint,artifactId:hash,composition:'complete-ad',compositionKey:body.request.output.compositionKey,
      model:'fixture',createdAt:'2026-11-28T00:00:00Z',creditUnit:'credit-v2',creditCost:5,creditCaptured:true,
      artifact:{id:hash,sha256:hash,width:320,height:400,role:'creative',dataUrl:'data:image/png;base64,'+png.toString('base64')}
    });
    return r.fulfill({json:{id:batchId}});
  });
  return {submissions,plans};
}

async function openCarousel(page:Page){
  await page.goto('/#create');
  const form=page.locator('.consumer-create');
  await form.getByRole('button',{name:'인스타 피드 캐러셀',exact:true}).click();
  await form.getByRole('button',{name:'서비스',exact:true}).click();
  await form.getByLabel('분야',{exact:true}).selectOption('dining');
  await form.getByLabel('세부 업종',{exact:true}).selectOption('restaurant');
  await form.getByLabel('서비스명',{exact:true}).fill('피자 이야기');
  await form.getByLabel('원하는 광고 한 줄',{exact:true}).fill('친구 둘이 마지막 피자 한 조각을 두고 한 판 더 주문해요.');
  return form;
}

for(const count of [2,4,6,10]){
  test(`approve, edit, generate and save a ${count}-card feed carousel at five credits per image`,async({page})=>{
    const {submissions,plans}=await carouselFixture(page);
    const form=await openCarousel(page),counts=form.getByRole('group',{name:'생성 장수',exact:true});
    await expect(counts.getByRole('button')).toHaveText(['2장','4장','6장','8장','10장']);
    await expect(counts.getByRole('button',{name:'4장',exact:true})).toHaveAttribute('aria-pressed','true');
    if(count!==4)await counts.getByRole('button',{name:`${count}장`,exact:true}).click();
    await expect(form.getByLabel('출력 비율',{exact:true})).toHaveValue('4:5');
    await expect(form.getByLabel('출력 비율',{exact:true})).toBeDisabled();
    await form.getByRole('button',{name:'캐러셀 구성 만들기'}).click();
    const dialog=page.getByRole('dialog');
    await expect(dialog.getByLabel('이미지에 넣을 문구')).toHaveCount(count);
    await expect(dialog.getByLabel('장면',{exact:true})).toHaveCount(count);
    await expect(dialog.locator('dd')).toHaveText(['100',String(count*5),String(100-count*5)]);
    expect(plans).toHaveLength(1);expect(plans[0].count).toBe(count);expect(submissions).toHaveLength(0);
    const confirm=dialog.getByRole('button',{name:`캐러셀 ${count}장 생성`,exact:true});
    const last=dialog.getByLabel('이미지에 넣을 문구').nth(count-1);
    await last.fill('');await expect(confirm).toBeDisabled();
    await last.fill('같은 피자로 한 판 더!');
    await dialog.getByLabel('장면',{exact:true}).first().fill('같은 친구 둘이 빈 접시를 보며 마지막 피자 조각을 가리킨다.');
    await confirm.click();
    await expect.poll(()=>submissions.length).toBe(1);
    const body=submissions[0],approved=storyPlan(count);
    approved.cards[0].scene='같은 친구 둘이 빈 접시를 보며 마지막 피자 조각을 가리킨다.';
    approved.cards[count-1].caption='같은 피자로 한 판 더!';
    expect(body.request.output.format).toBe('4:5');
    expect(body.batch.count).toBe(count);
    expect(body.batch.storyPlan).toEqual(approved);
    expect(body.batch.quote).toMatchObject({count,ticketsUsed:0,creditsUsed:count*5,creditsAfter:100-count*5});
    const results=page.locator('.batch-results');
    await expect(results.locator('.batch-grid img')).toHaveCount(count);
    await results.getByLabel(`광고 ${count}`,{exact:true}).check();
    const download=page.waitForEvent('download');
    await results.getByRole('button',{name:'선택 저장 (1)',exact:true}).click();
    expect((await download).suggestedFilename()).toMatch(new RegExp(`-${String(count).padStart(2,'0')}\\.png$`));
    // A saved single card must survive project parsing, independently of the multi-card plan.
    await page.goto('/#projects');
    const saved=page.locator('.project-tile').filter({has:page.locator('.project-tile-caption strong',{hasText:new RegExp(`피자 이야기.* · ${count}$`)})});
    await expect(saved).toHaveCount(1);await saved.click();
    await expect(page.getByRole('heading',{name:'사용 확정한 광고'})).toBeVisible();
    expect(submissions).toHaveLength(1);
  });
}

test('changing six cards to ten replans and rejects an old-length response before any image request',async({page})=>{
  const {submissions}=await carouselFixture(page);
  const planning:any[]=[];
  await page.route('**/api/assistant',r=>{
    const body=r.request().postDataJSON();planning.push(body);
    // The second response has the new request ID but a stale six-card plan.
    return r.fulfill({json:{requestId:body.requestId,plan:storyPlan(planning.length===2?6:body.count)}});
  });
  const form=await openCarousel(page),counts=form.getByRole('group',{name:'생성 장수',exact:true});
  await counts.getByRole('button',{name:'6장',exact:true}).click();
  await form.getByRole('button',{name:'캐러셀 구성 만들기'}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByLabel('이미지에 넣을 문구')).toHaveCount(6);
  await dialog.getByRole('button',{name:'취소',exact:true}).click();
  await counts.getByRole('button',{name:'10장',exact:true}).click();
  await form.getByRole('button',{name:'캐러셀 구성 만들기'}).click();
  await expect(form.getByRole('alert')).toContainText('장별 구성안을 확인하지 못했습니다');
  await expect(dialog).toHaveCount(0);expect(submissions).toHaveLength(0);
  expect(planning.map(request=>request.count)).toEqual([6,10]);
  expect(planning[1].requestId).not.toBe(planning[0].requestId);
  await form.getByRole('button',{name:'캐러셀 구성 만들기'}).click();
  await expect(dialog.getByLabel('이미지에 넣을 문구')).toHaveCount(10);
  await expect(dialog.locator('dd')).toHaveText(['100','50','50']);
  expect(planning[2].requestId).toBe(planning[1].requestId);
  expect(submissions).toHaveLength(0);
  await dialog.getByRole('button',{name:'캐러셀 10장 생성',exact:true}).click();
  await expect.poll(()=>submissions.length).toBe(1);
  expect(submissions[0].batch.storyPlan.cards).toHaveLength(10);
  expect(submissions[0].batch.count).toBe(10);
});

test('insufficient credit stops a ten-card plan before calling the planner or image generator',async({page})=>{
  const {plans,submissions}=await carouselFixture(page,40);
  const form=await openCarousel(page);
  await form.getByRole('group',{name:'생성 장수',exact:true}).getByRole('button',{name:'10장',exact:true}).click();
  await form.getByRole('button',{name:'캐러셀 구성 만들기'}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toContainText('10크레딧이 부족');
  await expect(dialog.getByRole('button',{name:'캐러셀 10장 생성',exact:true})).toBeDisabled();
  expect(plans).toHaveLength(0);expect(submissions).toHaveLength(0);
});
