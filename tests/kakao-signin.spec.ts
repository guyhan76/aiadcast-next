import {test,expect,type Page} from '@playwright/test';
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
});
const state='s'.repeat(43),proof='p'.repeat(43),receipt='r'.repeat(43);
const session=()=>({token:'t'.repeat(43),expires:Date.now()+600000,user:{id:'member-12345',label:'Member',role:'member'}});
async function api(page:Page,enabled:boolean,status:'verified'|'unknown'|'cancelled'='verified') {
  const starts:string[]=[];
  const polls:Record<string,string>[]=[];
  await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname;
    const body=req.method()==='POST'?req.postDataJSON():{};
    let data:unknown={};
    if(path==='/api/account/capabilities')data={google:{enabled:true},kakao:{enabled}};
    if(path==='/api/auth/kakao/start'){
      starts.push(body.intent);
      data={state,proof,expires:Date.now()+600000,url:url.origin+'/api/auth/kakao/authorize?state='+state};
    }
    if(path==='/api/auth/kakao/authorize') {
      await route.fulfill({contentType:'text/html',body:'<a href="/#kakao-return/'+state+'.'+receipt+'">Test provider return</a>'});return;
    }
    if(path==='/api/auth/kakao/poll'){
      polls.push(body);
      data=body.receipt!==receipt?{state:'pending'}:status==='verified'?{state:status,session:session()}:{state:status};
    }
    if(path==='/api/auth/session')data={user:session().user};
    await route.fulfill({json:data,headers:{'access-control-allow-origin':req.headers().origin??'*','access-control-allow-headers':'Content-Type,Authorization,X-Aiadcast-Client'}});
  });
  return {starts,polls};
}
test('Google and Kakao share button bounds and show their own brand symbols',async({page})=>{
  await api(page,true);
  await page.goto('/#login');
  await expect(page.getByText('최근 로그인')).toHaveCount(0);
  const boxes=[];
  for (const [name,color] of [['Google로 계속하기','rgb(255, 255, 255)'],['카카오로 계속하기','rgb(254, 229, 0)']]) {
    const button=page.getByRole('button',{name,exact:true});
    await expect(button).toBeVisible();
    await expect(button).toHaveCSS('height','52px');
    await expect(button).toHaveCSS('border-radius','12px');
    await expect(button).toHaveCSS('background-color',color);
    const icon=button.locator('img[alt=""]');
    await expect(icon).toBeVisible();
    await expect.poll(()=>icon.evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    boxes.push(await button.boundingBox());
  }
  expect(boxes[0]?.width).toBe(boxes[1]?.width);
  expect(boxes[0]?.x).toBe(boxes[1]?.x);
});

test('Kakao web callback restores the initiating member and clears the browser receipt',async({page})=>{
  const f=await api(page,true);
  await page.goto('/#login');
  await page.getByRole('button',{name:'카카오로 계속하기'}).click();
  expect(page.url()).not.toContain(proof);
  await page.getByRole('link',{name:'Test provider return'}).click();
  await expect(page).toHaveURL(/#home$/);
  await expect(page.getByRole('link',{name:'광고 이미지 만들기',exact:true})).toBeVisible();
  expect(f.starts).toEqual(['login']);
  expect(f.polls).toEqual([{state,proof,receipt}]);
  expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.kakao-flow'))).toBeNull();
  await page.getByRole('button',{name:'메뉴 열기'}).click();
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();
  await expect(page.getByRole('button',{name:'카카오로 계속하기',exact:true})).toHaveAccessibleDescription('최근 로그인');
  await page.reload();
  await expect(page.getByRole('button',{name:'카카오로 계속하기',exact:true})).toHaveAccessibleDescription('최근 로그인');
  await expect(page.getByRole('button',{name:'Google로 계속하기'})).toHaveAccessibleDescription('');
});
test('unknown Kakao login offers existing account recovery and explicit signup',async({page})=>{
  const f=await api(page,true,'unknown');
  await page.goto('/#login');
  await page.getByRole('button',{name:'카카오로 계속하기'}).click();
  await page.getByRole('link',{name:'Test provider return'}).click();
  await expect(page.getByRole('status')).toContainText('기존 회원');
  await page.getByRole('button',{name:'카카오로 새 계정 만들기'}).click();
  await page.getByRole('link',{name:'Test provider return'}).waitFor();
  expect(f.starts).toEqual(['login','signup']);
});
test('Kakao cancellation lets the user return to Google sign-in',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('aiadcast.last-login.'+location.origin,'google'));
  await api(page,true,'cancelled');
  await page.goto('/#login');
  await page.getByRole('button',{name:'카카오로 계속하기'}).click();
  await page.getByRole('link',{name:'Test provider return'}).click();
  await expect(page.getByRole('status')).toContainText('취소');
  await page.getByRole('button',{name:'로그인 화면으로'}).click();
  await expect(page.getByRole('button',{name:'Google로 계속하기'})).toHaveAccessibleDescription('최근 로그인');
  await expect(page.getByRole('button',{name:'카카오로 계속하기'})).toHaveAccessibleDescription('');
});
test('Kakao is hidden when disabled and a foreign callback cannot install a session',async({page})=>{
  const f=await api(page,false);
  await page.goto('/#login');
  await expect(page.getByRole('button',{name:'Google로 계속하기'})).toBeVisible();
  await expect(page.getByRole('button',{name:'카카오로 계속하기'})).toHaveCount(0);
  await page.goto('/#kakao-return/'+state+'.'+receipt);
  await expect(page.getByRole('status')).toContainText('다시 시작');
  expect(f.polls).toHaveLength(0);
  expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
});

test('Android starts in its app, resumes from the native return and signs in once',async({page})=>{
  const f=await api(page,true);
  await page.addInitScript(()=>{
    const host=window as any;
    host.__AIADCAST_API_ORIGIN__='https://kakao-preview.example';
    host.__AIADCAST_KAKAO_NATIVE__={packageId:'com.selluplabs.aiadcast.next.preview'};
    host.AiadcastNative={postMessage:(message:string)=>{
      const payload=JSON.parse(message);
      if(payload.type==='kakao-open')host.__AIADCAST_KAKAO_NATIVE__.pending=payload;
    }};
  });
  await page.goto('/#login');
  await page.getByRole('button',{name:'카카오로 계속하기'}).click();
  await expect(page).toHaveURL(/#kakao-return$/);
  await expect(page.getByRole('status')).toContainText('카카오 인증');
  await page.evaluate(value=>{
    const pending=(window as any).__AIADCAST_KAKAO_NATIVE__.pending;
    pending.receipt=value;
    pending.outcome='cancelled'; // A stale activity result can accompany a valid external return.
    window.dispatchEvent(new Event('aiadcast-kakao-return'));
    window.dispatchEvent(new Event('aiadcast-kakao-return'));
  },receipt);
  await expect(page).toHaveURL(/#home$/,{timeout:14000});
  expect(f.starts).toEqual(['login']);
  await expect(page.getByRole('link',{name:'광고 이미지 만들기',exact:true})).toBeVisible();
  expect(f.polls.filter(body=>body.receipt===receipt)).toHaveLength(1);
});

test('returning from KakaoTalk after cancellation does not start a browser login or issue a session',async({page})=>{
  const f=await api(page,true);
  await page.addInitScript(()=>{
    const host=window as any;
    host.__AIADCAST_API_ORIGIN__='https://kakao-preview.example';
    host.__AIADCAST_KAKAO_NATIVE__={packageId:'com.selluplabs.aiadcast.next.preview'};
    host.AiadcastNative={postMessage:(message:string)=>{
      const payload=JSON.parse(message);
      if(payload.type==='kakao-open')host.__AIADCAST_KAKAO_NATIVE__.pending=payload;
    }};
  });
  await page.goto('/#login');
  await page.getByRole('button',{name:'카카오로 계속하기'}).click();
  await expect(page.getByRole('status')).toContainText('카카오 인증');
  await page.evaluate(()=>{
    (window as any).__AIADCAST_KAKAO_NATIVE__.pending.outcome='cancelled';
    window.dispatchEvent(new Event('aiadcast-kakao-return'));
  });
  await expect(page.getByRole('status')).toContainText('취소');
  expect(f.starts).toEqual(['login']);
  expect(f.polls).toHaveLength(0);
});
