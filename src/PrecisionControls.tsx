import {defaultPrecision} from './precision.ts';
import type {Project,PrecisionSettings,TextLayer,BackgroundEffect,Motion,Expression} from './precision.ts';
import {ChevronDown,RotateCcw} from 'lucide-react';
import {useState} from 'react';
import './precision-controls.css';

interface PrecisionControlsProps {
 project:Project;
 change:(fn:(p:Project)=>Project)=>void;
}

const textLayers:TextLayer[]=['brand','title','description','company','contact'];
const backgroundEffects:BackgroundEffect[]=['none','blur','darken','brighten','saturate','desaturate','warm','cool'];
const motionOptions:Motion[]=['none','rays','swoosh','spiral','pulse','glow','shimmer','float'];
const expressions:Expression[]=['😊','😂','😍','🤩','😎','🤔','😢','😠'];

export function PrecisionControls({project,change}:PrecisionControlsProps){
 const precision=project.precision??defaultPrecision();
 const [openSection,setOpenSection]=useState<string|null>('background');

 const updatePrecision=(fn:(p:PrecisionSettings)=>PrecisionSettings)=>
  change(p=>({...p,precision:fn(p.precision??defaultPrecision())}));

 const toggleSection=(id:string)=>{
  setOpenSection(openSection===id?null:id);
 };

 return (
  <details className="precision-controls" open={openSection!==null}>
   <summary>
    <span>🎨 {project.locale==='ko'?'세부 조정':'Fine Tuning'}</span>
    <ChevronDown size={16}/>
   </summary>
   <div className="precision-body">
    {/* 배경 설정 */}
    <div className="precision-section">
     <button className="section-header active" onClick={()=>toggleSection('background')}>
      <span>{project.locale==='ko'?'배경 효과':'Background'}</span>
      <ChevronDown size={14}/>
     </button>
     <div className="section-content">
      <div className="precision-select">
       <label>{project.locale==='ko'?'효과':'Effect'}</label>
       <select value={precision.background.effect} onChange={e=>updatePrecision(p=>({\n        ...p,
        background:{...p.background,effect:e.target.value as BackgroundEffect}
       }))}>
        {backgroundEffects.map(effect=>(
         <option key={effect} value={effect}>
          {effect==='none'?project.locale==='ko'?'없음':'None':
           effect==='blur'?project.locale==='ko'?'흐림':'Blur':
           effect==='darken'?project.locale==='ko'?'어두움':'Darken':
           effect==='brighten'?project.locale==='ko'?'밝음':'Brighten':
           effect==='saturate'?project.locale==='ko'?'채도 증가':'Saturate':
           effect==='desaturate'?project.locale==='ko'?'채도 감소':'Desaturate':
           effect==='warm'?project.locale==='ko'?'따뜻함':'Warm':
           effect==='cool'?project.locale==='ko'?'시원함':'Cool':''}
         </option>
        ))}
       </select>
      </div>

      {precision.background.effect!=='none'&&(
       <div className="precision-slider">
        <span>
         <label>{project.locale==='ko'?'강도':'Intensity'}</label>
         <output>{Math.round(precision.background.effectIntensity*100)}%</output>
        </span>
        <input type="range" min="0" max="1" step="0.05" 
         value={precision.background.effectIntensity}
         onChange={e=>updatePrecision(p=>({\n          ...p,
          background:{...p.background,effectIntensity:parseFloat(e.target.value)}
         }))}\/>
       </div>
      )}

      <div className="precision-slider">
       <span>
        <label>{project.locale==='ko'?'투명도':'Opacity'}</label>
        <output>{Math.round(precision.background.opacity*100)}%</output>
       </span>
       <input type="range" min="0" max="1" step="0.05" 
        value={precision.background.opacity}
        onChange={e=>updatePrecision(p=>({\n         ...p,
         background:{...p.background,opacity:parseFloat(e.target.value)}
        }))}\/>
      </div>

      <div className="precision-slider">
       <span>
        <label>{project.locale==='ko'?'확대':'Zoom'}</label>
        <output>{(precision.background.zoom*100).toFixed(0)}%</output>
       </span>
       <input type="range" min="0.5" max="2" step="0.1" 
        value={precision.background.zoom}
        onChange={e=>updatePrecision(p=>({\n         ...p,
         background:{...p.background,zoom:parseFloat(e.target.value)}
        }))}\/>
      </div>
     </div>
    </div>

    {/* 스티커 설정 */}
    <div className="precision-section">
     <button className="section-header" onClick={()=>toggleSection('sticker')}>
      <span>{project.locale==='ko'?'스티커':'Sticker'}</span>
      <ChevronDown size={14}/>
     </button>
     {openSection==='sticker'&&(
      <div className="section-content">
       <div className="precision-subsection">
        <h4>{project.locale==='ko'?'표정 선택':'Expression'}</h4>
        <div className="expression-grid">
         {expressions.map(expr=>(
          <button key={expr} className={`expression-btn ${precision.sticker.glyph===expr?'active':''}`}
           onClick={()=>updatePrecision(p=>({\n            ...p,
            sticker:{...p.sticker,glyph:expr}
           }))}>
           <span className="emoji-btn">{expr}</span>
           <small>{project.locale==='ko'?'선택':'Select'}</small>
          </button>
         ))}
        </div>
       </div>

       {precision.sticker.glyph&&(
        <>
         <div className="precision-slider">
          <span>
           <label>{project.locale==='ko'?'크기':'Size'}</label>
           <output>{Math.round(precision.sticker.size)}px</output>
          </span>
          <input type="range" min="20" max="200" step="10" 
           value={precision.sticker.size}
           onChange={e=>updatePrecision(p=>({\n            ...p,
            sticker:{...p.sticker,size:parseInt(e.target.value)}
           }))}\/>
         </div>

         <div className="precision-slider">
          <span>
           <label>{project.locale==='ko'?'회전':'Rotation'}</label>
           <output>{Math.round(precision.sticker.rotation)}°</output>
          </span>
          <input type="range" min="0" max="360" step="15" 
           value={precision.sticker.rotation}
           onChange={e=>updatePrecision(p=>({\n            ...p,
            sticker:{...p.sticker,rotation:parseInt(e.target.value)}
           }))}\/>
         </div>
        </>
       )}
      </div>
     )}
    </div>

    {/* 텍스트 설정 */}
    <div className="precision-section">
     <button className="section-header" onClick={()=>toggleSection('text')}>
      <span>{project.locale==='ko'?'텍스트':'Text'}</span>
      <ChevronDown size={14}/>
     </button>
     {openSection==='text'&&(
      <div className="section-content">
       {textLayers.map(layer=>{
        const style=precision.text[layer];
        return (
         <div key={layer} className="precision-subsection">
          <h4>{layer==='brand'?project.locale==='ko'?'상단 기업명':'Brand':
               layer==='title'?project.locale==='ko'?'제목':'Title':
               layer==='description'?project.locale==='ko'?'설명':'Description':
               layer==='company'?project.locale==='ko'?'기업명':'Company':
               project.locale==='ko'?'연락처':'Contact'}</h4>
          
          <div className="precision-color">
           <label>{project.locale==='ko'?'색상':'Color'}</label>
           <div className="color-input-wrap">
            <input type="color" 
             value={style.color}
             onChange={e=>updatePrecision(p=>({\n              ...p,
              text:{...p.text,[layer]:{...style,color:e.target.value}}
             }))}\/>
            <input type="text" placeholder="#000000" maxLength="7"
             value={style.color}
             onChange={e=>updatePrecision(p=>({\n              ...p,
              text:{...p.text,[layer]:{...style,color:e.target.value}}
             }))}\/>
           </div>
          </div>

          <div className="precision-slider">
           <span>
            <label>{project.locale==='ko'?'투명도':'Opacity'}</label>
            <output>{Math.round(style.opacity*100)}%</output>
           </span>
           <input type="range" min="0" max="1" step="0.1" 
            value={style.opacity}
            onChange={e=>updatePrecision(p=>({\n             ...p,
             text:{...p.text,[layer]:{...style,opacity:parseFloat(e.target.value)}}
            }))}\/>
          </div>

          <div className="precision-slider">
           <span>
            <label>{project.locale==='ko'?'크기':'Scale'}</label>
            <output>{(style.scale*100).toFixed(0)}%</output>
           </span>
           <input type="range" min="0.5" max="2" step="0.1" 
            value={style.scale}
            onChange={e=>updatePrecision(p=>({\n             ...p,
             text:{...p.text,[layer]:{...style,scale:parseFloat(e.target.value)}}
            }))}\/>
          </div>

          <div className="precision-select">
           <label>{project.locale==='ko'?'폰트':'Font'}</label>
           <select value={style.font} onChange={e=>updatePrecision(p=>({\n            ...p,
            text:{...p.text,[layer]:{...style,font:e.target.value as any}}
           }))}>
            <option value="sans">{project.locale==='ko'?'기본':'Sans'}</option>
            <option value="serif">{project.locale==='ko'?'세리프':'Serif'}</option>
            <option value="mono">{project.locale==='ko'?'고정폭':'Mono'}</option>
           </select>
          </div>
         </div>
        );
       })}
      </div>
     )}
    </div>

    {/* 동작 효과 */}
    <div className="precision-section">
     <button className="section-header" onClick={()=>toggleSection('motion')}>
      <span>{project.locale==='ko'?'동작 효과':'Motion'}</span>
      <ChevronDown size={14}/>
     </button>
     {openSection==='motion'&&(
      <div className="section-content">
       <div className="motion-grid">
        {motionOptions.map(motion=>(
         <button key={motion} className={`motion-btn ${precision.motion===motion?'active':''}`}
          onClick={()=>updatePrecision(p=>({...p,motion}))}>
          <span className="motion-icon">
           {motion==='none'?'—':
            motion==='rays'?'☀️':
            motion==='swoosh'?'〰️':
            motion==='spiral'?'◯':
            motion==='pulse'?'◯◯':
            motion==='glow'?'✨':
            motion==='shimmer'?'≈≈':
            motion==='float'?'⠿':''}
          </span>
          <small>{motion==='none'?project.locale==='ko'?'없음':'None':motion}</small>
         </button>
        ))}
       </div>
      </div>
     )}
    </div>

    {/* 초기화 버튼 */}
    <div className="precision-footer">
     <button className="precision-reset-all" onClick={()=>updatePrecision(()=>defaultPrecision())}>
      <RotateCcw size={12}/>
      {project.locale==='ko'?'모두 초기화':'Reset All'}
     </button>
    </div>
   </div>
  </details>
 );
}
