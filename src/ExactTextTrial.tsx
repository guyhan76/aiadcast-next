import {useEffect,useRef,useState} from 'react';
import {betaSession} from './beta-session';
import {imageFile,type Asset} from './model';
import {plannedAdText} from './planned-ad-text';
import {preflightPlannedAdText} from './planned-ad-text-render';
import {useUiLanguage} from './ui-language';
export const trialTitle='Lenovo 씽크패드 P16 GEN1 워크스테이션 고성능 노트북';
export const trialDescription=`노트북 규격 : 364mm x 266mm x 30.23mm
무게 : 2.95kg
최고 전문가용 강력한 성능의 하이엔드 모바일 워크스테이션
Intel CORE 12세대 i9-12900HX 프로세스
NVIDIA RTX A1000 4GB GDDR6 강력한 전문가용 그래픽
16형 대화면 WQUXGA
64GB 메모리 / SSD 2TB
초고속 인터페이스 / 강력한 내구성 / ISV인증
가격 2,599,000원`;
export const trialDirections='노트북에 가장 잘 어울리는 배경과\n최고의 전문가들이 사용하는 하이엔드 프리미엄 느낌으로 만들어주세요.\n브랜드와 가격을 강조해주세요.';
// Preparation only: no submission handler, request ID, wallet/status call or provider path.
export function ExactTextTrial(){
 const {t}=useUiLanguage(),[access,setAccess]=useState<'loading'|'ready'|'denied'>('loading'),[asset,setAsset]=useState<Asset|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[prepared,setPrepared]=useState(false);
 const epoch=useRef(0),owner=useRef(betaSession()?.token),alive=useRef(false);
 const valid=(id:number)=>alive.current&&epoch.current===id&&owner.current===betaSession()?.token;
 useEffect(()=>{alive.current=true;owner.current=betaSession()?.token;const id=++epoch.current,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  const clear=()=>{epoch.current++;controller.abort();setAccess('denied');setAsset(null);setPrepared(false);setBusy(false);setError('');};
  window.addEventListener('aiadcast-session-change',clear);
  fetch('/api/admin/exact-text-trial',{headers:{Authorization:`Bearer ${owner.current??''}`},credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal}).then(async r=>{if(!r.ok)throw Error('ACCESS');const c=await r.json();if(c.version!==2||c.preparation!==true||c.generationEnabled!==false||c.reason!=='PAID_TRIAL_NOT_APPROVED')throw Error('ACCESS');if(valid(id))setAccess('ready');}).catch(()=>{if(valid(id))setAccess('denied');}).finally(()=>clearTimeout(timer));
  return()=>{alive.current=false;epoch.current++;controller.abort();clearTimeout(timer);window.removeEventListener('aiadcast-session-change',clear);};
 },[]);
 async function select(file?:File){const id=++epoch.current;setAsset(null);setPrepared(false);setError('');if(!file)return;setBusy(true);try{const value=await imageFile(file);if(valid(id))setAsset(value);}catch{if(valid(id))setError(t('사진을 읽지 못했습니다. JPG, PNG, WebP 사진 한 장을 선택해주세요.','Could not read the photo. Select one JPG, PNG or WebP image.'));}finally{if(valid(id))setBusy(false);}}
 async function prepare(){if(busy||!asset||access!=='ready')return;const id=++epoch.current;setBusy(true);setError('');setPrepared(false);try{await preflightPlannedAdText(plannedAdText({productName:trialTitle,copy:{company:'',description:trialDescription}},'9:16'),864,1536);if(valid(id))setPrepared(true);}catch{if(valid(id))setError(t('폰트 또는 문구 배치를 준비하지 못했습니다. 생성은 실행하지 않았습니다.','Font or text layout preparation failed. Generation was not started.'));}finally{if(valid(id))setBusy(false);}}
 return <main style={{maxWidth:680,margin:'auto',padding:20,overflowWrap:'anywhere'}}><a href="/">{t('앱으로 돌아가기','Back to app')}</a><h1>{t('정확 문구 시험 준비','Exact text trial preparation')}</h1>
 {access==='loading'?<p role="status">{t('접근 권한 확인 중','Checking access')}</p>:access==='denied'?<p role="alert">{t('지정 관리자 계정으로 로그인한 뒤 다시 열어주세요. 연결 실패 시에도 시험은 차단됩니다.','Open again after signing in as the designated administrator. Connection failures also block the trial.')}</p>:<>
 <p>{t('유료 시험은 승인 전입니다. 사진과 문구 준비만 가능하며 생성 요청은 보내지 않습니다.','Paid testing is not approved. You can prepare a photo and text; no generation request is sent.')}</p>
 <label>{t('대표사진 한 장','One primary photo')}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>void select(e.target.files?.[0])}/></label>
 {asset&&<img src={asset.data} alt={t('선택한 원본 사진','Selected original photo')} style={{display:'block',maxWidth:'100%',maxHeight:320,objectFit:'contain'}}/>}
 <h2>{t('시험 입력','Trial input')}</h2><p>{trialTitle}</p><p style={{whiteSpace:'pre-wrap'}}>{trialDescription}</p><p style={{whiteSpace:'pre-wrap'}}>{trialDirections}</p>
 <button disabled={!asset||busy} onClick={()=>void prepare()}>{t('문구 배치 준비 확인 · 무료','Check text layout · no charge')}</button>
 {prepared&&<p role="status">{t('문구 준비 완료. 실제 광고 디자인과 영역 준수는 아직 검증하지 않았습니다.','Text is ready. Actual ad design and reserved-region compliance have not been tested.')}</p>}
 {error&&<p role="alert">{error}</p>}<p>{t('실제 생성은 별도 승인과 서버 연결이 필요합니다.','Actual generation requires separate approval and server integration.')}</p>
 </>}</main>;
}
