import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {starterProject,prepareCampaign} from '../src/consumer-campaign';
import {createResultSet,imageCounts} from '../src/result-set';
import {generatedCompatibilityKey} from '../src/generated';
import {generationSourceHash} from '../src/generation-input';
import {completeAdKey} from '../src/complete-ad';
import {prepareSelectiveEdit,compositeSelectiveEdit} from '../server/selective-image-edit.mjs';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
import {restoreOwnedWorkspace} from './helpers/owned-workspace';

const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const date='2026-11-08T00:00:00.000Z';
test.afterEach(async({page},info)=>{
 if(info.status!==info.expectedStatus)console.log('Result-set browser diagnostics',JSON.stringify({url:page.url(),status:await page.getByRole('status').allTextContents(),alerts:await page.getByRole('alert').allTextContents()}));
});
async function storedProjects(page:Page,owner:string){
 return page.evaluate(async owner=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('aiadcast-editor-'+owner,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  return new Promise<any[]>((resolve,reject)=>{const r=db.transaction('projects').objectStore('projects').getAll();r.onsuccess=()=>{db.close();resolve(r.result);};r.onerror=()=>{db.close();reject(r.error);};});
 },owner);
}

for(const count of imageCounts)test(`${count} saved ads edit only the selected image and retain every original`,async({page},info)=>{
 const owner='result-set-'+count;await protectedScreen(page,mockSession(owner,'admin'));
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 const source=await sharp({create:{width:64,height:64,channels:4,background:'#eeeeee'}}).png().toBuffer();
 const p=starterProject('other');p.productName='스니커즈';p.productProfile.material='흰색 스니커즈 · 62,760원';
 p.product={name:'product.png',sha256:hash(source),data:'data:image/png;base64,'+source.toString('base64'),width:64,height:64};
 const items=await createResultSet(prepareCampaign(p),count),jobs=new Map<string,any>();
 for(const [index,item] of items.entries()){
  const bytes=await sharp({create:{width:64,height:64,channels:4,background:{r:30+index*15,g:70,b:150,alpha:1}}}).png().toBuffer();
  const sha=hash(bytes),asset={name:'ad.png',sha256:sha,data:'data:image/png;base64,'+bytes.toString('base64'),width:64,height:64};
  const jobId='saved-ad-'+index;
  item.generated={jobId,mode:'creative',role:'creative',sourceHash:generationSourceHash(item),asset,model:'mock',createdAt:date,acceptedAt:date,specificationKey:generatedCompatibilityKey(item),composition:'complete-ad',compositionKey:completeAdKey(item)};
  jobs.set(jobId,{id:jobId,projectId:item.id,requestId:'saved-request-'+index,state:'accepted',mode:'creative',sourceHash:generationSourceHash(item),createdAt:date,model:'mock',artifactId:sha,artifact:{id:sha,sha256:sha,dataUrl:asset.data,width:64,height:64,role:'creative'},composition:'complete-ad',compositionKey:completeAdKey(item)});
 }
 const original=JSON.parse(JSON.stringify(items)),posts:any[]=[],generationPosts:any[]=[];let edited:any=null,accepts=0;
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(['/api/auth/session','/api/account/capabilities'].includes(path))return route.fallback();
  if(path==='/api/status')return route.fulfill({json:{generation:{enabled:true,selectiveEdit:true,selectiveEditProofVersion:1,creditQuote:{unit:'legacy-ticket',amount:0,policy:'legacy-accept-v1'}},wallet:{available:3,reserved:0,kind:'admin-test-unlimited',unlimited:true,credits:{available:100,reserved:0}},budget:{limitMicros:100000000,spentMicros:0,heldMicros:0}}});
  if(path==='/api/selective-edits'){
   const b=request.postDataJSON();posts.push(b);const selected=jobs.get(b.sourceJobId);
   if(!selected)return route.fulfill({status:400,json:{error:{code:'INVALID_EDIT_SOURCE'}}});
   const prepared=await prepareSelectiveEdit(selected.artifact,b.mask),painted=await sharp({create:{width:64,height:64,channels:4,background:'#ffcc00'}}).png().toBuffer();
   const result=await compositeSelectiveEdit(prepared.source,prepared.mask,{bytes:painted},selected.artifactId);
   edited={...selected,id:'edited-ad',state:'ready',projectId:b.projectId,requestId:b.requestId,requestIds:[b.requestId],preservation:result.preservation,artifactId:result.sha256,artifact:{...selected.artifact,id:result.sha256,sha256:result.sha256,dataUrl:'data:image/png;base64,'+result.bytes.toString('base64')},selectiveEdit:{version:1,sourceProjectId:selected.projectId,sourceJobId:selected.id,sourceHash:selected.artifactId,maskHash:b.mask.sha256,prompt:b.prompt}};
   return route.fulfill({json:{job:edited}});
  }
  if(path==='/api/generations/edited-ad/accept'){accepts++;edited.state='accepted';return route.fulfill({json:{job:edited}});}
  if(path==='/api/generations'){
   if(request.method()==='POST'){generationPosts.push(request.postDataJSON());return route.fulfill({status:400,json:{error:{code:'UNEXPECTED_GENERATION'}}});}
   return route.fulfill({json:{jobs:[...jobs.values()]}});
  }
  if(path.startsWith('/api/generations/'))return route.fulfill({json:{job:jobs.get(path.split('/').at(-1)!)}});
  return route.fulfill({status:404,json:{error:{code:'NOT_FOUND'}}});
 });
 await restoreOwnedWorkspace(page,items[0],owner,'studio');
 await page.evaluate(async({items,owner})=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('aiadcast-editor-'+owner,1);r.onupgradeneeded=()=>r.result.createObjectStore('projects',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction('projects','readwrite');for(const item of items)tx.objectStore('projects').put(item);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});
 },{items,owner});
 await page.reload();
 if(count>1){const picker=page.getByRole('group',{name:'수정할 광고 이미지 선택'});await expect(picker.getByRole('button')).toHaveCount(count);await picker.getByRole('button',{name:count+'번 광고 선택',exact:true}).click();await expect(picker.getByRole('button',{name:count+'번 광고 선택',exact:true})).toHaveAttribute('aria-pressed','true');}
 else await expect(page.getByRole('group',{name:'수정할 광고 이미지 선택'})).toHaveCount(0);
 await page.getByRole('button',{name:'부분수정',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'부분 수정',exact:true})).toBeVisible();await expect(page.locator('.selective-canvas img')).toBeVisible();
 const canvas=page.locator('.selective-canvas canvas');await canvas.scrollIntoViewIfNeeded();const b=(await canvas.boundingBox())!;
 await page.mouse.click(b.x+b.width*.5,b.y+b.height*.5);
 await page.getByLabel('수정 요청',{exact:true}).fill('선택한 작은 영역의 색상만 노란색으로 변경');
 await page.getByRole('checkbox',{name:'수정 요청과 차감 조건을 확인했습니다.'}).check();
 await page.getByRole('button',{name:'수정 시안 요청',exact:true}).click();
 await expect(page.getByRole('img',{name:'수정 결과',exact:true})).toBeVisible();
 expect(posts).toHaveLength(1);expect(posts[0].sourceJobId).toBe(items.at(-1)!.generated!.jobId);expect(posts[0].sourceHash).toBe(items.at(-1)!.generated!.asset.sha256);
 await page.getByRole('button',{name:'사용 확정·수정 사본 저장',exact:true}).click();
 await expect(page.getByText('새 프로젝트와 PNG 사본을 저장했습니다. 원본은 유지됩니다.')).toBeVisible();
 const saved=await storedProjects(page,owner);expect(saved).toHaveLength(count+1);
 for(const item of original)expect(saved.find(x=>x.id===item.id)).toEqual(item);
 const copy=saved.find(x=>x.id===edited.projectId);expect(copy.resultSet).toBeUndefined();expect(copy.generated.editParent.projectId).toBe(items.at(-1)!.id);expect(copy.generated.asset.sha256).toBe(edited.artifactId);
 expect(accepts).toBe(1);expect(generationPosts).toHaveLength(0);
 if(count===10)await page.screenshot({path:info.outputPath('ten-ads-selected-copy.png')});
});
