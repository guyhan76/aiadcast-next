import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,ImagePlus,X} from 'lucide-react';
import {referenceAssets,withReferences} from './model';
import type {Project} from './model';
import {isServiceCategory} from './product';
import {photoRole,withPhotoRole,type PhotoRole} from './photo-roles';
import {importReferenceFiles,type ReferenceImportIssue} from './reference-import';
import {referenceBytes} from './reference-limits';
import './reference-photos.css';
import {useUiLanguage} from './ui-language';
export function ReferencePhotos({project,change,onBusyChange,onAdded,onIssueChange}:{project:Project;change:(fn:(p:Project)=>Project)=>void;onBusyChange?:(busy:boolean)=>void;onAdded?:()=>void;onIssueChange?:(message:string)=>void}){
 const {t,text}=useUiLanguage();const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[issues,setIssues]=useState<ReferenceImportIssue[]>([]);const latest=useRef(project);latest.current=project;
 const photos=referenceAssets(project);
 const inputRef=useRef<HTMLInputElement>(null);
 const errorRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(error){errorRef.current?.focus({preventScroll:true});errorRef.current?.scrollIntoView({block:'nearest'});}},[error,issues]);
 const sizeError=issues.some(issue=>issue.code==='file-size'||issue.code==='total-size');
 function issueReason(issue:ReferenceImportIssue){
  switch(issue.code){
   case 'count':return t('최대 10장까지 첨부할 수 있습니다.','Add up to 10 photos.');
   case 'file-size':return t('사진 한 장이 10MB를 넘습니다. 10MB 이하 파일을 선택해주세요.','This photo exceeds 10MB. Choose a file no larger than 10MB.');
   case 'total-size':return t('첨부한 사진과 합계가 10MB를 넘습니다. 작은 파일을 선택하거나 기존 사진을 삭제해주세요.','The combined size exceeds 10MB. Choose a smaller file or remove an attached photo.');
   case 'duplicate':return t('이미 첨부한 사진입니다.','This photo is already attached.');
   default:
    if(issue.message==='PNG, JPG, WebP 사진을 선택해주세요.')return t('PNG, JPG, WebP 사진을 선택해주세요.','Choose a PNG, JPG or WebP photo.');
    if(issue.message==='3,000만 화소 이하의 사진을 사용해주세요.')return t('3,000만 화소 이하의 사진을 사용해주세요.','Choose a photo with no more than 30 megapixels.');
    return t('사진을 읽지 못했습니다. 다른 PNG·JPG·WebP 파일을 선택해주세요.','Could not read this photo. Choose another PNG, JPG or WebP file.');
  }
 }
 async function add(files:File[]){if(!files.length||busy)return;setError('');setNotice('');setIssues([]);onIssueChange?.('');setBusy(true);onBusyChange?.(true);const before=latest.current;
 try{
  const result=await importReferenceFiles(before,files);
  if(latest.current.id!==before.id||referenceAssets(latest.current).map(a=>a.sha256).join()!==referenceAssets(before).map(a=>a.sha256).join())throw Error(t('사진이 변경되었습니다. 다시 선택해주세요.','Photos changed. Please select again.'));
  if(result.addedCount){change(p=>withReferences(p,result.assets));onAdded?.();setNotice(t(`${result.addedCount}장 첨부 완료. 아래 사진을 확인해주세요.`,`${result.addedCount} photo(s) attached. Review them below.`));}
  if(result.issues.length){
   const message=t(`${result.issues.length}장은 첨부하지 못했습니다. 첨부된 사진은 유지됩니다.`,`${result.issues.length} photo(s) could not be attached. Attached photos are kept.`);
   const title=result.issues.some(issue=>issue.code==='file-size'||issue.code==='total-size')?t('참조사진 전체 용량이 10MB를 초과했습니다.','The combined reference photo size exceeds 10MB.'):t('사진 첨부를 확인해주세요.','Check the photo attachments.');
   setError(message);setIssues(result.issues);onIssueChange?.([title,issueReason(result.issues[0])].join(' '));
  }
 }catch(e){const message=e instanceof Error?text(e.message):t('사진을 확인해주세요.','Check the selected photos.');setError(message);onIssueChange?.(message);}
 finally{setBusy(false);onBusyChange?.(false);}}
 return <section className="reference-photos" aria-label={t('참조사진','Reference photos')}>
  <div className="reference-heading"><strong>{t('사진','Photos')}</strong><span aria-live="polite">{photos.length} / 10</span></div>
  <p>{isServiceCategory(project.productProfile.category)?t('공간이나 서비스 사진을 추가하세요. (선택)','Add photos of your space or service. (Optional)'):t('첫 사진 · 대표 사진','First photo · Main')}</p>
  {error&&<div ref={errorRef} tabIndex={-1} role="alert" className="reference-import-error"><p className="reference-error-title"><AlertTriangle size={28} aria-hidden="true"/><strong>{sizeError?t('참조사진 전체 용량이 10MB를 초과했습니다.','The combined reference photo size exceeds 10MB.'):t('사진 첨부를 확인해주세요.','Check the photo attachments.')}</strong></p><p>{error}</p>{issues.length>0&&<ul>{issues.map((issue,i)=><li key={i}><strong>{issue.name}</strong>: {issueReason(issue)}</li>)}</ul>}</div>}
  {notice&&<p role="status">{notice}</p>}
  {photos.length>0&&<div className="reference-grid">{photos.map((photo,i)=><div className="reference-item" key={photo.sha256}>
   <img src={photo.data} alt={`${t('참조사진','Reference')} ${i+1}`}/>
   <button type="button" className="reference-primary" disabled={busy||i===0} aria-label={`${i+1} ${t('대표 사진으로','Use as main photo')}`} onClick={()=>change(p=>withReferences(p,[photo,...referenceAssets(p).filter(a=>a.sha256!==photo.sha256)]))}>{i===0?t('대표','Main'):t('대표로','Set main')}</button>
   <button type="button" className="reference-remove" disabled={busy} aria-label={`${i+1} ${t('사진 삭제','Remove photo')}`} onClick={()=>change(p=>withReferences(p,referenceAssets(p).filter(a=>a.sha256!==photo.sha256)))}><X size={14} aria-hidden="true"/></button>
   <select className="reference-role" aria-label={`${i+1} ${t('사진 용도','Photo purpose')}`} value={photoRole(project,photo.sha256)} disabled={busy} onChange={e=>change(p=>withPhotoRole(p,photo.sha256,e.target.value as PhotoRole))}><option value="subject">{t('실제 상품·공간','Actual subject')}</option><option value="style">{t('디자인 참고','Design reference')}</option></select>
  </div>)}</div>}
  {photos.length<10&&<div className="reference-upload-zone">
   <input ref={inputRef} type="file" multiple hidden disabled={busy} accept="image/png,image/jpeg,image/webp" aria-label={t('참조사진 추가','Add reference photos')} onChange={e=>{void add(Array.from(e.target.files??[]));e.target.value='';}}/>
   <button type="button" className="reference-add" disabled={busy} onClick={()=>inputRef.current?.click()}><ImagePlus size={36} aria-hidden="true"/><span>{busy?t('불러오는 중','Loading'):t('사진 첨부','Attach photos')}</span></button>
  </div>}
  <div className="reference-file-info"><p>PNG · JPG · WebP</p><p>{t('최대 10장 · 전체 합계 10MB','Up to 10 photos · 10MB combined')}</p>{photos.length>0&&<p>{t('첨부 용량','Attached size')}: {(referenceBytes(photos)/1024/1024).toFixed(1)} / 10MB</p>}</div>
  {project.generation.mode==='original'&&photos.length>1&&<p>{t('원본 합성에서는 대표 사진만 사용합니다. 모든 참조사진을 활용하려면 AI 광고를 선택하세요.','Original composition uses only the main photo. AI creative uses all references.')}</p>}
 </section>;
}


