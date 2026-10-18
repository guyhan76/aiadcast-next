import {useEffect,useState} from 'react';
export type NativeVersion={versionName:string;versionCode:number;packageName:string};
export type WebBuild={version:string;commit:string|null};
declare const __AIADCAST_WEB_BUILD__:WebBuild;
export const webBuild:WebBuild=typeof __AIADCAST_WEB_BUILD__==='undefined'?{version:'unknown',commit:null}:__AIADCAST_WEB_BUILD__;
export function readNativeVersion():NativeVersion|null{
 const v=(window as Window&{__AIADCAST_NATIVE_VERSION__?:NativeVersion}).__AIADCAST_NATIVE_VERSION__;
 return v&&/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/i.test(v.versionName)&&Number.isSafeInteger(v.versionCode)&&v.versionCode>0&&/^com\.selluplabs\.aiadcast\.next(?:\.[a-z]+)?$/.test(v.packageName)?v:null;
}
export function useNativeVersion(){const [version,setVersion]=useState(readNativeVersion);useEffect(()=>{const update=()=>setVersion(readNativeVersion());window.addEventListener('aiadcast-native-version',update);return()=>window.removeEventListener('aiadcast-native-version',update);},[]);return version;}
