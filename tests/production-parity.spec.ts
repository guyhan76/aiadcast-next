import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {expect,test,type Page} from '@playwright/test';
import {generationMatchKey} from '../src/generation-match';
import {normalizeGenerationRequest} from '../server/generation-service.mjs';
import {mockSession,protectedScreen} from './helpers/authenticated-session';
import sharp from 'sharp';
import {reloadDraft} from './helpers/workspace';
import {restoreOwnedWorkspace} from './helpers/owned-workspace';
import {starterProject} from '../src/consumer-campaign';
import {campaignFieldExamples} from '../src/campaign-field-examples';

function parityOrigin(native:boolean) {
  return native ? 'https://appassets.androidplatform.net' : (process.env.AIADCAST_PARITY_WEB_ORIGIN || 'http://127.0.0.1:4180');
}

async function prepareParityPage(page:Page,native:boolean) {
  const origin = parityOrigin(native);
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
        const selectType = (isService:boolean) =>
          form.getByRole('button',{name:isService?'서비스':'상품',exact:true}).click();
        const chooseIndustry = async (isService:boolean) => {
          await form.getByLabel('분야',{exact:true}).selectOption(isService?'travel':'beauty');
          await form.getByLabel('세부 업종',{exact:true}).selectOption(isService?'tickets':'skincare');
        };
        const details = form.locator('[data-order="5"]');
        const label = service?'서비스명':'상품명';
        const name = details.getByRole('textbox',{name:label,exact:true});
        const description = details.getByRole('textbox',{name:'상세설명',exact:true});
        const request = details.getByRole('textbox',{name:'추가 요청',exact:true});
        await selectType(!service);
        await chooseIndustry(!service);
        await selectType(service);
        await expect(name).toHaveAttribute('placeholder',service?"예: 제주의 감성이 있는 한옥 스위트":"예: 탄력케어 리프팅 3종세트");
        await expect(description).toHaveAttribute('placeholder',service?"예:\n아름다운 제주 해변이 있는\n한국의 멋과 감성이 있는 한옥 공간에서\n휴식과 힐링의 시간을 가지세요.\n\n침실1개, 킹사이즈 침대 1개, 욕실 1개\n해변, 자쿠지, 화덕, 뒷마당\n에어컨, TV, 셀프체크인\n반려동물동반가능\n\n1박 399,000원":"예:\n3종세트 리프팅 스킨+에멀전+크림\n\n저자극 포뮬러 피부에 순하게\n기존 대비 3배 많은 콜라겐\n효과는 강력하게\n늘어나는 주름, 꺼지는 피부 탄력\n더 늦기 전에 지금 시작하세요.\n가격 29,800원\n당일로켓배송");
        await expect(request).toHaveAttribute('placeholder',service?"예: 제주 해변과 한옥의 따뜻한 분위기를 보여주고, 1박 399,000원을 눈에 띄게 넣어주세요.":"예: 세 제품을 나란히 보여주고, 29,800원과 당일로켓배송이 한눈에 보이게 해주세요.");
        await expect(description).toHaveValue('');
        await expect(request).toHaveValue('');
        await reloadDraft(page);
        await expect(form.getByRole('button',{name:service?'서비스':'상품',exact:true})).toHaveAttribute('aria-pressed','true');
        await expect(name).toHaveValue('');
        await chooseIndustry(service);
        await expect(name).toBeVisible();
        await page.evaluate(()=>document.fonts.ready);
        for (const field of [description,request]) {
          expect(await field.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(2);
        }
        const guide = details.locator('details');
        await expect(guide).not.toHaveAttribute('open','');
        await details.screenshot({path:test.info().outputPath((native?'android':'web')+'-section-5.png')});
        await guide.locator('summary').click();
        await expect(guide).toContainText(service?'여행상품 예시':'화장품 예시');
        observed.push(await details.innerText());
        await name.fill('고객이 입력한 이름');
        await description.fill('고객이 입력한 내용');
        await request.fill('고객이 입력한 연출');
        await selectType(!service);
        await expect(details.getByRole('textbox',{name:service?'상품명':'서비스명',exact:true})).toHaveValue('고객이 입력한 이름');
        await expect(description).toHaveValue('고객이 입력한 내용');
        await expect(request).toHaveValue('고객이 입력한 연출');
      } finally { await context.close(); }
    }
    expect(observed[1]).toEqual(observed[0]);
  });
}

for (const native of [false,true]) {
  test('restored industry-only description on '+(native?'Android':'web'), async ({browser}) => {
    const context = await browser.newContext({baseURL:parityOrigin(native),
      viewport:{width:native?390:1440,height:900},locale:'ko-KR',serviceWorkers:'block'});
    try {
      const page = await context.newPage();
      await prepareParityPage(page,native);
      const owner = 'parity-member';
      const scope = native ? owner+'@'+encodeURIComponent('https://aiadcast-next.onrender.com') : owner;
      const previous = starterProject('services');
      const header = '업종: 여행·티켓·렌탈 > 공연·전시 티켓';
      previous.productProfile.material = header;
      await restoreOwnedWorkspace(page,previous,owner,'create',undefined,
        {step:0,project:previous,industryChosen:true},scope);
      const form = page.locator('.consumer-create');
      const section = form.locator('[data-order="5"]');
      const description = section.getByRole('textbox',{name:'상세설명',exact:true});
      await expect(form.getByLabel('세부 업종',{exact:true})).toHaveValue('tickets');
      for (const kind of ['service','product'] as const) {
        await form.getByRole('button',{name:kind==='service'?'서비스':'상품',exact:true}).click();
        await expect(description).toHaveAttribute('placeholder',campaignFieldExamples.ko[kind].description);
        await expect(description).toHaveValue('');
        expect(await description.evaluate(el=>el.matches(':placeholder-shown'))).toBe(true);
        await page.evaluate(()=>document.fonts.ready);
        expect(await description.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(2);
        await section.screenshot({path:test.info().outputPath((native?'android':'web')+'-'+kind+'-restored-section-5.png')});
      }
      await reloadDraft(page);
      await expect(description).toHaveValue('');
      await expect(form.getByRole('button',{name:'상품',exact:true})).toHaveAttribute('aria-pressed','true');
      const facts='업종: 고객이 직접 작성한 소개\n공연은 오후 6시에 시작합니다.';
      previous.productProfile.material=header+'\n'+facts;
      await restoreOwnedWorkspace(page,previous,owner,'create',undefined,
        {step:0,project:previous,industryChosen:true},scope);
      await expect(description).toHaveValue(facts);
      await form.getByRole('button',{name:'상품',exact:true}).click();
      await form.getByLabel('분야',{exact:true}).selectOption('beauty');
      await form.getByLabel('세부 업종',{exact:true}).selectOption('skincare');
      await expect(description).toHaveValue(facts);
      await reloadDraft(page);
      await expect(description).toHaveValue(facts);
    } finally { await context.close(); }
  });
}

for(const native of [false,true])test('save separate originals and the entire download list on '+(native?'Android':'the web'),async({page})=>{
  const origin=await prepareParityPage(page,native);
  const formats=['png','jpeg','webp'] as const;
  const files=await Promise.all(formats.map(format=>sharp({create:{width:16,height:12,channels:3,background:'#e39146'}}).toFormat(format).toBuffer()));
  const items=Array.from({length:12},(_,i)=>({id:'delivery-'+String(i).padStart(4,'0'),name:'테스트 광고 '+i,expiresAt:new Date(Date.now()+86400000).toISOString(),reviewRequired:i===10}));
  let accepted=0,release!:()=>void,hold=true;
  const delay=new Promise<void>(resolve=>{release=resolve;});
  if(native)await page.addInitScript(()=>{
    const out:{name:string;base64:string}[]=[];
    Object.assign(window,{exportedFiles:out});
    let session='',content:{name:string;base64:string}[]=[];
    (window as any).AiadcastNative={postMessage:(json:string)=>{
      const message=JSON.parse(json);
      if(message.type!=='batch-export')return;
      let ok=true;
      if(message.op==='begin'){
        ok=!session&&message.count>=1&&message.count<=10;session=message.id;content=[];
      }else if(message.id!==session)ok=false;
      else if(message.op==='file'){
        ok=/^aiadcast-[0-9a-f]{8}-[0-9]{2}\.(png|jpg|webp)$/.test(message.name);
        if(ok)content.push({name:message.name,base64:message.base64});
      }else if(message.op==='finish'){out.push(...content);session='';}
      else if(message.op==='cancel'){session='';return;}
      setTimeout(()=>window.dispatchEvent(new CustomEvent('aiadcast-batch-export',{detail:{id:message.id,ok}})),15);
    }};
  });
  await page.route('**/api/projects',r=>r.fulfill({json:{projects:[]}}));
  await page.route('**/api/membership/downloads',r=>r.fulfill({json:{downloads:items}}));
  await page.route('**/api/generations/delivery-*/accept',async r=>{accepted++;await r.fulfill({json:{ok:true}});});
  const unavailable=7;
  await page.route('**/api/generations/delivery-*',async r=>{
    const i=Number(r.request().url().split('-').pop());
    if(i===0&&hold)await delay;
    if(i===unavailable)return r.fulfill({status:404,json:{error:{code:'STORAGE_NOT_FOUND'}}});
    const data=files[i%3],hash=createHash('sha256').update(data).digest('hex');
    await r.fulfill({json:{job:{id:items[i].id,state:i===10?'ready':'accepted',artifactId:hash,artifact:{id:hash,sha256:hash,width:16,height:12,dataUrl:'data:image/'+formats[i%3]+';base64,'+data.toString('base64')}}}});
  });
  await page.goto(origin+'/#projects');
  await page.getByRole('button',{name:'다운로드',exact:true}).click();
  const list=page.locator('.download-library');
  const row=(i:number)=>list.locator('li').filter({has:page.getByText(items[i].name,{exact:true})});
  const save=(i:number)=>row(i).getByRole('button');
  await save(0).click();
  await expect(save(0)).toBeDisabled();
  await expect(save(1)).toBeEnabled();
  await expect(list.getByRole('button',{name:'전체 저장'})).toBeEnabled();
  const second=native?null:page.waitForEvent('download');
  await save(1).click();
  if(second){const d=await second;expect(d.suggestedFilename()).toBe('aiadcast-'+items[1].id+'.jpg');expect((await readFile((await d.path())!)).equals(files[1])).toBe(true);}
  else await expect(row(1)).toContainText('갤러리');
  const first=native?null:page.waitForEvent('download');
  hold=false;release();
  if(first){const d=await first;expect((await readFile((await d.path())!)).equals(files[0])).toBe(true);}
  await expect(save(0)).toBeEnabled();
  page.once('dialog',dialog=>dialog.dismiss());
  await list.getByRole('button',{name:'전체 저장'}).click();
  expect(accepted).toBe(0);
  page.once('dialog',dialog=>dialog.accept());
  const zip=native?null:page.waitForEvent('download');
  await list.getByRole('button',{name:'전체 저장'}).click();
  const expected=items.filter((_,i)=>i!==unavailable);
  await expect(list).toContainText('미저장 1건');
  expect(accepted).toBe(1);
  if(zip){
    const download=await zip;
    expect(download.suggestedFilename()).toBe('aiadcast-images.zip');
    const data=await readFile((await download.path())!),end=data.length-22;
    expect(data.readUInt32LE(end)).toBe(0x06054b50);
    expect(data.readUInt16LE(end+10)).toBe(expected.length);
    let offset=0;
    for(const item of expected){
      const i=items.indexOf(item);
      expect(data.readUInt32LE(offset)).toBe(0x04034b50);
      const size=data.readUInt32LE(offset+18),nameSize=data.readUInt16LE(offset+26),start=offset+30+nameSize;
      expect(data.toString('utf8',offset+30,start)).toBe('aiadcast-'+item.id+'.'+['png','jpg','webp'][i%3]);
      expect(data.subarray(start,start+size).equals(files[i%3])).toBe(true);
      offset=start+size;
    }
    expect(offset).toBe(data.readUInt32LE(end+16));
  }else{
    const written=await page.evaluate(()=>(window as any).exportedFiles as {name:string;base64:string}[]);
    expect(written.map(f=>f.base64)).toEqual([1,0,...expected.map(item=>items.indexOf(item))].map(i=>files[i%3].toString('base64')));
  }
  await list.getByRole('button',{name:'다운로드 더 보기'}).click();
  await expect(row(unavailable)).toContainText('서버에서 원본을 찾을 수 없습니다.');
  await expect(save(unavailable)).toBeEnabled();
});
