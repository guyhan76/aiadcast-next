import {test,expect,type Page} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
const corners:Record<number,{x:number;y:number}>={4:{x:.46,y:.08},5:{x:.91,y:.29},7:{x:.53,y:.48},6:{x:.09,y:.25},2:{x:.11,y:.72},3:{x:.53,y:.94},1:{x:.90,y:.70}};
const ids=[4,5,7,6,2,3,1];
const faces=[[4,5,7,6],[2,3,7,6],[1,3,7,5]];
const polygon=(face:number[])=>face.map(id=>`${corners[id].x*720},${corners[id].y*540}`).join(' ');
// Synthetic planar print fixture, not the customer's photo or a real-product proof.
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="540"><rect width="720" height="540" fill="#fb00ff"/><defs>${faces.map((f,i)=>`<clipPath id="face${i}"><polygon points="${polygon(f)}"/></clipPath>`).join('')}</defs>${faces.map((face,i)=>`<g clip-path="url(#face${i})"><rect width="720" height="540" fill="${['#e6c99a','#ce9b60','#c29b74'][i]}"/>${Array.from({length:10},(_,n)=>`<rect x="0" y="${n*55}" width="720" height="5" fill="#a34428"/>`).join('')}<text x="${[310,130,395][i]}" y="${[170,345,360][i]}" font-family="sans-serif" font-weight="bold" font-size="${[24,28,30][i]}" fill="#242923">${['TOP • T0','SOURCE A1','SIDE B2'][i]}</text><rect x="${[310,145,500][i]}" y="${[190,365,380][i]}" width="40" height="25" fill="${['#ed2712','#1259ed','#2ce016'][i]}"/></g>`).join('')}</svg>`;
const fixture=await sharp(Buffer.from(svg)).png().toBuffer();
const file={name:'synthetic-calibration-box.png',mimeType:'image/png',buffer:fixture};
async function backup(page:Page){const event=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 백업',exact:true}).click();return JSON.parse(await readFile((await (await event).path())!,'utf8'));}
async function png(page:Page){const event=page.waitForEvent('download');await page.getByRole('button',{name:'PNG 내보내기',exact:true}).click();return readFile((await (await event).path())!);}
test('source faces, dimensions and confirmation survive edit/save/import without paid calls',async({page},testInfo)=>{
 test.setTimeout(60000);page.on('dialog',d=>d.accept());
 const paid:string[]=[];page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(generations|assistant)/.test(r.url()))paid.push(r.url());});
 await page.goto('/#studio');await page.getByLabel('상품 사진 추가').setInputFiles(file);
 await expect(page.getByRole('status').filter({hasText:'원본 사진을 추가'})).toBeVisible();
 await page.getByLabel('프로젝트 이름').fill('면 투영 시험');
 await page.locator('.editor-tabs').getByRole('button',{name:/규격/}).click();
 for(const [label,value] of [['가로','340'],['세로','250'],['높이','210']])await page.getByLabel(`${label} mm`,{exact:true}).fill(value);
 await page.getByRole('radio',{name:'요약과 치수선',exact:true}).check();
 await page.getByLabel('규격 박스 구성 사용',{exact:true}).check();
 await page.getByRole('button',{name:'PNG 내보내기',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('일곱');
 const photo=page.getByRole('img',{name:'박스 모서리를 지정할 원본 사진',exact:true});
 for(let i=0;i<7;i++){
  await page.getByRole('group',{name:'사진 모서리 선택'}).getByRole('button').nth(i).click();
  const bounds=await photo.boundingBox();await photo.click({position:{x:corners[ids[i]].x*bounds!.width,y:corners[ids[i]].y*bounds!.height}});
  // Mouse coordinates round to screen pixels; refine the known fixture corners using the keyboard controls.
  await page.getByRole('group',{name:'사진 모서리 선택'}).getByRole('button').nth(i).click();
  await page.getByLabel('선택한 모서리 X %',{exact:true}).fill(String(corners[ids[i]].x*100));
  await page.getByLabel('선택한 모서리 Y %',{exact:true}).fill(String(corners[ids[i]].y*100));
 }
 await page.getByLabel('일곱 점을 현재 사진의 실제 모서리에 맞췄습니다.',{exact:true}).check();
 await expect(page.locator('.projection-state')).toContainText('투영 적용됨');
 await expect(page.locator('.preview-foot')).toContainText('규격 박스 구성');
 const p=await backup(page);
 expect(p.product.sha256).toBe(createHash('sha256').update(fixture).digest('hex'));
 expect(Buffer.from(p.product.data.split(',')[1],'base64')).toEqual(fixture);
 expect(p.boxProjection.markedCorners).toHaveLength(7);
 const first=await png(page);expect((await sharp(first).metadata()).width).toBe(1080);
 const raster=await sharp(first).removeAlpha().raw().toBuffer();let leakedBackground=0;
 for(let i=0;i<raster.length;i+=3)if(raster[i]>200&&raster[i+1]<80&&raster[i+2]>200)leakedBackground++;
 expect(leakedBackground).toBe(0);
 await mkdir('release/box-projection',{recursive:true});
 await writeFile(`release/box-projection/synthetic-${testInfo.project.name}-340x250x210.png`,first);
 if(testInfo.project.name==='desktop'){await writeFile('release/box-projection/synthetic-source.png',fixture);await writeFile('release/box-projection/synthetic-project.json',JSON.stringify(p,null,2));}
 await page.getByLabel('높이 mm',{exact:true}).fill('100');
 const second=await png(page);expect(second.equals(first)).toBe(false);
 await writeFile(`release/box-projection/synthetic-${testInfo.project.name}-340x250x100.png`,second);
 expect((await backup(page)).product.data).toBe(p.product.data);
 await page.getByRole('radio',{name:'표시 안 함',exact:true}).check();
 await page.getByLabel('높이 mm',{exact:true}).fill('');
 await page.getByRole('button',{name:'PNG 내보내기',exact:true}).click();await expect(page.getByRole('alert')).toContainText('세 치수');
 await page.getByLabel('높이 mm',{exact:true}).fill('210');
 await page.getByRole('button',{name:'이 기기에 저장',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'이 기기에 저장'})).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'저장한 작업',exact:true}).click();await page.getByRole('button',{name:/면 투영 시험/}).click();
 await page.locator('.editor-tabs').getByRole('button',{name:/규격/}).click();
 await expect(page.locator('.projection-state')).toContainText('투영 적용됨');
 await page.getByLabel('프로젝트 파일 선택').setInputFiles({name:'box.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
 const restored=await backup(page);expect(restored.boxProjection).toEqual(p.boxProjection);expect(restored.product.data).toBe(p.product.data);
 await page.getByLabel('선택한 모서리 X %',{exact:true}).fill('89');
 await expect(page.locator('.projection-state')).not.toContainText('투영 적용됨');
 await page.getByRole('button',{name:'PNG 내보내기',exact:true}).click();await expect(page.getByRole('alert')).toContainText('일곱');
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:950});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 await page.locator('.editor-tabs').getByRole('button',{name:/광고 정보/}).click();
 await page.getByLabel('상품 사진 추가').setInputFiles({...file,buffer:await sharp(fixture).flop().png().toBuffer()});
 await expect.poll(async()=>(await backup(page)).boxProjection.markedCorners.length).toBe(0);
 expect(paid).toEqual([]);
});
