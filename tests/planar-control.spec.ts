import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';import {createHash} from 'node:crypto';
import {GenerationService} from '../server/generation-service.mjs';
import {OpenAIImageAdapter} from '../server/openai-image-adapter.mjs';
import {reloadDraft} from './helpers/workspace';
const photo=await sharp(Buffer.from('<svg width="300" height="300"><rect width="300" height="300" fill="white"/><rect x="60" y="60" width="180" height="120" fill="#346074"/></svg>')).png().toBuffer();
const raw=await sharp(Buffer.from('<svg width="1024" height="1024"><rect width="1024" height="1024" fill="white"/><rect x="200" y="260" width="600" height="340" fill="#446074"/></svg>')).png().toBuffer();
async function form(page:Page){await page.goto('/#create');const f=page.locator('.create-page');await f.getByLabel('산업 선택').selectOption('other');await f.getByLabel('상품명',{exact:true}).fill('평면 상품');await f.getByRole('textbox',{name:'상세설명',exact:true}).fill('정면 평면 패널');await f.getByLabel('참조사진 추가').setInputFiles({name:'panel.png',mimeType:'image/png',buffer:photo});await f.getByRole('button',{name:'규격 넣기',exact:true}).click();await f.getByLabel('규격 형식').selectOption('flat');await f.getByLabel('규격 단위').selectOption('mm');await f.getByLabel('가로 mm',{exact:true}).fill('180');await f.getByLabel('세로 mm',{exact:true}).fill('120');return f;}
test('opt-in planar generation preserves drafts, separate source and raw result with no extra provider calls',async({page},info)=>{
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
  const f=await form(page),toggle=f.getByRole('checkbox',{name:/규격을 AI 참고로 전달/});await expect(toggle).not.toBeChecked();await toggle.check();await f.getByRole('checkbox',{name:'정면 평면 자동 보정',exact:true}).check();await f.getByLabel('이번 규격 이름 (선택)').fill('규격 A');
  await reloadDraft(page);await expect(toggle).toBeChecked();await expect(f.getByLabel('이번 규격 이름 (선택)')).toHaveValue('규격 A');
  await f.getByRole('button',{name:'광고 생성',exact:true}).click();const review=page.getByRole('region',{name:'규격 기반 생성 확인'});
  await expect(review).toContainText('보정했습니다');await expect(review).toContainText('규격 A');await expect(review).toContainText('실물 치수·입체 형상·상품 동일성 검증은 아닙니다');
  await review.locator('summary').click();await expect(review.getByRole('img')).toHaveAttribute('src','data:image/png;base64,'+raw.toString('base64'));
  await page.getByRole('checkbox',{name:'상품·재질 구조·규격·가격·문구를 확인했습니다.',exact:true}).check();await page.getByRole('button',{name:'사용 확정 · 이용권 차감 없음',exact:true}).click();
  await expect(page.locator('.accepted-ad .planar-result')).toBeVisible();await expect(page.locator('.accepted-ad .marketing-summary')).toBeVisible();
  for(const width of [320,360,390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
  await page.setViewportSize({width:360,height:900});await page.locator('.accepted-ad .planar-result').screenshot({path:info.outputPath('planar-review.png')});
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'이미지 저장',exact:true}).click();expect(await sharp((await(await download).path())!).metadata()).toMatchObject({width:1080,height:1920});
  expect(calls).toBe(1);expect(requests).toHaveLength(1);expect(requests[0].source.sha256).toBe(createHash('sha256').update(photo).digest('hex'));expect(service.wallet()).toMatchObject({available:0,reserved:0,unlimited:true});
  await page.getByRole('button',{name:'입력 내용 수정',exact:true}).click();await f.getByLabel('세로 mm',{exact:true}).fill('180');await f.getByLabel('이번 규격 이름 (선택)').fill('규격 B');await reloadDraft(page);await expect(f.getByLabel('세로 mm',{exact:true})).toHaveValue('180');expect(calls).toBe(1);expect(requests[0].request.proportionControl.variantLabel).toBe('규격 A');expect(requests[0].request.specifications[1].value).toBe('120');
  await toggle.uncheck();await expect(f.getByLabel('이번 규격 이름 (선택)')).toHaveCount(0);await reloadDraft(page);await expect(toggle).not.toBeChecked();
 }finally{await service.close();}
});
test('unsupported server blocks opt-in dispatch and unsupported dimensions never enable it',async({page})=>{
 let posts=0;await page.route('**/api/**',r=>{if(r.request().method()==='POST')posts++;return r.fulfill({json:new URL(r.request().url()).pathname==='/api/status'?{generation:{enabled:true,photoPurposes:true},wallet:{available:3,reserved:0},budget:{limitMicros:1000000,spentMicros:0,heldMicros:0}}:{email:{enabled:false},checkout:{enabled:false}}});});
 const f=await form(page),toggle=f.getByRole('checkbox',{name:/규격을 AI 참고로 전달/});await f.getByLabel('규격 형식').selectOption('cylindrical');await expect(toggle).toBeEnabled();await toggle.check();await expect(f.getByRole('checkbox',{name:'정면 평면 자동 보정',exact:true})).toBeDisabled();await toggle.uncheck();await f.getByLabel('규격 형식').selectOption('flat');await toggle.check();await f.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.getByRole('alert')).toContainText('서버가 규격 기반 생성을 지원하지 않습니다');expect(posts).toBe(0);
});
test('measured garment and container variants are optional and retain numeric measurements on reload',async({page})=>{
 const f=await form(page);await f.getByRole('checkbox',{name:'규격을 AI 참고로 전달',exact:true}).check();await f.getByLabel('치수 기준',{exact:true}).selectOption('garment-flat');await f.getByLabel('가슴 단면 mm',{exact:true}).fill('520');await f.getByLabel('총장 mm',{exact:true}).fill('700');await f.getByLabel('이번 규격 이름 (선택)').fill('M');await expect(f.getByRole('checkbox',{name:'정면 평면 자동 보정',exact:true})).toBeDisabled();await reloadDraft(page);await expect(f.getByLabel('가슴 단면 mm',{exact:true})).toHaveValue('520');await expect(f.getByLabel('총장 mm',{exact:true})).toHaveValue('700');await expect(f.getByLabel('이번 규격 이름 (선택)')).toHaveValue('M');
 await f.getByLabel('규격 형식').selectOption('cylindrical');await f.getByLabel('지름 mm',{exact:true}).fill('65');await f.getByLabel('높이 mm',{exact:true}).fill('170');await f.getByLabel('이번 규격 이름 (선택)').fill('500 ml');await reloadDraft(page);await expect(f.getByLabel('지름 mm',{exact:true})).toHaveValue('65');await expect(f.getByLabel('높이 mm',{exact:true})).toHaveValue('170');await f.getByRole('button',{name:'규격 없이',exact:true}).click();await f.getByRole('button',{name:'규격 넣기',exact:true}).click();await expect(f.getByRole('checkbox',{name:'규격을 AI 참고로 전달',exact:true})).not.toBeChecked();
});
