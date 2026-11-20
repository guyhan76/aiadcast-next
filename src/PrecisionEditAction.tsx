import {useEffect,useRef,useState} from 'react';
import {Pencil} from 'lucide-react';
import type {Asset,Project} from './model';
import {imageFile,loadImage} from './model';
import {starterProject} from './consumer-campaign';
import {imageFormats} from './formats';
import {apiRequest,type ApiStatus,type CreditQuote,type GenerationJob} from './generation-client';
import {storageNamespace} from './beta-session';
import {SelectiveImageEditor} from './SelectiveImageEditor';
import {useUiLanguage} from './ui-language';

import {precisionFileInput,type EditInput} from './precision-edit-file';
type EditSource=Pick<GenerationJob,'id'|'projectId'|'artifact'|'artifactId'>;
async function readEditFile(file:File) {
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('FILE');
 if(file.size>25*1024*1024)throw Error('FILE_SIZE');
 if(file.type==='image/png'){
  if(file.size>10*1024*1024)throw Error('ORIGINAL_SIZE');
  const image=await imageFile(file);
  if(image.width*image.height>8294400)throw Error('ORIGINAL_SIZE');
  return image;
 }
 const url=URL.createObjectURL(file);
 try{
  const img=await loadImage(url);
  if(img.naturalWidth*img.naturalHeight>8294400)throw Error('ORIGINAL_SIZE');
  const canvas=document.createElement('canvas');
  canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
  canvas.getContext('2d')!.drawImage(img,0,0);
  const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG')),'image/png'));
  if(png.size>10*1024*1024)throw Error('ORIGINAL_SIZE');
  return imageFile(new File([png],file.name,{type:'image/png'}));
 }finally{URL.revokeObjectURL(url);}
}

async function editImage({file,asset,data=asset?.data,name}:EditInput):Promise<Asset>{
 // importProject has already decoded and hashed embedded assets. Keep its original PNG bytes.
 if(asset&&asset.data.startsWith('data:image/png;base64,')){
  if(asset.width*asset.height>8294400)throw Error('ORIGINAL_SIZE');
  return asset;
 }
 if(file)return readEditFile(file);
 if(!data)throw Error('FILE');
 const match=/^data:(image\/(?:png|jpeg|webp));base64,/.exec(data);
 if(!match)throw Error('FILE');
 const bytes=Uint8Array.from(atob(data.slice(match[0].length)),c=>c.charCodeAt(0));
 return readEditFile(new File([bytes],name||'aiadcast.png',{type:match[1]}));
}

export function PrecisionEditAction({getInput,label,disabled}:{getInput?:(signal:AbortSignal)=>EditInput|undefined|Promise<EditInput|undefined>;label?:string;disabled?:boolean}){
 const {language,t}=useUiLanguage(),picker=useRef<HTMLInputElement>(null),request=useRef<AbortController|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [editor,setEditor]=useState<{source:EditSource;project:Project;quote:CreditQuote;image:Asset}>();
 useEffect(()=>{const cancel=()=>{request.current?.abort();request.current=null;setEditor(undefined);setBusy(false);};window.addEventListener('hashchange',cancel);window.addEventListener('aiadcast-session-change',cancel);return()=>{request.current?.abort();window.removeEventListener('hashchange',cancel);window.removeEventListener('aiadcast-session-change',cancel);};},[]);
 async function open(input:(signal:AbortSignal)=>EditInput|undefined|Promise<EditInput|undefined>){
  if(request.current)return;
  const controller=new AbortController(),owner=storageNamespace();
  request.current=controller;setBusy(true);setError('');
  try{
   const inputFile=await input(controller.signal);
   if(!inputFile)return;
   if(controller.signal.aborted||owner!==storageNamespace())return;
   let image:Asset;
   try{image=await editImage(inputFile);}
   catch(error){
    if(error instanceof Error&&['FILE','FILE_SIZE','ORIGINAL_SIZE'].includes(error.message))throw error;
    throw Error('PHOTO_INVALID');
   }
   if(controller.signal.aborted||owner!==storageNamespace())return;
   const status=await apiRequest<ApiStatus>('/api/status',undefined,controller.signal);
   if(controller.signal.aborted||owner!==storageNamespace())return;
   if(!status.generation.selectiveEdit||!status.generation.enabled||!status.generation.creditQuote)throw Error(status.generation.reason||'UNAVAILABLE');
   const id='upload-'+image.sha256;
   const format=imageFormats.reduce((a,b)=>Math.abs(Math.log(b.width/b.height*image.height/image.width))<Math.abs(Math.log(a.width/a.height*image.height/image.width))?b:a);
   const title=(inputFile.name||image.name).replace(/\.[^./]+$/,'').slice(0,55)||t('이미지','Image');
   const project={...starterProject(),id,format:format.id,name:title,productName:title,locale:language,product:image};
   const source={id,projectId:id,artifactId:image.sha256,artifact:{id:image.sha256,sha256:image.sha256,width:image.width,height:image.height,dataUrl:image.data,role:'creative' as const}};
   setEditor({source,project,quote:status.generation.creditQuote,image});
  }catch(e){
   if(controller.signal.aborted)return;
   const messages:Record<string,string>={
    NO_TEST_CREDITS:t('편집에 사용할 크레딧이 부족합니다.','Insufficient credits for an edit.'),
    ORIGINAL_SIZE:t('원본 크기로 편집하려면 829만 화소 이하, PNG로 10MB 이하인 사진을 선택해주세요.','Choose an original up to 8.29 MP that fits in a 10 MB PNG.'),
    FILE:t('PNG·JPG·WebP 사진 또는 aiadcast 백업 파일(JSON)을 선택해주세요.','Choose a PNG, JPG, WebP or aiadcast JSON backup.'),
    PHOTO_INVALID:t('사진을 읽지 못했습니다. 다른 사진을 선택해주세요.','Could not read this photo. Choose another image.'),
    FILE_SIZE:t('25MB 이하의 사진을 선택해주세요.','Choose a photo up to 25 MB.'),
    BACKUP_SIZE:t('30MB 이하의 프로젝트 백업 파일을 선택해주세요.','Choose a project backup up to 30 MB.'),
    BACKUP_INVALID:t('aiadcast 백업 파일을 읽지 못했습니다. 다른 백업이나 사진을 선택해주세요.','Could not read this aiadcast backup. Choose another backup or photo.'),
    NO_FINISHED_AD:t('이 보관본은 초안입니다. 광고를 열어 제작을 완료해 주세요.','This backup is a draft. Open it to finish the ad.'),
    REVIEW_DIMENSIONS:t('광고 결과에서 규격 표시를 검수하고 사용을 확정해 주세요.','Review the dimensions and confirm use on the ad result screen.'),
    ORIGINAL_MISSING:t('이 광고의 원본을 찾을 수 없습니다.','The original for this ad could not be found.'),
    BACKUP_EMPTY:t('이 백업에는 이미지가 없습니다. 저장한 광고 사진을 선택해주세요.','This backup contains no image. Choose a saved ad photo.'),
    BACKUP_IMAGE:t('백업에 있는 광고를 표시할 수 없습니다. 저장한 광고 사진을 선택해주세요.','Could not display the ad in this backup. Choose a saved ad photo.'),
    BACKUP_REVIEW:t('이 광고는 규격 확인이 필요합니다. 규격 확인을 마친 광고를 불러와 주세요.','Choose a saved ad with its dimension review complete.')
   };
   setError(messages[e instanceof Error?e.message:'']??t('이미지와 편집 서버 연결을 확인하고 다시 시도해주세요.','Check the image and editing connection, then retry.'));
  }
  finally{if(request.current===controller){request.current=null;setBusy(false);}}
 }
 return <><button className="precision-launch" type="button" disabled={disabled||busy} onClick={()=>getInput?void open(getInput):picker.current?.click()}><Pencil size={18} aria-hidden="true"/>{busy?t('이미지 여는 중…','Opening image…'):label||t('정밀 편집','Precision edit')}</button>
 {!getInput&&<input hidden ref={picker} accept="image/png,image/jpeg,image/webp,application/json,.json" type="file" aria-label={t('편집할 사진 또는 백업 파일','Photo or backup file to edit')} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void open(()=>precisionFileInput(file));}}/>}
 {error&&<p role="alert">{error}</p>}{editor&&<SelectiveImageEditor source={editor.source} project={editor.project} quote={editor.quote} uploaded={editor.image} onClose={()=>setEditor(undefined)}/>}</>;
}
