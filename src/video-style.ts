export const videoStyles = {
  product: {
    label: ['상품 광고', 'Product ad'],
    media: ['상품 사진 또는 완성된 광고 이미지', 'Product photo or finished ad'],
    scenes: [['상품 전체', 'Full product'], ['디테일 확대', 'Closer look'], ['상품 마무리 컷', 'Final product shot']],
  },
  unboxing: {
    label: ['언박싱', 'Unboxing'],
    media: ['닫힌 박스와 열린 박스 사진을 순서대로 추가하세요.', 'Add closed-box and open-box photos in order.'],
    scenes: [['개봉 전', 'Closed box'], ['개봉 장면', 'The reveal'], ['구성품 전체', 'Contents']],
  },
  presenter: {
    label: ['UGC 광고', 'UGC ad'],
    media: ['제품을 직접 소개하거나 사용하는 영상 또는 상품 사진', 'Footage introducing or using the product, or product photos'],
    scenes: [['오프닝', 'Introduction'], ['상품 소개', 'Product walkthrough'], ['마무리 안내', 'Closing message']],
  },
  service: {
    label: ['서비스 광고', 'Service ad'],
    media: ['사진이 없어도 서비스명과 설명으로 시작할 수 있어요.', 'Start with a service name and description, or add photos.'],
    scenes: [['서비스 소개', 'Introduce service'], ['주요 특징', 'Key detail'], ['마무리 안내', 'Closing message']],
  },
} as const;

export type VideoStyle = keyof typeof videoStyles;
export function styleForBrief(brief:{kind:'product'|'service';style?:VideoStyle}):VideoStyle {
  return brief.style ?? (brief.kind==='service'?'service':'product');
}
export function sceneStops(seconds:number) {
  return [0, Math.round(seconds * .3), Math.round(seconds * .7), seconds];
}
export function videoShot(time:number, seconds:number, count:number, style:VideoStyle) {
  const [,middle,end]=sceneStops(seconds);
  const phase=time<middle?0:time<end?1:2;
  const start=[0,middle,end][phase], stop=[middle,end,seconds][phase];
  const progress=Math.min(1, Math.max(0,(time-start)/(stop-start)));
  const index=count===0?-1:Math.min(count-1,Math.floor(time*count/seconds));
  // A two-photo unboxing reveals the opened box as the middle shot begins.
  const source=style==='unboxing'&&count===2?(phase===0?0:1):index;
  const zoom=style==='product'?(phase===1 ? 1+.09*progress : 1)
    :style==='unboxing'&&phase===1?1+.035*progress:1;
  return {source,zoom};
}
