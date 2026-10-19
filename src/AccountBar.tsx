import {useRef,useState} from 'react';
import {betaSession} from './beta-session';
import {signOut} from './sign-out';
import {useUiLanguage} from './ui-language';
import './account-bar.css';
export function AccountBar({preserve,enabled=true}:{preserve:()=>Promise<void>;enabled?:boolean}){
 const {t}=useUiLanguage(),session=betaSession();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const locked=useRef(false);
 if(!enabled||!session)return null;
 async function logout(){
  if(locked.current)return;
  if(!window.confirm(t('현재 작업을 이 기기에 보관한 뒤 로그아웃합니다. 서버 저장은 별도입니다. 계속할까요?','Your current work will be kept on this device before signing out. Server saving is separate. Continue?')))return;
  locked.current=true;setBusy(true);setError('');
  try{await signOut(preserve);}
  catch{setError(t('작업 보관 또는 로그아웃 결과를 확인하지 못했습니다. 작업은 지우지 않았습니다. 저장 공간과 연결을 확인한 뒤 다시 시도해주세요.','Could not confirm saving or sign-out. Your work was not deleted. Check storage and your connection, then retry.'));}
  finally{locked.current=false;setBusy(false);}
 }
 return <section className="account-bar" aria-label={t('내 계정 및 로그아웃','My account and sign out')}>
  <div className="account-bar-identity"><a href="#credits">{t('내 계정','My account')}</a><span>{session.user.label}</span></div>
  <button type="button" disabled={busy} onClick={()=>void logout()}>{busy?t('로그아웃 확인 중…','Signing out…'):t('로그아웃','Sign out')}</button>
  {error&&<p role="alert">{error}</p>}
 </section>;
}
