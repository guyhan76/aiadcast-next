import {useEffect,useRef,useState} from 'react';
import {apiUrl} from './generation-client';
import {configuredApiOrigin,nativeTestConnection,requestTestConnection} from './api-origin';
import {betaSession} from './beta-session';
import {useUiLanguage} from './ui-language';
import './test-connection.css';

type Readiness={connected:boolean;email:boolean;checkout:boolean};
export function TestConnection({beforeChange,preserve}:{beforeChange:()=>Promise<void>;preserve:()=>Promise<void>}){
 const {t}=useUiLanguage(),origin=configuredApiOrigin(),editable=nativeTestConnection();
 const [input,setInput]=useState(origin),[busy,setBusy]=useState(false),[checking,setChecking]=useState(false);
 const [status,setStatus]=useState<Readiness|null>(null),[message,setMessage]=useState('');
 const probe=useRef<AbortController|null>(null),configureTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 async function check(){
  probe.current?.abort();const controller=new AbortController();probe.current=controller;setChecking(true);setMessage('');
  const timeout=setTimeout(()=>controller.abort(),10_000);
  try{
   // A readiness check sends neither an account token nor provider credentials.
   const get=async(path:string)=>{const response=await fetch(apiUrl(path),{credentials:'omit',redirect:'error',signal:controller.signal});if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw Error('UNAVAILABLE');return response.json();};
   const [health,cap]=await Promise.all([get('/api/health'),get('/api/account/capabilities')]);
   if(health.mode!=='invite-beta'||health.commercialReady!==false||cap.checkout?.test!==true||cap.checkout?.currency!=='KRW')throw Error('INVALID_TEST_SERVER');
   if(probe.current===controller)setStatus({connected:true,email:cap.email?.enabled===true,checkout:cap.checkout.enabled===true});
  }catch{if(probe.current===controller)setStatus({connected:false,email:false,checkout:false});}
  finally{clearTimeout(timeout);if(probe.current===controller)setChecking(false);}
 }
 useEffect(()=>{void check();const failed=()=>{clearTimeout(configureTimer.current);setBusy(false);setMessage(t('연결 주소를 저장하지 못했습니다. 공개 HTTPS 서버 주소만 입력하고, 파일 저장을 마친 뒤 다시 시도해주세요.','Could not save the connection. Use a public HTTPS server origin and finish any file export before retrying.'));};window.addEventListener('aiadcast-test-connection',failed);return()=>{probe.current?.abort();clearTimeout(configureTimer.current);window.removeEventListener('aiadcast-test-connection',failed);};},[]);
 async function configure(value:string){
  setBusy(true);setMessage('');
  try{await beforeChange();configureTimer.current=setTimeout(()=>{setBusy(false);setMessage(t('연결 설정 응답이 없습니다. 앱을 다시 열어주세요.','The connection setting did not respond. Reopen the app.'));},5000);requestTestConnection(value.trim());}
  catch{clearTimeout(configureTimer.current);setBusy(false);setMessage(t('현재 작업을 보관하거나 연결 주소를 저장하지 못했습니다.','Could not preserve your work or save this connection.'));}
 }
 async function go(page:'signup'|'checkout'){try{await preserve();location.hash=page;}catch{setMessage(t('입력 내용을 보관하지 못했습니다. 프로젝트 파일로 먼저 저장해주세요.','Could not keep your inputs. Export your project first.'));}}
 return <section className="test-connection" aria-label={t('가입·결제 테스트 연결','Signup and payment test connection')}>
  <h2>{t('가입·결제 테스트 연결','Signup and payment test connection')}</h2>
  <p>{t('테스트 서버를 한 번 연결하면 이메일 가입 → 테스트 결제 → 이용권 확인 순서로 시험할 수 있습니다.','Connect your test server once to try email signup, test checkout and credit verification.')}</p>
  <p className="test-server-origin">{t('현재 연결','Current connection')}: <b>{origin||t('이 기기 앱 · 외부 서버 미지정','Local app · No external server selected')}</b></p>
  {editable&&<form onSubmit={e=>{e.preventDefault();void configure(input);}}>
   <label>{t('테스트 서버 주소','Test server origin')}<input type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" autoComplete="off" maxLength={300} placeholder="https://your-test-server.example.com" value={input} onChange={e=>setInput(e.target.value)} required/></label>
   <p>{t('서버의 공개 주소만 입력하세요. API 키나 비밀번호는 입력하지 않습니다. 연결을 바꾸면 로그인은 해제되고, 현재 편집은 기기에 보관됩니다.','Enter only the public server origin, never an API key or password. Changing the connection signs you out and keeps the current draft on this device.')}</p>
   <div className="test-connection-actions"><button disabled={busy||!input.trim()||input.trim()===origin}>{t('연결 주소 저장','Save connection')}</button>{origin&&<button type="button" disabled={busy} onClick={()=>void configure('')}>{t('서버 연결 해제','Disconnect server')}</button>}</div>
  </form>}
  <ul aria-label={t('연결 준비 상태','Connection readiness')}>
   <li><b>{t('서버','Server')}</b><span>{checking?t('확인 중…','Checking…'):status?.connected?t('응답 확인','Response verified'):t('연결되지 않음','Not connected')}</span></li>
   <li><b>{t('이메일 인증','Email verification')}</b><span>{status?.email?t('설정 연결됨 · 수신 시험 필요','Configured · Delivery test needed'):t('서버 설정 필요','Server configuration required')}</span></li>
   <li><b>{t('결제','Payment')}</b><span>{status?.checkout?t('테스트 키 연결됨 · 승인 시험 필요','Test keys configured · Approval test needed'):t('테스트 결제 설정 필요','Test checkout configuration required')}</span></li>
  </ul>
  <div className="test-connection-actions"><button type="button" disabled={checking||busy} onClick={()=>void check()}>{t('연결 상태 다시 확인','Recheck connection')}</button><button type="button" disabled={!status?.email||busy} onClick={()=>void go(betaSession()?'checkout':'signup')}>{betaSession()?t('테스트 결제 시작','Start test checkout'):t('회원가입 시험 시작','Start signup test')}</button></div>
  <p>{t('테스트 결제는 실청구가 없습니다. 상태 확인만으로 실제 이메일 수신이나 결제 승인이 완료되었다고 판단하지 않습니다.','Test payments do not charge real money. Readiness does not prove actual email delivery or payment approval.')}</p>
  {message&&<p role="alert">{message}</p>}
 </section>;
}
