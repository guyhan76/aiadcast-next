import {ArrowUpRight,ImagePlus,Film} from 'lucide-react';
import {useUiLanguage} from './ui-language';
import './creation-home.css';

export function CreationHome({onCreate}:{onCreate:()=>void}){
 const {t}=useUiLanguage();
 return <section className="creation-home" aria-labelledby="creation-home-title">
  <div className="creation-home-hero">
   <div className="creation-home-heading">
    <h1 id="creation-home-title">{t('어떤 광고를 만들까요?','What would you like to create?')}</h1>
    <button type="button" className="creation-home-image" onClick={onCreate}><ImagePlus size={22} aria-hidden="true"/><span>{t('광고 이미지 만들기','Create an ad image')}</span><ArrowUpRight size={22} aria-hidden="true"/></button>
   </div>
  </div>
  <section className="creation-home-video" aria-labelledby="creation-home-video-title">
   <Film size={26} aria-hidden="true"/><h2 id="creation-home-video-title">{t('광고 영상 만들기','Create an ad video')}</h2><span>{t('준비 중','Coming soon')}</span>
  </section>
 </section>;
}
