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
 await page.route('**/api/generations/mock-ad-*/accept',async r=>{
  const id=new URL(r.request().url()).pathname.split('/').at(-2),job=jobs.find(j=>j.id===id);
  expect(r.request().postDataJSON().artifactId).toBe(job.artifactId);job.state='accepted';await r.fulfill({json:{job}});
 });
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
 await page.goto('/#projects');
 const gallery=page.locator('.project-tile').filter({hasText:'생성 완료'});
 await expect(gallery).toHaveCount(1);await expect(gallery.getByAltText('생성된 광고 미리보기')).toBeVisible();
 await expect(page.locator('.project-tile').filter({hasText:'제작 중'})).toHaveCount(0);
 await gallery.click();await expect(results.locator('.batch-grid img')).toHaveCount(4);
 await results.getByLabel('전체 선택',{exact:true}).check();await expect(results.getByRole('button',{name:'선택 저장 (4)'})).toBeEnabled();
 await results.getByLabel('광고 2',{exact:true}).uncheck();await results.getByLabel('광고 4',{exact:true}).uncheck();
 const download=page.waitForEvent('download');await results.getByRole('button',{name:'선택 저장 (2)'}).click();expect((await download).suggestedFilename()).toBe('aiadcast-images.zip');
 await results.getByRole('button',{name:'선택 공유 (2)'}).click();
 const names=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('shared-names')??'[]'));expect(names).toHaveLength(2);expect(names[0]).toMatch(/-01\.png$/);expect(names[1]).toMatch(/-03\.png$/);
 await page.goto('/#projects');
 const saved=page.locator('.project-tile').filter({has:page.locator('.project-tile-caption strong',{hasText:/택배.* · [13]$/})});await expect(saved).toHaveCount(2);
 await expect(page.locator('.project-tile-caption strong').filter({hasText:/택배.* · [24]$/})).toHaveCount(0);
 await saved.first().click();await expect(page.getByRole('button',{name:'정밀 편집',exact:true})).toBeVisible();
 await page.goto('/#projects');await gallery.click();await expect(results.locator('.batch-grid img')).toHaveCount(4);
 await results.getByLabel('전체 선택',{exact:true}).check();
 const allFiles=page.waitForEvent('download');await results.getByRole('button',{name:'선택 저장 (4)'}).click();await allFiles;
 await page.goto('/#projects');await expect(page.locator('.project-tile')).toHaveCount(4);
 await page.reload();await expect(page.locator('.project-tile')).toHaveCount(4);
 await expect(page.locator('.project-tile').filter({hasText:/제작 중|초안|결과 확인|생성 완료/})).toHaveCount(0);
 expect(writes).toBe(1);
});

test('open a device image and confirm a text-directed edit on mobile and desktop',async({page})=>{
 await protectedScreen(page,mockSession('device-editor'));
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 await page.route('**/api/status',r=>r.fulfill({json:{generation:{enabled:true,selectiveEdit:true,selectiveEditProofVersion:1,creditQuote:{unit:'credit-v2',amount:10,policy:'delivered-2026-10-18'}},wallet:{available:0,reserved:0,credits:{available:30,reserved:0}},budget:{limitMicros:1000000}}}));
 const png=await sharp({create:{width:128,height:96,channels:4,background:'#578aac'}}).png().toBuffer();
 let submissions=0;
 await page.route('**/api/selective-edits/upload',async r=>{
  submissions++;
  const body=r.request().postDataJSON();
  expect(body.original.width).toBe(128);expect(body.original.height).toBe(96);
  expect(body.mask).toEqual({mode:'scene'});expect(body.prompt).toBe('하늘에 구름 추가');expect(body.creditQuote.amount).toBe(10);
  await r.fulfill({status:409,json:{error:{code:'GENERATION_ALREADY_RUNNING'}}});
 });
 await page.goto('/#projects');
 await expect(page.getByRole('button',{name:'사진·백업 불러와 정밀 편집'})).toBeInViewport();
 await page.getByLabel('편집할 사진 또는 백업 파일').setInputFiles({name:'sky.png',mimeType:'image/png',buffer:png});
 const dialog=page.getByRole('dialog',{name:'정밀 편집'});
 await expect(dialog.getByAltText('원본 광고')).toBeVisible();
 await expect(dialog.locator('canvas')).toHaveCount(0);
 const submit=dialog.getByRole('button',{name:'수정하기 · 10 크레딧'});
 await expect(submit).toBeDisabled();
 await dialog.getByRole('textbox').fill('하늘에 구름 추가');
 page.once('dialog',d=>{expect(d.message()).toContain('10 크레딧');return d.accept();});
 await submit.click();await expect.poll(()=>submissions).toBe(1);
 await expect(submit).toBeEnabled();
});

test('reopen a released edit, restore its instructions and wait for explicit resubmission',async({page})=>{
 await protectedScreen(page,mockSession('precision-recovery'));
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 const png=await sharp({create:{width:64,height:48,channels:4,background:'blue'}}).png().toBuffer();
 const file={name:'ad.png',mimeType:'image/png',buffer:png};
 const quote={unit:'credit-v2',amount:10,policy:'delivered-2026-10-18'};
 await page.route('**/api/status',r=>r.fulfill({json:{generation:{enabled:true,selectiveEdit:true,selectiveEditProofVersion:1,creditQuote:quote},wallet:{available:0,reserved:0,credits:{available:30,reserved:0}},budget:{limitMicros:2000000}}}));
 const prompt='오른쪽 남성의 포즈를 바꾸고 하늘에 먹구름을 추가해주세요.';
 let job:any,finished=false,reads=0;
 const ids:string[]=[];
 await page.route('**/api/selective-edits/upload',async r=>{
  const b=r.request().postDataJSON(),sourceId='upload-'+b.sourceHash;
  ids.push(b.requestId);expect(b.prompt).toBe(prompt);
  job={id:'edit-recovery-fixture',projectId:b.projectId,requestId:b.requestId,state:'running',artifact:null,selectiveEdit:{sourceHash:b.sourceHash,sourceJobId:sourceId,sourceProjectId:sourceId,prompt:b.prompt}};
  await r.fulfill({status:202,json:{job}});
 });
 await page.route('**/api/generations/edit-recovery-fixture',r=>{reads++;return r.fulfill({json:{job:finished?{...job,state:'failed',errorCode:'EDIT_NOT_DELIVERED'}:job}});});
 await page.clock.install();
 await page.goto('/#projects');
 const upload=page.getByLabel('편집할 사진 또는 백업 파일'),dialog=page.getByRole('dialog',{name:'정밀 편집'});
 await upload.setInputFiles(file);
 await dialog.getByRole('textbox').fill(prompt);
 const submit=dialog.getByRole('button',{name:'수정하기 · 10 크레딧'});
 page.once('dialog',d=>d.accept());await submit.click();
 await expect(dialog.getByText('수정 시안 생성 중',{exact:true})).toBeVisible();
 // The information message at two minutes must not stop polling the same request.
 await page.clock.fastForward(121000);
 await expect.poll(()=>reads).toBeGreaterThan(0);
 const previousReads=reads;
 await page.clock.runFor(10000);
 await expect.poll(()=>reads).toBeGreaterThan(previousReads);expect(ids).toHaveLength(1);
 await dialog.getByRole('button',{name:'닫기',exact:true}).click();
 finished=true;
 await upload.setInputFiles(file);
 await expect(dialog.getByText(/수정본을 저장하지 못해 요청이 종료/)).toBeVisible();
 await expect(dialog.getByRole('textbox')).toHaveValue(prompt);
 await expect(submit).toBeEnabled();expect(ids).toHaveLength(1);
 page.once('dialog',d=>d.accept());await submit.click();
 await expect.poll(()=>new Set(ids).size).toBe(2);
});

test('inspect a rejected pose without charging or accepting it, and keep the instructions editable',async({page})=>{
 await protectedScreen(page,mockSession('edit-review-preview'));
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 const quote={unit:'credit-v2',amount:10,policy:'delivered-2026-10-18'};
 await page.route('**/api/status',r=>r.fulfill({json:{generation:{enabled:true,selectiveEdit:true,selectiveEditProofVersion:1,creditQuote:quote},wallet:{available:0,reserved:0,credits:{available:30,reserved:0}},budget:{limitMicros:2000000}}}));
 const png=await sharp({create:{width:64,height:48,channels:4,background:'blue'}}).png().toBuffer();
 const jpg=await sharp(png).jpeg().toBuffer();let posts=0;
 await page.route('**/api/selective-edits/upload',async r=>{
  posts++;const b=r.request().postDataJSON(),sourceId='upload-'+b.sourceHash;
  await r.fulfill({status:202,json:{job:{id:'review-fixture',projectId:b.projectId,requestId:b.requestId,state:'failed',errorCode:'EDIT_POSE_QUALITY_FAILED',artifact:null,creditCaptured:false,
   selectiveEdit:{sourceHash:b.sourceHash,sourceJobId:sourceId,sourceProjectId:sourceId,prompt:b.prompt},editReview:{version:1,failedChecks:['previousGestureResolved'],differences:[{kind:'copy',expected:'두 번째 커리어',observed:''},{kind:'object',subject:'드론',expected:2,observed:1}],preview:'data:image/jpeg;base64,'+jpg.toString('base64')}}}});
 });
 await page.goto('/#projects');await page.getByLabel('편집할 사진 또는 백업 파일').setInputFiles({name:'ad.png',mimeType:'image/png',buffer:png});
 const dialog=page.getByRole('dialog',{name:'정밀 편집'});await dialog.getByRole('textbox').fill('인물 포즈 변경');
 page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'수정하기 · 10 크레딧'}).click();
 await expect(dialog.getByLabel('원본과 수정본 비교')).toBeVisible();await expect(dialog.getByText(/이전 자세의 흔적/)).toBeVisible();
 await expect(dialog.getByText(/두 번째 커리어.*누락/)).toBeVisible();await expect(dialog.getByText(/드론.*원본 2.*시안 1/)).toBeVisible();
 await expect(dialog.getByRole('button',{name:'수정본 저장'})).toHaveCount(0);
 await expect(dialog.getByRole('button',{name:'영역 직접 선택'})).toHaveCount(0);
 await expect(dialog.getByLabel('원본과 수정본 비교')).toBeVisible();
 await expect(dialog.getByRole('textbox')).toHaveValue('인물 포즈 변경');expect(posts).toBe(1);
});

test('save a verified device edit and reopen its project without another generation',async({page})=>{
 await protectedScreen(page,mockSession('precision-save'));
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 const original=await sharp({create:{width:64,height:48,channels:4,background:'#3377aa'}}).png().toBuffer();
 const wallet={available:2,reserved:0,credits:{available:30,reserved:0}},quote={unit:'legacy-ticket',amount:1,policy:'legacy-accept-v1'};
 await page.route('**/api/status',r=>r.fulfill({json:{generation:{enabled:true,selectiveEdit:true,selectiveEditProofVersion:1,creditQuote:quote},wallet,budget:{limitMicros:2000000}}}));
 let job:any,posts=0;
 await page.route('**/api/selective-edits/upload',async r=>{
  posts++;const b=r.request().postDataJSON(),w=b.original.width,h=b.original.height;
  expect(b.mask).toEqual({mode:'scene'});const maskHash='c'.repeat(64);
  const rgba=await sharp(Buffer.from(b.original.dataUrl.split(',')[1],'base64')).ensureAlpha().raw().toBuffer();
  let changed=0;
  for(let i=0;i<rgba.length;i+=4){rgba[i]=255;changed++;}
  const bytes=await sharp(rgba,{raw:{width:w,height:h,channels:4}}).png().toBuffer(),hash=createHash('sha256').update(bytes).digest('hex');
  const sourceId='upload-'+b.sourceHash;
  job={id:'edit-proof-fixture',projectId:b.projectId,requestId:b.requestId,state:'ready',mode:'creative',createdAt:new Date().toISOString(),model:'fixture',composition:'complete-ad',artifactId:hash,artifact:{id:hash,sha256:hash,dataUrl:'data:image/png;base64,'+bytes.toString('base64'),width:w,height:h,role:'creative'},selectiveEdit:{sourceJobId:sourceId,sourceProjectId:sourceId,sourceHash:b.sourceHash,maskHash},preservation:{version:1,sourceHash:b.sourceHash,maskHash,resultHash:hash,width:w,height:h,selectedPixels:changed,changedSelectedPixels:changed,changedOutsidePixels:0,bounds:{x:0,y:0,width:w,height:h},semanticQuality:'not-assessed'}};
  await r.fulfill({json:{job,wallet}});
 });
 await page.route('**/api/generations/edit-proof-fixture/accept',r=>{job.state='accepted';return r.fulfill({json:{job,wallet}});});
 await page.goto('/#projects');
 await page.getByLabel('편집할 사진 또는 백업 파일').setInputFiles({name:'Harbor.png',mimeType:'image/png',buffer:original});
 const dialog=page.getByRole('dialog',{name:'정밀 편집'});
 await expect(dialog.getByAltText('원본 광고')).toBeVisible();
 await dialog.getByRole('textbox').fill('하늘을 흐리게');
 page.once('dialog',d=>{expect(d.message()).toContain('이용권 1장');return d.accept();});
 await dialog.getByRole('button',{name:'수정하기 · 이용권 1장'}).click();
 await expect(dialog.getByLabel('원본과 수정본 비교')).toBeVisible();
 for(const width of [320,360,390]){
  await page.setViewportSize({width,height:760});
  const actions=dialog.locator('.edit-decisions>button');
  const bounds=await actions.evaluateAll(buttons=>buttons.map(b=>{
   const range=document.createRange();range.selectNodeContents(b);
   return {y:b.getBoundingClientRect().top,lines:range.getClientRects().length,fits:b.scrollWidth<=b.clientWidth};
  }));
  expect(bounds).toHaveLength(2);
  expect(bounds.every(b=>b.lines===1&&b.fits&&b.y===bounds[0].y)).toBe(true);
 }
 const download=page.waitForEvent('download');
 await dialog.getByRole('button',{name:'수정본 저장'}).click();
 expect((await download).suggestedFilename()).toMatch(/^aiadcast-[0-9a-f]{8}-01\.png$/);
 await dialog.getByRole('button',{name:'닫기',exact:true}).click();
 await page.locator('.project-tile').filter({hasText:'Harbor · 수정 사본'}).click();
 await expect(page.getByRole('heading',{name:'사용 확정한 광고'})).toBeVisible();
 expect(posts).toBe(1);
});

test('find sports by group or alias and enter an unlisted industry',async({page})=>{
  await protectedScreen(page,mockSession('sports-fields'));
  await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
  await page.goto('/#create');
  const picker=page.locator('.ad-field-picker');
  const fields=picker.getByLabel('분야',{exact:true});
  const items=picker.getByLabel('세부 업종',{exact:true});
  const custom=picker.getByLabel('세부 항목 직접 입력 (선택)',{exact:true});
  await picker.getByRole('button',{name:'서비스',exact:true}).click();
  await fields.selectOption('sports');
  await expect(items.locator('optgroup')).toHaveCount(9);
  const search=picker.getByRole('searchbox',{name:'종목 검색'});
  await search.fill('런닝');
  await expect(items.locator('option[value="running"]')).toHaveCount(1);
  await expect(items.locator('option[value="football"]')).toHaveCount(0);
  await items.selectOption('running');
  await expect(search).toHaveValue('');
  await search.fill('추크볼');
  await expect(picker.getByRole('status')).toContainText('기타');
  await items.selectOption({label:'기타'});
  await custom.fill('추크볼 클럽');
  await expect(custom).toHaveValue('추크볼 클럽');
  await items.selectOption('taekwondo');
  await expect(custom).toHaveCount(0);
  await picker.getByRole('button',{name:'상품',exact:true}).click();
  await fields.selectOption('packaging');
  await items.selectOption({label:'기타'});
  await expect(custom).toHaveValue('');
  await custom.fill('보냉 포장재');
  await expect(custom).toHaveValue('보냉 포장재');
});

test('browse dance families, search for a dance and enter a custom discipline',async({page})=>{
  await protectedScreen(page,mockSession('dancesport'));
  await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
  await page.goto('/#create');
  const picker=page.locator('.ad-field-picker');
  await picker.getByRole('button',{name:'서비스',exact:true}).click();
  await picker.getByLabel('분야',{exact:true}).selectOption('sports');
  const sports=picker.getByLabel('세부 업종',{exact:true});
  const style=picker.getByLabel('댄스스포츠 세부 종목',{exact:true});
  await sports.selectOption('dance-sport');
  await expect(style).toHaveValue('dance-sport');
  await expect(style.locator('optgroup[label="스탠다드"] option')).toHaveCount(5);
  await expect(style.locator('optgroup[label="라틴"] option')).toHaveCount(5);
  await style.selectOption({label:'탱고'});
  await expect(style).toHaveValue('dance-tango');
  await picker.getByRole('searchbox').fill('차차');
  await sports.selectOption('dance-cha-cha-cha');
  await expect(style).toHaveValue('dance-cha-cha-cha');
  await expect(sports).toHaveValue('dance-sport');
  await style.selectOption({label:'기타'});
  const custom=picker.getByLabel('세부 항목 직접 입력 (선택)',{exact:true});
  await custom.fill('휠체어 댄스 입문');
  await expect(custom).toHaveValue('휠체어 댄스 입문');
  await style.selectOption('dance-sport');
  await expect(custom).toHaveCount(0);
  await sports.selectOption('running');
  await expect(style).toHaveCount(0);
});
