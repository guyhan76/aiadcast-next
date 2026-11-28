import {useEffect,useMemo,useState,type CSSProperties} from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource-variable/noto-sans-kr';
import '@fontsource-variable/noto-serif-kr';
import '../../src/style.css';
import '../../src/formats.css';
import '../../src/brand-theme.css';
import '../../src/mobile-shell.css';
import {CreateCampaign,starterProject} from '../../src/CreateCampaign';
import {UiLanguageProvider,LanguageSwitcher} from '../../src/ui-language';
import {setBetaSession} from '../../src/beta-session';
import {isCarouselCount,type StoryPlan} from '../../src/story-carousel';
import type {BatchPrice} from '../../src/batch-price';
import type {Project} from '../../src/model';
import type {WizardDraft} from '../../src/workspace-draft';

// Vite-only visual fixture. The production entry never imports this module.
// Every fetch is answered in memory; there is deliberately no real-fetch fallback.
type Scenario={credits:100|40;wrongLength:boolean;assistantAvailable:boolean};
let scenario:Scenario={credits:100,wrongLength:false,assistantAvailable:true};
let traffic={status:0,plans:0,blocked:0};
const trafficEvent='aiadcast-feed-carousel-fixture-traffic';
const report=()=>window.dispatchEvent(new Event(trafficEvent));
const savedSession=sessionStorage.getItem('aiadcast.beta-session');
const savedLanguage=localStorage.getItem('aiadcast.ui-language');
const savedDemo=localStorage.getItem('aiadcast.offline-demo.v1');
localStorage.setItem('aiadcast.ui-language','ko');
localStorage.removeItem('aiadcast.offline-demo.v1');
setBetaSession({token:'f'.repeat(43),expires:Date.now()+4*3600_000,user:{id:'feed-carousel-fixture',label:'캐러셀 모의 검증',role:'member'}});
window.addEventListener('pagehide',()=>{
  for(const [storage,key,value] of [[sessionStorage,'aiadcast.beta-session',savedSession],[localStorage,'aiadcast.ui-language',savedLanguage],[localStorage,'aiadcast.offline-demo.v1',savedDemo]] as const){
    if(value===null)storage.removeItem(key);else storage.setItem(key,value);
  }
},{once:true});

function samplePlan(count:number):StoryPlan{
  const moments=[
    ['차가운 유리잔 안으로 에스프레소가 흐르고 우유 위에 선명한 갈색 곡선이 퍼진다.','지금, 시원한 한 잔'],
    ['같은 아이스라떼 잔 옆으로 부드러운 창가 빛이 들어온다.','잠시 쉬어가는 시간'],
    ['같은 잔 안의 얼음과 우유 사이로 커피가 섞이는 모습을 가까이 보여준다.','커피와 우유의 만남'],
    ['카메라가 같은 잔의 물방울과 투명한 유리 표면에 초점을 맞춘다.','차가움이 전해지는 순간'],
    ['같은 아이스라떼를 가운데 두고 카페 테이블의 여백을 넓게 보여준다.','한 잔으로 채우는 여유'],
    ['같은 잔의 커피색과 우유색이 자연스럽게 이어진 층을 옆에서 보여준다.','천천히 바라보는 한 잔'],
    ['같은 잔의 위쪽을 비스듬히 바라보며 얼음과 잔 입구를 보여준다.','가볍게 쉬어가요'],
    ['같은 카페 테이블에서 컵의 그림자와 부드러운 조명을 보여준다.','오늘의 작은 쉼표'],
    ['같은 아이스라떼 한 잔을 충분한 여백 안에 놓고 시선을 모은다.','당신의 쉬는 시간에'],
    ['첫 장과 동일한 아이스라떼 한 잔을 마지막 대표 장면으로 보여준다.','한 잔의 여유를 만나세요']
  ];
  const selected=count===2?[moments[0],moments[9]]:[...moments.slice(0,count-1),moments[9]];
  return {continuity:'같은 투명 유리잔의 아이스라떼 한 잔, 밝은 테이블과 부드러운 창가 빛을 유지한다. 실재 매장이나 추가 상품을 지어내지 않는다.',cards:selected.map(([scene,caption])=>({scene,caption}))};
}

window.fetch=async(input,init)=>{
  if(init?.signal?.aborted)throw new DOMException('Aborted','AbortError');
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
  const method=(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
  if(url.pathname==='/api/status'&&method==='GET'){
    traffic.status++;report();
    return Response.json({mode:'local-development',commercialReady:false,generation:{enabled:true,batchVersion:1,reason:null,model:'in-memory-fixture'},wallet:{available:0,reserved:0,credits:{available:scenario.credits,reserved:0},kind:'credit-v2'},budget:{limitMicros:1000000,spentMicros:0,heldMicros:0},assistant:{available:scenario.assistantAvailable,reason:scenario.assistantAvailable?null:'ASSISTANT_DISABLED'}});
  }
  if(url.pathname==='/api/assistant'&&method==='POST'){
    traffic.plans++;report();
    if(!scenario.assistantAvailable)return Response.json({error:{code:'ASSISTANT_DISABLED'}},{status:503});
    const body=typeof init?.body==='string'?JSON.parse(init.body):input instanceof Request?await input.clone().json():{};
    if(body.kind!=='carousel-plan'||!isCarouselCount(body.count))return Response.json({error:{code:'INVALID_ASSISTANT_REQUEST'}},{status:400});
    const count=scenario.wrongLength?(body.count===4?6:4):body.count;
    return Response.json({requestId:body.requestId,plan:samplePlan(count)});
  }
  traffic.blocked++;report();
  return Response.json({error:{code:'FIXTURE_NETWORK_BLOCKED'}},{status:503});
};

function draft():WizardDraft{
  const project=starterProject('cafe');
  return {step:0,industryChosen:true,industryKind:'service',project:{...project,locale:'ko',storyCarousel:true,requestedImageCount:4,format:'4:5',productName:'모먼트 카페',productProfile:{...project.productProfile,industryDetail:'카페 · 아이스라떼',material:'더운 오후, 아이스라떼 한 잔으로 잠시 쉬어가는 카페 광고. 밝은 테이블 위 같은 유리잔의 커피와 우유가 섞이는 장면을 보여주세요.'}}};
}

function Fixture(){
  const [settings,setSettings]=useState<Scenario>(scenario),[run,setRun]=useState(0),[width,setWidth]=useState<390|520>(390);
  const [calls,setCalls]=useState(traffic),[approved,setApproved]=useState<{count:number;quote?:BatchPrice;plan?:StoryPlan}>();
  const initial=useMemo(draft,[run]);
  useEffect(()=>{const update=()=>setCalls({...traffic});window.addEventListener(trafficEvent,update);update();return()=>window.removeEventListener(trafficEvent,update);},[]);
  function restart(next:Scenario=settings){
    scenario={...next};traffic={status:0,plans:0,blocked:0};setSettings(next);setCalls({...traffic});setApproved(undefined);setRun(value=>value+1);
  }
  async function onReady(project:Project,quote?:BatchPrice){
    // Capture approved inputs only. Never call submitAdBatch or any image API.
    setApproved({count:project.requestedImageCount??0,quote,plan:project.storyPlan});
  }
  const shellStyle={width,maxWidth:'100%',margin:'20px auto',containerType:'inline-size',containerName:'app-shell','--fixture-width':`${width}px`} as CSSProperties;
  return <UiLanguageProvider>
    <style>{`
      .fixture-controls{max-width:900px;margin:0 auto;padding:20px;background:#fff;border-bottom:1px solid #ccc;}
      .fixture-controls h1{font-size:22px;letter-spacing:0;margin-bottom:8px;}
      .fixture-controls p{line-height:1.6;margin:8px 0;}
      .fixture-controls-grid{display:flex;gap:12px 20px;align-items:center;flex-wrap:wrap;margin:14px 0;}
      .fixture-controls-grid label{display:flex;gap:8px;align-items:center;}
      .fixture-controls-grid button,.fixture-controls-grid select{min-height:44px;padding:8px 12px;border:1px solid #aaa;border-radius:8px;background:#fff;}
      .fixture-controls-grid input{width:20px;height:20px;}
      .fixture-viewport{background:#fff;border:1px solid #ccc;border-radius:12px;}
      .fixture-viewport>.studio-shell{padding:20px 16px;}
      .fixture-viewport dialog{max-width:min(calc(var(--fixture-width) - 24px),calc(100vw - 24px));}
      .fixture-approved{padding:18px;margin-top:20px;background:#f4f4f4;border-radius:10px;}
      .fixture-approved h2{font-size:18px;margin-bottom:8px;}
      .fixture-approved output{display:block;font-weight:700;line-height:1.6;}
      .fixture-approved pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 monospace;}
    `}</style>
    <header className="fixture-controls">
      <h1>모의 검증 · 실제 생성 없음</h1>
      <p>실제 앱 화면으로 입력·구성안·차감 안내를 확인합니다. 모든 API 응답은 메모리에서 만들며 승인해도 이미지 생성이나 결제가 실행되지 않습니다.</p>
      <div className="fixture-controls-grid">
        <label>화면 폭<select aria-label="화면 폭" value={width} onChange={e=>setWidth(Number(e.target.value) as 390|520)}><option value={390}>390px · 모바일</option><option value={520}>520px · 넓은 화면</option></select></label>
        <label>모의 잔액<select aria-label="모의 잔액" value={settings.credits} onChange={e=>restart({...settings,credits:Number(e.target.value) as 100|40})}><option value={100}>100크레딧</option><option value={40}>40크레딧</option></select></label>
        <label><input type="checkbox" checked={settings.wrongLength} onChange={e=>restart({...settings,wrongLength:e.target.checked})}/>잘못된 장수 응답</label>
        <label><input type="checkbox" checked={!settings.assistantAvailable} onChange={e=>restart({...settings,assistantAvailable:!e.target.checked})}/>구성안 기능 끄기</label>
        <button type="button" onClick={()=>restart()}>다시 시작</button>
        <LanguageSwitcher/>
      </div>
      <p aria-live="polite">모의 상태 조회 {calls.status}회 · 모의 구성안 {calls.plans}회 · 차단한 기타 요청 {calls.blocked}회</p>
    </header>
    <main className="app-shell fixture-viewport" style={shellStyle}>
      <div className="studio-shell">
        <CreateCampaign key={run} initialKind="service" draft={initial} active onNew={()=>restart()} onReady={onReady}/>
        {approved&&<section className="fixture-approved" aria-label="모의 승인 결과">
          <h2>모의 승인 결과</h2>
          <output aria-live="polite">{approved.count}장 승인 · {approved.quote?.creditsUsed??0}크레딧 안내 · 실제 생성 0건</output>
          <details><summary>승인한 장수·견적·구성안 확인</summary><pre>{JSON.stringify(approved,null,2)}</pre></details>
        </section>}
      </div>
    </main>
  </UiLanguageProvider>;
}

createRoot(document.getElementById('fixture')!).render(<Fixture/>);
