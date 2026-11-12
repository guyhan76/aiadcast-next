import {useState} from 'react';
import {ChevronDown,RotateCcw,Type,Image as ImageIcon,Sparkles} from 'lucide-react';
import type {Project} from './model';
import {defaultPrecision,stickerChoices,textLayers} from './precision';
import type {PrecisionSettings,TextLayer} from './precision';
import './precision.css';

type Props={project:Project;change:(fn:(p:Project)=>Project)=>void};
const names:Record<TextLayer,string>={brand:'상단 브랜드',title:'홍보 제목',description:'광고 설명',company:'하단 회사명',contact:'연락처 · 홈페이지'};
const fonts=[['sans','기본'],['serif','명조'],['mono','고정폭']] as const;
const effects=[['none','없음'],['rays','빛살'],['swoosh','곡선']] as const;
function slider(label:string,value:number,min:number,max:number,step:number,onChange:(n:number)=>void,display:string){return <label className="precision-slider"><span>{label}<output>{display}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}/></label>;}
export function PrecisionControls({project,change}:Props){
 const [selected,setSelected]=useState<TextLayer>('title');
 const settings=project.precision??defaultPrecision(),style=settings.text[selected];
 function update(fn:(s:PrecisionSettings)=>PrecisionSettings){change(p=>({...p,precision:fn(p.precision??defaultPrecision())}));}
 function text(patch:Partial<typeof style>){update(s=>({...s,text:{...s.text,[selected]:{...s.text[selected],...patch}}}));}
 function background(patch:Partial<PrecisionSettings['background']>){update(s=>({...s,background:{...s.background,...patch}}));}
 function sticker(patch:Partial<PrecisionSettings['sticker']>){update(s=>({...s,sticker:{...s.sticker,...patch}}));}
 return <details className="precision-controls"><summary><span><Type size={18}/>부분 수정</span><ChevronDown size={16}/></summary><div className="precision-body">
  <fieldset><legend>문구별 위치 · 크기 · 글꼴</legend><label className="precision-select">수정할 문구<select value={selected} onChange={e=>setSelected(e.target.value as TextLayer)}>{textLayers.map(layer=><option key={layer} value={layer}>{names[layer]}</option>)}</select></label>
   {slider('좌우',style.x,-.1,.1,.01,n=>text({x:n}),`${Math.round(style.x*100)}%`)}
   {slider('상하',style.y,-.1,.1,.01,n=>text({y:n}),`${Math.round(style.y*100)}%`)}
   {slider('크기',style.scale,.7,1.3,.05,n=>text({scale:n}),`${Math.round(style.scale*100)}%`)}
   <label className="precision-select">글꼴<select value={style.font} onChange={e=>text({font:e.target.value as typeof style.font})}>{fonts.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
   <button type="button" className="precision-reset" onClick={()=>update(s=>({...s,text:{...s.text,[selected]:defaultPrecision().text[selected]}}))}><RotateCcw size={14}/>이 문구 초기화</button>
  </fieldset>
  <fieldset><legend><ImageIcon size={15}/>배경 사진 조정</legend><p>배경 탭에서 사진을 추가하면 적용됩니다. 상품 원본은 변경되지 않습니다.</p>
   {slider('좌우',settings.background.x,-.5,.5,.05,n=>background({x:n}),`${Math.round(settings.background.x*100)}%`)}
   {slider('상하',settings.background.y,-.5,.5,.05,n=>background({y:n}),`${Math.round(settings.background.y*100)}%`)}
   {slider('확대',settings.background.zoom,1,2,.05,n=>background({zoom:n}),`${Math.round(settings.background.zoom*100)}%`)}
   {slider('불투명도',settings.background.opacity,0,1,.05,n=>background({opacity:n}),`${Math.round(settings.background.opacity*100)}%`)}
   <button type="button" className="precision-reset" onClick={()=>update(s=>({...s,background:defaultPrecision().background}))}><RotateCcw size={14}/>배경 조정 초기화</button>
  </fieldset>
  <fieldset><legend><Sparkles size={15}/>장식</legend><label className="precision-select">이모지<select value={settings.sticker.glyph} onChange={e=>sticker({glyph:e.target.value})}>{stickerChoices.map(glyph=><option key={glyph} value={glyph}>{glyph||'없음'}</option>)}</select></label>
   {settings.sticker.glyph&&<>{slider('좌우',settings.sticker.x,.1,.9,.05,n=>sticker({x:n}),`${Math.round(settings.sticker.x*100)}%`)}{slider('상하',settings.sticker.y,.1,.9,.05,n=>sticker({y:n}),`${Math.round(settings.sticker.y*100)}%`)}{slider('크기',settings.sticker.size,40,160,5,n=>sticker({size:n}),`${settings.sticker.size}px`)}</>}
   <label className="precision-select">정적 연출 효과<select value={settings.motion} onChange={e=>update(s=>({...s,motion:e.target.value as PrecisionSettings['motion']}))}>{effects.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
   <p>PNG에 정지 이미지로 표시됩니다. 애니메이션이나 영상은 만들지 않습니다.</p>
  </fieldset>
 </div></details>;
}
