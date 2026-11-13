import {useState} from 'react';
import {ChevronDown,RotateCcw,Type,Image as ImageIcon,Sparkles,Smile,Zap} from 'lucide-react';
import type {Project} from './model';
import {
  defaultPrecision,
  stickerChoices,
  textLayers,
  expressionChoices,
  expressionLabels,
  motionChoices,
  motionLabels,
  backgroundEffectChoices,
  backgroundEffectLabels,
} from './precision';
import type {PrecisionSettings,TextLayer,ExpressionType,MotionType,BackgroundEffect} from './precision';
import './precision.css';

type Props={project:Project;change:(fn:(p:Project)=>Project)=>void};
const names:Record<TextLayer,string>={brand:'상단 브랜드',title:'홍보 제목',description:'광고 설명',company:'하단 회사명',contact:'연락처 · 홈페이지'};
const fonts=[['sans','기본'],['serif','명조'],['mono','고정폭']] as const;

function slider(label:string,value:number,min:number,max:number,step:number,onChange:(n:number)=>void,display:string){
  return <label className="precision-slider">
    <span>{label}<output>{display}</output></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}/>
  </label>;
}

function colorPicker(label:string,value:string,onChange:(c:string)=>void){
  return <label className="precision-color">
    <span>{label}</span>
    <div className="color-input-wrap">
      <input type="color" value={value} onChange={e=>onChange(e.target.value)} title={value}/>
      <input type="text" value={value} onChange={e=>onChange(e.target.value)} placeholder="#000000" maxLength={7}/>
    </div>
  </label>;
}

function buttonGroup<T extends string>(label:string,value:T,options:{id:T;label:string}[],onChange:(v:T)=>void){
  return <fieldset className="precision-button-group">
    <legend>{label}</legend>
    <div className="button-group">
      {options.map(opt=><button
        key={opt.id}
        type="button"
        aria-pressed={value===opt.id}
        className={value===opt.id?'active':''}
        onClick={()=>onChange(opt.id)}
      >{opt.label}</button>)}
    </div>
  </fieldset>;
}

export function PrecisionControls({project,change}:Props){
  const [selected,setSelected]=useState<TextLayer>('title');
  const [expandedSection,setExpandedSection]=useState<'text'|'background'|'emoji'|'expression'|'motion'|null>('text');
  
  const settings=project.precision??defaultPrecision();
  const style=settings.text[selected];
  
  function update(fn:(s:PrecisionSettings)=>PrecisionSettings){
    change(p=>({...p,precision:fn(p.precision??defaultPrecision())}));
  }
  
  function text(patch:Partial<typeof style>){
    update(s=>({...s,text:{...s.text,[selected]:{...s.text[selected],...patch}}}));
  }
  
  function background(patch:Partial<PrecisionSettings['background']>){
    update(s=>({...s,background:{...s.background,...patch}}));
  }
  
  function sticker(patch:Partial<PrecisionSettings['sticker']>){
    update(s=>({...s,sticker:{...s.sticker,...patch}}));
  }
  
  function setExpression(expr:ExpressionType){
    update(s=>({...s,expression:expr}));
  }
  
  function setMotion(motion:MotionType){
    update(s=>({...s,motion}));
  }
  
  return <details className="precision-controls" open>
    <summary><span><Type size={18}/>부분 수정</span><ChevronDown size={16}/></summary>
    <div className="precision-body">
      
      {/* 문구 편집 섹션 */}
      <section className="precision-section" data-section="text">
        <button className="section-header" onClick={()=>setExpandedSection(expandedSection==='text'?null:'text')}>
          <Type size={16}/>
          <span>문구 편집 · 위치 · 글꼴</span>
          <ChevronDown size={14}/>
        </button>
        
        {expandedSection==='text'&&<div className="section-content">
          <label className="precision-select">
            수정할 문구
            <select value={selected} onChange={e=>setSelected(e.target.value as TextLayer)}>
              {textLayers.map(layer=><option key={layer} value={layer}>{names[layer]}</option>)}
            </select>
          </label>
          
          <div className="precision-subsection">
            <h4>위치 조정</h4>
            {slider('좌우',style.x,-.1,.1,.01,n=>text({x:n}),`${Math.round(style.x*100)}%`)}
            {slider('상하',style.y,-.1,.1,.01,n=>text({y:n}),`${Math.round(style.y*100)}%`)}
          </div>
          
          <div className="precision-subsection">
            <h4>크기 · 글꼴</h4>
            {slider('크기',style.scale,.7,1.3,.05,n=>text({scale:n}),`${Math.round(style.scale*100)}%`)}
            <label className="precision-select">
              글꼴
              <select value={style.font} onChange={e=>text({font:e.target.value as typeof style.font})}>
                {fonts.map(([id,label])=><option key={id} value={id}>{label}</option>)}
              </select>
            </label>
          </div>
          
          <div className="precision-subsection">
            <h4>색상 · 투명도</h4>
            {colorPicker('텍스트 색상',style.color,c=>text({color:c}))}
            {slider('투명도',style.opacity,0,1,.05,n=>text({opacity:n}),`${Math.round(style.opacity*100)}%`)}
          </div>
          
          <button type="button" className="precision-reset" onClick={()=>update(s=>({...s,text:{...s.text,[selected]:defaultPrecision().text[selected]}}))}>
            <RotateCcw size={14}/>이 문구 초기화
          </button>
        </div>}
      </section>
      
      {/* 배경 조정 섹션 */}
      <section className="precision-section" data-section="background">
        <button className="section-header" onClick={()=>setExpandedSection(expandedSection==='background'?null:'background')}>
          <ImageIcon size={16}/>
          <span>배경 사진 조정</span>
          <ChevronDown size={14}/>
        </button>
        
        {expandedSection==='background'&&<div className="section-content">
          <p className="section-help">배경 탭에서 사진을 추가하면 적용됩니다. 상품 원본은 변경되지 않습니다.</p>
          
          <div className="precision-subsection">
            <h4>위치 · 확대</h4>
            {slider('좌우',settings.background.x,-.5,.5,.05,n=>background({x:n}),`${Math.round(settings.background.x*100)}%`)}
            {slider('상하',settings.background.y,-.5,.5,.05,n=>background({y:n}),`${Math.round(settings.background.y*100)}%`)}
            {slider('확대',settings.background.zoom,1,2,.05,n=>background({zoom:n}),`${Math.round(settings.background.zoom*100)}%`)}
          </div>
          
          <div className="precision-subsection">
            <h4>투명도 · 효과</h4>
            {slider('불투명도',settings.background.opacity,0,1,.05,n=>background({opacity:n}),`${Math.round(settings.background.opacity*100)}%`)}
            
            <label className="precision-select">
              사진 효과
              <select value={settings.background.effect} onChange={e=>background({effect:e.target.value as BackgroundEffect})}>
                {backgroundEffectChoices.map(effect=><option key={effect} value={effect}>{backgroundEffectLabels[effect]}</option>)}
              </select>
            </label>
            
            {settings.background.effect!=='none'&&<div>
              {slider('효과 강도',settings.background.effectIntensity,0,1,.05,n=>background({effectIntensity:n}),`${Math.round(settings.background.effectIntensity*100)}%`)}
            </div>}
          </div>
          
          <button type="button" className="precision-reset" onClick={()=>update(s=>({...s,background:defaultPrecision().background}))}>
            <RotateCcw size={14}/>배경 조정 초기화
          </button>
        </div>}
      </section>
      
      {/* 이모지 · 장식 섹션 */}
      <section className="precision-section" data-section="emoji">
        <button className="section-header" onClick={()=>setExpandedSection(expandedSection==='emoji'?null:'emoji')}>
          <Sparkles size={16}/>
          <span>이모지 · 장식</span>
          <ChevronDown size={14}/>
        </button>
        
        {expandedSection==='emoji'&&<div className="section-content">
          <label className="precision-select">
            이모지 선택
            <select value={settings.sticker.glyph} onChange={e=>sticker({glyph:e.target.value})}>
              {stickerChoices.map(glyph=><option key={glyph} value={glyph}>{glyph||'없음'}</option>)}
            </select>
          </label>
          
          {settings.sticker.glyph&&<>
            <div className="precision-subsection">
              <h4>위치 · 크기</h4>
              {slider('좌우',settings.sticker.x,.1,.9,.05,n=>sticker({x:n}),`${Math.round(settings.sticker.x*100)}%`)}
              {slider('상하',settings.sticker.y,.1,.9,.05,n=>sticker({y:n}),`${Math.round(settings.sticker.y*100)}%`)}
              {slider('크기',settings.sticker.size,40,160,5,n=>sticker({size:n}),`${settings.sticker.size}px`)}
            </div>
            
            <div className="precision-subsection">
              <h4>회전</h4>
              {slider('회전 각도',settings.sticker.rotation,0,360,15,n=>sticker({rotation:n}),`${Math.round(settings.sticker.rotation)}°`)}
            </div>
          </>}
        </div>}
      </section>
      
      {/* 표정 섹션 */}
      <section className="precision-section" data-section="expression">
        <button className="section-header" onClick={()=>setExpandedSection(expandedSection==='expression'?null:'expression')}>
          <Smile size={16}/>
          <span>표정 · 감정</span>
          <ChevronDown size={14}/>
        </button>
        
        {expandedSection==='expression'&&<div className="section-content">
          <p className="section-help">인물 사진의 표정과 분위기를 조정합니다. 렌더링 시 적용됩니다.</p>
          <div className="expression-grid">
            {expressionChoices.map(expr=><button
              key={expr}
              type="button"
              className={`expression-btn ${settings.expression===expr?'active':''}`}
              onClick={()=>setExpression(expr)}
              title={expressionLabels[expr as ExpressionType]}
            >
              {(() => {
                const map:Record<string,string>={neutral:'😐',smile:'🙂',laugh:'😄',wink:'😉',surprised:'😲',excited:'🤩',cool:'😎',confident:'💪'};
                return map[expr]||'😐';
              })()}
              <small>{expressionLabels[expr as ExpressionType]}</small>
            </button>)}
          </div>
          <button type="button" className="precision-reset" onClick={()=>setExpression(defaultPrecision().expression)}>
            <RotateCcw size={14}/>표정 초기화
          </button>
        </div>}
      </section>
      
      {/* 움직임 · 효과 섹션 */}
      <section className="precision-section" data-section="motion">
        <button className="section-header" onClick={()=>setExpandedSection(expandedSection==='motion'?null:'motion')}>
          <Zap size={16}/>
          <span>움직임 · 정적 효과</span>
          <ChevronDown size={14}/>
        </button>
        
        {expandedSection==='motion'&&<div className="section-content">
          <p className="section-help">PNG에 정지 이미지로 표시됩니다. 애니메이션 영상은 만들지 않습니다.</p>
          <div className="motion-grid">
            {motionChoices.map(motion=><button
              key={motion}
              type="button"
              className={`motion-btn ${settings.motion===motion?'active':''}`}
              onClick={()=>setMotion(motion)}
            >
              <span className="motion-icon">{motion==='none'?'—':motion==='rays'?'✦':motion==='swoosh'?'↗':motion==='spiral'?'◎':motion==='pulse'?'◉':motion==='glow'?'✨':motion==='shimmer'?'⋆':motion==='float'?'↑':'–'}</span>
              <small>{motionLabels[motion as MotionType]}</small>
            </button>)}
          </div>
          <button type="button" className="precision-reset" onClick={()=>setMotion(defaultPrecision().motion)}>
            <RotateCcw size={14}/>움직임 초기화
          </button>
        </div>}
      </section>
      
      {/* 리셋 모두 */}
      <div className="precision-footer">
        <button type="button" className="precision-reset-all" onClick={()=>update(()=>defaultPrecision())}>
          <RotateCcw size={14}/>모든 부분 수정 초기화
        </button>
      </div>
    </div>
  </details>;
}
