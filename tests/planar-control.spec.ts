import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';import {createHash} from 'node:crypto';
import {GenerationService} from '../server/generation-service.mjs';
import {OpenAIImageAdapter} from '../server/openai-image-adapter.mjs';
import {reloadDraft,seedLegacyDimensionDraft} from './helpers/workspace';
const photo=await sharp(Buffer.from('<svg width="300" height="300"><rect width="300" height="300" fill="white"/><rect x="60" y="60" width="180" height="120" fill="#346074"/></svg>')).png().toBuffer();
const raw=await sharp(Buffer.from('<svg width="864" height="1536"><rect width="864" height="1536" fill="white"/><rect x="200" y="260" width="600" height="340" fill="#446074"/></svg>')).png().toBuffer();
async function form(page:Page){await page.goto('/#create');const f=page.locator('.create-page');await f.getByLabel('산업 선택').selectOption('other');await f.getByLabel('상품명',{exact:true}).fill('평면 상품');await f.getByRole('textbox',{name:'상세설명',exact:true}).fill('정면 평면 패널');await f.getByLabel('참조사진 추가').setInputFiles({name:'panel.png',mimeType:'image/png',buffer:photo});await f.getByRole('button',{name:'규격 넣기',exact:true}).click();await f.getByLabel('규격 형식').selectOption('flat');await f.getByLabel('규격 단위').selectOption('mm');await f.getByLabel('가로 mm',{exact:true}).fill('180');await f.getByLabel('세로 mm',{exact:true}).fill('120');return f;}
test('legacy reshape draft uses one ordinary photo generation and retains admin exemption, recovery and save',async({page})=>{
 let calls=0;const requests:any[]=[];
 const adapter=new OpenAIImageAdapter({apiKey:'local-fixture-only',fetchImpl:async()=>{calls++;return new Response(JSON.stringify({data:[{b64_json:raw.toString('base64')}],usage:{input_tokens:3,input_tokens_details:{text_tokens:1,image_tokens:2},output_tokens:2}}));}});
 const service=new GenerationService({adapter,enabled:true,providerConfigured:true,budgetMicros:1000000,testCredits:0});service.adminTestUnlimited=true;
 await page.route('**/api/**',async route=>{const r=route.request(),path=new URL(r.url()).pathname;let response:any={};
  if(path==='/api/status')response=service.status();
  else if(path==='/api/account/capabilities')response={email:{enabled:false},checkout:{enabled:false}};
  else if(path==='/api/generations'&&r.method()==='POST'){const body=r.postDataJSON();requests.push(body);response=await service.create(body);await service.waitForIdle();response={job:service.job(response.job.id),wallet:service.wallet()};}
  else if(path.endsWith('/accept'))response=service.accept(path.split('/')[3],r.postDataJSON().artifactId);
  else if(path.startsWith('/api/generations/'))response={job:service.job(path.split('/')[3]),wallet:service.wallet()};
  else if(path==='/api/generations')response=service.history();
  await route.fulfill({json:response});
 });

 try{
  const f=await form(page);await seedLegacyDimensionDraft(page,true);
  await expect(f.getByRole('checkbox',{name:'규격을 AI 참고로 전달',exact:true})).toHaveCount(0);
  await expect(f.getByRole('checkbox',{name:'정면 평면 자동 보정',exact:true})).toHaveCount(0);
  await f.getByRole('button',{name:'광고 생성',exact:true}).click();
  await expect(page.locator('.generation-ad-preview')).toBeVisible();
  expect(requests[0].request.dimensionPlan).toBeUndefined();expect(requests[0].request.proportionControl).toBeUndefined();
  expect(requests[0].source.sha256).toBe(createHash('sha256').update(photo).digest('hex'));
  await reloadDraft(page);await expect(page.locator('.generation-ad-preview')).toBeVisible();expect(calls).toBe(1);
  await page.getByRole('checkbox',{name:'상품·재질 구조·규격·가격·문구를 확인했습니다.',exact:true}).check();
  await page.getByRole('button',{name:'사용 확정 · 이용권 차감 없음',exact:true}).click();
  await expect(page.locator('.accepted-ad')).toBeVisible();await expect(page.locator('.accepted-ad .planar-result')).toHaveCount(0);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'이미지 저장 · 공유',exact:true}).click();expect(await sharp((await(await download).path())!).metadata()).toMatchObject({width:1080,height:1920});
  expect(calls).toBe(1);expect(requests).toHaveLength(1);expect(service.wallet()).toMatchObject({available:0,reserved:0,unlimited:true});
 }finally{await service.close();}
});
test('numeric measurements still persist without reshape controls',async({page})=>{
 const f=await form(page);await reloadDraft(page);await expect(f.getByLabel('가로 mm',{exact:true})).toHaveValue('180');await expect(f.getByLabel('세로 mm',{exact:true})).toHaveValue('120');
 await f.getByLabel('규격 형식').selectOption('cylindrical');await f.getByLabel('지름 mm',{exact:true}).fill('65');await f.getByLabel('높이 mm',{exact:true}).fill('170');await reloadDraft(page);
 await expect(f.getByLabel('지름 mm',{exact:true})).toHaveValue('65');await expect(f.getByLabel('높이 mm',{exact:true})).toHaveValue('170');await expect(f.getByRole('radio')).toHaveCount(3);
 await expect(f.getByRole('checkbox',{name:'규격을 AI 참고로 전달',exact:true})).toHaveCount(0);
});
