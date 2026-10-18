import {useId} from 'react';
import {useUiLanguage} from './ui-language';
// Curated illustration coordinates on the owned AI sample, never detector output.
// Crop uses the same asset bytes; the labeled values are invented example dimensions.
export function ShowcaseDimensionInset({image}:{image:string}){
 const {t}=useUiLanguage(),arrow=useId().replace(/:/g,'')+'-sample-arrow';
 return <div className="showcase-dimension-inset"><div className="sample-dimension-copy"><span>{t('PHOTO DETAIL','PHOTO DETAIL')}</span><strong>{t('같은 사진,\n규격을 더하다.','Same photo.\nDimensions added.')}</strong><small>{t('예시 규격 · 실측 아님','Example dimensions · not measured')}</small></div><svg viewBox="180 610 870 660" role="img" aria-label={t('같은 가방 사진에 가로 280, 깊이 120, 몸통 높이 200 mm를 더한 예시 규격 시연. 실측이나 자동 검출 결과가 아닙니다.','The same bag photo with illustrative width 280, depth 120 and body height 200 mm. Not measured or automatically detected.')}>
  <defs><marker id={arrow} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#b36b35"/></marker></defs>
  <image href={image} x="0" y="0" width="1080" height="1920"/>
  <g stroke="#b36b35" strokeWidth="5" fill="none" markerStart={`url(#${arrow})`} markerEnd={`url(#${arrow})`}><path data-axis="width" d="M380 1198 L949 1160"/><path data-axis="depth" d="M240 1145 L380 1198"/><path data-axis="height" d="M974 1130 L908 728"/></g>
  <g fill="#fffaf2" stroke="#b36b35" strokeWidth="2"><rect x="555" y="1192" width="260" height="72" rx="7"/><rect x="180" y="1200" width="235" height="70" rx="7"/><rect x="717" y="900" width="265" height="72" rx="7"/></g>
  <g fill="#422819" fontFamily="sans-serif" fontSize="58" textAnchor="middle"><text x="685" y="1248">280 mm</text><text x="297" y="1255">120 mm</text><text x="850" y="956">200 mm</text></g>
 </svg></div>;
}
