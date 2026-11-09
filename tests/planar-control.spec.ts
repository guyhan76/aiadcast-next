import {selectConsumerIndustry} from './helpers/industry';
import {test,expect,type Page} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
// This spec exercises protected screens; guest/login contracts stay in their dedicated specs.
test.beforeEach(async({page})=>{await protectedScreen(page,mockSession('protected-planar-control'));});
import sharp from 'sharp';import {createHash} from 'node:crypto';
import {GenerationService} from '../server/generation-service.mjs';
import {OpenAIImageAdapter} from '../server/openai-image-adapter.mjs';
import {readFile} from 'node:fs/promises';
import {starterProject,prepareCampaign} from '../src/consumer-campaign';
import {buildGenerationRequest} from '../src/generation';
import {generatedCompatibilityKey} from '../src/generated';
import {restoreOwnedWorkspace} from './helpers/owned-workspace';
import {reloadDraft} from './helpers/workspace';
const photo=await sharp(Buffer.from('<svg width="300" height="300"><rect width="300" height="300" fill="white"/><rect x="60" y="60" width="180" height="120" fill="#346074"/></svg>')).png().toBuffer();
const raw=await sharp(Buffer.from('<svg width="1024" height="1024"><rect width="1024" height="1024" fill="white"/><rect x="200" y="260" width="600" height="340" fill="#446074"/></svg>')).png().toBuffer();
async function form(page:Page,withPhoto=true){await page.goto('/#create');const f=page.locator('.create-page');await selectConsumerIndustry(f,'other');await f.getByLabel('상품명',{exact:true}).fill('평면 상품');await f.getByRole('textbox',{name:'상세설명',exact:true}).fill('정면 평면 패널');if(withPhoto)await f.getByLabel('참조사진 추가').setInputFiles({name:'panel.png',mimeType:'image/png',buffer:photo});await f.getByRole('button',{name:'규격 넣기',exact:true}).click();await f.getByLabel('규격 형식').selectOption('flat');await f.getByLabel('규격 단위').selectOption('mm');await f.getByLabel('가로 mm',{exact:true}).fill('180');await f.getByLabel('세로 mm',{exact:true}).fill('120');return f;}
test('historical planar result preserves source, raw result, measurements and export without a new provider request',async({page},info)=>{
 let calls=0;const requests:any[]=[];
 const adapter=new OpenAIImageAdapter({apiKey:'local-fixture-only',fetchImpl:async()=>{calls++;return new Response(JSON.stringify({data:[{b64_json:raw.toString('base64')}],usage:{input_tokens:3,input_tokens_details:{text_tokens:1,image_tokens:2},output_tokens:2}}));}});
 const service=new GenerationService({adapter,enabled:true,providerConfigured:true,budgetMicros:1000000,testCredits:0});service.adminTestUnlimited=true;
 await page.route('**/api/**',async route=>{if(new URL(route.request().url()).pathname==='/api/auth/session')return route.fallback();const r=route.request(),path=new URL(r.url()).pathname;let response:any={};
  if(path==='/api/status')response=service.status();
  else if(path==='/api/account/capabilities')response={email:{enabled:false},checkout:{enabled:false}};
  else if(path==='/api/generations'&&r.method()==='POST'){const body=r.postDataJSON();requests.push(body);response=await service.create(body);await service.waitForIdle();response={job:service.job(response.job.id),wallet:service.wallet()};}
  else if(path.endsWith('/accept'))response=service.accept(path.split('/')[3],r.postDataJSON().artifactId);
  else if(path.startsWith('/api/generations/'))response={job:service.job(path.split('/')[3]),wallet:service.wallet()};
  else if(path==='/api/generations')response=service.history();
  await route.fulfill({json:response});
 });
 try{
  let draft=starterProject('other');draft.productName='평면 상품';draft.productProfile={...draft.productProfile,specType:'flat',material:'정면 평면 패널'};draft.product={name:'panel.png',data:'data:image/png;base64,'+photo.toString('base64'),width:300,height:300,sha256:createHash('sha256').update(photo).digest('hex')};draft.dimensions={...draft.dimensions,width:'180',depth:'120',height:'0',displayUnit:'mm'};draft=prepareCampaign(draft);draft.generation={...draft.generation,dimensionBased:true,planarSourceHash:draft.product!.sha256,dimensionVariant:'규격 A',dimensionBasis:'outer-body'};
  const body={projectId:draft.id,requestId:'historic-planar-request',request:buildGenerationRequest(draft),source:draft.product,references:[]};requests.push(body);const created=await service.create(body);await service.waitForIdle();const job=service.job(created.job.id);expect(job.state).toBe('ready');
  await restoreOwnedWorkspace(page,draft,'protected-planar-control','studio',{jobId:job.id,requestId:body.requestId,key:generatedCompatibilityKey(draft)});await page.locator('.new-ad-options>summary').click();const review=page.getByRole('region',{name:'규격 기반 생성 확인'});
  await expect(review).toContainText('보정했습니다');await expect(review).toContainText('규격 A');await expect(review).toContainText('실물 치수·입체 형상·상품 동일성 검증은 아닙니다');await review.locator('summary').click();await expect(review.getByRole('img')).toHaveAttribute('src','data:image/png;base64,'+raw.toString('base64'));
  await expect(page.getByRole('button',{name:/^(사용 확정|Accept)$/})).toBeEnabled();await page.getByRole('button',{name:'사용 확정',exact:true}).click();await expect(page.locator('.accepted-ad .planar-result')).toBeVisible();await expect(page.locator('.accepted-ad .marketing-summary')).toBeVisible();
  for(const width of [320,360,390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'이미지 저장 · 공유',exact:true}).click();expect(await sharp((await(await download).path())!).metadata()).toMatchObject({width:1080,height:1920});expect(calls).toBe(1);expect(requests).toHaveLength(1);expect(requests[0].source.sha256).toBe(createHash('sha256').update(photo).digest('hex'));expect(service.wallet()).toMatchObject({available:0,reserved:0,unlimited:true});
  await page.getByRole('button',{name:'입력 내용 수정',exact:true}).click();const f=page.locator('.create-page');await f.getByLabel('세로 mm',{exact:true}).fill('180');await reloadDraft(page);await expect(f.getByLabel('세로 mm',{exact:true})).toHaveValue('180');await expect(f.getByRole('checkbox',{name:'정면 평면 자동 보정',exact:true})).toHaveCount(0);expect(calls).toBe(1);expect(requests).toHaveLength(1);expect(requests[0].request.proportionControl.variantLabel).toBe('규격 A');expect(requests[0].request.specifications[1].value).toBe('120');
 }finally{await service.close();}
});
test('new forms cannot dispatch retired planar control and missing photos block every shape without writes',async({page})=>{
 let posts=0;await page.route('**/api/**',r=>{if(r.request().method()!=='GET')posts++;return r.fallback();});const f=await form(page,false);
 for(const shape of ['cylindrical','flat']){await f.getByLabel('규격 형식').selectOption(shape);await expect(f.getByRole('checkbox',{name:'정면 평면 자동 보정',exact:true})).toHaveCount(0);await expect(f.getByRole('checkbox',{name:'규격을 AI 참고로 전달',exact:true})).toHaveCount(0);await f.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(f.getByRole('alert')).toContainText('사진');await expect(page).toHaveURL(/#create$/);expect(posts).toBe(0);}
});
test('historical garment and container variants retain names and exact numeric measurements through backup and reload',async({page})=>{
 let writes=0;await page.route('**/api/**',r=>{if(r.request().method()!=='GET')writes++;return r.fallback();});
 for(const [shape,basis,name,width,height] of [['flat','garment-flat','M','520','700'],['cylindrical','inner-body','500 ml','65','170']] as const){let draft=starterProject('other');draft.productName='이전 규격 상품';draft.productProfile={...draft.productProfile,specType:shape,material:'보존할 규격'};draft.dimensions={...draft.dimensions,width,depth:'700',height,displayUnit:'mm'};draft=prepareCampaign(draft);draft.generation={...draft.generation,dimensionBased:true,dimensionBasis:basis,dimensionVariant:name};await restoreOwnedWorkspace(page,draft,'protected-planar-control','editor');
  for(let i=0;i<2;i++){const event=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 백업',exact:true}).click();const saved=JSON.parse(await readFile((await(await event).path())!,'utf8'));expect(saved.dimensions).toEqual(draft.dimensions);expect(saved.generation.dimensionVariant).toBe(name);expect(saved.generation.dimensionBasis).toBe(basis);expect(saved.productProfile.specType).toBe(shape);if(i===0)await page.reload();}expect(writes).toBe(0);
 }
});
