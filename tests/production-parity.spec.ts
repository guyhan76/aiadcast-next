import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {expect,test,type Page} from '@playwright/test';
import {generationMatchKey} from '../src/generation-match';
import {normalizeGenerationRequest} from '../server/generation-service.mjs';
import {mockSession,protectedScreen} from './helpers/authenticated-session';
import sharp from 'sharp';

async function prepareParityPage(page:Page,native:boolean) {
  const origin = native ? 'https://appassets.androidplatform.net' : (process.env.AIADCAST_PARITY_WEB_ORIGIN || 'http://127.0.0.1:4180');
  if (native) {
    // Mirror the Android asset loader under its real origin, using the assets from the Android package.
    await page.route(origin+'/**', async route => {
      const path=new URL(route.request().url()).pathname;
      if (!/^\/(?:[a-zA-Z0-9_@./-]*)$/.test(path) || path.includes('..')) throw Error(path);
      const name=path==='/'?'index.html':path.slice(1);
      const body=await readFile('android/app/src/main/assets/'+name);
      const mime:Record<string,string>={html:'text/html',css:'text/css',js:'text/javascript',woff2:'font/woff2',png:'image/png',webp:'image/webp',json:'application/json'};
      await route.fulfill({body,contentType:mime[name.split('.').pop()!]??'application/octet-stream'});
    });
    await page.addInitScript(() => Object.assign(window,{
      __AIADCAST_API_ORIGIN__:'https://aiadcast-next.onrender.com',
      __AIADCAST_GOOGLE_NATIVE__:{version:1,packageId:'com.selluplabs.aiadcast.next.preview'},
      AiadcastNative:{postMessage:()=>{}}
    }));
  }
  const session={...mockSession('parity-member'),...(native?{origin:'https://aiadcast-next.onrender.com'}:{})};
  await protectedScreen(page,session);
  await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
  return origin;
}

test('web and native clients submit identical briefs and display the same delivered batch', async ({browser}) => {
  const source = await sharp({create:{width:864,height:1536,channels:4,background:'#246790'}}).png().toBuffer();
  const sha = createHash('sha256').update(source).digest('hex');
  const evidence:unknown[] = [];
  for (const native of [false,true]) {
    const context = await browser.newContext({viewport:{width:native?390:1440,height:900},locale:'ko-KR'});
    try {
      const page = await context.newPage();
      const origin = await prepareParityPage(page,native);
      const jobs:any[]=[];
      let batchId='',count=0,submitted:any;
      await page.route('**/api/status',r=>r.fulfill({json:{generation:{enabled:true,batchVersion:1,creditQuote:{unit:'credit-v2',amount:10,policy:'delivered-2026-10-18'}},wallet:{available:0,reserved:0,credits:{available:80,reserved:0}},budget:{limitMicros:8000000}}}));
      await page.route('**/api/ad-batches/*',r=>r.fulfill({json:{id:batchId,jobs:jobs.map(j=>({...j,artifact:null}))}}));
      await page.route('**/api/generations/parity-*',r=>r.fulfill({json:{job:jobs.find(j=>r.request().url().endsWith(j.id))}}));
      await page.route('**/api/generations',async r=>{
        if(r.request().method()!=='POST')return r.fulfill({json:{jobs:[]}});
        count++;
        const {batch,request}=r.request().postDataJSON();
        batchId=batch.id;
        submitted={request,quote:batch.quote,count:batch.count};
        const fingerprint=createHash('sha256').update(generationMatchKey(normalizeGenerationRequest(request))).digest('hex');
        for(let i=0;i<batch.count;i++)jobs.push({id:'parity-'+i,projectId:batchId+'-'+(i+1),mode:'creative',state:'ready',sourceHash:null,requestFingerprint:fingerprint,artifactId:sha,composition:'complete-ad',compositionKey:request.output.compositionKey,model:'fixture',createdAt:'2026-11-14T00:00:00Z',creditUnit:'credit-v2',artifact:{id:sha,sha256:sha,width:864,height:1536,role:'creative',dataUrl:'data:image/png;base64,'+source.toString('base64')}});
        await r.fulfill({json:{id:batchId}});
      });
      await page.goto(origin+'/#create');
      const form=page.locator('.consumer-create');
      await form.getByRole('button',{name:'서비스',exact:true}).click();
      await form.getByLabel('분야',{exact:true}).selectOption('travel');
      await form.getByLabel('세부 업종',{exact:true}).selectOption('tickets');
      await form.getByLabel('서비스명',{exact:true}).fill('공연 티켓');
      await form.getByLabel('상세설명',{exact:true}).fill('공연 입장권, 1인 19,800원');
      await form.getByLabel('추가 요청',{exact:true}).fill('공연명과 가격을 강조해주세요');
      await form.getByRole('button',{name:'2',exact:true}).click();
      await form.getByRole('button',{name:'광고 생성',exact:true}).click();
      await page.getByRole('dialog').getByRole('button',{name:'확인',exact:true}).click();
      const images=page.locator('.batch-grid img');
      await expect(images).toHaveCount(2);
      const displayed=await images.evaluateAll(async nodes=>Promise.all(nodes.map(async node=>{
        const bytes=await (await fetch((node as HTMLImageElement).src)).arrayBuffer();
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
      })));
      expect(count).toBe(1);
      expect(submitted.count).toBe(2);
      evidence.push({submitted,displayed});
    } finally { await context.close(); }
  }
  expect(evidence[1]).toEqual(evidence[0]);
});

for (const service of [false,true]) {
  test('section 5 matches on web and Android for '+(service?'performance tickets':'skincare'), async ({browser}) => {
    const observed = [];
    for (const native of [false,true]) {
      const context = await browser.newContext({
        viewport:{width:native?390:1440,height:900},locale:'ko-KR',serviceWorkers:'block'
      });
      try {
        const page = await context.newPage();
        const origin = await prepareParityPage(page,native);
        await page.goto(origin+'/#create');
        const form = page.locator('.consumer-create');
        await form.getByRole('button',{name:service?'서비스':'상품',exact:true}).click();
        await form.getByLabel('분야',{exact:true}).selectOption(service?'travel':'beauty');
        await form.getByLabel('세부 업종',{exact:true}).selectOption(service?'tickets':'skincare');
        const details = form.locator('[data-order="5"]');
        const fields = [
          [service?'서비스명':'상품명',service?'예: 제주 감성 숙소':'예: 탄력케어 리프팅 3종세트'],
          ['상세설명','재질, 특징, 장점, 가격, 배송 등 광고에 담을 정보를 적어주세요.'],
          ['추가 요청','원하는 연출이나 강조할 내용을 적어주세요 (선택)']
        ];
        for (const [label,example] of fields) {
          const input = details.getByRole('textbox',{name:label,exact:true});
          await expect(input).toHaveAttribute('placeholder',example);
          await expect(input).toHaveValue('');
        }
        const guide = details.locator('details');
        await expect(guide).not.toHaveAttribute('open','');
        await details.screenshot({path:test.info().outputPath((native?'android':'web')+'-section-5.png')});
        await guide.locator('summary').click();
        await expect(guide).toContainText(service?'여행상품 예시':'화장품 예시');
        observed.push(await details.innerText());
      } finally { await context.close(); }
    }
    expect(observed[1]).toEqual(observed[0]);
  });
}
