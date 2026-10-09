import {useState} from 'react';
import {ArrowLeft,ArrowRight,Check,ImagePlus} from 'lucide-react';
import {imageFile,newProject} from './model';
import type {Project} from './model';
import {axisLabel,dimensionAxes,isServiceCategory,specTypes,withCategory} from './product';
import type {ProductCategory,SpecType} from './product';
import {defaultCampaign} from './campaign';
import {CampaignFields} from './CampaignPanel';
import {generationIssues} from './generation';
import {imageFormats} from './formats';
import {IndustryPicker} from './IndustryPicker';
import {industryLabel,industryPlaceholder} from './industry';
import type {IndustryKind} from './industry';
import {CreativeOptions} from './CreativeOptions';
import {defaultCreative,creativeCopy} from './creative';
export function starterProject(category:ProductCategory='other'):Project{
 const p=withCategory(newProject(),category);return {...p,name:'',background:{...p.background,color:'#f8f7f4'},productProfile:{...p.productProfile,specType:'none'},dimensions:{...p.dimensions,width:'',depth:'',height:'',visible:false,lines:false},campaign:{...defaultCampaign(),creative:defaultCreative()},copy:{ko:{...p.copy.ko,company:''},en:{...p.copy.en,company:''}}};
}
export function CreateCampaign({initialKind,onReady}:{initialKind?:IndustryKind;onReady:(p:Project)=>Promise<void>}){
 const [project,setProject]=useState(()=>starterProject(initialKind==='service'?'services':'other'));
 const [selectedCategory,setSelectedCategory]=useState<ProductCategory>();
 const [step,setStep]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const service=isServiceCategory(project.productProfile.category);const axes=dimensionAxes(project.productProfile);
 function change(fn:(p:Project)=>Project){setProject(fn);setError('');}
 async function addPhoto(file?:File){if(!file)return;setBusy(true);try{const asset=await imageFile(file);change(p=>({...p,product:asset}));}catch(e){setError(e instanceof Error?e.message:'사진을 다시 확인해주세요.');}finally{setBusy(false);}}
 async function next(){
  if(step===0&&!selectedCategory){setError('광고할 상품 또는 서비스 분야를 선택해주세요.');return;}
  if(step===0&&!project.productName.trim()){setError('상품 또는 서비스 이름을 입력해주세요.');return;}
  if(step===1){const issues=generationIssues(project);if(issues.length){setError(issues.join(' '));return;}}
  if(step<2){setStep(step+1);setError('');window.scrollTo(0,0);return;}
  setBusy(true);try{await onReady({...project,name:project.productName+' 광고',updatedAt:new Date().toISOString(),copy:{...project.copy,ko:{...project.copy.ko,...creativeCopy({...project,locale:'ko'})}}});}catch{setError('이 기기에 저장하지 못했습니다. 저장 공간과 브라우저 설정을 확인해주세요. 입력 내용은 이 화면에 유지됩니다.');}finally{setBusy(false);}
 }
 return <div className="create-page"><div className="section-label"><span>CREATE A CAMPAIGN</span><span>처음부터, 간결하게.</span></div><ol className="create-steps">{['업종과 브랜드','사진과 정보','광고 방향'].map((s,i)=><li key={s} aria-current={step===i?'step':undefined} className={i<=step?'current':''}><span>{i<step?<Check size={14}/>:i+1}</span>{s}</li>)}</ol>
  <div className="create-heading"><span>0{step+1} / 03</span><h1>{['무엇을 알리고 싶으세요?','광고의 기준이 될 정보.','어떤 모습으로 보여줄까요?'][step]}</h1><p>{['상품부터 서비스까지, 당신의 비즈니스를 선택하세요.','실제 사진과 확인된 정보를 바탕으로 광고를 준비합니다.','방향과 분위기를 고르면 광고 초안을 준비합니다. 추가 요청은 선택이에요.'][step]}</p></div>
  <div className="create-card">
   {step===0&&<><IndustryPicker value={selectedCategory} initialKind={initialKind} onClearSelection={()=>{setSelectedCategory(undefined);setError('');}} onChange={category=>{setSelectedCategory(category);change(p=>withCategory(p,category));}}/>{selectedCategory&&<><label className="field">상품·서비스 이름<input autoComplete="off" value={project.productName} maxLength={60} placeholder={industryPlaceholder(project.productProfile.category)} onChange={e=>change(p=>({...p,productName:e.target.value}))}/></label><label className="field">브랜드·회사명 <span className="optional-tag">선택</span><input value={project.copy.ko.company} maxLength={60} placeholder="광고에 표시할 이름" onChange={e=>change(p=>({...p,copy:{ko:{...p.copy.ko,company:e.target.value},en:{...p.copy.en,company:e.target.value}}}))}/></label><CampaignFields project={project} change={change}/></>}</>}
   {step===1&&<><label className="upload-zone wizard-upload"><input type="file" aria-label="제작용 사진 추가" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{void addPhoto(e.target.files?.[0]);e.target.value='';}}/>{project.product?<><img src={project.product.data} alt="선택한 원본 사진"/><strong>{project.product.name}</strong><small>눌러서 다른 사진으로 변경</small></>:<><ImagePlus size={32}/><strong>{service?'사진이나 로고 추가 (선택)':'실제 상품 사진 추가'}</strong><small>PNG · JPG · WebP / 최대 10 MB</small></>}</label><p className="help">{service?'사진 없이 문구와 배경만으로도 시작할 수 있습니다.':'사진의 형태와 인쇄는 유지됩니다. 상품만 합성하려면 배경이 투명한 PNG를 사용하세요.'}</p><label className="field">{service?'서비스 소개':'소재·상품 특징'}<textarea value={project.productProfile.material} maxLength={160} rows={3} placeholder="고객에게 알리고 싶은 사실을 입력하세요." onChange={e=>change(p=>({...p,productProfile:{...p.productProfile,material:e.target.value}}))}/></label><label className="check-field"><input type="checkbox" checked={!!axes.length} onChange={e=>change(p=>({...p,productProfile:{...p.productProfile,specType:e.target.checked?'rectangular':'none'},dimensions:{...p.dimensions,visible:e.target.checked,lines:false}}))}/>규격 정보 사용 <span className="optional-tag">선택</span></label>{!!axes.length&&<><label className="field">규격 형식<select aria-label="규격 형식" value={project.productProfile.specType} onChange={e=>change(p=>({...p,productProfile:{...p.productProfile,specType:e.target.value as SpecType},dimensions:e.target.value==='none'?{...p.dimensions,visible:false,lines:false}:p.dimensions}))}>{specTypes.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><div className="dimension-inputs">{axes.map(axis=><label className="field" key={axis}>{axisLabel(axis,'ko',project.productProfile)} (mm)<input inputMode="decimal" maxLength={12} value={project.dimensions[axis]} onChange={e=>change(p=>({...p,dimensions:{...p.dimensions,[axis]:e.target.value}}))}/></label>)}</div><label className="check-field"><input type="checkbox" checked={project.dimensions.visible} onChange={e=>change(p=>({...p,dimensions:{...p.dimensions,visible:e.target.checked}}))}/>광고에 규격 표시</label></>}<label className="field">제작 방식<select aria-label="제작 방식" value={project.generation.mode} onChange={e=>change(p=>({...p,generation:{...p.generation,mode:e.target.value as 'original'|'creative'}}))}><option value="original">원본 사진과 문구로 직접 제작</option><option value="creative">참고 자료로 새 광고 구상 (AI 연결 전)</option></select></label>{project.generation.mode==='creative'&&<p className="help">다음 단계에서 추천 방향과 분위기를 고르세요. 별도로 요청 문장을 작성하지 않아도 됩니다.</p>}</>}
   {step===2&&<><CreativeOptions project={project} change={change}/><details className="wizard-format-details"><summary>사용할 이미지 비율 <strong>{project.format}</strong></summary><fieldset className="wizard-formats"><legend>광고 이미지 비율</legend>{imageFormats.map(format=><button key={format.id} aria-pressed={project.format===format.id} onClick={()=>change(p=>({...p,format:format.id}))}><strong>{format.id}</strong><span>{format.use}</span><small>{format.width} × {format.height}</small></button>)}</fieldset></details><div className="wizard-summary"><span>{project.productName}</span><p>{industryLabel(project.productProfile.category)} · {axes.length?'규격 사용':'규격 없음'} · {project.generation.mode==='original'?'직접 편집':'창작 요청 준비'}</p></div><p className="help">편집 시작 시 추천 문구와 선택한 색상을 적용한 초안을 저장합니다. AI 사진·장면 생성은 연결 전입니다.</p></>}
  </div>{error&&<p className="wizard-error" role="alert">{error}</p>}<div className="wizard-actions"><button disabled={step===0||busy} onClick={()=>{setStep(step-1);setError('');window.scrollTo(0,0);}}><ArrowLeft size={17}/>이전</button><button className="primary-action" disabled={busy} onClick={()=>void next()}>{busy?'준비 중…':step===2?'편집 시작':'다음'}<ArrowRight size={17}/></button></div>
 </div>;
}
