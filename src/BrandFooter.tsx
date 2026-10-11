import {useId} from 'react';
import {footerVisible} from './model';
import type {FooterField,Project} from './model';
import {useUiLanguage} from './ui-language';
export function BrandFooter({project,change}:{project:Project;change:(fn:(p:Project)=>Project)=>void}){
 const {t}=useUiLanguage(),id=useId();
 const fields:[FooterField,string,string][]=[['company',t('회사명','Company'),'selluplabs'],['contact',t('연락처','Phone'),'010-0000-0000'],['email',t('이메일','Email'),'hello@brand.com'],['website',t('홈페이지','Website'),'www.brand.com']];
 return <details className="brand-footer-settings"><summary>{t('회사·연락처','Company & contact')}<span>{t('선택','Optional')}</span></summary><p>{t('표시할 정보만 선택하세요.','Choose which details to display.')}</p>{fields.map(([key,label,placeholder])=><div className="brand-footer-row" key={key}>
  <div className="brand-footer-label"><label htmlFor={`${id}-${key}`}>{label}</label><label className="check-field"><input type="checkbox" aria-label={label} checked={footerVisible(project,key)} onChange={e=>change(p=>({...p,footer:{company:footerVisible(p,'company'),contact:footerVisible(p,'contact'),email:footerVisible(p,'email'),website:footerVisible(p,'website'),[key]:e.target.checked}}))}/>{t('광고에 표시','Show in ad')}</label></div>
  <input id={`${id}-${key}`} type={key==='email'?'email':key==='contact'?'tel':'text'} maxLength={key==='company'?80:100} placeholder={placeholder} value={project.copy[project.locale][key]??''} onChange={e=>change(p=>({...p,copy:{...p.copy,[p.locale]:{...p.copy[p.locale],[key]:e.target.value}}}))}/>
 </div>)}</details>;
}
