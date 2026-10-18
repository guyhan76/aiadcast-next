import {useState} from 'react';
import {offlineDemo,setOfflineDemo} from './demo-mode';
import {useUiLanguage} from './ui-language';
import {betaSession} from './beta-session';
import {signOut} from './sign-out';
import './offline-demo.css';
export function DemoNotice(){const {t}=useUiLanguage();return offlineDemo()?<div className="demo-notice" role="status">{t('서버 없는 체험 모드 · 가입·결제는 모의 처리, 광고는 기기 내 합성입니다. 실제 청구·인증메일·AI 호출은 없습니다.','Offline demo · Local signup, simulated checkout and on-device composition. No charge, verification email or AI call.')}</div>:null;}
export function OfflineDemoControls({beforeChange,preserve}:{beforeChange:()=>Promise<void>;preserve:()=>Promise<void>}){
 const {t}=useUiLanguage(),enabled=offlineDemo(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function toggle(){setBusy(true);try{await beforeChange();window.dispatchEvent(new Event('aiadcast-preserved-reload'));setOfflineDemo(!enabled);location.hash=enabled?'home':'signup';location.reload();}catch{setError(t('작업을 보관하지 못해 체험 모드 전환을 멈췄습니다.','Could not preserve your work. Mode was not changed.'));setBusy(false);}}
 async function logout(){setBusy(true);try{await signOut(preserve);}catch{setBusy(false);setError(t('로그아웃하지 못했습니다.','Could not sign out.'));}}
 return <section className="offline-demo-controls" aria-label={t('서버 없는 체험','Offline demo')}><h2>{t('서버 없이 전체 흐름 시험','Try the flow without a server')}</h2><p>{t('가입 → 결제 성공·실패·취소 → 시안 검토 → PNG 저장을 이 기기에서 시험합니다. 체험 계정·이용권은 실제 서버와 별도로 보관합니다.','Try signup, checkout success/failure/cancel, visual review and PNG export on this device. Demo accounts and credits are separate from server accounts.')}</p><button className="primary-action" disabled={busy} onClick={()=>void toggle()}>{enabled?t('체험 종료 · 서버 모드로','Exit demo · Use server mode'):t('서버 없는 체험 시작','Start offline demo')}</button>{enabled&&<a href={betaSession()?'#checkout':'#signup'}>{t('가입·결제 시험 이어가기','Continue signup & checkout')}</a>}{enabled&&betaSession()&&<button disabled={busy} onClick={()=>void logout()}>{t('체험 계정 로그아웃','Sign out of demo')}</button>}{error&&<p role="alert">{error}</p>}</section>;
}
