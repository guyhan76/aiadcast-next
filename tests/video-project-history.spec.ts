import {test,expect} from '@playwright/test';

test('member can reopen an existing video in projects without submitting a generation',async({page})=>{
 const token='a'.repeat(43),user={id:'history-member',label:'Member'};
 await page.addInitScript(session=>{
  localStorage.setItem('aiadcast.ui-language','ko');
  sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(session));
 },{token,user,expires:Date.now()+86400000});
 let submits=0,downloads=0;
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(path==='/api/videos'&&request.method()==='POST')submits++;
  if(path==='/api/videos/history-example/file'){
   expect(request.headers().authorization).toBe('Bearer '+token);
   downloads++;
   return route.fulfill({contentType:'video/mp4',body:Buffer.from([0,0,0,12,102,116,121,112,105,115,111,109])});
  }
  const body=path==='/api/videos'?{videos:[{id:'history-example',expires_at:Date.now()+60000}]}:
   path==='/api/auth/session'?{user}:path==='/api/generations'?{jobs:[]}:{downloads:[],backups:[],projects:[],items:[]};
  return route.fulfill({json:body});
 });
 await page.goto('/#projects');
 await page.getByRole('button',{name:'영상',exact:true}).click();
 await page.getByRole('button',{name:'영상 보기'}).click();
 await expect(page.getByRole('button',{name:'원본 저장'})).toBeVisible();
 expect(downloads).toBe(1);
 expect(submits).toBe(0);
 await page.getByRole('button',{name:'이미지',exact:true}).click();
 await expect(page.getByRole('button',{name:'사진·백업 불러와 정밀 편집'})).toBeVisible();
});
