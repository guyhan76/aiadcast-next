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
  const requested:number[]=[];
  const delay=new Promise<void>(resolve=>{release=resolve;});
  if(native)await page.addInitScript(()=>{
    const nativeFetch=window.fetch.bind(window);
    window.fetch=(input,init)=>typeof input==='string'&&input.startsWith('data:')?
      Promise.reject(new Error('data URL transport is unavailable')):nativeFetch(input,init);
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
  await page.route('**/api/membership/downloads/*/preview',r=>r.fulfill({json:{preview:'data:image/webp;base64,'+files[2].toString('base64')}}));
  const unavailable=7;
  await page.route('**/api/generations/delivery-*',async r=>{
    const i=Number(r.request().url().split('-').pop());
    requested.push(i);
    if(i===0&&hold)await delay;
    if(i===unavailable)return r.fulfill({status:404,json:{error:{code:'STORAGE_NOT_FOUND'}}});
    const data=files[i%3],hash=createHash('sha256').update(data).digest('hex');
    await r.fulfill({json:{job:{id:items[i].id,state:i===10?'ready':'accepted',artifactId:hash,artifact:{id:hash,sha256:hash,width:16,height:12,dataUrl:'data:image/'+formats[i%3]+';base64,'+data.toString('base64')}}}});
  });
  await page.goto(origin+'/#projects');
  await page.getByRole('button',{name:'다운로드',exact:true}).click();
  const list=page.locator('.download-library');
  const row=(i:number)=>list.locator('li').filter({has:page.getByText(items[i].name,{exact:true})});
  const button=(name:string|RegExp)=>list.getByRole('button',{name,exact:typeof name==='string'});
  const notice=list.getByText('새 광고는 생성 후 24시간 동안 다운로드 가능',{exact:true});
  const viewport=page.viewportSize()!;
  await expect(notice).toBeVisible();
  await page.evaluate(()=>document.fonts.ready.then(()=>true));
  for(const width of [320,360,390,430]){
   await page.setViewportSize({width,height:viewport.height});
   const header=list.locator('.download-actions');
   const layout=await header.evaluate(element=>{
    const notice=element.querySelector('p')!,button=element.querySelector('button')!;
    const lines=(node:Element)=>{
     const range=document.createRange();range.selectNodeContents(node);
     return new Set(Array.from(range.getClientRects(),r=>r.top)).size;
    };
    return {noticeLines:lines(notice),buttonLines:lines(button),
     below:button.getBoundingClientRect().top>=notice.getBoundingClientRect().bottom,
     rightGap:Math.abs(element.getBoundingClientRect().right-button.getBoundingClientRect().right)};
   });
   expect(layout.noticeLines,'notice at '+width+'px').toBe(1);
   expect(layout.buttonLines,'selection button at '+width+'px').toBe(1);
   expect(layout.below).toBe(true);expect(layout.rightGap).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize(viewport);
  await expect(button('원본 저장')).toHaveCount(0);
  await expect(button('전체 저장')).toHaveCount(0);
  await button('선택').click();
  await expect(button(/선택 저장/)).toBeDisabled();
  await row(1).getByRole('checkbox').check();
  const single=native?null:page.waitForEvent('download');
  await button(/선택 저장/).click();
  if(single){
   const download=await single;
   expect(download.suggestedFilename()).toBe('aiadcast-'+items[1].id+'.jpg');
   expect((await readFile((await download.path())!)).equals(files[1])).toBe(true);
  }
  await expect(button('선택')).toBeVisible();expect(requested).toEqual([1]);
  await button('선택').click();
  await row(0).getByRole('checkbox').check();await row(2).getByRole('checkbox').check();
  const subset=native?null:page.waitForEvent('download');
  await button(/선택 저장.*2/).click();
  await expect.poll(()=>requested).toEqual([1,0]);
  await expect(button(/선택 삭제/)).toBeDisabled();await expect(row(0).getByRole('checkbox')).toBeDisabled();
  hold=false;release();
  if(subset){
   const download=await subset;expect(download.suggestedFilename()).toBe('aiadcast-images.zip');
   const bytes=await readFile((await download.path())!);
   expect(bytes.readUInt16LE(bytes.length-12)).toBe(2);
   expect(bytes.includes(Buffer.from('aiadcast-'+items[0].id+'.png'))).toBe(true);
   expect(bytes.includes(Buffer.from('aiadcast-'+items[2].id+'.webp'))).toBe(true);
  }
  await expect(button('선택')).toBeVisible();expect(requested).toEqual([1,0,2]);
  await button('선택').click();await button('전체 선택').click();
  page.once('dialog',dialog=>dialog.dismiss());
  await button(/전체 저장.*12/).click();expect(accepted).toBe(0);expect(requested).toEqual([1,0,2]);
  page.once('dialog',dialog=>dialog.accept());
  const zip=native?null:page.waitForEvent('download');
  await button(/전체 저장.*12/).click();
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
    expect(written.map(f=>f.base64)).toEqual([1,0,2,...expected.map(item=>items.indexOf(item))].map(i=>files[i%3].toString('base64')));
  }
  await list.getByRole('button',{name:'다운로드 더 보기'}).click();
  await expect(row(unavailable)).toContainText('서버에서 원본을 찾을 수 없습니다.');
  await expect(row(unavailable).getByRole('checkbox')).toBeChecked();
  await expect(button(/선택 저장.*1/)).toBeEnabled();
});

for(const native of [false,true])test('instruction editing, credit consent and illustrated download selection on '+(native?'Android':'web'),async({page})=>{
 const origin=await prepareParityPage(page,native);
 const source=await sharp({create:{width:32,height:48,channels:3,background:'#358191'}}).png().toBuffer();
 const thumb='data:image/webp;base64,'+(await sharp(source).webp().toBuffer()).toString('base64');
 const items=Array.from({length:7},(_,i)=>({id:'delivery-preview-'+i,name:'미리보기 광고 '+i,reviewRequired:false,expiresAt:new Date(Date.now()+86400000).toISOString()}));
 const removed:string[]=[];let edits=0;
 const edited=await sharp({create:{width:32,height:48,channels:3,background:'#89c7e5'}}).png().toBuffer(),editedHash=createHash('sha256').update(edited).digest('hex');
 await page.route('**/api/status',r=>r.fulfill({json:{generation:{enabled:true,selectiveEdit:true,creditQuote:{unit:'credit-v2',amount:10,policy:'delivered-2026-10-18'}},wallet:{available:0,reserved:0,credits:{available:20,reserved:0}},budget:{limitMicros:1000000}}}));
 await page.route('**/api/membership/downloads',r=>r.fulfill({json:{downloads:items.filter(item=>!removed.includes(item.id))}}));
 await page.route('**/api/membership/downloads/*/preview',r=>r.fulfill({json:{preview:thumb}}));
 await page.route('**/api/membership/remove-downloads',r=>{removed.push(...r.request().postDataJSON().ids);return r.fulfill({json:{removed}});});
 let polls=0,manualReady=false,releaseLookup!:()=>void;
 const lookupHeld=new Promise<void>(resolve=>{releaseLookup=resolve;});
 let sourceInfo:{projectId:string;requestId:string;sourceJobId:string;sourceHash:string};
 function editJob(state:'running'|'ready'){
  const maskHash='a'.repeat(64),{projectId,requestId,sourceJobId,sourceHash}=sourceInfo;
  const job={id:'instruction-job',projectId,requestId,state,selectiveEdit:{sourceJobId,sourceProjectId:sourceJobId,sourceHash,maskHash}};
  if(state==='running')return job;
  return {...job,artifactId:editedHash,artifact:{id:editedHash,sha256:editedHash,width:32,height:48,dataUrl:'data:image/png;base64,'+edited.toString('base64')},
   preservation:{version:1,sourceHash,maskHash,resultHash:editedHash,width:32,height:48,selectedPixels:1536,changedSelectedPixels:1536,changedOutsidePixels:0,bounds:{x:0,y:0,width:32,height:48},semanticQuality:'not-assessed'}};
 }
 await page.route('**/api/selective-edits/upload',r=>{
  const body=r.request().postDataJSON();expect(body.mask).toEqual({mode:'instruction'});expect(body.prompt).toBe('가격을 599,000원으로, 하늘은 화창하게');expect(body.creditQuote.amount).toBe(10);
  sourceInfo=body;edits++;return r.fulfill({json:{job:editJob('running')}});
 });
 await page.route('**/api/generations/instruction-job',async r=>{
  const attempt=++polls;
  const state=manualReady?'ready':'running';
  if(attempt===1)await lookupHeld;
  return r.fulfill({json:{job:editJob(state)}});
 });
 await page.goto(origin+'/#projects');
 await page.getByText('프로젝트 도구',{exact:true}).click();
 await page.locator('input[type=file][aria-label="편집할 기기 사진"]').setInputFiles({name:'여행.png',mimeType:'image/png',buffer:source});
 const edit=page.getByRole('dialog',{name:'정밀 편집'});await expect(edit).toBeVisible();
 await expect(edit.locator('canvas')).toHaveCount(0);
 await edit.getByRole('textbox').fill('가격을 599,000원으로, 하늘은 화창하게');
 await page.clock.install();
 const submit=edit.getByRole('button',{name:/수정하기.*10 크레딧/});
 page.once('dialog',d=>{expect(d.message()).toContain('10 크레딧');return d.dismiss();});await submit.click();expect(edits).toBe(0);
 page.once('dialog',d=>d.accept());await submit.click();await expect.poll(()=>edits).toBe(1);
 const retry=edit.getByRole('button',{name:'결과 확인',exact:true});
 await expect(edit.getByText('수정 시안 생성 중',{exact:true})).toBeVisible();await expect(retry).toHaveCount(0);
 await page.clock.fastForward(3100);await expect.poll(()=>polls).toBe(1);await expect(retry).toHaveCount(0);
 const firstPoll=page.waitForResponse(r=>r.url().endsWith('/api/generations/instruction-job'));releaseLookup();await firstPoll;
 await page.clock.fastForward(121000);
 await expect(retry).toBeVisible();await expect(retry).toBeEnabled();
 // The timeout stops background checks. A manual check only reads the same job.
 manualReady=true;await retry.click();
 await expect(edit.getByRole('img',{name:'수정 결과'})).toBeVisible();await expect(edit.getByRole('button',{name:'수정본 사용 · 저장'})).toBeEnabled();
 expect(edits).toBe(1);await expect(edit.getByText('슬라이드를 움직여 보세요')).toBeVisible();
 const slider=edit.getByRole('slider',{name:'원본과 수정본 비교'});
 const previewImage=edit.locator('.selective-wipe');
 for(const [key,label,rgb] of [['Home','원본',[53,129,145]],['End','수정본',[137,199,229]]] as const){
  await slider.press(key);await expect(slider).toHaveAttribute('aria-valuetext',label);
  const shot=await previewImage.screenshot();
  const {data,info}=await sharp(shot).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const offset=(Math.floor(info.height/2)*info.width+Math.floor(info.width/2))*info.channels;
  expect([...data.subarray(offset,offset+3)]).toEqual([...rgb]);
 }
 await edit.getByRole('button',{name:'닫기'}).click();
 await page.getByRole('button',{name:'다운로드',exact:true}).click();
 const list=page.locator('.download-library');
 await expect(list.locator('.delivery-preview img').first()).toBeVisible();
 await list.locator('.delivery-preview').first().click();await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'닫기'}).click();
 await list.getByRole('button',{name:'선택',exact:true}).click();await list.getByRole('checkbox').first().check();
 page.once('dialog',d=>d.dismiss());await list.getByRole('button',{name:/선택 삭제/}).click();expect(removed).toEqual([]);
 page.once('dialog',d=>d.accept());await list.getByRole('button',{name:/선택 삭제/}).click();await expect(list.getByText(items[0].name,{exact:true})).toHaveCount(0);
 await list.locator('.delivery-preview').first().click();
 const preview=page.getByRole('dialog',{name:items[1].name});
 await expect(preview.getByRole('button',{name:'원본 저장'})).toBeEnabled();
 page.once('dialog',d=>d.dismiss());await preview.getByRole('button',{name:'삭제',exact:true}).click();
 await expect(preview).toBeVisible();expect(removed).toEqual([items[0].id]);
 page.once('dialog',d=>d.accept());await preview.getByRole('button',{name:'삭제',exact:true}).click();
 await expect(preview).toHaveCount(0);expect(removed).toEqual([items[0].id,items[1].id]);
 await list.getByRole('button',{name:'선택',exact:true}).click();await list.getByRole('button',{name:'전체 선택'}).click();
 page.once('dialog',d=>d.accept());await list.getByRole('button',{name:/전체 삭제/}).click();
 await expect(list.getByText('다운로드할 파일이 없습니다.')).toBeVisible();expect(removed).toEqual(items.map(i=>i.id));
});

for(const native of [false,true])test('delete selected saved projects and the active ad without restoring it on reload '+(native?'Android':'web'),async({browser})=>{
 const origin=parityOrigin(native),ctx=await browser.newContext({baseURL:origin,viewport:{width:native?390:1100,height:850},locale:'ko-KR',serviceWorkers:'block'});
 try{
  const page=await ctx.newPage();await prepareParityPage(page,native);
  const owner='parity-member',scope=native?owner+'@'+encodeURIComponent('https://aiadcast-next.onrender.com'):owner;
  const projects=['첫 번째 저장 광고','두 번째 저장 광고','작업 중 광고'].map(name=>({...starterProject(),name,productName:name}));
  await page.goto(origin+'/#projects');await expect(page.locator('.projects-page').getByText('저장한 광고가 없습니다.')).toBeVisible();
  await page.evaluate(({items,scope})=>new Promise<void>((done,fail)=>{
   const open=indexedDB.open('aiadcast-editor-'+scope,1);
   open.onupgradeneeded=()=>open.result.createObjectStore('projects',{keyPath:'id'});
   open.onerror=()=>fail(open.error);
   open.onsuccess=()=>{const db=open.result,tx=db.transaction('projects','readwrite');for(const item of items)tx.objectStore('projects').put(item);tx.oncomplete=()=>{db.close();done();};tx.onerror=()=>fail(tx.error);};
  }),{items:projects,scope});await page.evaluate(()=>window.dispatchEvent(new Event('aiadcast-project-copy-saved')));
  const section=page.locator('.projects-page');
  await expect(section.locator('.project-tile')).toHaveCount(3);
  await section.locator('.project-tile').filter({hasText:'작업 중 광고'}).click();await expect(page).toHaveURL(/#studio$/);
  await page.getByRole('link',{name:'내 프로젝트',exact:true}).filter({visible:true}).first().click();await expect(section.locator('.project-tile')).toHaveCount(3);
  const search=section.getByRole('textbox',{name:'프로젝트 검색'});
  await search.fill('저장 광고');
  await section.getByRole('button',{name:'선택',exact:true}).click();
  await section.getByRole('button',{name:'전체 선택'}).click();
  await expect(section.getByRole('button',{name:'전체 삭제 (2)',exact:true})).toBeVisible();
  const first=section.getByRole('button',{name:/첫 번째 저장 광고/});
  const second=section.getByRole('button',{name:/두 번째 저장 광고/});
  for(const tile of [first,second]){
   await expect(tile).toHaveAttribute('aria-pressed','true');
   await expect(tile).toHaveCSS('outline-style','none');
   await expect(tile.locator('.selection-dot')).toHaveText('✓');
  }
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed','false');
  await expect(first.locator('.selection-dot')).toBeEmpty();
  await expect(second).toHaveCSS('outline-style','none');
  await expect(second.locator('.selection-dot')).toHaveText('✓');
  await page.keyboard.press('Tab');await expect(second).toBeFocused();
  await expect(second).toHaveCSS('outline-style','none');
  await expect(second.locator('.selection-dot')).toHaveCSS('outline-style','solid');
  page.once('dialog',d=>d.accept());await section.getByRole('button',{name:/선택 삭제/}).click();
  await search.fill('');
  await expect(section.locator('.project-tile')).toHaveCount(2);
  await section.getByRole('button',{name:'선택',exact:true}).click();await section.getByRole('button',{name:'전체 선택'}).click();
  page.once('dialog',d=>d.accept());await section.getByRole('button',{name:/전체 삭제/}).click();
  await expect(section.getByText('저장한 광고가 없습니다.')).toBeVisible();await reloadDraft(page);
  await expect(section.getByText('저장한 광고가 없습니다.')).toBeVisible();
 }finally{await ctx.close();}
});
