import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import type {GenerationJob} from '../src/generation-client';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const png=await sharp({create:{width:12,height:8,channels:4,background:{r:33,g:94,b:174,alpha:1}}}).png().toBuffer();
const artifactHash=createHash('sha256').update(png).digest('hex');
async function recoveryApi(page:Page,scenario:'invalid-first'|'lose-second'){
 const state={posts:0,historyReads:0,readIds:[] as string[],acceptedIds:[] as string[],jobs:[] as GenerationJob[],wallet:{available:10,reserved:0,kind:'test'}};
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  const json=(value:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
  if(path==='/api/status')return json({mode:'local-development',commercialReady:false,generation:{enabled:true,model:'gpt-image-2.5-sunburst',reason:null},wallet:state.wallet,budget:{limitMicros:1000000,spentMicros:0,heldMicros:0},assistant:{available:false}});
  if(path==='/api/generations'&&request.method()==='POST'){
   state.posts++;
   if(scenario==='invalid-first'&&state.posts===1)return json({error:{code:'INVALID_REQUEST'}},400);
   const body=request.postDataJSON();
   const job:GenerationJob={id:`recovery_job_${state.posts}`,projectId:body.projectId,requestIds:[body.requestId],state:'ready',mode:body.request.mode,sourceHash:body.source?.sha256??null,createdAt:'2026-10-10T01:00:00.000Z',model:'gpt-image-2.5-sunburst',artifactId:artifactHash,artifact:{id:artifactHash,sha256:artifactHash,dataUrl:'data:image/png;base64,'+png.toString('base64'),width:12,height:8,role:'background'},errorCode:null};
   state.jobs.push(job);state.wallet={available:9-state.acceptedIds.length,reserved:1,kind:'test'};
   if(scenario==='lose-second'&&state.posts===2)return route.abort('failed');
   return json({job,wallet:state.wallet});
  }
  if(path==='/api/generations'&&request.method()==='GET'){state.historyReads++;return json({jobs:state.jobs});}
  const match=path.match(/^\/api\/generations\/(recovery_job_\d+)(\/accept)?$/);
  if(match){const job=state.jobs.find(item=>item.id===match[1]);if(!job)return json({error:{code:'NOT_FOUND'}},404);
   if(match[2]){state.acceptedIds.push(job.id);job.state='accepted';state.wallet={available:10-state.acceptedIds.length,reserved:0,kind:'test'};}
   else state.readIds.push(job.id);
   return json({job,wallet:state.wallet});
  }
  return json({error:{code:'UNEXPECTED_TEST_ENDPOINT'}},404);
 });
 await page.goto('/#studio');await page.getByLabel('상품 사진 추가').setInputFiles({name:'source.png',mimeType:'image/png',buffer:png});
 const panel=page.getByRole('region',{name:'AI 광고 제작',exact:true});await expect(panel).toHaveCount(1);
 await expect(panel.getByText('생성 테스트 연결됨',{exact:true})).toBeVisible();
 return {panel,state};
}

test('a definite validation rejection clears pending state so a corrected request can be submitted',async({page})=>{
 const {panel,state}=await recoveryApi(page,'invalid-first');
 const create=panel.getByRole('button',{name:'AI 배경 요청 · 1개',exact:true});await create.click();
 await expect(panel.getByRole('alert')).toBeVisible();await expect(create).toBeEnabled();
 await expect(panel.getByText(/중복 생성을 막기 위해 새 요청을 보류/)).toHaveCount(0);
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('aiadcast.pending-generation.')))).toEqual([]);
 expect(state.posts).toBe(1);expect(state.jobs).toHaveLength(0);
 await create.click();await expect(panel.getByText('결과를 확인해주세요',{exact:true})).toBeVisible();
 expect(state.posts).toBe(2);expect(state.jobs).toHaveLength(1);expect(state.acceptedIds).toEqual([]);
});

test('a lost second response hides the old accepted job and recovers only the matching request',async({page})=>{
 const {panel,state}=await recoveryApi(page,'lose-second');
 const create=panel.getByRole('button',{name:'AI 배경 요청 · 1개',exact:true});
 await create.click();await panel.getByRole('checkbox',{name:'상품·배경·형태를 확인했습니다.',exact:true}).check();
 await panel.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true}).click();
 await expect(panel.getByText('사용 확정한 시안',{exact:true})).toBeVisible();expect(state.acceptedIds).toEqual(['recovery_job_1']);
 await create.click();await expect(panel.getByRole('alert')).toContainText('자동으로 다시 생성하지 않습니다');
 await expect(create).toBeDisabled();await expect(panel.getByText(/중복 생성을 막기 위해 새 요청을 보류/)).toBeVisible();
 await expect(panel.getByText('사용 확정한 시안',{exact:true})).toHaveCount(0);
 await expect(panel.getByRole('button',{name:'저장한 시안 다시 적용',exact:true})).toHaveCount(0);
 expect(state.posts).toBe(2);expect(state.acceptedIds).toEqual(['recovery_job_1']);
 await panel.getByRole('button',{name:'연결 상태 확인',exact:true}).click();
 await expect(panel.getByText('결과를 확인해주세요',{exact:true})).toBeVisible();expect(state.historyReads).toBe(1);
 expect(state.readIds).toEqual(['recovery_job_2']);expect(state.posts).toBe(2);
 await panel.getByRole('checkbox',{name:'상품·배경·형태를 확인했습니다.',exact:true}).check();
 await panel.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true}).click();
 await expect(panel.getByText('사용 확정한 시안',{exact:true})).toBeVisible();expect(state.acceptedIds).toEqual(['recovery_job_1','recovery_job_2']);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 백업',exact:true}).click();
 const saved=JSON.parse(await readFile((await (await download).path())!,'utf8'));expect(saved.generated.jobId).toBe('recovery_job_2');
 expect(state.posts).toBe(2);
});
