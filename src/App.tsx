import {defaultGeneration,generationIssues} from './generation.ts';
import {getImageFormat,imageFormats} from './formats.ts';
import type {ImageFormat} from './formats.ts';
import {axisLabel,defaultProfile,dimensionAxes,isServiceCategory,specTypes,withCategory} from './product.ts';
import type {SpecType} from './product.ts';
import {useEffect,useRef,useState} from 'react';
import type {PointerEvent} from 'react';
import {ArrowDownToLine,ArrowLeft,Check,ChevronRight,FolderOpen,ImagePlus,Layers,Maximize2,MessageSquare,Plus,RotateCcw,Save,ShieldCheck,Upload,X} from 'lucide-react';
import {exportErrors,imageFile,importProject,newProject} from './model';
import type {Axis,Copy,Locale,Project} from './model';
import {geometry,render} from './render';
import {projects,saveProject} from './storage';
import {PricingDialog} from './PricingDialog';
import {CampaignFields,CampaignPanel} from './CampaignPanel';
import {ReferenceInspector} from './ReferenceInspector';
import {BoxGeometryPreview} from './BoxGeometryPreview';
import {BoxProjectionPanel} from './BoxProjectionPanel';
import {boxProjectionActive,boxProjectionReady} from './box-projection';
import {CreativeDirector} from './CreativeDirector';
import {IndustryPicker} from './IndustryPicker';
import {CreativeOptions} from './CreativeOptions';
import {InstagramExports} from './InstagramExports';
import {hasUsableCreative} from './generated';
import {GenerationPanel} from './GenerationPanel';
import CopyAssistant from './CopyAssistant';
import {LanguageSwitcher,useUiLanguage} from './ui-language';
import {editorEnglish} from './editor-translations';
const tabs=[['product','광고 정보'],['copy','문구·언어'],['background','배경'],['dimensions','규격']] as const;
type Tab=typeof tabs[number][0];
const presets=[['크림','#f4f0e8','dark'],['화이트','#ffffff','dark'],['차콜','#20241f','light'],['세이지','#e5e9de','dark']] as const;
const nativeDownloads=()=>typeof window!=='undefined'&&(window as Window & {__aiadcastNativeDownloads?:boolean}).__aiadcastNativeDownloads===true;
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export default function App({initialProject,onProjectChange}:{initialProject?:Project;onProjectChange?:(p:Project)=>void}={}){
 const {language,t,text:globalText}=useUiLanguage();
 const text=(value:string)=>language==='ko'?value:(editorEnglish[value.trim()]??globalText(value));
 const [project,setProject]=useState<Project>(()=>initialProject??newProject());const [tab,setTab]=useState<Tab>('product');const [axis,setAxis]=useState<Axis>('width');
 const [history,setHistory]=useState<Project[]>([]);const [notice,setNotice]=useState('');const [error,setError]=useState('');const [layoutErrors,setLayoutErrors]=useState<string[]>([]);
 const [saved,setSaved]=useState<Project[]>([]);const [busy,setBusy]=useState(false);const [zoom,setZoom]=useState('');
 const canvas=useRef<HTMLCanvasElement>(null);const library=useRef<HTMLDialogElement>(null);const zoomDialog=useRef<HTMLDialogElement>(null);const projectFile=useRef<HTMLInputElement>(null);
 const latest=useRef(project);latest.current=project;const uploadSequence=useRef({product:0,background:0});
 const generation=project.generation??defaultGeneration();const creative=generation.mode==='creative';const pendingCreative=creative&&!hasUsableCreative(project);
 const outputFormat=getImageFormat(project.format);
 const profile=project.productProfile??defaultProfile();const activeAxes=dimensionAxes(profile);const service=isServiceCategory(profile.category);
 const selectedAxis=activeAxes.includes(axis)?axis:(activeAxes[0]??'width');
 const dimensionMode=!activeAxes.length||!project.dimensions.visible?'none':project.dimensions.lines?'annotated':'summary';
 const drag=useRef<{index:number;axis:Axis;start:Project}|null>(null);
 const dirty=useRef(false);
 useEffect(()=>{
  const exported=(event:Event)=>{
   if(!nativeDownloads())return;
   const status=(event as CustomEvent<{status?:string}>).detail?.status;
   const messages:Record<string,string>={
    requested:t('파일을 저장할 위치를 선택해주세요.','Choose where to save your file.'),
    saved:t('선택한 위치에 파일을 저장했습니다.','File saved to your selected location.'),
    'share-opened':t('공유할 앱을 열었습니다. 전송 완료 여부는 해당 앱에서 확인해주세요.','A sharing app was opened. Confirm delivery in that app.'),
    cancelled:t('파일 저장을 취소했습니다.','File save cancelled.'),
   };
   if(status==='error'){setNotice('');setError(t('파일을 저장하지 못했습니다. 저장 위치와 여유 공간을 확인해주세요.','Could not save the file. Check the destination and available storage.'));}
   else if(status&&messages[status]){setError('');setNotice(messages[status]);}
  };
  window.addEventListener('aiadcast-native-export',exported);
  return()=>window.removeEventListener('aiadcast-native-export',exported);
 },[language]);
 useEffect(()=>onProjectChange?.(project),[project,onProjectChange]);
 const change=(fn:(p:Project)=>Project,remember=true)=>{const old=latest.current;const next=fn(old);if(remember)setHistory(h=>[...h.slice(-19),old]);latest.current=next;setProject(next);dirty.current=true;setNotice('');setError('');};
 const message=(e:unknown)=>setError(e instanceof Error?text(e.message):text("작업을 완료하지 못했습니다. 다시 시도해주세요."));
 const load=(stored:Project)=>{const p={...stored,generation:stored.generation??defaultGeneration(),productProfile:stored.productProfile??defaultProfile()};uploadSequence.current.product++;uploadSequence.current.background++;drag.current=null;setProject(p);latest.current=p;setHistory([]);dirty.current=false;setError('');setNotice(text("프로젝트를 열었습니다."));library.current?.close();};
 useEffect(()=>{if(pendingCreative){setLayoutErrors([]);return;}let live=true;const scratch=document.createElement('canvas');render(scratch,project,tab==='dimensions'?selectedAxis:undefined).then(errors=>{if(!live||!canvas.current)return;canvas.current.width=scratch.width;canvas.current.height=scratch.height;canvas.current.getContext('2d')!.drawImage(scratch,0,0);setLayoutErrors(errors);}).catch(e=>{if(live)message(e);});return()=>{live=false;};},[project,tab,axis,pendingCreative]);
 useEffect(()=>{const leave=(event:BeforeUnloadEvent)=>{if(dirty.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave);},[]);
 async function upload(file:File|undefined,target:'product'|'background'){if(!file)return;setError('');const sequence=++uploadSequence.current[target];try{const asset=await imageFile(file);if(sequence!==uploadSequence.current[target])return;change(p=>target==='product'?{...p,product:asset,boxProjection:p.boxProjection?{...p.boxProjection,confirmedSourceHash:null,markedCorners:[]}:undefined}:{...p,background:{...p.background,image:asset}});setNotice(target==='product'?text("원본 사진을 추가했습니다."):text("배경 사진을 추가했습니다."));}catch(e){message(e);}}
 async function save(){setBusy(true);setError('');const snapshot={...latest.current,updatedAt:new Date().toISOString()};try{await saveProject(snapshot);if(latest.current===project){dirty.current=false;setNotice(text("이 기기에 저장했습니다. 저장한 작업에서 다시 열 수 있습니다."));}else setNotice(text("저장을 시작한 시점의 작업이 저장되었습니다."));}catch{setError(text("기기에 저장하지 못했습니다. 프로젝트 파일로 백업해주세요."));}finally{setBusy(false);}}
 async function openLibrary(){try{setSaved(await projects());library.current?.showModal();}catch{setError(text("저장한 작업을 읽지 못했습니다. 프로젝트 파일을 불러와주세요."));}}
 async function exportPng(target?:{format:ImageFormat;filename:string;label:string}){
  setBusy(true);setError('');setNotice('');
  try{
   // Export a snapshot in the requested format; keep the editable project and undo history intact.
   const current=target?{...latest.current,format:target.format}:latest.current;
   const errors=exportErrors(current);if(errors.length)throw new Error(errors.join(' '));
   const output=document.createElement('canvas');const renderedErrors=await render(output,current);
   if(renderedErrors.length)throw new Error(renderedErrors.join(' '));
   const blob=await new Promise<Blob>((resolve,reject)=>output.toBlob(b=>b?resolve(b):reject(new Error(text("이미지 파일을 만들지 못했습니다."))),'image/png'));
   download(blob,`aiadcast-${target?target.filename+'-':''}${current.locale}-${current.format.replace(':','x')}.png`);
   if(!nativeDownloads())setNotice(target?t(`${target.label} PNG를 내보냈습니다. 편집 중인 비율과 원본은 유지됩니다. 다시 수정하려면 프로젝트도 저장해주세요.`,`${target.label} PNG exported. Your editable format and original stay unchanged. Save the project to edit again.`):text("PNG 이미지를 내보냈습니다. 다시 편집하려면 프로젝트도 저장해주세요."));
  }catch(e){message(target?new Error(`${target.label}${t(" 저장", " export")}: ${e instanceof Error?text(e.message):text("파일을 만들지 못했습니다.")}`):e);}finally{setBusy(false);}
 }
 const backup=()=>{download(new Blob([JSON.stringify({...latest.current,updatedAt:new Date().toISOString()},null,2)],{type:'application/json'}),'aiadcast-project.json');if(!nativeDownloads())setNotice(text("원본 사진과 편집 정보를 프로젝트 파일로 백업했습니다."));};
 async function restore(file?:File){if(!file)return;try{if(file.size>30*1024*1024)throw new Error(text("프로젝트 파일은 30 MB 이하만 지원합니다."));const p=await importProject(JSON.parse(await file.text()));if(dirty.current&&!confirm(text("저장하지 않은 편집을 닫고 프로젝트를 불러올까요?")))return;load(p);dirty.current=true;}catch(e){message(e);}}
 function point(event:PointerEvent<HTMLCanvasElement>){const bounds=event.currentTarget.getBoundingClientRect();const g=geometry(latest.current);return {x:(event.clientX-bounds.left)/bounds.width*g.width,y:(event.clientY-bounds.top)/bounds.height*g.height};}
 function pointerDown(event:PointerEvent<HTMLCanvasElement>){const p=latest.current;if(boxProjectionActive(p)||tab!=='dimensions'||!p.product||!p.dimensions.visible||!p.dimensions.lines||!activeAxes.length)return;const at=point(event),{photo}=geometry(p);const index=p.dimensions.anchors[selectedAxis].findIndex(pt=>Math.hypot(photo.x+pt.x*photo.w-at.x,photo.y+pt.y*photo.h-at.y)<45);if(index<0)return;event.currentTarget.setPointerCapture(event.pointerId);drag.current={index,axis:selectedAxis,start:p};}
 function pointerMove(event:PointerEvent<HTMLCanvasElement>){const d=drag.current;if(!d)return;const at=point(event),{photo}=geometry(latest.current);change(p=>{const points=[...p.dimensions.anchors[d.axis]] as typeof p.dimensions.anchors.width;points[d.index]={x:Math.max(0,Math.min(1,(at.x-photo.x)/photo.w)),y:Math.max(0,Math.min(1,(at.y-photo.y)/photo.h))};return {...p,dimensions:{...p.dimensions,anchors:{...p.dimensions.anchors,[d.axis]:points}}};},false);}
 function pointerEnd(){const d=drag.current;if(d)setHistory(h=>[...h.slice(-19),d.start]);drag.current=null;}
 const copy=project.copy[project.locale];
 const setCopy=(field:keyof Copy,value:string)=>change(p=>({...p,copy:{...p.copy,[p.locale]:{...p.copy[p.locale],[field]:value}}}));
 const updateDimension=(a:Axis,value:string)=>change(p=>({...p,dimensions:{...p.dimensions,[a]:value}}));
 return <>
  <header className="topbar"><a className="wordmark" href="#home" aria-label={text("aiadcast 홈")}><b>ai</b>adcast<i/></a><span className="edition">CREATIVE STUDIO</span><div className="topbar-actions"><LanguageSwitcher/><PricingDialog/><button className="library-button" onClick={openLibrary}><FolderOpen size={17}/><span>{text("저장한 작업")}</span></button></div></header>
  <main id="main" className="workspace">
   <div className="page-heading"><div><div className="eyebrow">YOUR BRAND. YOUR STORY.</div><h1>{creative?<>{text("새로운 광고를,")}<br className="mobile-only"/>{text("구상해보세요.")}</>:service?<>{text("서비스의 가치를,")}<br className="mobile-only"/>{text("분명하게 전하세요.")}</>:<>{text("상품은 그대로.")}<br className="mobile-only"/>{text("표현은 자유롭게.")}</>}</h1><p>{creative?text("사진·광고 내용으로 제작 방향을 정하세요. 규격은 필요할 때만 사용합니다."):service?text("규격 없이 사진·배경·문구로 광고를 구성하세요."):text("원본 사진을 보존하고, 필요한 부분만 수정하세요.")}</p></div><button className="new-button" onClick={()=>{if(!dirty.current||confirm(text("저장하지 않은 편집을 닫고 새 작업을 시작할까요?")))load({...newProject(),name:t('새 프로젝트','New project'),locale:language});}}><Plus size={17}/>{text("새 작업")}</button></div>
   <div className="scope-note"><ShieldCheck size={18}/><span>{text("개발 테스트 버전입니다. AI 연결 상태는 아래에서 확인하세요. 실제 결제와 자동 배경 제거는 준비 중입니다.")}</span></div>
   <button className="direction-jump" onClick={()=>document.getElementById('creative-direction')?.scrollIntoView({block:'start',behavior:'auto'})}><MessageSquare size={15}/>{text("대화로 요청·수정하기")}</button>
   <div className="studio">
    <section className="preview-section" aria-label={text("홍보 이미지 미리보기")}><div className="preview-toolbar"><span><span className="live-dot"/>{pendingCreative?text("생성 전 · 참고 사진"):text("실시간 미리보기")}</span><label className="format-label">{text("출력 비율")}<select aria-describedby="format-usage" value={project.format} onChange={e=>change(p=>({...p,format:e.target.value as Project['format']}))}>{imageFormats.map(format=><option key={format.id} value={format.id}>{format.id}</option>)}</select></label><button className="icon-button" aria-label={text("미리보기 확대")} disabled={pendingCreative} onClick={()=>{if(canvas.current){setZoom(canvas.current.toDataURL());zoomDialog.current?.showModal();}}}><Maximize2 size={17}/></button></div>
     <div className="format-info" id="format-usage"><strong>{outputFormat.id} · {text(outputFormat.use)}</strong><p>{text(outputFormat.description)}</p></div>
     <details className="format-guide"><summary>{text("광고 용도별 비율 고르기")}<span>{text("7가지 비율")}</span></summary><div className="format-options" role="group" aria-label={text("광고 이미지 비율")}>{imageFormats.map(format=><button type="button" key={format.id} aria-label={`${format.id} ${text(format.name)}`} aria-pressed={project.format===format.id} onClick={()=>change(p=>({...p,format:format.id}))}><span className="ratio-icon" aria-hidden="true"><i style={{width:format.width>=format.height?30:30*format.width/format.height,height:format.height>=format.width?30:30*format.height/format.width}}/></span><span><strong>{format.id}<small>{text(format.name)}</small></strong><em>{text(format.use)}</em><small>{format.width} × {format.height} px</small></span></button>)}</div><p>{text("용도에 맞는 비율을 선택하면 사진과 문구가 다시 배치됩니다. 실제 광고의 허용 비율과 안전 영역은 매체·노출 위치에 따라 다릅니다.")}</p></details>
     <div className="canvas-well">{pendingCreative?<div className="creative-reference">{project.product?<img src={project.product.data} alt={text("첨부한 참고 사진")}/>:<ImagePlus size={40}/>}<strong>{text("새 광고 이미지는 아직 생성되지 않았습니다.")}</strong><p>{text("사진과 광고 내용은 참고 자료로 보관합니다.")}<br/>{text("아래 AI 제작에서 연결 상태를 확인하고 새 시안을 요청하세요.")}</p></div>:<canvas ref={canvas} aria-label={text("현재 홍보 이미지")} className={tab==='dimensions'&&dimensionMode==='annotated'?'editing-anchors':''} style={{aspectRatio:`${outputFormat.width}/${outputFormat.height}`,width:`min(100%, calc(var(--preview-height) * ${outputFormat.width/outputFormat.height}))`}} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}/>}</div>
     <div className="preview-foot"><span><ShieldCheck size={14}/>{creative?text("창작 모드 · 설정 저장 가능"):project.product?(boxProjectionReady(project)?t('원본 면 · 규격 박스 구성','Source faces · dimensioned box'):text("원본 사진 사용")):service?text("문구·배경으로 구성"):text("상품 사진을 추가해주세요")}</span><span>{outputFormat.width} × {outputFormat.height} px</span></div>
    </section>
    <section className="editor" aria-label={text("이미지 편집 도구")}>
     <div className="project-name"><label htmlFor="project-name">{text("프로젝트 이름")}</label><input id="project-name" value={project.name} maxLength={80} onChange={e=>change(p=>({...p,name:e.target.value}))}/><button aria-label={text("되돌리기")} className="icon-button" disabled={!history.length} onClick={()=>{const last=history.at(-1);if(last){setProject(last);latest.current=last;setHistory(history.slice(0,-1));dirty.current=true;setNotice(text("이전 편집으로 되돌렸습니다."));}}}><RotateCcw size={17}/></button></div>
     <div className="editor-tabs" role="group" aria-label={text("편집할 요소")}>{tabs.map(([id,title],i)=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}><span>0{i+1}</span>{text(title)}</button>)}</div>
     <div className="editor-body">
      {tab==='product'&&<><div className="panel-heading"><h2>{text("광고 대상과 제작 방식")}</h2><span>01 / AD CONTENT</span></div><p className="help">{text("상품과 서비스 모두 광고할 수 있습니다. 업종과 제작 방식을 선택하세요.")}</p>
       <IndustryPicker compact value={profile.category} onChange={category=>change(p=>withCategory(p,category))}/>
       <label className="check-field"><input type="checkbox" aria-label={text("규격 정보 사용")} checked={activeAxes.length>0} onChange={e=>change(p=>({...p,productProfile:{...p.productProfile,specType:e.target.checked?'rectangular':'none'},dimensions:e.target.checked?p.dimensions:{...p.dimensions,visible:false,lines:false}}))}/>{text("규격 정보 사용")}<span className="optional-tag">{text("선택")}</span></label>
       <p className="help small">{activeAxes.length?text("입력한 치수를 생성 참고값으로 사용합니다. 규격 탭에서 표시 여부를 별도로 선택하세요."):text("규격 없이 만드는 광고입니다. 치수 입력·규격 표·치수선이 필요하지 않습니다.")}</p><fieldset className="dimension-display generation-display"><legend>{text("이미지 제작 방식")}</legend>{([
       ['original',text("사진과 문구로 직접 만들기"),text("첨부 사진을 그대로 유지하며 배경·문구를 편집합니다. 서비스 광고는 사진 없이도 구성할 수 있습니다.")],
       ['creative',text("새로운 광고 이미지 만들기"),text("사진과 광고 내용을 참고해 새로운 이미지를 구상합니다. 규격은 선택 사항이며 원본과 다르게 표현될 수 있습니다.")],
      ] as const).map(([mode,title,description])=><label key={mode} className={generation.mode===mode?'selected':''}><input type="radio" name="generation-mode" aria-label={title} checked={generation.mode===mode} onChange={()=>change(p=>({...p,generation:{...(p.generation??defaultGeneration()),mode}}))}/><span><strong>{title}{mode==='original'&&<em>{text("기본")}</em>}</strong><small>{description}</small></span></label>)}</fieldset>
      {creative&&<div className="creative-note"><strong>{text("새 광고 이미지를 구상하는 모드입니다.")}</strong><p>{text("원본 사진과 다른 장면·상품으로 표현될 수 있습니다. AI 제작에서 연결 상태와 요청 범위를 확인하세요.")}</p><label className="field">{text("원하는 광고 이미지")}<textarea aria-label={text("원하는 광고 이미지")} rows={3} maxLength={600} value={generation.brief} placeholder={service?text("예: 성인 영어 회화 수업을 알리는 차분한 교실 분위기"):text("예: 참고 사진을 활용한 신차 출시 광고. 규격이 있다면 함께 참고")} onChange={e=>change(p=>({...p,generation:{...(p.generation??defaultGeneration()),brief:e.target.value}}))}/></label><p>{activeAxes.length?text("표시를 꺼도 입력한 치수는 생성 참고값으로 저장합니다."):text("규격을 사용하지 않으므로 치수 없이 광고 내용과 사진으로 제작 방향을 정합니다.")}</p>{activeAxes.length>0&&<button type="button" className="next-panel" onClick={()=>setTab('dimensions')}>{text("참고할 규격 입력하기")}<ChevronRight size={17}/></button>}{generationIssues(project).map(issue=><p className="generation-issue" key={issue}>{text(issue)}</p>)}</div>}
      <label className="upload-zone"><input type="file" aria-label={service?text("광고 사진 추가"):text("상품 사진 추가")} accept="image/png,image/jpeg,image/webp" onChange={e=>{void upload(e.target.files?.[0],'product');e.target.value='';}}/>{project.product?<><img src={project.product.data} alt={text("업로드한 원본 사진")}/><span className="upload-file">{project.product.name}</span><small>{text("눌러서 다른 사진 선택")}</small></>:<><ImagePlus size={34} strokeWidth={1.3}/><strong>{service?text("광고 사진 추가 (선택)"):text("상품 사진 추가")}</strong><small>{text("PNG · JPG · WebP / 최대 10 MB")}</small></>}</label>
       {project.product&&<button className="remove-photo" type="button" onClick={()=>{uploadSequence.current.product++;change(p=>({...p,product:null}));}}>{text("첨부 사진 제거")}</button>}
       {service&&<p className="help small">{text("교실·매장·상담 장면이나 로고를 사용할 수 있습니다. 사진 없이 문구와 배경만으로도 광고를 구성할 수 있습니다.")}</p>}
       {!creative&&project.product&&!boxProjectionActive(project)&&<><div className="preserve-note"><ShieldCheck size={18}/><p><strong>{text("원본 사진 보존")}</strong>{text("사진을 다시 그리지 않습니다. 사진의 비율과 인쇄 내용을 유지합니다.")}</p></div><p className="help small">{text("사진 자체의 배경도 함께 표시됩니다. 배경 없는 상품은 투명 PNG를 사용해주세요.")}</p></>}
       <label className="field">{text("상품·서비스명")}<input value={project.productName} maxLength={100} placeholder={text("예: 신차, 영어 회화 수업, 보험 상담, 청소 서비스")} onChange={e=>change(p=>({...p,productName:e.target.value}))}/></label>
       <label className="field">{service?text("서비스 내용"):text("소재·제품 정보")}<input value={profile.material} maxLength={160} placeholder={service?text("예: 수업 내용, 상담 주제, 제공하는 서비스"):text("예: 스테인리스, 면, 유리 또는 차량 정보")} onChange={e=>change(p=>({...p,productProfile:{...(p.productProfile??defaultProfile()),material:e.target.value}}))}/></label><p className="help small">{text("광고 대상의 정보를 저장합니다. 가격·조건·혜택 등 공개할 내용은 문구·언어 탭에 직접 입력하세요.")}</p>
       <label className="field range-label" hidden={creative||!project.product}>{text("사진 크기")}<span>{Math.round(project.scale*100)}%</span><input aria-label={text("사진 크기")} type="range" min="0.5" max="1" step="0.01" value={project.scale} onChange={e=>change(p=>({...p,scale:Number(e.target.value)}))}/></label>
       <CreativeOptions compact project={project} change={change}/><CampaignFields project={project} change={change}/><button className="next-panel" onClick={()=>setTab('copy')}>{text("문구 편집하기")}<ChevronRight size={17}/></button></>}
      {tab==='copy'&&<><div className="panel-heading"><h2>{text("문구와 언어")}</h2><span>02 / COPY</span></div><p className="help">{text("언어별 문구를 따로 편집·저장합니다. 아래 초기 문구는 예시이며 자동 번역되지 않습니다.")}</p><div className="language-options" role="group" aria-label={text("콘텐츠 언어")}>{(['ko','en'] as Locale[]).map(lang=><button key={lang} aria-pressed={project.locale===lang} onClick={()=>change(p=>({...p,locale:lang}))}>{lang==='ko'?text("한국어"):'English'}</button>)}</div>
       <label className="field">{text("홍보 제목")}<textarea rows={3} maxLength={180} value={copy.title} onChange={e=>setCopy('title',e.target.value)}/></label><label className="field">{text("광고 설명")}<textarea rows={3} maxLength={240} value={copy.description} onChange={e=>setCopy('description',e.target.value)}/></label>
       <label className="field">{text("회사명")}<input maxLength={80} value={copy.company} onChange={e=>setCopy('company',e.target.value)}/></label><label className="field">{text("연락처")}<input maxLength={60} value={copy.contact} placeholder="010-0000-0000" onChange={e=>setCopy('contact',e.target.value)}/></label><label className="field">{text("이메일 또는 홈페이지")}<input maxLength={100} value={copy.website} placeholder="hello@example.com" onChange={e=>setCopy('website',e.target.value)}/></label><p className="help small">{text("확정한 문구를 실제 글꼴로 출력합니다. 원본 상품 사진 안에 인쇄된 글자는 그대로 유지됩니다.")}</p><CopyAssistant key={project.id} project={project} change={change}/></>}
      {tab==='background'&&<><div className="panel-heading"><h2>{text("배경만 바꾸기")}</h2><span>03 / BACKGROUND</span></div><p className="help">{text("상품 사진과 문구를 유지하며 배경을 교체합니다.")}</p><div className="swatches">{presets.map(([name,color,ink])=><button key={name} aria-pressed={project.background.color===color&&!project.background.image} onClick={()=>change(p=>({...p,background:{color,image:null},ink}))}><span style={{background:color}}/>{text(name)}</button>)}</div><label className="field color-field">{text("배경색")}<input type="color" value={project.background.color} onChange={e=>change(p=>({...p,background:{color:e.target.value,image:null}}))}/></label><label className="field">{text("글자색")}<select value={project.ink} onChange={e=>change(p=>({...p,ink:e.target.value as Project['ink']}))}><option value="dark">{text("짙은 색")}</option><option value="light">{text("흰색")}</option></select></label><label className="upload-zone compact"><input type="file" aria-label={text("배경 사진 추가")} accept="image/png,image/jpeg,image/webp" onChange={e=>{void upload(e.target.files?.[0],'background');e.target.value='';}}/><Upload size={24}/><strong>{text("배경 사진 가져오기")}</strong><small>{text("PNG · JPG · WebP / 최대 10 MB")}</small></label>{project.background.image&&<div className="file-row"><span>{project.background.image.name}</span><button onClick={()=>change(p=>({...p,background:{...p.background,image:null}}))}>{text("배경 사진 제거")}</button></div>}<p className="help small">{text("배경 위에서 글자가 잘 읽히는지 확인해주세요. 아래 AI 제작에서 배경 생성을 요청할 수 있습니다. 원본에 포함된 배경은 자동으로 제거되지 않습니다.")}</p></>}
      {tab==='dimensions'&&<><div className="panel-heading"><h2>{text("정확한 규격 표시")}</h2><span>04 / DIMENSIONS</span></div><fieldset className="dimension-display"><legend>{text("이미지에 규격을 표시할까요?")}</legend>{([
        ['none',text("표시 안 함"),text("상품 사진과 홍보 문구만 보여줍니다.")],
        ['summary',text("규격 요약만"),text("입력한 치수를 텍스트로 표시합니다.")],
        ['annotated',text("요약과 치수선"),text("규격 요약과 사진 위 치수선을 함께 표시합니다.")],
       ] as const).map(([mode,title,description])=><label key={mode} className={dimensionMode===mode?'selected':''}><input type="radio" name="dimension-display" aria-label={title} checked={dimensionMode===mode} disabled={mode!=='none'&&!activeAxes.length} onChange={()=>change(p=>({...p,dimensions:{...p.dimensions,visible:mode!=='none',lines:mode==='annotated'}}))}/><span><strong>{title}</strong><small>{description}</small></span></label>)}</fieldset><p className="help small">{text("표시를 꺼도 입력한 규격은 보관됩니다. 이미지 생성 없이 언제든 표시 방식을 바꿀 수 있습니다. 원본 사진이나 홍보 문구에 직접 적힌 숫자는 그대로 유지됩니다.")}</p><label className="field">{text("규격 형식")}<select value={profile.specType} onChange={e=>{const type=e.target.value as SpecType;change(p=>({...p,productProfile:{...(p.productProfile??defaultProfile()),specType:type},dimensions:type==='none'?{...p.dimensions,visible:false,lines:false}:p.dimensions}));}}>{specTypes.map(([value,name])=><option key={value} value={value}>{text(name)}</option>)}</select></label><p className="help small">{text("병·용기는 지름과 높이, 평면 상품은 가로와 세로를 선택하세요. 자동차·교육·보험·서비스 등 규격이 필요 없는 광고는 ‘규격 정보 없음’을 선택하세요.")}</p>
       <div className="dimension-inputs">{activeAxes.map(a=><label className="field" key={a}>{axisLabel(a,language,profile)}<div className="unit-input"><input aria-label={axisLabel(a,language,profile)+' mm'} inputMode="decimal" value={project.dimensions[a]} maxLength={12} onChange={e=>updateDimension(a,e.target.value)}/><span>mm</span></div></label>)}</div>{activeAxes.length>0&&<p className="help">{boxProjectionActive(project)?t('치수선은 입력 규격의 박스 변에 자동 연결됩니다. 실물 치수의 측정·인증 결과는 아닙니다.','Dimension lines follow the calculated box edges. They are not a physical measurement or certification.'):text("치수선은 입력값을 표시합니다. 사진을 측정하거나 상품의 입체 형상을 바꾸는 기능은 아닙니다.")}</p>}
       {!boxProjectionActive(project)&&project.dimensions.lines&&project.dimensions.visible&&activeAxes.length>0&&<><div className="axis-options" role="group" aria-label={text("편집할 치수선")}>{activeAxes.map(a=><button key={a} aria-pressed={selectedAxis===a} onClick={()=>setAxis(a)}>{axisLabel(a,language,profile)}</button>)}</div><p className="help small">{text("미리보기의 주황색 점 두 개를 움직여 해당 변에 맞추세요. 아래 좌표로도 조정할 수 있습니다.")}</p>{project.dimensions.anchors[selectedAxis].map((pt,index)=><div className="anchor-controls" key={index}><span>{index===0?text("시작점"):text("끝점")}</span>{(['x','y'] as const).map(coordinate=><label key={coordinate}>{coordinate.toUpperCase()}<input aria-label={`${index===0?text("시작점"):text("끝점")} ${coordinate.toUpperCase()}`} type="range" min="0" max="1" step="0.01" value={pt[coordinate]} onChange={e=>change(p=>{const points=[...p.dimensions.anchors[selectedAxis]] as typeof p.dimensions.anchors.width;points[index]={...points[index],[coordinate]:Number(e.target.value)};return {...p,dimensions:{...p.dimensions,anchors:{...p.dimensions.anchors,[selectedAxis]:points}}};})}/></label>)}</div>)}</>}
       <BoxProjectionPanel project={project} change={change}/><BoxGeometryPreview project={project}/>{!boxProjectionActive(project)&&<ReferenceInspector project={project} change={change}/>}<div className="preserve-note"><Layers size={18}/><p><strong>{text("같은 데이터로 일관되게")}</strong>{text("규격 요약과 치수선이 같은 숫자를 사용합니다. 출력 비율을 바꿔도 입력값은 유지됩니다.")}</p></div></>}
     </div>
     <div className="editor-actions"><button className="save-button" disabled={busy} onClick={()=>void save()}><Save size={17}/>{text("이 기기에 저장")}</button><button className="export-button" disabled={busy||pendingCreative} onClick={()=>void exportPng()}><ArrowDownToLine size={17}/>{busy?text("처리 중…"):pendingCreative?text("AI 시안 확인 후 저장"):text("PNG 내보내기")}</button></div>
    </section>
   </div>
   {(error||layoutErrors.length>0)&&<div role="alert" className="feedback error">{error?text(error):layoutErrors.map(text).join(' ')}</div>}
   <div role="status" className={notice?'feedback success':'status-empty'}>{notice&&<><Check size={16}/>{text(notice)}</>}</div>
   <InstagramExports disabled={busy||pendingCreative} pendingGeneration={pendingCreative} onExport={target=>void exportPng(target)}/>
   <GenerationPanel key={`generation-${project.id}`} project={project} change={change}/>
   <CreativeDirector key={`creative-${project.id}`} project={project} change={change}/>
   <CampaignPanel project={project} change={change} message={setNotice}/>
   <div className="backup-strip"><div><strong>{text("이전 광고, 필요한 부분만 다시 수정하세요.")}</strong><p>{text("저장한 작업이나 프로젝트 백업 파일을 열면 문구·배경·규격을 따로 수정할 수 있습니다. PNG·JPG만 있는 광고의 글자와 배경은 자동으로 분리되지 않으니, 프로젝트도 함께 보관하세요.")}</p></div><div><button onClick={backup}><ArrowDownToLine size={16}/>{text("프로젝트 백업")}</button><button onClick={()=>projectFile.current?.click()}><FolderOpen size={16}/>{text("파일 불러오기")}</button><input ref={projectFile} type="file" accept="application/json,.json" aria-label={text("프로젝트 파일 선택")} className="sr-only" onChange={e=>{void restore(e.target.files?.[0]);e.target.value='';}}/></div></div>
   <footer><span>aiadcast <span>by selluplabs</span></span><p>{text("직접 편집은 기기에서 처리합니다. AI 기능을 요청할 때 해당 입력이 서버로 전송됩니다. 기기 저장 데이터는 브라우저 데이터를 지우면 삭제될 수 있습니다.")}</p></footer>
  </main>
  <dialog ref={library} className="library-dialog"><div className="dialog-head"><h2>{text("저장한 작업")}</h2><button className="icon-button" aria-label={text("저장한 작업 닫기")} onClick={()=>library.current?.close()}><X/></button></div><p className="help">{text("이 브라우저에 저장된 프로젝트입니다.")}</p>{saved.length===0?<div className="empty-library"><FolderOpen size={36}/><p>{text("아직 저장한 작업이 없습니다.")}</p></div>:saved.map(p=><button className="saved-project" key={p.id} onClick={()=>{if(!dirty.current||confirm(text("저장하지 않은 편집을 닫고 선택한 작업을 열까요?")))load(p);}}>{p.product?<img src={p.product.data} alt=""/>:<Layers size={24}/>}<span><strong>{p.name||text("이름 없는 작업")}</strong><small>{new Date(p.updatedAt).toLocaleString(language==='ko'?'ko-KR':'en-US')} · {p.format}</small></span><ChevronRight size={18}/></button>)}</dialog>
  <dialog ref={zoomDialog} className="zoom-dialog"><button onClick={()=>zoomDialog.current?.close()}><ArrowLeft size={18}/>{text("편집기로 돌아가기")}</button>{zoom&&<img src={zoom} alt={text("홍보 이미지 확대 미리보기")}/>}</dialog>
 </>;
}
