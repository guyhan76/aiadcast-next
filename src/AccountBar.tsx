import {useRef,useState} from 'react';
import {betaSession} from './beta-session';
import {signOut,SignOutPreservationFailure} from './sign-out';
import {useUiLanguage} from './ui-language';
import './account-bar.css';
export function AccountBar({preserve}:{preserve:()=>Promise<void>}){
 const {t}=useUiLanguage(),session=betaSession();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const locked=useRef(false);
 if(!session)return null;
 async function logout(){
  if(locked.current)return;
  if(!window.confirm(t('현재 작업을 이 기기에 보관한 뒤 로그아웃합니다. 서버 저장은 별도입니다. 계속할까요?','Your current work will be kept on this device before signing out. Server saving is separate. Continue?')))return;
  locked.current=true;setBusy(true);setError('');
  try{await signOut(preserve);}
  catch(error){setError(error instanceof SignOutPreservationFailure
   ?t('현재 작업을 이 기기에 보관하지 못해 로그아웃하지 않았습니다. 작업은 그대로 유지됩니다. 저장 공간을 확인한 뒤 다시 시도해주세요.','Your work could not be saved on this device, so you remain signed in. Your work is kept. Check device storage and retry.')
   :t('계정 상태가 변경되어 로그아웃을 완료하지 못했습니다. 현재 계정을 확인한 뒤 다시 시도해주세요.','The account changed before sign-out completed. Check the current account and retry.'));}
  finally{locked.current=false;setBusy(false);}
 }
 return <section className="account-bar" aria-label={t('내 계정 및 로그아웃','My account and sign out')}>
  <div className="account-bar-identity"><a href="#credits">{t('내 계정','My account')}</a><span>{session.user.label}</span></div>
  <button type="button" disabled={busy} onClick={()=>void logout()}>{busy?t('로그아웃 확인 중…','Signing out…'):t('로그아웃','Sign out')}</button>
  {error&&<p role="alert">{error}</p>}
 </section>;
}

