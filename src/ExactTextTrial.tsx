import {useEffect,useRef,useState} from 'react';
import {trialHttpDiagnostic,validTrialCapability,type TrialDiagnostic} from './exact-trial-access';
import {apiRequest,ApiRequestFailure} from './generation-client';
import {rememberLoginDestination,clearLoginDestination} from './login-navigation';
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
 const [diagnostic,setDiagnostic]=useState<TrialDiagnostic|null>(null),[attempt,setAttempt]=useState(0);
 const epoch=useRef(0),owner=useRef(betaSession()?.token),alive=useRef(false),reading=useRef(false);
 const valid=(id:number)=>alive.current&&epoch.current===id&&owner.current===betaSession()?.token;
 useEffect(()=>{alive.current=true;reading.current=true;owner.current=betaSession()?.token;setAccess('loading');setDiagnostic(null);const id=++epoch.current,controller=new AbortController();let timedOut=false,status:number|null=null;
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},10000);
  const clear=()=>{epoch.current++;controller.abort();reading.current=false;setAccess('denied');setDiagnostic({kind:'changed',status:null,code:'SESSION_CHANGED'});setAsset(null);setPrepared(false);setBusy(false);setError('');};
  window.addEventListener('aiadcast-session-change',clear);
  const fail=(d:TrialDiagnostic)=>{if(valid(id)){setAccess('denied');setDiagnostic(d);}};
  void (async()=>{try{
   if(!owner.current){fail({kind:'auth',status:null,code:'AUTH_REQUIRED'});return;}
   const c=await apiRequest<unknown>('/api/admin/exact-text-trial',undefined,controller.signal,value=>{status=value;});
   if(controller.signal.aborted)throw Error('ABORTED');
   if(!validTrialCapability(c)){fail({kind:'invalid',status,code:'INVALID_RESPONSE'});return;}
   if(valid(id))setAccess('ready');
  }catch(e){fail(e instanceof ApiRequestFailure?trialHttpDiagnostic(e.status,{error:{code:e.code}}):{kind:timedOut?'timeout':status!==null?'invalid':'network',status,code:timedOut?'ACCESS_TIMEOUT':status!==null?'INVALID_RESPONSE':'NETWORK_ERROR'});}
  finally{clearTimeout(timer);if(valid(id))reading.current=false;}})();
  return()=>{alive.current=false;epoch.current++;reading.current=false;controller.abort();clearTimeout(timer);window.removeEventListener('aiadcast-session-change',clear);};
 },[attempt]);
 const accessMessage=diagnostic?.kind==='auth'?t('로그인 상태를 확인하지 못했습니다. 같은 탭에서 로그인한 뒤 시험 화면으로 돌아올 수 있습니다.','Your sign-in could not be verified. Sign in in this tab to return to the trial.'):
 diagnostic?.kind==='forbidden'?t('이 계정에는 시험 접근 권한이 없습니다. 지정 관리자 계정만 이용할 수 있습니다.','This account cannot access the trial. Only the designated administrator is allowed.'):
 diagnostic?.kind==='timeout'?t('10초 안에 접근 상태를 확인하지 못했습니다. 다시 확인해주세요.','Access could not be checked within 10 seconds. Check again.'):
 diagnostic?.kind==='changed'?t('계정이 변경되었습니다. 현재 계정으로 다시 확인해주세요.','The account changed. Check access again for the current account.'):
 diagnostic?.kind==='server'?t('서버에서 접근 상태를 확인하지 못했습니다. 잠시 후 다시 확인해주세요.','The server could not confirm access. Check again shortly.'):
 diagnostic?.kind==='network'?t('서버에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 확인해주세요.','Could not connect to the server. Check your connection and try again.'):
 t('서버 응답 형식을 확인하지 못했습니다. 다시 확인해주세요.','The server response could not be verified. Check again.');
 async function select(file?:File){const id=++epoch.current;setAsset(null);setPrepared(false);setError('');if(!file)return;setBusy(true);try{const value=await imageFile(file);if(valid(id))setAsset(value);}catch{if(valid(id))setError(t('사진을 읽지 못했습니다. JPG, PNG, WebP 사진 한 장을 선택해주세요.','Could not read the photo. Select one JPG, PNG or WebP image.'));}finally{if(valid(id))setBusy(false);}}
 async function prepare(){if(busy||!asset||access!=='ready')return;const id=++epoch.current;setBusy(true);setError('');setPrepared(false);try{await preflightPlannedAdText(plannedAdText({productName:trialTitle,copy:{company:'',description:trialDescription}},'9:16'),864,1536);if(valid(id))setPrepared(true);}catch{if(valid(id))setError(t('폰트 또는 문구 배치를 준비하지 못했습니다. 생성은 실행하지 않았습니다.','Font or text layout preparation failed. Generation was not started.'));}finally{if(valid(id))setBusy(false);}}
 return <main style={{maxWidth:680,margin:'auto',padding:20,overflowWrap:'anywhere'}}><a href="/" onClick={clearLoginDestination}>{t('앱으로 돌아가기','Back to app')}</a><h1>{t('정확 문구 시험 준비','Exact text trial preparation')}</h1>
 {access==='loading'?<p role="status">{t('접근 권한 확인 중','Checking access')}</p>:access==='denied'?<><p role="alert">{accessMessage}</p>{diagnostic&&<p><small>{diagnostic.status===null?t('HTTP 응답 없음','No HTTP response'):'HTTP '+diagnostic.status} · {diagnostic.code}</small></p>}{diagnostic?.kind==='auth'?<button onClick={()=>{if(reading.current)return;reading.current=true;rememberLoginDestination('exact-text-trial');location.assign('/#login');}}>{t('로그인하고 시험으로 돌아오기','Sign in and return to trial')}</button>:<button onClick={()=>{if(reading.current)return;reading.current=true;setAccess('loading');setAttempt(v=>v+1);}}>{t('접근 상태 다시 확인','Check access again')}</button>}</>:<>
 <p>{t('유료 시험은 승인 전입니다. 사진과 문구 준비만 가능하며 생성 요청은 보내지 않습니다.','Paid testing is not approved. You can prepare a photo and text; no generation request is sent.')}</p>
 <label>{t('대표사진 한 장','One primary photo')}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>void select(e.target.files?.[0])}/></label>
 {asset&&<img src={asset.data} alt={t('선택한 원본 사진','Selected original photo')} style={{display:'block',maxWidth:'100%',maxHeight:320,objectFit:'contain'}}/>}
 <h2>{t('시험 입력','Trial input')}</h2><p>{trialTitle}</p><p style={{whiteSpace:'pre-wrap'}}>{trialDescription}</p><p style={{whiteSpace:'pre-wrap'}}>{trialDirections}</p>
 <button disabled={!asset||busy} onClick={()=>void prepare()}>{t('문구 배치 준비 확인 · 무료','Check text layout · no charge')}</button>
 {prepared&&<p role="status">{t('문구 준비 완료. 실제 광고 디자인과 영역 준수는 아직 검증하지 않았습니다.','Text is ready. Actual ad design and reserved-region compliance have not been tested.')}</p>}
 {error&&<p role="alert">{error}</p>}<p>{t('실제 생성은 별도 승인과 서버 연결이 필요합니다.','Actual generation requires separate approval and server integration.')}</p>
 </>}</main>;
}
