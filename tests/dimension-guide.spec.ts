import {test,expect,type Page} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
// This spec exercises protected screens; guest/login contracts stay in their dedicated specs.
test.beforeEach(async({page})=>{await protectedScreen(page,mockSession('protected-dimension-guide'));});import sharp from 'sharp';import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {starterProject,prepareCampaign} from '../src/consumer-campaign';
import {buildGenerationRequest} from '../src/generation';
import {generatedCompatibilityKey} from '../src/generated';
import {restoreOwnedWorkspace} from './helpers/owned-workspace';
const bytes=await sharp({create:{width:600,height:400,channels:4,background:'#397095'}}).png().toBuffer(),hash=createHash('sha256').update(bytes).digest('hex');
async function generate(page:Page,{shape='rectangular',basis='inner-body',category='boxes',values=['450','300','400']}={}){
 // Dimension-driven reshaping is retired for new requests. Recover the old
 // request/job and retain review, saved measurements, diagram pixels and exports.
 let draft=starterProject(category as any);draft.productName='규격 안내 시험';draft.productProfile={...draft.productProfile,specType:shape as any,material:'본체 치수 안내'};
 draft.product={name:'source.png',data:'data:image/png;base64,'+bytes.toString('base64'),width:600,height:400,sha256:hash};
 draft.dimensions={...draft.dimensions,width:shape==='cylindrical'?'65':values[0],depth:values[1],height:shape==='cylindrical'?'170':values[2],displayUnit:'mm',visible:true};draft=prepareCampaign(draft);
 draft.generation={...draft.generation,dimensionBased:true,dimensionBasis:basis as any,dimensionVariant:''};
 const request={projectId:draft.id,requestId:'historical-guide-request',request:buildGenerationRequest(draft)};
 let calls=0;const wallet={available:5,reserved:0,kind:'test'};
 const job={id:'guide-fixture',requestIds:[request.requestId],projectId:draft.id,state:'ready',mode:'creative',sourceHash:hash,createdAt:'2026-10-17T00:00:00.000Z',model:'fixture',artifactId:hash,artifact:{id:hash,sha256:hash,dataUrl:'data:image/png;base64,'+bytes.toString('base64'),width:600,height:400,role:'creative'},dimensionPlan:request.request.dimensionPlan,marketingPlan:request.request.marketingPlan};
 await page.route('**/api/**',async route=>{const r=route.request(),path=new URL(r.url()).pathname;
  if(path==='/api/generations'&&r.method()==='POST'){calls++;return route.fulfill({status:500,json:{error:{code:'UNEXPECTED_NEW_GENERATION'}}});}
  if(path.endsWith('/accept')){job.state='accepted';return route.fulfill({json:{job,wallet}});}
  if(path.startsWith('/api/generations/'))return route.fulfill({json:{job,wallet}});
  if(path==='/api/generations')return route.fulfill({json:{jobs:[job]}});
  return route.fallback();
 });
 await restoreOwnedWorkspace(page,draft,'protected-dimension-guide','studio',{jobId:job.id,requestId:request.requestId,key:generatedCompatibilityKey(draft)});
 await page.locator('.new-ad-options>summary').click();await page.getByRole('checkbox',{name:'상품·재질 구조·규격·가격·문구를 확인했습니다.',exact:true}).check();await page.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true}).click();await expect(page.locator('.accepted-ad')).toBeVisible();return {calls:()=>calls,request:()=>request};
}
async function download(page:Page,name:string){const event=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();const file=await event;return {name:file.suggestedFilename(),bytes:await readFile((await file.path())!)};}
test('separate cuboid guide exports exact saved labels and pixels without changing ad or calling provider again',async({page},info)=>{
 const state=await generate(page),before=await download(page,'이미지 저장 · 공유'),guide=page.getByRole('region',{name:'규격 안내 이미지',exact:true});const closedPreviewFile=await download(page,'규격 안내 이미지 저장');await guide.locator('summary').click();const svg=guide.getByRole('img');await expect(svg).toContainText('450 mm');await expect(svg).toContainText('300 mm');await expect(svg).toContainText('400 mm');await expect(svg).toContainText('본체 내부 치수');await expect(svg).toContainText('열린 날개');
 for(const width of [320,360,390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);expect(await svg.locator('text').evaluateAll(nodes=>nodes.every(n=>{const b=(n as SVGGraphicsElement).getBBox();return b.x>=0&&b.y>=0&&b.x+b.width<=960&&b.y+b.height<=1040;}))).toBe(true);}
 await page.setViewportSize({width:360,height:900});await guide.screenshot({path:info.outputPath('dimension-guide-360.png')});const file=await download(page,'규격 안내 이미지 저장');await writeFile(info.outputPath('dimension-guide-450-300-400.png'),file.bytes);expect(file.bytes.equals(closedPreviewFile.bytes)).toBe(true);expect(file.name).toBe('aiadcast-dimensions-rectangular.png');expect(await sharp(file.bytes).metadata()).toMatchObject({width:1920,height:2080});const pixel=await sharp(file.bytes).extract({left:900,top:1000,width:1,height:1}).removeAlpha().raw().toBuffer();expect([...pixel]).toEqual([243,243,243]);
 for(const top of [1500,1620,1740]){const {data}=await sharp(file.bytes).extract({left:80,top,width:1600,height:80}).removeAlpha().raw().toBuffer({resolveWithObject:true});expect([...data].filter(v=>v<200).length).toBeGreaterThan(1000);}
 const after=await download(page,'이미지 저장 · 공유');expect(after.bytes.equals(before.bytes)).toBe(true);expect(state.calls()).toBe(0);expect(state.request().request.dimensionPlan.basis).toBe('inner-body');
});
for(const shape of ['flat','cylindrical'])test(`${shape} guide preserves two axes and scoped drawing`,async({page})=>{const state=await generate(page,{shape,basis:'outer-body',category:'other'}),guide=page.getByRole('region',{name:'규격 안내 이미지',exact:true});await guide.locator('summary').click();await expect(guide.locator('.dimension-guide-values')).toContainText(shape==='flat'?'W · 가로 450 mm':'Ø · 지름 65 mm');await expect(guide.locator('.dimension-guide-values')).toContainText(shape==='flat'?'L · 세로 300 mm':'H · 높이 170 mm');const file=await download(page,'규격 안내 이미지 저장');expect(file.name).toBe(`aiadcast-dimensions-${shape}.png`);expect(await sharp(file.bytes).metadata()).toMatchObject({width:1920,height:2080});expect(state.calls()).toBe(0);});
test('apparel has an honest unavailable explanation and no box download',async({page})=>{const state=await generate(page,{shape:'flat',basis:'garment-flat',category:'fashion'}),guide=page.getByRole('region',{name:'규격 안내 이미지',exact:true});await expect(guide).toContainText('지원하지 않습니다');await expect(guide.getByRole('button')).toHaveCount(0);expect(state.calls()).toBe(0);});

for(const values of [['0.000001','0.000002','0.000003'],['99999.99999999','70000','80000']])test(`dimension labels remain exact and unclipped at ${values[0]} mm`,async({page})=>{
 await generate(page,{values,basis:'body'});const guide=page.getByRole('region',{name:'규격 안내 이미지',exact:true});await guide.locator('summary').click();const svg=guide.getByRole('img');for(const value of values)await expect(svg).toContainText(value+' mm');await expect(svg).toContainText('내부/외부 미지정');expect(await svg.locator('text').evaluateAll(nodes=>nodes.every(n=>{const b=(n as SVGGraphicsElement).getBBox();return b.x>=0&&b.y>=0&&b.x+b.width<=960&&b.y+b.height<=1040;}))).toBe(true);const file=await download(page,'규격 안내 이미지 저장');expect(await sharp(file.bytes).metadata()).toMatchObject({width:1920,height:2080});
});
