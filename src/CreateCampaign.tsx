import {CarouselEditor} from './CarouselEditor';
import {planCarousel} from './carousel-planner';
import {validStoryPlan,isCarouselCount,carouselCounts,carouselCount,carouselFormat} from './story-carousel';
import {BatchConfirmation} from './BatchConfirmation';
import {batchPrice,type BatchPrice} from './batch-price';
import {imageCredits} from './pricing';
import {offlineDemo} from './demo-mode';
import './ad-batch.css';
import {imageCounts} from './result-set';
import './result-set.css';
import {apiRequest,type ApiStatus} from './generation-client';
import {DimensionDisplayChoice} from './DimensionDisplayChoice';
import {isTextExample} from './generation-input';
import {InputExampleGuide} from './InputExampleGuide';
import {AdFieldPicker} from './AdFieldPicker';
import {RegulatoryNotice,useRegulatoryCheck} from './RegulatoryNotice';
import {DimensionControlChoice} from './DimensionControlChoice';
import type {WizardDraft} from './workspace-draft';
import {DimensionInputs} from './DimensionInputs';
import {useUiLanguage} from './ui-language';
import {useId,useState,useLayoutEffect,useRef,useEffect} from 'react';
import {Sparkles} from 'lucide-react';
import type {Project,FooterField} from './model';
import {dimensionAxes,isServiceCategory,restoreDraftProfile} from './product';
import type {SpecType} from './product';
import {newGenerationIssues,photoGenerationDraft} from './generation';
import {imageFormats} from './formats';

import {industryKindFor,type IndustryKind} from './industry';
import {campaignFieldExamples} from './campaign-field-examples';
import {creativeSettings,withCreative} from './creative';
import {ReferencePhotos} from './ReferencePhotos';
import {PhotoUsage} from './PhotoUsage';
import {betaSession} from './beta-session';
import './create-campaign.css';

export {starterProject,prepareCampaign} from './consumer-campaign';
import {starterProject,prepareCampaign,automaticDimensionDraft} from './consumer-campaign';
export function CreateCampaign({initialKind,onReady,onNew,draft,onDraft,active=true}:{onNew?:()=>void;active?:boolean;initialKind?:IndustryKind;onReady:(p:Project,price?:BatchPrice)=>Promise<void>;draft?:WizardDraft;onDraft?:(draft:WizardDraft)=>void}){
 const {language,t,text}=useUiLanguage(),id=useId();
 const [project,setProject]=useState(()=>{
  const input=draft ? {...draft.project,productProfile:restoreDraftProfile(draft.project.productProfile)}
    : {...starterProject(initialKind==='service'?'services':'other'),locale:language};
  return automaticDimensionDraft(photoGenerationDraft(input));
 });
 const submitting=useRef(false),photoImporting=useRef(false);
 const [confirmation,setConfirmation]=useState<{project:Project;price:BatchPrice;token:string|undefined}>();
 const live=useRef(active);live.current=active;
 useEffect(()=>{setConfirmation(undefined);},[active,betaSession()?.token]);
 const [creditStatus,setCreditStatus]=useState<ApiStatus|null>(null),sessionToken=betaSession()?.token;
 useEffect(()=>{if(!active){setCreditStatus(null);return;}let live=true;const controller=new AbortController();apiRequest<ApiStatus>('/api/status',undefined,controller.signal).then(s=>{if(live)setCreditStatus(s);}).catch(()=>{if(live)setCreditStatus(null);});return()=>{live=false;controller.abort();};},[sessionToken,active]);
 const [chosen,setChosen]=useState(draft?.industryChosen ?? !!draft),[error,setError]=useState(''),[submittingBusy,setSubmittingBusy]=useState(false),[photosBusy,setPhotosBusy]=useState(false),[photoImportIssue,setPhotoImportIssue]=useState('');
 const [kind,setKind]=useState<IndustryKind|undefined>(() => {
  if (draft?.industryKind) return draft.industryKind;
  if (!chosen) return initialKind;
  return industryKindFor(project.productProfile.category);
 });
 const busy=submittingBusy||photosBusy;
 // 법규 안내: 규제 업종이면 안내를 확인하기 전까지 광고 생성을 막습니다.
 const noticeContext=project.productProfile.industryDetail ? '업종: '+project.productProfile.industryDetail : project.productProfile.material;
 const [regulatoryOk,confirmRegulatory]=useRegulatoryCheck(project.productProfile.category,noticeContext);
 useLayoutEffect(()=>{onDraft?.({project,step:0,industryChosen:chosen,industryKind:kind});},[project,chosen,kind,onDraft]);
 const example=isTextExample(project);
 const service=kind ? kind==='service' : isServiceCategory(project.productProfile.category);
 const examples=campaignFieldExamples[language][service?'service':'product'];
 const axes=dimensionAxes(project.productProfile),settings=creativeSettings(project),copy=project.copy[project.locale];
 const carousel=!!project.storyCarousel&&!project.dimensionControl&&!offlineDemo();
 const selectedCount=carousel?(isCarouselCount(project.requestedImageCount)?project.requestedImageCount:carouselCount):(project.requestedImageCount??1);
 const previewPrice=(()=>{try{return creditStatus?batchPrice(creditStatus.wallet,selectedCount):undefined;}catch{return undefined;}})();
 const copyMode=carousel?'ai':settings.copyMode??'ai';
 const aiDimensionChoice=!project.dimensionControl&&project.generation.mode==='creative';
 const dimensionsVisible=aiDimensionChoice?(project.dimensionAnnotation?.mode??'none')!=='none':project.dimensions.visible;
 function change(fn:(p:Project)=>Project){if(submitting.current)return;setProject(fn);setConfirmation(undefined);setError('');}
 function photoBusyChanged(value:boolean){photoImporting.current=value;setPhotosBusy(value);}
 function setCopy(field:'title'|'description'|FooterField,value:string){change(p=>({...p,copy:{...p.copy,[p.locale]:{...p.copy[p.locale],[field]:value}}}));}
 function setDimensionUse(on:boolean){
  change(p=>{
   if((dimensionAxes(p.productProfile).length>0)===on)return p;
   const ai=p.generation.mode==='creative',visible=on&&!isTextExample(p);
   return {...p,productProfile:{...p.productProfile,specType:on?'rectangular':'none'},generation:{...p.generation,dimensionBased:false,planarSourceHash:undefined},dimensions:{...p.dimensions,visible,lines:ai&&visible},...(!on?{dimensionControl:undefined}:{}),...(ai?{dimensionAnnotation:{method:'ai' as const,mode:visible?'main' as const:'none' as const,snapshot:''}}:!on&&p.dimensionAnnotation?{dimensionAnnotation:{...p.dimensionAnnotation,mode:'none' as const}}:{})};
  });
 }
 function setDimensionVisibility(visible:boolean){
  change(p=>{
   if(p.generation.mode!=='creative')return {...p,dimensions:{...p.dimensions,visible}};
   const mode=visible?(p.dimensionAnnotation?.mode==='inset'?'inset':'main'):'none';
   return {...p,dimensionAnnotation:{method:'ai',mode,snapshot:''},dimensions:{...p.dimensions,visible,lines:visible}};
  });
 }
 async function submit(){
  if(!active||submitting.current||photoImporting.current||busy)return;
  if(!chosen){setError(t('광고 분야를 선택해주세요.','Choose your industry.'));document.getElementById(id+'-industry')?.focus();return;}
  if(!regulatoryOk){setError(t('1번 광고 분야의 법규 안내를 확인해주세요.','Review the industry notice in step 1.'));return;}
  if((!carousel&&!project.productName.trim())||!project.productProfile.material.trim()){setError(carousel?t('원하는 광고를 한 줄로 입력해주세요.','Describe your ad in one line.'):t('상품·서비스 이름과 상세설명을 입력해주세요.','Enter the name and description.'));document.getElementById(id+(!carousel&&!project.productName.trim()?'-name':'-description'))?.focus();return;}
  if(copyMode==='manual'&&!copy.title.trim()){setError(t('직접 사용할 광고 제목을 입력해주세요.','Enter your advertising headline.'));document.getElementById(id+'-headline')?.focus();return;}
  const input:Project=carousel?{...project,productName:project.productName.trim()||project.productProfile.material.trim().slice(0,60),format:carouselFormat,requestedImageCount:selectedCount,storyPlan:undefined}:{...project,storyCarousel:undefined,storyPlan:undefined};
  const prepared=prepareCampaign(photoGenerationDraft(withCreative(input,{copyMode}))),issues=newGenerationIssues(prepared);
  if(issues.length){setError(!prepared.product&&photoImportIssue?photoImportIssue:issues.map(text).join(' '));if(!prepared.product)document.getElementById(id+'-photos')?.focus();return;}
  submitting.current=true;setSubmittingBusy(true);setError('');
  const token=betaSession()?.token;
  try{
   if(prepared.dimensionControl||offlineDemo()){await onReady(prepared);return;}
   const status=await apiRequest<ApiStatus>('/api/status');
   if(token!==betaSession()?.token||!live.current)return;
   if(status.generation.batchVersion!==1)throw Error('BATCH_UNAVAILABLE');
   if(!status.generation.enabled&&status.generation.reason!=='NO_TEST_CREDITS')throw Error(status.generation.reason??'GENERATION_DISABLED');
   setCreditStatus(status);
   const price=batchPrice(status.wallet,prepared.requestedImageCount??1);
   if(carousel&&price.creditsAfter<0){setConfirmation({project:prepared,price,token});return;}
   if(carousel&&status.assistant?.available===false)throw Error(status.assistant.reason??'ASSISTANT_DISABLED');
   const storyPlan=carousel?await planCarousel(prepared):undefined;
   if(token!==betaSession()?.token||!live.current)return;
   setConfirmation({project:{...prepared,...(storyPlan?{storyPlan}:{})},price,token});
  }catch(e){showError(e);}finally{submitting.current=false;setSubmittingBusy(false);}
 }
 function showError(e:unknown){
  const code=e instanceof Error?e.message:'';
  const message:Record<string,[string,string]>={
   BUDGET_NOT_AVAILABLE:['생성 예산이 부족합니다. 관리자에게 확인해주세요. 추가 결제로 해결되지 않습니다.','Generation budget is unavailable. Contact your administrator.'],
   CREDIT_QUOTE_CHANGED:['잔액이 변경되었습니다. 광고 생성을 다시 눌러 최신 금액을 확인해주세요.','Your balance changed. Check the updated amount before generating.'],
   GENERATION_ALREADY_RUNNING:['다른 광고를 생성 중입니다. 완료 후 다시 시도해주세요.','Another generation is running. Try again when it finishes.'],
   STORAGE_CAPACITY_UNAVAILABLE:['이미지를 저장할 서버 공간이 부족합니다. 관리자에게 문의해주세요.','Server storage is full. Contact your administrator.'],
   NO_TEST_CREDITS:['잔여 크레딧이 부족합니다.','Insufficient credits.'],
   ASSISTANT_DISABLED:['캐러셀 구성 기능을 준비 중입니다. 관리자에게 문의해주세요.','Carousel planning is not available yet. Contact your administrator.'],
   PROVIDER_NOT_CONFIGURED:['AI 연결을 준비 중입니다. 관리자에게 문의해주세요.','The AI connection is not ready. Contact your administrator.'],
   ASSISTANT_ALREADY_RUNNING:['구성안을 만들고 있습니다. 잠시 후 다시 확인해주세요.','Your plan is being prepared. Please check again shortly.'],
   PROVIDER_RATE_LIMITED:['요청이 많아 잠시 지연되고 있습니다. 잠시 후 다시 시도해주세요.','The service is busy. Please retry shortly.'],
   PROVIDER_INVALID_RESPONSE:['구성안을 받지 못했습니다. 다시 시도해주세요.','Could not read the plan. Please retry.'],
   PROVIDER_INCOMPLETE_RESPONSE:['구성안이 완성되지 않았습니다. 다시 시도해주세요.','The plan was incomplete. Please retry.'],
   INVALID_STORY_PLAN:['장별 구성안을 확인하지 못했습니다. 다시 시도해주세요.','Could not validate the carousel plan. Please retry.'],
   BATCH_UNAVAILABLE:['서버가 아직 일괄 생성을 지원하지 않습니다.','The server does not yet support batch generation.'],
   AUTH_REQUIRED:['이미지를 생성하려면 로그인해주세요.','Sign in to generate images.'],
   PROPORTION_MISMATCH:['입력 규격과 사진 비례를 확인해주세요.','Check the dimensions and photograph proportions.']
  };
  setError(t(...(message[code]??['접수 상태를 확인하지 못했습니다. 같은 입력으로 다시 확인해주세요.','Could not confirm submission. Retry with the same details.'] as [string,string])));
 }
 async function confirm(){
  if(!active||!confirmation||submitting.current||confirmation.token!==betaSession()?.token||confirmation.price.creditsAfter<0)return;
  if(confirmation.project.storyCarousel&&(confirmation.project.requestedImageCount!==confirmation.price.count||!validStoryPlan(confirmation.project.storyPlan,confirmation.price.count)))return;
  submitting.current=true;setSubmittingBusy(true);setError('');
  try{await onReady(confirmation.project,confirmation.price);}catch(e){showError(e);}
  finally{setConfirmation(undefined);submitting.current=false;setSubmittingBusy(false);}
 }
 const companyFields:[FooterField,string,string][]=[['company',t('회사명','Company'),'셀업랩스'],['contact',t('연락처','Phone'),'010-0000-0000'],['email',t('이메일 주소','Email'),'hello@brand.com'],['website',t('홈페이지','Website'),'https://www.brand.com']];
 return <div className="create-page consumer-create">
  <div className="create-heading"><div className="ad-creation-title"><h1>{t('광고 이미지 만들기','Create an ad image')}</h1>{onNew&&<button type="button" className="fresh-ad-button" disabled={busy} onClick={onNew}>{t('새 광고','New ad')}</button>}</div><p>{t('사진과 정보로 만드는 광고','Create ads with photos and details')}</p></div>
  <form aria-busy={busy} onSubmit={e=>{e.preventDefault();void submit();}}>
   <fieldset disabled={submittingBusy} style={{border:0,padding:0,margin:0,minWidth:0}}>
   {!offlineDemo()&&!project.dimensionControl&&<div className="simple-choice carousel-mode" role="group" aria-label={t('이미지 형식','Image format')}>
    <button type="button" aria-pressed={!carousel} onClick={()=>change(p=>({...p,storyCarousel:false,storyPlan:undefined,resultSet:undefined}))}>{t('일반 광고','Standard ad')}</button>
    <button type="button" aria-pressed={carousel} onClick={()=>change(p=>({...p,storyCarousel:true,requestedImageCount:isCarouselCount(p.requestedImageCount)?p.requestedImageCount:carouselCount,storyPlan:undefined,resultSet:undefined}))}>{t('인스타 피드 캐러셀','Instagram feed carousel')}</button>
   </div>}
   {carousel&&<p className="carousel-intro">{t('넘겨보는 4:5 광고, 하나의 이야기로.','One story across swipeable 4:5 ads.')}</p>}
   <section className="creation-section" data-order="1"><h2><span>1</span>{t('광고할 분야','Your industry')}</h2>
    <AdFieldPicker id={id+'-industry'} kind={kind} onKind={setKind} project={project} chosen={chosen} onChosen={setChosen} change={change}/>
    
    <RegulatoryNotice category={project.productProfile.category} material={noticeContext} confirmed={regulatoryOk} onConfirm={confirmRegulatory}/>
   </section>
   <section className="creation-section" data-order="2"><details className="optional-block"><summary><span className="section-title"><b>2</b>{t('회사 정보','Company details')}</span><small>{t('선택','Optional')}</small></summary><p className="help">{t('입력한 정보만 광고에 표시합니다.','Only the details you enter will appear on the ad.')}</p><div className="company-fields">{companyFields.map(([field,label,placeholder])=><div className="field company-field" key={field}><label htmlFor={id+'-'+field}>{label}</label><input id={id+'-'+field} type={field==='email'?'email':field==='contact'?'tel':'text'} maxLength={field==='company'?80:field==='website'?200:100} placeholder={placeholder} value={copy[field]??''} onChange={e=>setCopy(field,e.target.value)}/><label className="company-visible"><input type="checkbox" aria-label={label+t(' 광고에 표시',' shown on ad')} checked={project.footer?.[field]??true} onChange={e=>change(p=>({...p,footer:{company:p.footer?.company??true,contact:p.footer?.contact??true,email:p.footer?.email??true,website:p.footer?.website??true,[field]:e.target.checked}}))}/>{t('광고에 표시','Show on ad')}</label></div>)}</div></details></section>
   <section className="creation-section" data-order="3" id={id+'-photos'} tabIndex={-1}><h2><span>3</span>{t('사진 첨부','Add photos')}{service&&<small>{t('선택','Optional')}</small>}</h2><div hidden={example}><PhotoUsage project={project} change={change}/><p className="help">{t('한 번에 여러 장 선택 가능','Select several photos at once')}</p><ReferencePhotos project={project} change={change} onBusyChange={photoBusyChanged} onIssueChange={setPhotoImportIssue}/></div></section>
   {(!carousel||axes.length>0)&&<section className="creation-section" data-order="4"><h2><span>4</span>{t('상품 규격','Product dimensions')}<small>{t('선택','Optional')}</small></h2>
    {service?<p className="help">{t('서비스 광고는 규격 없이 만듭니다.','Service ads do not need product dimensions.')}</p>:<><div className="simple-choice" role="group" aria-label={t('규격 입력 여부','Use dimensions')}>{[false,true].map(on=><button type="button" key={String(on)} aria-pressed={!!axes.length===on} onClick={()=>setDimensionUse(on)}>{on?t('규격 넣기','Add dimensions'):t('규격 없이','No dimensions')}</button>)}</div>{!!axes.length&&<div className="dimension-form"><label className="field">{t('상품 형태','Product shape')}<select aria-label={t('규격 형식','Dimension type')} value={project.productProfile.specType} onChange={e=>change(p=>({...p,productProfile:{...p.productProfile,specType:e.target.value as SpecType},generation:{...p.generation,planarSourceHash:undefined,dimensionBasis:'outer-body'}}))}><option value="rectangular">{t('가로 · 세로 · 높이','Width · Depth · Height')}</option><option value="flat">{t('가로 · 세로','Width · Depth')}</option><option value="cylindrical">{t('지름 · 높이','Diameter · Height')}</option></select></label><DimensionInputs project={project} change={change}/>{aiDimensionChoice&&<DimensionDisplayChoice project={project} change={change} disabled={example}/>}{!example&&project.generation.mode==='creative'&&(new URLSearchParams(location.search).get('dimensionProof')==='1'||project.dimensionControl)&&<DimensionControlChoice project={project} change={change}/>}{!project.dimensionControl&&<label className="check-field"><input type="checkbox" checked={dimensionsVisible} disabled={example} onChange={e=>setDimensionVisibility(e.target.checked)}/>{t('광고에 규격 표시','Show dimensions on ad')}</label>}<p className="help">{t('입력 규격은 숫자·치수선 표시에 사용하며 사진 속 상품의 형태를 변경하는 기준으로 사용하지 않습니다. 수치와 치수선 위치는 결과에서 직접 확인해주세요.','Dimensions are for numeric labels and arrows, not for reshaping the photographed product. Review values and arrow placement in the result.')}</p></div>}</>}
   </section>}
   <section className="creation-section" data-order="5">
    <h2><span>5</span>{t('상품·서비스 상세설명','Product or service details')}</h2>
    <label className="field">{service?t('서비스명','Service name'):t('상품명','Product name')}
     <input id={id+'-name'} maxLength={100} value={project.productName} placeholder={carousel?t('선택','Optional'):examples.name}
       onChange={e=>change(p=>({...p,productName:e.target.value}))}/>
    </label>
    <label className="field">{carousel?t('원하는 광고 한 줄','Your ad in one line'):t('상세설명','Description')}
     <textarea id={id+'-description'} className="campaign-description" rows={carousel?2:project.productProfile.material ? 4 : examples.description.split('\n').length}
       maxLength={2000} value={project.productProfile.material} placeholder={carousel?t('친구 둘이 마지막 피자 조각을 보고 한 판 더 주문하는 이야기','Two friends spot the last pizza slice and order another pizza.'):examples.description}
       onChange={e=>change(p=>({...p,productProfile:{...p.productProfile,material:e.target.value}}))}/>
    </label>
    <label className="field">{t('추가 요청','Additional requests')}
     <textarea className="campaign-request" rows={2} maxLength={600} value={settings.note} placeholder={examples.request}
       onChange={e=>change(p=>withCreative(p,{note:e.target.value}))}/>
    </label>
    {!carousel&&<InputExampleGuide kind="facts" service={service}/>} 
   </section>
   {!carousel&&<section className="creation-section" data-order="6"><h2><span>6</span>{t('광고 문구','Advertising copy')}</h2><div className="simple-choice" role="group" aria-label={t('광고 문구 작성 방식','Copy mode')}>{(['ai','manual'] as const).map(mode=><button type="button" key={mode} aria-pressed={copyMode===mode} onClick={()=>change(p=>withCreative(p,{copyMode:mode}))}>{mode==='ai'?(project.dimensionControl?t('문구 초안 사용','Use draft copy'):t('AI가 만들기','Let AI write it')):t('직접 입력','Write my own')}</button>)}</div>{copyMode==='ai'?<p className="help">{project.dimensionControl?t('입력 내용의 문구 초안을 검증용 화면에 사용합니다. AI 문구 생성은 실행하지 않습니다.','Use a draft from your inputs for the proof. AI copy generation is not executed.'):t('상세설명을 바탕으로 AI가 광고 제목과 문구를 함께 만듭니다.','AI writes the headline and supporting copy from your description.')}</p>:<><label className="field">{t('광고 제목','Ad headline')}<textarea id={id+'-headline'} rows={2} maxLength={400} value={copy.title} onChange={e=>setCopy('title',e.target.value)}/></label><InputExampleGuide kind="headline" service={service}/><label className="field">{t('광고 설명','Ad supporting copy')}<textarea rows={3} maxLength={400} value={copy.description} onChange={e=>setCopy('description',e.target.value)}/></label><InputExampleGuide kind="copy" service={service}/></>}</section>
   }
   {!carousel&&<section className="creation-section" data-order="7"><h2><span>7</span>{t('광고 목적','Ad purpose')}<small>{t('선택','Optional')}</small></h2><label className="field">{t('목적 선택','Choose a purpose')}<select value={settings.directionId} onChange={e=>change(p=>withCreative(p,{directionId:e.target.value as 'brand'|'offer'|'trust'}))}><option value="brand">{t('AI가 정하기','Let AI decide')}</option><option value="offer">{t('상품·서비스 홍보','Promote the offer')}</option><option value="trust">{t('브랜드·신뢰 강조','Build brand trust')}</option></select></label></section>
   }
   <section className="creation-section" data-order="8"><h2><span>8</span>{t('광고 이미지 비율','Image ratio')}<small>{t('선택','Optional')}</small></h2><label className="field">{t('출력 비율','Output ratio')}<select disabled={carousel} value={carousel?carouselFormat:project.format} onChange={e=>change(p=>({...p,format:e.target.value as Project['format']}))}>{imageFormats.map(f=><option key={f.id} value={f.id}>{f.id} · {text(f.use)}</option>)}</select></label><label className="field">{t('광고 문구 언어','Ad copy language')}<select value={project.locale} onChange={e=>change(p=>({...p,locale:e.target.value as 'ko'|'en'}))}><option value="ko">한국어</option><option value="en">English</option></select></label></section>
   {!project.dimensionControl&&<section className={'creation-section'+(carousel?' carousel-count-section':'')} data-order="9"><h2><span>9</span><strong>{t('생성 장수','Number of images')}</strong></h2><div className="image-count-options" role="group" aria-label={t('생성 장수','Number of images')}>{(carousel?carouselCounts:imageCounts).map(count=><button type="button" key={count} aria-pressed={selectedCount===count} onClick={()=>change(p=>({...p,requestedImageCount:count,storyPlan:undefined,resultSet:undefined}))}>{carousel?t(`${count}장`,`${count} cards`):count}</button>)}</div>
    {carousel&&<p className="carousel-count-summary" aria-live="polite"><span>{t(`${selectedCount}장 · 인스타 피드 4:5`,`${selectedCount} cards · Instagram feed 4:5`)}</span><strong>{previewPrice?.admin?t('관리자 · 차감 없음','Admin · no charge'):previewPrice?t(`${previewPrice.creditsUsed}크레딧${previewPrice.ticketsUsed?` + 이용권 ${previewPrice.ticketsUsed}장`:''}`,`${previewPrice.creditsUsed} credits${previewPrice.ticketsUsed?` + ${previewPrice.ticketsUsed} legacy tickets`:''}`):t(`장당 ${imageCredits}크레딧`,`${imageCredits} credits per card`)}</strong></p>}
   </section>}
   </fieldset>
   {error&&<p className={'wizard-error'+(photoImportIssue&&error===photoImportIssue?' photo-upload-error':'')} role="alert">{error}</p>}
   {!regulatoryOk&&<p className="help">{t('1번 광고할 분야의 법규 안내를 확인하면 광고를 만들 수 있습니다.','Confirm the industry notice in step 1 to generate the ad.')}</p>}
   <div className="wizard-actions"><button className="primary-action" type="submit" disabled={busy||!active||!regulatoryOk}><Sparkles size={18}/>{photosBusy?t('사진 불러오는 중…','Loading photos…'):submittingBusy?t('준비 중…','Preparing…'):carousel?t('캐러셀 구성 만들기','Plan carousel'):project.dimensionControl?t('기하 검증 이미지 만들기','Create geometry proof'):t('광고 생성','Generate ad')}</button></div>{!project.dimensionControl&&creditStatus?.wallet?.unlimited&&<p className="help submit-help">{t('관리자 테스트 · 차감 없음','Administrator test · no charge')}</p>}
  </form>
  {confirmation&&active&&<BatchConfirmation price={confirmation.price} carousel={!!confirmation.project.storyCarousel} busy={busy} onConfirm={()=>void confirm()} onClose={()=>setConfirmation(undefined)} canConfirm={!confirmation.project.storyCarousel||(confirmation.project.requestedImageCount===confirmation.price.count&&validStoryPlan(confirmation.project.storyPlan,confirmation.price.count))}>
   {confirmation.project.storyPlan&&<CarouselEditor plan={confirmation.project.storyPlan} busy={busy} onChange={storyPlan=>setConfirmation(current=>current?{...current,project:{...current.project,storyPlan}}:current)}/>}
  </BatchConfirmation>}
 </div>;
}
