import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
const bytes=await sharp({create:{width:400,height:300,channels:4,background:'#b58354'}}).png().toBuffer();
const photo={name:'source.png',mimeType:'image/png',buffer:bytes};
const director=(page:Page)=>page.getByRole('region',{name:'대화로 광고 요청',exact:true});
async function downloadJSON(page:Page,name='프로젝트 백업'){
 const event=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();return JSON.parse(await readFile((await (await event).path())!,'utf8'));
}
async function request(page:Page,text:string){const panel=director(page);await panel.getByLabel('원하는 광고 또는 수정 요청').fill(text);await panel.getByRole('button',{name:'요청 남기기',exact:true}).click();}
test.beforeEach(async({page})=>{await page.goto('/#studio');await page.getByLabel('상품 사진 추가').setInputFiles(photo);await expect(page.getByRole('status')).toContainText('원본 사진');});
test('a conversation proposal applies only after review, preserves photo and supports undo',async({page})=>{
 const original=await downloadJSON(page);await page.getByRole('button',{name:'대화로 요청·수정하기',exact:true}).click();await expect(page).toHaveURL(/#studio$/);
 await request(page,'배경을 검정색으로 바꿔줘');const panel=director(page);await expect(panel.getByText('빠른 편집 제안 · AI 미사용',{exact:true})).toBeVisible();
 const pending=await downloadJSON(page);expect(pending.background).toEqual(original.background);
 await page.getByRole('button',{name:'광고 기획 저장',exact:true}).click();await expect(page.getByRole('status')).toContainText('적용하거나 제외');
 await panel.getByRole('button',{name:'변경안 적용',exact:true}).click();const applied=await downloadJSON(page);
 expect(applied.background.color).toBe('#171717');expect(applied.product).toEqual(original.product);expect(applied.dimensions).toEqual(original.dimensions);expect(applied.conversation.turns[0].state).toBe('applied');
 await page.getByRole('button',{name:'되돌리기',exact:true}).click();const undone=await downloadJSON(page);expect(undone.background).toEqual(original.background);expect(undone.conversation.turns[0].state).toBe('recorded');
 await panel.getByRole('button',{name:'이 요청 제외',exact:true}).click();const plan=await downloadJSON(page,'광고 기획 저장');expect(plan.request.direction.instructions).toEqual([]);
});
test('print direction needs explicit consent and survives device save and backup import',async({page})=>{
 const panel=director(page);await page.getByLabel('프로젝트 이름').fill('인쇄 대화 프로젝트');await panel.getByRole('button',{name:'인쇄 색상 요청',exact:false}).click();await panel.getByRole('button',{name:'요청 남기기',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('허용');await expect(panel.getByRole('list')).toHaveCount(0);
 await panel.getByRole('checkbox',{name:/상품 인쇄 변경을 별도 시안으로 허용/}).check();await panel.getByRole('button',{name:'요청 남기기',exact:true}).click();await expect(panel.getByText('요청 기록됨 · 생성 전',{exact:true})).toBeVisible();
 const plan=await downloadJSON(page,'광고 기획 저장');expect(plan.request.operation).toBe('image-region');expect(plan.request.preserveProduct).toBe(false);expect(plan.request.direction.productPolicy.maskRequired).toBe(true);expect(plan.request.direction.productPolicy.saveAsSeparateVariant).toBe(true);expect(plan.request.direction.execution).toBe('not-started');
 const data=await downloadJSON(page);expect(Buffer.from(data.product.data.split(',')[1],'base64')).toEqual(bytes);
 await page.getByRole('button',{name:'이 기기에 저장',exact:true}).click();await expect(page.getByRole('status')).toContainText('이 기기에 저장');await page.reload();await page.getByRole('button',{name:'저장한 작업',exact:true}).click();await page.getByRole('button',{name:/인쇄 대화 프로젝트/}).click();expect((await downloadJSON(page)).conversation).toEqual(data.conversation);
 await page.getByLabel('프로젝트 파일 선택').setInputFiles({name:'conversation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await expect(page.getByRole('status')).toContainText('프로젝트를 열었습니다');expect((await downloadJSON(page)).conversation).toEqual(data.conversation);
});
test('follow-up requests retain context and replacing a photo blocks old instructions',async({page})=>{
 const panel=director(page);await request(page,'상품은 그대로 두고 밝은 쇼룸에서 촬영한 느낌으로 연출해줘.');await request(page,'오른쪽은 문구를 넣을 수 있게 비워줘.');let plan=await downloadJSON(page,'광고 기획 저장');expect(plan.request.direction.instructions).toHaveLength(2);expect(plan.request.preserveProduct).toBe(true);
 await panel.getByRole('listitem').first().getByRole('button',{name:'이 요청 제외',exact:true}).click();plan=await downloadJSON(page,'광고 기획 저장');expect(plan.request.direction.instructions).toHaveLength(1);expect(plan.request.direction.instructions[0].text).toContain('오른쪽');
 await page.getByLabel('상품 사진 추가').setInputFiles({...photo,buffer:await sharp(bytes).resize(500,300).png().toBuffer()});await expect(page.getByRole('status')).toContainText('원본 사진');await page.getByRole('button',{name:'광고 기획 저장',exact:true}).click();await expect(page.getByRole('status')).toContainText('이전 요청을 제외');await expect(panel.getByText(/원본·대상·언어가 바뀐 이전 요청/)).toBeVisible();
 await panel.getByRole('button',{name:'이 요청 제외',exact:true}).click();expect((await downloadJSON(page,'광고 기획 저장')).request.direction.instructions).toEqual([]);
});
test('long dialogue and appearance controls fit mobile and desktop without executing AI',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const panel=director(page);
 await request(page,'실제 상품의 형태와 로고는 유지해줘. '+ '자연광으로 촬영한 매장 광고를 원해요. '.repeat(20));await panel.getByRole('button',{name:'인쇄 색상 요청',exact:false}).click();
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});await panel.scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth),`dialogue at ${width}`).toBeLessThanOrEqual(width);}
 await expect(panel.getByText('요청 준비 · AI 연결 전',{exact:true})).toBeVisible();await expect(panel.getByText(/이용권 차감이 실행되지 않았습니다/)).toBeVisible();expect(errors).toEqual([]);
});
