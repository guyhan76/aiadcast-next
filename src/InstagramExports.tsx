import {useUiLanguage} from './ui-language';
import {ArrowDownToLine,Layers} from 'lucide-react';
import type {ImageFormat} from './formats';
import {getImageFormat} from './formats';
import './instagram-exports.css';

type ExportTarget={format:ImageFormat;filename:string;label:string};
const targets:ExportTarget[]=[
 {format:'4:5',filename:'instagram-feed',label:'피드 이미지'},
 {format:'9:16',filename:'instagram-story',label:'스토리 이미지'},
 {format:'9:16',filename:'instagram-reels-still',label:'릴스용 정지 이미지'},
];

export function InstagramExports({disabled,pendingGeneration,onExport}:{disabled:boolean;pendingGeneration:boolean;onExport:(target:ExportTarget)=>void}){
 const {t,text}=useUiLanguage();
 return <section className="instagram-exports" aria-labelledby="instagram-exports-title">
  <div className="instagram-exports-heading"><Layers size={22} aria-hidden="true"/><div><h2 id="instagram-exports-title">{text("인스타그램에 맞춰 저장하세요.")}</h2><p>{text("같은 광고를 필요한 크기로 저장합니다. 편집 중인 원본은 그대로 유지됩니다.")}</p></div></div>
  <div className="instagram-export-options">{targets.map(target=>{
   const size=getImageFormat(target.format);
   return <button type="button" key={target.filename} disabled={disabled} aria-label={t(`${text(target.label)} PNG 저장`,`Save ${text(target.label).toLowerCase()} PNG`)} onClick={()=>onExport({...target,label:text(target.label)})}>
    <span><strong>{text(target.label)}</strong><small>{target.format} · {size.width} × {size.height} px</small></span>
    <span className="instagram-file-type">PNG<ArrowDownToLine size={16} aria-hidden="true"/></span>
   </button>;
  })}</div>
  <p className="instagram-export-note">{text("릴스용 파일은 영상 제작에 사용할 정지 이미지입니다. 동영상 생성과 인스타그램 자동 업로드는 아직 지원하지 않습니다. 게시 전 인스타그램 미리보기에서 잘림과 글자 위치를 확인하세요.")}</p>
  {pendingGeneration&&<p className="instagram-export-pending">{text("새 시안을 생성하고 사용 확정한 뒤 저장할 수 있습니다.")}</p>}
 </section>;
}
