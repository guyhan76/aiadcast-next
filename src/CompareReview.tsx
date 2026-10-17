import {useEffect,useRef,useState} from 'react';
import type {Asset,Project} from './model';
import {exportErrors,loadImage,imageFile} from './model';
import {render} from './render';
import {axisLabel,dimensionAxes} from './product';
import {boxProjectionReady} from './box-projection';
import {useUiLanguage} from './ui-language';
import {ProportionReview} from './ProportionReview';
import {proportionContext} from './proportion-review';
import './compare-review.css';

type Snapshot={project:Project;result:string;resultAsset:Asset;createdAt:string;details:string;method:string};
export function CompareReview({project,disabled,onDownload}:{project:Project;disabled:boolean;onDownload:(blob:Blob,name:string)=>void}){
 const {t,language}=useUiLanguage();
 const dialog=useRef<HTMLDialogElement>(null),openButton=useRef<HTMLButtonElement>(null);
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [isOpen,setIsOpen]=useState(false),[exportPending,setExportPending]=useState(false),[exportStatus,setExportStatus]=useState('');
 const renderVersion=useRef(0),awaitingExport=useRef(false);
 function close(){renderVersion.current++;setBusy(false);setIsOpen(false);}
 useEffect(()=>{
  if(!isOpen)return;
  // Rendering disables the opener and may blur it before this effect runs.
  const element=dialog.current!,opener=openButton.current,overflow=document.body.style.overflow;
  element.showModal();document.body.style.overflow='hidden';
  const back=(event:Event)=>{if(!element.open)return;event.preventDefault();event.stopImmediatePropagation();close();};
  window.addEventListener('aiadcast-native-back',back,true);
  return()=>{element.close();document.body.style.overflow=overflow;window.removeEventListener('aiadcast-native-back',back,true);if(opener?.isConnected)opener.focus({preventScroll:true});};
 },[isOpen]);
 useEffect(()=>()=>{renderVersion.current++;},[]);
 useEffect(()=>{
  const feedback=(event:Event)=>{
   if(!awaitingExport.current)return;
   const status=(event as CustomEvent<{status?:string}>).detail?.status;
   if(status==='requested'){setExportStatus(t('파일을 저장할 위치를 선택해주세요.','Choose where to save the file.'));return;}
   const messages:Record<string,string>={saved:t('선택한 위치에 파일을 저장했습니다.','File saved to the selected location.'),'share-opened':t('공유할 앱을 열었습니다. 전송 완료 여부는 해당 앱에서 확인해주세요.','Sharing app opened. Check that app for delivery status.'),cancelled:t('파일 저장을 취소했습니다.','File save cancelled.'),error:t('파일을 저장하지 못했습니다. 다시 시도해주세요.','Could not save the file. Please try again.')};
   if(!status||!messages[status])return;
   awaitingExport.current=false;setExportPending(false);
   if(status==='error'){setError(messages[status]);setExportStatus('');}else{setExportStatus(messages[status]);}
  };
  window.addEventListener('aiadcast-native-export',feedback);
  return()=>window.removeEventListener('aiadcast-native-export',feedback);
 },[t]);
 function exportFile(blob:Blob,name:string){
  if(awaitingExport.current)throw Error(t('진행 중인 파일 저장을 먼저 마쳐주세요.','Finish the current file export first.'));
  const native=(window as Window & {__aiadcastNativeDownloads?:boolean}).__aiadcastNativeDownloads===true;
  awaitingExport.current=native;setExportPending(native);setError('');
  setExportStatus(native?t('파일 저장을 준비하고 있습니다.','Preparing file export.'):t('파일 다운로드를 요청했습니다. 브라우저의 다운로드 목록에서 확인해주세요.','Download requested. Check your browser’s downloads.'));
  try{onDownload(blob,name);}catch(e){awaitingExport.current=false;setExportPending(false);setExportStatus('');throw e;}
 }
 const limitation=t('원본 인쇄·로고·색상과 치수선 위치를 직접 비교해주세요. 입력 규격은 실측 검증 결과가 아닙니다.','Compare the print, logo, colours and dimension lines yourself. Entered dimensions are not verified physical measurements.');
 async function open(){
  const version=++renderVersion.current;
  setBusy(true);setError('');if(!awaitingExport.current)setExportStatus('');setSnapshot(null);setIsOpen(true);
  // Render a fresh, immutable project snapshot: the editor canvas may still be rendering or show editing handles.
  const current=structuredClone(project);
  try{
   const errors=exportErrors(current);if(errors.length)throw Error(errors.join(' '));
   const canvas=document.createElement('canvas'),issues=await render(canvas,current);
   if(issues.length)throw Error(issues.join(' '));
   const axes=dimensionAxes(current.productProfile);
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not render comparison.')),'image/png'));
   const resultAsset=await imageFile(new File([blob],'ad-result.png',{type:'image/png'}));
   if(version!==renderVersion.current)return;
   setSnapshot({project:current,result:resultAsset.data,resultAsset,createdAt:new Date().toISOString(),
    details:axes.length?axes.map(axis=>`${axisLabel(axis,language,current.productProfile)} ${current.dimensions[axis]} mm`).join(' · '):t('규격 없음','No dimensions'),
    method:boxProjectionReady(current)?t('입력 규격으로 구성 · 원본 사진의 세 면 적용','Built from entered dimensions · Three source faces applied'):current.generation.mode==='creative'?t('AI 창작 결과 · 원본과 비교 필요','AI creative result · Compare with the source'):t('원본 사진 배치 · 사진 형상 유지','Original photo placed · Photo shape retained')});
  }catch(e){if(version===renderVersion.current)setError(e instanceof Error?e.message:t('비교 이미지를 준비하지 못했습니다.','Could not prepare the comparison.'));}finally{if(version===renderVersion.current)setBusy(false);}
 }
 async function download(){
  if(!snapshot?.project.product)return;
  setBusy(true);setError('');setExportStatus(t('파일 저장을 준비하고 있습니다.','Preparing file export.'));
  try{
   const [source,result]=await Promise.all([loadImage(snapshot.project.product.data),loadImage(snapshot.result)]);
   const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1600;
   const ctx=canvas.getContext('2d')!;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1800,1600);
   const line=(value:string,y:number,size=26)=>{ctx.fillStyle='#171717';ctx.font=`${size}px sans-serif`;ctx.fillText(value,60,y,1680);};
   line(t('aiadcast · 원본과 결과 비교','aiadcast · Source and result comparison'),65,38);
   line(snapshot.details,115);line(snapshot.method,160);
   line(t('첨부한 원본','Uploaded original'),220);ctx.fillText(t('현재 광고 결과','Current ad result'),930,220);
   for(const [image,x] of [[source,60],[result,930]] as const){
    ctx.fillStyle='#f1f1f1';ctx.fillRect(x,245,810,1080);
    const scale=Math.min(810/image.naturalWidth,1080/image.naturalHeight);
    const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
    ctx.drawImage(image,x+(810-w)/2,245+(1080-h)/2,w,h);
   }
   line(t('입력 규격 기준의 비교 자료 · 실물 동일성/치수 검증 완료를 뜻하지 않습니다.','Comparison of entered dimensions · Not proof of product identity or physical measurements.'),1380,24);
   line(`${t('원본 파일','Source file')}: ${snapshot.project.product.name}`,1425,24);
   line(`SHA-256: ${snapshot.project.product.sha256}`,1468,23);
   line(`${snapshot.project.format} · ${snapshot.createdAt}`,1510,24);
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error(t('파일을 만들지 못했습니다.','Could not create the file.'))),'image/png'));
   exportFile(blob,'aiadcast-source-comparison.png');
  }catch(e){setError(e instanceof Error?e.message:t('파일을 저장하지 못했습니다.','Could not save the file.'));}finally{setBusy(false);}
 }
 return <div className="comparison-entry">
  <button ref={openButton} type="button" disabled={disabled||!project.product||busy} onClick={()=>void open()}>{t('원본과 결과 비교','Compare source and result')}</button>
  <dialog ref={dialog} className="comparison-dialog" aria-label={t('원본과 결과 비교','Compare source and result')} onCancel={e=>{e.preventDefault();close();}}>
   <div className="comparison-heading"><h2>{t('원본과 결과 비교','Compare source and result')}</h2><button type="button" onClick={close}>{t('닫기','Close')}</button></div>
   {busy&&<p role="status">{t('비교 자료 준비 중…','Preparing comparison…')}</p>}
   {error&&<p role="alert">{error}</p>}
   {exportStatus&&<p className="comparison-export-status" role="status">{exportStatus}</p>}
   {snapshot&&<><p className="comparison-details">{snapshot.details}</p><p>{snapshot.method}</p>
    <div className="comparison-images"><figure><figcaption>{t('첨부한 원본','Uploaded original')}</figcaption><img src={snapshot.project.product!.data} alt={t('비교할 원본 상품 사진','Original product photo for comparison')}/></figure><figure><figcaption>{t('현재 광고 결과','Current ad result')}</figcaption><img src={snapshot.result} alt={t('비교할 광고 결과','Ad result for comparison')}/></figure></div>
    <p>{limitation}</p><p className="help">{t('비교 화면을 연 시점의 내용입니다. 편집 후 다시 열면 갱신됩니다. 비교에는 AI 생성 비용이 들지 않습니다.','This snapshot was made when you opened the comparison. Reopen it after editing to refresh. Comparing does not incur AI generation costs.')}</p>
    <button type="button" disabled={busy||exportPending} onClick={()=>void download()}>{t('비교 이미지 저장','Save comparison image')}</button>
    <ProportionReview key={snapshot.createdAt} context={proportionContext(snapshot.project,snapshot.resultAsset)} source={snapshot.project.product!} result={snapshot.resultAsset} onDownload={exportFile} exportDisabled={busy||exportPending}/>
   </>}
  </dialog>
 </div>;
}

