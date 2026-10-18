import {useEffect,useRef,useState} from 'react';
import {useNativeVersion,webBuild} from './app-version';
import {apiUrl} from './generation-client';
import {offlineDemo} from './demo-mode';
import {useUiLanguage} from './ui-language';
import './app-version.css';
type ServerBuild={schemaVersion:1;service:'aiadcast-next';version:string;commit:string|null};
type NativeBuild={webBuildDigest:string;packagedAt:string};
export function VersionBadge(){const native=useNativeVersion(),{t}=useUiLanguage();return <a className="version-badge" href="#credits" aria-label={t('앱·서버 버전 보기','View app and server versions')}>{native?`${t('앱','App')} ${native.versionName} · ${native.versionCode}`:`${t('웹','Web')} ${webBuild.version}`}</a>;}
export function AppVersionInfo(){
 const {t}=useUiLanguage(),native=useNativeVersion(),[build,setBuild]=useState<NativeBuild>(),[server,setServer]=useState<ServerBuild>(),[busy,setBusy]=useState(false),[checked,setChecked]=useState(''),request=useRef<AbortController|null>(null);
 async function refresh(){if(request.current)return;setServer(undefined);setChecked('');if(offlineDemo())return;const controller=new AbortController();request.current=controller;setBusy(true);const timer=setTimeout(()=>controller.abort(),10000);
  try{const response=await fetch(apiUrl('/api/version'),{credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal});if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw Error('UNAVAILABLE');const v=await response.json();if(v?.schemaVersion!==1||v.service!=='aiadcast-next'||typeof v.version!=='string'||!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(v.version)||(v.commit!==null&&!/^[a-f0-9]{40}$/i.test(v.commit)))throw Error('INVALID_VERSION');if(request.current===controller){setServer({schemaVersion:1,service:'aiadcast-next',version:v.version,commit:v.commit});setChecked(new Date().toISOString());}}
  catch{/* Failed reads never become an inferred server version. */}finally{clearTimeout(timer);if(request.current===controller){request.current=null;setBusy(false);}}
 }
 useEffect(()=>{void refresh();return()=>{request.current?.abort();request.current=null;};},[]);
 useEffect(()=>{setBuild(undefined);if(!native)return;const controller=new AbortController();void fetch('./native-build.json',{signal:controller.signal,cache:'no-store'}).then(r=>{if(!r.ok)throw Error('UNAVAILABLE');return r.json();}).then(v=>{if(!controller.signal.aborted&&v?.schemaVersion===1&&/^[a-f0-9]{64}$/.test(v.webBuildDigest)&&typeof v.packagedAt==='string'&&Number.isFinite(Date.parse(v.packagedAt)))setBuild({webBuildDigest:v.webBuildDigest,packagedAt:v.packagedAt});}).catch(()=>{});return()=>controller.abort();},[native?.versionName,native?.versionCode]);
 return <section className="app-version-info" aria-label={t('앱·서버 버전','App and server versions')}><h2>{t('앱·서버 버전','App and server versions')}</h2><dl>
 <dt>{t('설치 앱 버전','Installed app version')}</dt><dd>{native?`${native.versionName} (code ${native.versionCode})`:t('확인 불가 · 웹 화면 버전만 표시합니다.','Unavailable · Only the web version is shown.')}</dd>
 {native&&<><dt>{t('앱 패키지','App package')}</dt><dd>{native.packageName}</dd><dt>{t('앱 빌드','Native build')}</dt><dd>{build?<><time>{build.packagedAt}</time><br/><code>{build.webBuildDigest}</code></>:t('확인 불가','Unavailable')}</dd></>}
 <dt>{t('웹 화면 버전','Web version')}</dt><dd>{webBuild.version}</dd><dt>{t('웹 빌드 commit','Web build commit')}</dt><dd><code>{webBuild.commit??t('확인 불가','Unavailable')}</code></dd>
 <dt>{t('서버 조회 상태','Server lookup status')}</dt><dd aria-live="polite">{busy?t('확인 중…','Checking…'):server?t('응답 확인','Response verified'):t('확인 불가','Unavailable')}{checked&&<> · <time dateTime={checked}>{new Date(checked).toLocaleTimeString()}</time></>}</dd>
 <dt>{t('서버 버전','Server version')}</dt><dd>{server?.version??t('확인 불가','Unavailable')}</dd><dt>{t('서버 commit','Server commit')}</dt><dd><code>{server?.commit??t('확인 불가','Unavailable')}</code></dd></dl>
 <button disabled={busy||offlineDemo()} onClick={()=>void refresh()}>{t('서버 버전 다시 확인','Refresh server version')}</button><p>{t('앱·웹·서버는 각각 갱신됩니다. 버전 숫자의 차이만으로 호환 여부를 판단하지 않습니다.','App, web and server updates are independent. Version numbers alone do not determine compatibility.')}</p></section>;
}
