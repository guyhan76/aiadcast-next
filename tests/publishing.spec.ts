import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {newProject} from '../src/model';
import {withCategory} from '../src/product';
import {defaultCampaign} from '../src/campaign';
function sample(){const p=withCategory(newProject(),'cafe');p.name='게시 가이드 시험';p.productName='가을 라떼';p.copy.ko={title:'가을 라떼',description:'6,900원 · 10월 31일까지',company:'카페 봄',contact:'010-1234-5678',website:'https://example.com'};p.copy.en={title:'Autumn latte',description:'Available until October 31',company:'Cafe Spring',contact:'010-1234-5678',website:'https://example.com'};p.campaign={...defaultCampaign(),attributes:[{name:'지역',value:'인천'}]};return p;}
async function open(page:Page){await page.goto('/#editor');await page.locator('.editor-details > summary').click();await page.getByLabel('프로젝트 파일 선택').setInputFiles({name:'cafe.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(sample()))});await page.locator('#publishing-tools > summary').click();return page.getByRole('region',{name:'광고 활용 가이드',exact:true});}
async function backup(page:Page){const event=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 백업',exact:true}).click();return JSON.parse(await readFile((await(await event).path())!,'utf8'));}
test('channel suggestions, editable copy, clipboard and image export work without paid calls or changing the editable ratio',async({page})=>{
 const paid:string[]=[];page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(generations|assistant)/.test(r.url()))paid.push(r.url());});
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(value:string)=>{(window as any).__copied=value;}}}));
 const panel=await open(page),channels=panel.getByRole('group',{name:'게시할 매체'});await expect(channels.getByRole('button')).toHaveCount(6);await expect(channels).toContainText('인스타그램');
 await expect(panel.getByLabel('게시글 내용')).toContainText('6,900원');await panel.getByRole('button',{name:'게시글 복사',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).__copied)).toContain('#가을라떼');
 await panel.getByLabel('게시글 내용').fill('직접 수정한 라떼 소개 6,900원');
 await panel.getByRole('button',{name:'모든 매체 보기',exact:true}).click();await channels.getByRole('button',{name:/블로그/}).click();
 await expect(panel.getByLabel('게시글 제목')).toHaveValue('가을 라떼 소개');await panel.getByRole('button',{name:'게시글 복사',exact:true}).click();expect(await page.evaluate(()=>(window as any).__copied)).not.toContain('#가을라떼');
 const before=(await backup(page)).format;const event=page.waitForEvent('download');await panel.getByRole('button',{name:/이 매체용 이미지 저장/}).click();const meta=await sharp(await readFile((await(await event).path())!)).metadata();expect([meta.width,meta.height]).toEqual([1920,1080]);expect((await backup(page)).format).toBe(before);
 await channels.getByRole('button',{name:/인스타그램/}).click();await expect(panel.getByLabel('게시글 내용')).toHaveValue('직접 수정한 라떼 소개 6,900원');
 await channels.getByRole('button',{name:/숏폼/}).click();await expect(panel).toContainText('동영상은 생성되지 않습니다');
 await channels.getByRole('button',{name:/광고 룩북/}).click();await expect(panel).toContainText('현재 광고 1장을 저장');
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:950});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 expect(paid).toEqual([]);
});
test('edited posts persist through save/import, stale prices block copying, and UI language does not translate drafts',async({page})=>{
 page.on('dialog',d=>d.accept());const panel=await open(page);
 await panel.getByLabel('게시글 내용').fill('수정한 게시글 6,900원');
 const stored=await backup(page);expect(stored.publishing.drafts[0].body).toBe('수정한 게시글 6,900원');
 await page.getByRole('button',{name:'이 기기에 저장',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'이 기기에 저장'})).toBeVisible();await page.reload();await page.locator('.editor-details>summary').click();await page.locator('#publishing-tools>summary').click();
 await page.getByRole('button',{name:'저장한 작업',exact:true}).click();await page.getByRole('button',{name:/게시 가이드 시험/}).click();await expect(panel.getByLabel('게시글 내용')).toHaveValue('수정한 게시글 6,900원');
 await page.locator('.editor-tabs').getByRole('button',{name:/문구·언어/}).click();await page.getByRole('textbox',{name:'광고 설명',exact:true}).fill('7,900원 · 11월 30일까지');
 await expect(panel.getByRole('alert')).toContainText('광고 정보가 바뀌었습니다');await expect(panel.getByRole('button',{name:'게시글 복사',exact:true})).toBeDisabled();
 await panel.getByRole('button',{name:'최신 정보로 다시 구성',exact:true}).click();await expect(panel.getByLabel('게시글 내용')).toContainText('7,900원');await expect(panel.getByLabel('게시글 내용')).not.toContainText('6,900원');await expect(panel.getByRole('button',{name:'게시글 복사',exact:true})).toBeEnabled();
 await page.getByLabel('앱 언어',{exact:true}).selectOption('en');const english=page.getByRole('region',{name:'Ad publishing guide',exact:true});await expect(english.getByLabel('Post body')).toContainText('7,900원');
 await page.getByLabel('App language',{exact:true}).selectOption('ko');await page.getByLabel('프로젝트 파일 선택').setInputFiles({name:'restored.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(stored))});await expect(panel.getByLabel('게시글 내용')).toHaveValue('수정한 게시글 6,900원');
});
test('clipboard denial offers selectable text, never a false copied message',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied');}}}));
 const panel=await open(page);await panel.getByRole('button',{name:'게시글 복사',exact:true}).click();await expect(panel.getByRole('status')).toContainText('선택해 복사');await expect(panel.getByLabel('직접 복사할 게시글')).toContainText('가을 라떼');await expect(panel.getByRole('status')).not.toContainText('복사했습니다');
});

test('image export failures are explained beside the publishing action',async({page})=>{
 const p=withCategory(sample(),'boxes');p.productProfile.specType='rectangular';p.dimensions.visible=true;
 await page.goto('/#editor');await page.locator('.editor-details > summary').click();await page.getByLabel('프로젝트 파일 선택').setInputFiles({name:'box.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});await page.locator('#publishing-tools>summary').click();
 const panel=page.getByRole('region',{name:'광고 활용 가이드',exact:true});await panel.getByRole('button',{name:/이 매체용 이미지 저장/}).click();await expect(panel.locator('.publication-how').getByRole('status')).toContainText('원본 상품 사진');
});
