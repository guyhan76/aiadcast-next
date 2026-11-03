import {ArrowUpRight,ImagePlus,Film,FolderOpen,Ticket} from 'lucide-react';
import {useUiLanguage} from './ui-language';
import './creation-home.css';

export function CreationHome({onCreate}:{onCreate:()=>void}){
 const {t}=useUiLanguage();
 return <section className="creation-home" aria-labelledby="creation-home-title">
  <div className="creation-home-heading"><h1 id="creation-home-title">{t('내 상품으로, 나만의 광고','Your product. Your ad.')}</h1><p>{t('사진과 설명으로 시작하세요.','Start with photos and a description.')}</p></div>
  <div className="creation-home-options">
   <button type="button" className="creation-home-image" onClick={onCreate}>
    <span className="creation-home-art" aria-hidden="true"><ImagePlus size={48}/><span className="creation-home-frame"/></span>
    <span className="creation-home-action">{t('광고 이미지 만들기','Create an ad image')}<ArrowUpRight size={25} aria-hidden="true"/></span>
   </button>
   <div className="creation-home-video" aria-label={t('광고 영상 만들기 · 준비 중','Create an ad video · Coming soon')}>
    <Film size={32} aria-hidden="true"/><h2>{t('광고 영상 만들기','Create an ad video')}</h2><span>{t('준비 중','Coming soon')}</span>
   </div>
  </div>
  <nav className="creation-home-links" aria-label={t('내 작업과 이용권','Your work and credits')}>
   <a href="#projects"><FolderOpen size={22} aria-hidden="true"/>{t('내 프로젝트','My projects')}<ArrowUpRight size={19} aria-hidden="true"/></a>
   <a href="#credits"><Ticket size={22} aria-hidden="true"/>{t('내 이용권','My Credits')}<ArrowUpRight size={19} aria-hidden="true"/></a>
  </nav>
 </section>;
}
