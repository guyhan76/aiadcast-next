import {ArrowUpRight,ImagePlus,Film,FolderOpen,Ticket} from 'lucide-react';
import beauty from './assets/showcase-beauty.webp';
import hotel from './assets/showcase-hotel.webp';
import {useUiLanguage} from './ui-language';
import './creation-home.css';

export function CreationHome({onCreate}:{onCreate:()=>void}){
 const {t}=useUiLanguage();
 return <section className="creation-home" aria-labelledby="creation-home-title">
  <div className="creation-home-hero">
   <div className="creation-home-heading">
    <h1 id="creation-home-title">{t('내 상품이 돋보이는 광고','Make your product stand out.')}</h1>
    <p>{t('사진과 설명으로 시작하세요.','Start with photos and a description.')}</p>
    <button type="button" className="creation-home-image" onClick={onCreate}><ImagePlus size={22} aria-hidden="true"/><span>{t('광고 이미지 만들기','Create an ad image')}</span><ArrowUpRight size={22} aria-hidden="true"/></button>
   </div>
   <div className="creation-home-examples" role="group" aria-label={t('콘셉트 예시','Concept examples')}>
    <div className="creation-home-example-grid">
     <figure><img src={beauty} width="1080" height="1920" decoding="async" alt={t('화장품과 물결을 활용한 상품 콘셉트','Product concept with skincare and water')}/><figcaption>{t('상품','Products')}</figcaption></figure>
     <figure><img src={hotel} width="1080" height="1920" decoding="async" alt={t('호텔 공간을 활용한 서비스 콘셉트','Service concept featuring a hotel space')}/><figcaption>{t('서비스','Services')}</figcaption></figure>
    </div>
    <p>{t('콘셉트 예시','Concept examples')}</p>
   </div>
  </div>
  <nav className="creation-home-links" aria-label={t('내 작업과 이용권','Your work and credits')}>
   <a href="#projects"><FolderOpen size={24} aria-hidden="true"/><span>{t('내 프로젝트','My projects')}</span><ArrowUpRight size={20} aria-hidden="true"/></a>
   <a href="#credits"><Ticket size={24} aria-hidden="true"/><span>{t('내 이용권','My Credits')}</span><ArrowUpRight size={20} aria-hidden="true"/></a>
  </nav>
  <section className="creation-home-video" aria-labelledby="creation-home-video-title">
   <Film size={26} aria-hidden="true"/><h2 id="creation-home-video-title">{t('광고 영상 만들기','Create an ad video')}</h2><span>{t('준비 중','Coming soon')}</span>
  </section>
 </section>;
}
