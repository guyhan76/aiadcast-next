import {useRef,useState} from 'react';
import {ImagePlus,X} from 'lucide-react';
import {imageFile,referenceAssets,withReferences} from './model';
import type {Project} from './model';
import {isServiceCategory} from './product';
import {useUiLanguage} from './ui-language';
export function ReferencePhotos({project,change,onBusyChange,onAdded}:{project:Project;change:(fn:(p:Project)=>Project)=>void;onBusyChange?:(busy:boolean)=>void;onAdded?:()=>void}){
 const {t}=useUiLanguage();const [busy,setBusy]=useState(false),[error,setError]=useState('');const latest=useRef(project);latest.current=project;
 const photos=referenceAssets(project);
 const inputRef=useRef<HTMLInputElement>(null);
 async function add(files:File[]){if(!files.length)return;setError('');setBusy(true);onBusyChange?.(true);const before=latest.current;
 try{if(photos.length+files.length>10)throw Error(t('최대 10장까지 첨부할 수 있습니다.','Add up to 10 reference photos.'));const added=[];for(const file of files)added.push(await imageFile(file));const next=withReferences(before,[...referenceAssets(before),...added]);if(latest.current.id!==before.id||referenceAssets(latest.current).map(a=>a.sha256).join()!==referenceAssets(before).map(a=>a.sha256).join())throw Error(t('사진이 변경되었습니다. 다시 선택해주세요.','Photos changed. Please select again.'));change(p=>withReferences(p,referenceAssets(next)));onAdded?.();}
 catch(e){setError(e instanceof Error?e.message:t('사진을 확인해주세요.','Check the selected photos.'));}finally{setBusy(false);onBusyChange?.(false);}}
 return <section className="reference-photos" aria-label={t('참조사진','Reference photos')}>
  <div className="reference-heading"><strong>{t('사진','Photos')}</strong><span aria-live="polite">{photos.length} / 10</span></div>
  <p>{isServiceCategory(project.productProfile.category)?t('공간이나 서비스 사진을 추가하세요. (선택)','Add photos of your space or service. (Optional)'):t('첫 사진을 대표 사진으로 사용합니다.','The first photo is used as the main photo.')}</p>
  {photos.length>0&&<div className="reference-grid">{photos.map((photo,i)=><div className="reference-item" key={photo.sha256}>
   <img src={photo.data} alt={`${t('참조사진','Reference')} ${i+1}`}/>
   <button type="button" className="reference-primary" disabled={busy||i===0} aria-label={`${i+1} ${t('대표 사진으로','Use as main photo')}`} onClick={()=>change(p=>withReferences(p,[photo,...referenceAssets(p).filter(a=>a.sha256!==photo.sha256)]))}>{i===0?t('대표','Main'):t('대표로','Set main')}</button>
   <button type="button" className="reference-remove" disabled={busy} aria-label={`${i+1} ${t('사진 삭제','Remove photo')}`} onClick={()=>change(p=>withReferences(p,referenceAssets(p).filter(a=>a.sha256!==photo.sha256)))}><X size={14} aria-hidden="true"/></button>
  </div>)}</div>}
  {photos.length<10&&<div className="reference-upload-zone">
   <input ref={inputRef} type="file" multiple hidden disabled={busy} accept="image/png,image/jpeg,image/webp" aria-label={t('참조사진 추가','Add reference photos')} onChange={e=>{void add(Array.from(e.target.files??[]));e.target.value='';}}/>
   <button type="button" className="reference-add" disabled={busy} onClick={()=>inputRef.current?.click()}><ImagePlus size={36} aria-hidden="true"/><span>{busy?t('불러오는 중','Loading'):t('사진 여러 장 추가','Add multiple photos')}</span></button>
  </div>}
  <div className="reference-file-info"><p>PNG · JPG · WebP</p><p>{t('한 번에 여러 장 선택 · 최대 10장 · 전체 10MB','Select multiple photos at once · Up to 10 · 10MB total')}</p></div>
  {project.generation.mode==='original'&&photos.length>1&&<p>{t('원본 합성에서는 대표 사진만 사용합니다. 모든 참조사진을 활용하려면 AI 광고를 선택하세요.','Original composition uses only the main photo. AI creative uses all references.')}</p>}
  {error&&<p role="alert" className="wizard-error">{error}</p>}
 </section>;
}


