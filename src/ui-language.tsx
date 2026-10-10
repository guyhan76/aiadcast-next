import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import type {ReactNode} from 'react';
import {Globe2} from 'lucide-react';
import {uiEnglish} from './ui-translations';
import './i18n.css';

export type UiLanguage='ko'|'en';
export const uiLanguageStorageKey='aiadcast.ui-language';
export function initialUiLanguage():UiLanguage {
 try {const saved=localStorage.getItem(uiLanguageStorageKey);if(saved==='ko'||saved==='en')return saved;} catch {/* Browsers may block storage. */}
 return typeof navigator!=='undefined'&&navigator.language.toLowerCase().startsWith('ko')?'ko':'en';
}
type UiContext={language:UiLanguage;setLanguage:(language:UiLanguage)=>void;t:(ko:string,en:string)=>string;text:(ko:string)=>string};
const UiLanguageContext=createContext<UiContext|null>(null);
export function UiLanguageProvider({children}:{children:ReactNode}){
 const [language,setLanguage]=useState<UiLanguage>(initialUiLanguage);
 useEffect(()=>{document.documentElement.lang=language;try{localStorage.setItem(uiLanguageStorageKey,language);}catch{/* Keep the choice in memory when storage is unavailable. */}},[language]);
 const value=useMemo<UiContext>(()=>({language,setLanguage,t:(ko,en)=>language==='ko'?ko:en,text:ko=>language==='ko'?ko:(uiEnglish[ko]??(uiEnglish[ko.trim()]!==undefined?ko.replace(ko.trim(),uiEnglish[ko.trim()]):ko))}),[language]);
 return <UiLanguageContext.Provider value={value}>{children}</UiLanguageContext.Provider>;
}
export function useUiLanguage(){const context=useContext(UiLanguageContext);if(!context)throw new Error('UiLanguageProvider is required.');return context;}
export function LanguageSwitcher(){
 const {language,setLanguage,t}=useUiLanguage();
 return <label className="ui-language-switch"><Globe2 size={16} aria-hidden="true"/><span className="sr-only">{t('앱 언어','App language')}</span><select aria-label={t('앱 언어','App language')} value={language} onChange={e=>setLanguage(e.target.value as UiLanguage)}><option value="ko">한국어</option><option value="en">English</option></select></label>;
}
