import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {reloadDraft} from './helpers/workspace';
const bytes=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#f4f0e8"/><text x="80" y="85" font-size="26">MOCK AD - NO AI ANALYSIS</text><path d="M96 300 L288 300 L384 220 L192 220Z" fill="#cca878"/><path d="M96 300 L288 300 L288 500 L96 500Z" fill="#b69163"/><path d="M288 300 L384 220 L384 400 L288 500Z" fill="#967346"/><text x="80" y="870" font-size="25">Price 19,800 KRW</text></svg>')).png().toBuffer(),hash=createHash('sha256').update(bytes).digest('hex');
const proposal=()=>({located:true,product:[.1,.2,.4,.35],axes:{width:[[.12,.5],[.36,.5]],depth:[[.36,.5],[.48,.4]],height:[[.48,.4],[.48,.22]]},protectedText:[[.1,.04,.8,.08],[.1,.82,.8,.08]],existingAnnotations:[],inset:[.65,.35,.3,.4]});
async function setup(page:Page,{owned=false,allowNewGeneration=true,uncertain=false,available=true,fail=false,delay=false,missing=false,reviewOnly=false,dimensions=['300','200','100'],mode='none' as 'none'|'main'|'inset'}={}){
 const analysisIds:string[]=[];let generations=0,analyses=0,job:any,release:(()=>void)|undefined;
 await page.route('**/api/**',async route=>{
  const r=route.request(),path=new URL(r.url()).pathname,wallet={available:5,reserved:0,kind:'test'};let data:any={};
  if(path==='/api/status')data={generation:{enabled:true,photoPurposes:true},wallet,budget:{limitMicros:1000000,spentMicros:0,heldMicros:0}};
  else if(path==='/api/dimension-analysis'){
   if(r.method()==='GET')data={available,allowNewGeneration,scope:owned?'owned-single-box':'approved-reference-evaluation',reason:available?null:'REFERENCES_NOT_VERIFIED'};
   else{analyses++;expect(r.postDataJSON().source.sha256).toBe(hash);if(delay)await new Promise<void>(resolve=>release=resolve);if(fail)return route.fulfill({status:409,json:{error:{code:'DIMENSION_LOCATION_UNCERTAIN'}}});data={sourceHash:hash,proposal:missing?undefined:proposal(),verified:false};}
  }else if(path==='/api/box-dimensions'){
   analyses++;const b=r.postDataJSON();analysisIds.push(b.requestId);expect(Object.keys(b).sort()).toEqual(['jobId','requestId','sourceHash']);expect(b.sourceHash).toBe(hash);expect(b.jobId).toBe('annotation-fixture');data={sourceHash:hash,state:uncertain?'uncertain':missing?'failed':'ready',...(!uncertain&&!missing?{proposal:proposal()}:{}),verified:false};
  }else if(path==='/api/generations'&&r.method()==='POST'){
   generations++;const body=r.postDataJSON();if(mode!=='none')expect(body.request.output.showDimensions).toBe(false);job={id:'annotation-fixture',projectId:body.projectId,requestIds:[body.requestId],state:'ready',mode:'creative',sourceHash:body.source.sha256,createdAt:'2026-10-17T00:00:00.000Z',model:'fixture',artifactId:hash,composition:'complete-ad',compositionKey:body.request.output.compositionKey,artifact:{id:hash,sha256:hash,dataUrl:'data:image/png;base64,'+bytes.toString('base64'),width:800,height:1000,role:'creative'},marketingPlan:body.request.marketingPlan};data={job,wallet};
  }else if(path.endsWith('/accept')){job.state='accepted';data={job,wallet};}
  else if(path.startsWith('/api/generations/'))data={job,wallet};else if(path==='/api/generations')data={jobs:job?[job]:[]};else if(path==='/api/account/capabilities')data={email:{enabled:false},checkout:{enabled:false}};
  await route.fulfill({json:data});
 });
 await page.goto('/#create');const form=page.locator('.consumer-create');await form.getByLabel('산업 선택').selectOption('boxes');await form.getByLabel('상품명',{exact:true}).fill('박스 규격');await form.getByRole('textbox',{name:'상세설명',exact:true}).fill('10개 19,800원');await form.getByLabel('참조사진 추가').setInputFiles({name:'source.png',mimeType:'image/png',buffer:bytes});await form.getByRole('button',{name:'규격 넣기',exact:true}).click();await form.getByLabel('규격 단위').selectOption('mm');for(const [axis,value] of [['가로',dimensions[0]],['세로',dimensions[1]],['높이',dimensions[2]]])await form.getByLabel(axis+' mm',{exact:true}).fill(value);
 if(mode!=='none'){await form.getByRole('radio',{name:mode==='inset'?'같은 제품 작은 사진에 표시':'본제품에 직접 표시',exact:true}).check();await reloadDraft(page);await expect(form.getByRole('radio',{name:mode==='inset'?'같은 제품 작은 사진에 표시':'본제품에 직접 표시',exact:true})).toBeChecked();}
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 if(reviewOnly||mode!=='none'&&(!available||missing))return {analysisIds,counts:()=>({generations,analyses}),release:()=>release?.(),recover:()=>{fail=false;}};
 await page.getByRole('checkbox',{name:'상품·재질 구조·규격·가격·문구를 확인했습니다.',exact:true}).check();await page.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true}).click();await expect(page.locator('.accepted-ad')).toBeVisible();
 return {analysisIds,counts:()=>({generations,analyses}),release:()=>release?.(),recover:()=>{fail=false;}};
}
async function png(page:Page,original=false){const event=page.waitForEvent('download');await page.getByRole('button',{name:original?'원본 광고 저장 · 사진 규격 표시 없음':'이미지 저장',exact:true}).click();const file=await event;return readFile((await file.path())!);}
test('automatic-first selection, optional point adjustment, draft restore and both PNG modes need one analysis',async({page},info)=>{
 const state=await setup(page),panel=page.getByRole('region',{name:'광고 안 규격 표시'}),original=await png(page);
 await panel.getByRole('radio',{name:'본제품에 직접 표시',exact:true}).check();await expect(panel.getByRole('button',{name:'위치 수정',exact:true})).toBeVisible();
 const main=await png(page);expect(main.equals(original)).toBe(false);expect(state.counts()).toEqual({generations:1,analyses:1});
 await panel.getByRole('button',{name:'위치 수정',exact:true}).click();const imageRect=await panel.locator('.annotation-points img').boundingBox();expect(imageRect!.width/imageRect!.height).toBeCloseTo(800/1000,2);const point=panel.getByRole('button',{name:'가로 시작점',exact:true});await point.focus();await point.press('ArrowRight');await panel.getByRole('button',{name:'위치 적용',exact:true}).click();const adjusted=await png(page);expect(adjusted.equals(main)).toBe(false);
 await reloadDraft(page);await expect(panel.getByRole('radio',{name:'본제품에 직접 표시',exact:true})).toBeChecked();expect((await png(page)).equals(adjusted)).toBe(true);
 await panel.getByRole('radio',{name:'같은 제품 작은 사진에 표시',exact:true}).check();const inset=await png(page);expect(inset.equals(adjusted)).toBe(false);expect(state.counts()).toEqual({generations:1,analyses:1});
 await writeFile(info.outputPath('annotation-main-mock.png'),main);await writeFile(info.outputPath('annotation-inset-mock.png'),inset);await page.setViewportSize({width:360,height:900});await panel.screenshot({path:info.outputPath('annotation-controls-360.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
 await panel.getByRole('radio',{name:'표시 없음',exact:true}).check();expect((await png(page)).equals(original)).toBe(true);expect(state.counts().analyses).toBe(1);
});
test('disabled analysis preserves inset intent and exports only the explicitly labeled original',async({page})=>{
 const state=await setup(page,{available:false}),panel=page.getByRole('region',{name:'광고 안 규격 표시'});
 await expect(panel).toContainText('일반 광고의 유료 분석은 켜져 있지 않습니다');await panel.getByRole('radio',{name:'같은 제품 작은 사진에 표시',exact:true}).check();await expect(page.getByRole('button',{name:'이미지 저장',exact:true})).toBeDisabled();expect((await png(page,true)).equals(bytes)).toBe(true);await panel.getByRole('button',{name:'자동 배치 가능 여부 다시 확인',exact:true}).click();await reloadDraft(page);await expect(panel.getByRole('radio',{name:'같은 제품 작은 사진에 표시',exact:true})).toBeChecked();await expect(page.getByRole('button',{name:'이미지 저장',exact:true})).toBeDisabled();expect(state.counts().analyses).toBe(0);
});
test('failed automatic location keeps original and does not silently retry or switch to manual-first',async({page})=>{
 const state=await setup(page,{fail:true}),panel=page.getByRole('region',{name:'광고 안 규격 표시'}),original=await png(page);
 await panel.getByRole('radio',{name:'본제품에 직접 표시',exact:true}).check();await expect(panel).toContainText('원본 광고는 유지됩니다');await expect(panel.getByRole('button',{name:'위치 수정',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'이미지 저장',exact:true})).toBeDisabled();expect((await png(page,true)).equals(bytes)).toBe(true);expect(state.counts().analyses).toBe(1);await reloadDraft(page);await expect(page.getByRole('button',{name:'이미지 저장',exact:true})).toBeDisabled();expect(state.counts().analyses).toBe(1);state.recover();await panel.getByRole('button',{name:'자동 배치 다시 요청',exact:true}).click();await expect(panel.getByRole('button',{name:'위치 수정',exact:true})).toBeVisible();await png(page);expect(state.counts().analyses).toBe(2);
});
test('stopping a pending analysis prevents a late response from changing the ad',async({page})=>{
 const state=await setup(page,{delay:true}),panel=page.getByRole('region',{name:'광고 안 규격 표시'}),original=await png(page);
 await panel.getByRole('radio',{name:'본제품에 직접 표시',exact:true}).check();await expect(panel.getByRole('button',{name:'요청 중단',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'이미지 저장',exact:true})).toBeDisabled();await panel.getByRole('button',{name:'요청 중단',exact:true}).click();state.release();await expect(panel.getByRole('radio',{name:'본제품에 직접 표시',exact:true})).toBeChecked();await expect(page.getByRole('button',{name:'이미지 저장',exact:true})).toBeDisabled();expect((await png(page,true)).equals(bytes)).toBe(true);expect(state.counts().analyses).toBe(1);
});

test('pre-generation inset intent restores and automatically composes photo pixels and arrows only after location',async({page},info)=>{
 const state=await setup(page,{mode:'inset'}),panel=page.getByRole('region',{name:'광고 안 규격 표시'});
 await expect(panel.getByRole('button',{name:'위치 수정',exact:true})).toBeVisible();
 const annotated=await png(page),original=await png(page,true);expect(original.equals(bytes)).toBe(true);expect(annotated.equals(original)).toBe(false);
 const image=await sharp(annotated).removeAlpha().raw().toBuffer({resolveWithObject:true});
 // Whole ad is uniformly contained at x=0,y=285,w=1080,h=1350. Inset samples come from the same product crop.
 const pixel=(x:number,y:number)=>{const at=(Math.round(y)*image.info.width+Math.round(x))*image.info.channels;return Array.from(image.data.subarray(at,at+3));};
 expect(pixel(1080*.71,285+1350*.58)).toEqual([182,145,99]);
 let arrows=0;for(let y=285+Math.round(1350*.36);y<285+1350*.69;y++)for(let x=Math.round(1080*.64);x<1080*.96;x++){const c=pixel(x,y);if(c[0]>150&&c[1]<110&&c[2]<60)arrows++;}expect(arrows).toBeGreaterThan(100);
 await reloadDraft(page);await expect(panel.getByRole('radio',{name:'같은 제품 작은 사진에 표시',exact:true})).toBeChecked();expect((await png(page)).equals(annotated)).toBe(true);expect(state.counts()).toEqual({generations:1,analyses:1});await writeFile(info.outputPath('inset-pixels-mock.png'),annotated);
});
test('pre-generation annotation unavailability prevents the paid generation dispatch',async({page})=>{
 const state=await setup(page,{mode:'inset',available:false});
 await expect(page.getByRole('alert')).toContainText('새 AI 생성을 요청하지 않았습니다');
 await expect(page.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true})).toHaveCount(0);
 expect(state.counts()).toEqual({generations:0,analyses:0});
 await page.getByRole('button',{name:'입력 내용 수정',exact:true}).click();
 await expect(page.getByRole('radio',{name:'같은 제품 작은 사진에 표시',exact:true})).toBeChecked();await reloadDraft(page);
 await expect(page.getByRole('radio',{name:'같은 제품 작은 사진에 표시',exact:true})).toBeChecked();expect(state.counts()).toEqual({generations:0,analyses:0});
});

test('missing geometry cannot be accepted as a completed annotated ad and reload does not retry analysis',async({page})=>{
 const state=await setup(page,{mode:'inset',missing:true}),panel=page.getByRole('region',{name:'광고 안 규격 표시'});
 await expect(panel).toContainText('자동 배치를 완료하지 못했습니다');
 await expect(page.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true})).toBeDisabled();
 await expect(page.locator('.generation-preview-label')).toContainText('규격 표시 미완료');
 await expect(page.locator('.generation-ad-preview')).toBeVisible();await expect(page.locator('.accepted-ad')).toHaveCount(0);
 await reloadDraft(page);await expect(page.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true})).toBeDisabled();expect(state.counts()).toEqual({generations:1,analyses:1});
});

// This verifies annotation delivery in the real review/export path, not reconstruction of fixture geometry.
test('500x350x200 direct labels are composed before acceptance and exported from the same reviewed pixels',async({page},info)=>{
 await page.addInitScript(()=>{const original=CanvasRenderingContext2D.prototype.fillText;(window as any).__dimensionText=[];CanvasRenderingContext2D.prototype.fillText=function(text:string,...args:any[]){(window as any).__dimensionText.push(text);return (original as any).call(this,text,...args);};});
 const state=await setup(page,{mode:'main',reviewOnly:true,dimensions:['500','350','200']});
 await expect(page.getByRole('button',{name:'위치 수정',exact:true})).toBeVisible();
 await expect(page.getByRole('checkbox',{name:'상품·재질 구조·규격·가격·문구를 확인했습니다.',exact:true})).toBeEnabled();
 const painted=await page.evaluate(()=>(window as any).__dimensionText);for(const value of ['500 mm','350 mm','200 mm'])expect(painted).toContain(value);
 const reviewed=await page.locator('.generation-ad-preview').getAttribute('src');await page.locator('.generation-result').screenshot({path:info.outputPath('500x350x200-direct-review-mock.png')});
 await page.getByRole('checkbox',{name:'상품·재질 구조·규격·가격·문구를 확인했습니다.',exact:true}).check();await page.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true}).click();
 const exported=await png(page);expect(exported.equals(Buffer.from(reviewed!.split(',')[1],'base64'))).toBe(true);expect(state.counts()).toEqual({generations:1,analyses:1});await writeFile(info.outputPath('500x350x200-direct-labels-mock.png'),exported);
});

for(const mode of ['main','inset'] as const)test(`owned box missing coordinates can be manually recovered and exports identical reviewed pixels: ${mode}`,async({page},info)=>{
 const state=await setup(page,{owned:true,missing:true,reviewOnly:true,mode});
 const panel=page.getByRole('region',{name:'광고 안 규격 표시'});
 await panel.getByRole('radio',{name:mode==='main'?'본제품에 직접 표시':'같은 제품 작은 사진에 표시',exact:true}).check();
 await expect(panel).toContainText('자동 배치를 완료하지 못했습니다');
 await reloadDraft(page);expect(state.counts()).toEqual({generations:1,analyses:1});
 await panel.getByRole('button',{name:'박스 위치 직접 지정',exact:true}).click();
 const editor=page.locator('.manual-box-coordinates');
 const imageBox=await editor.getByRole('img',{name:'위치를 지정할 원본 광고',exact:true}).boundingBox(),overlayBox=await editor.locator('svg').boundingBox();
 expect(imageBox!.width/imageBox!.height).toBeCloseTo(800/1000,2);expect(overlayBox!.x).toBeCloseTo(imageBox!.x,1);expect(overlayBox!.y).toBeCloseTo(imageBox!.y,1);expect(overlayBox!.width).toBeCloseTo(imageBox!.width,1);expect(overlayBox!.height).toBeCloseTo(imageBox!.height,1);
 const consent=editor.getByRole('checkbox');await consent.check();await editor.getByRole('button',{name:'수동 위치 적용',exact:true}).click();await expect(editor.getByRole('alert')).toBeVisible();
 const fill=async(label:string,values:number[],names=['왼쪽','위','너비','높이'])=>{for(let i=0;i<values.length;i++)await editor.getByLabel(label+' '+names[i]+' %',{exact:true}).fill(String(values[i]*100));};
 const p=proposal();await fill('상품 영역',p.product);
 for(const [axis,name] of [['width','가로'],['depth','깊이'],['height','높이']] as const)for(let i=0;i<2;i++)await fill(name+' '+(i?'끝점':'시작점'),p.axes[axis][i],['X','Y']);
 for(let i=0;i<2;i++){await editor.getByRole('button',{name:'문구 보호 영역 추가',exact:true}).click();await fill('문구 보호 영역 '+(i+1),p.protectedText[i]);}
 if(mode==='inset')await fill('작은 사진 공간',p.inset);
 await editor.screenshot({path:info.outputPath('manual-'+mode+'-coordinates-mock.png')});
 await consent.check();await editor.getByRole('button',{name:'수동 위치 적용',exact:true}).click();await expect(editor).toHaveCount(0);
 const review=page.getByRole('checkbox',{name:'상품·재질 구조·규격·가격·문구를 확인했습니다.',exact:true});await expect(review).toBeEnabled();
 await page.locator('.generation-result').screenshot({path:info.outputPath('manual-'+mode+'-review-mock.png')});
 const pixels=await page.locator('.generation-ad-preview').getAttribute('src');await review.check();await page.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true}).click();
 expect((await png(page)).equals(Buffer.from(pixels!.split(',')[1],'base64'))).toBe(true);await reloadDraft(page);expect((await png(page)).equals(Buffer.from(pixels!.split(',')[1],'base64'))).toBe(true);expect(state.counts()).toEqual({generations:1,analyses:1});
});
test('owned box uncertain analysis preserves original and request identity on status recovery',async({page})=>{
 const state=await setup(page,{owned:true,uncertain:true,reviewOnly:true,mode:'main'});const panel=page.getByRole('region',{name:'광고 안 규격 표시'});
 const ids=state.analysisIds;
 await panel.getByRole('radio',{name:'본제품에 직접 표시',exact:true}).check();await expect(panel).toContainText('분석 비용 확인 중');await reloadDraft(page);expect(state.counts()).toEqual({generations:1,analyses:1});
 await panel.getByRole('button',{name:'분석 상태 확인 · 추가 호출 없음',exact:true}).click();await expect.poll(()=>ids.length).toBe(2);expect(ids[0]).toBe(ids[1]);await expect(page.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true})).toBeDisabled();await expect(panel.getByRole('button',{name:'박스 위치 직접 지정',exact:true})).toBeVisible();
});

test('owned-result analysis approval cannot authorize a new paid image generation',async({page})=>{
 const state=await setup(page,{owned:true,allowNewGeneration:false,mode:'inset',reviewOnly:true});await expect(page.getByRole('alert')).toContainText('새 AI 생성을 요청하지 않았습니다');expect(state.counts()).toEqual({generations:0,analyses:0});
});
test('owned result automatic mock coordinates support both modes without a second analysis',async({page})=>{
 const state=await setup(page,{owned:true}),panel=page.getByRole('region',{name:'광고 안 규격 표시'});
 await panel.getByRole('radio',{name:'본제품에 직접 표시',exact:true}).check();await expect(panel.getByRole('button',{name:'위치 수정',exact:true})).toBeVisible();const main=await png(page);
 await panel.getByRole('radio',{name:'같은 제품 작은 사진에 표시',exact:true}).check();const inset=await png(page);expect(inset.equals(main)).toBe(false);await reloadDraft(page);expect((await png(page)).equals(inset)).toBe(true);expect(state.counts()).toEqual({generations:1,analyses:1});
});
