import type {VideoBrief} from './video-brief';
export const videoDurations = [10, 15, 20, 30] as const;
export type VideoDuration = typeof videoDurations[number];
export type VideoSource = {name: string; media: Blob | string; kind: 'image' | 'video'; brief?:VideoBrief};

export function recommendDuration(images: number, clips: number, brief: string): VideoDuration {
  const comparison = /비교|전후|전\s*[·/과후-]\s*후|단계별|과정 전체|before.{0,12}after|compar(?:e|ison)|step.by.step/i.test(brief);
  const demonstration = /사용법|사용\s*장면|언박싱|개봉|시연|데모|unbox|demo|how.to/i.test(brief);
  if (comparison && (clips > 0 || images >= 2)) return 30;
  if (clips > 0 || (demonstration && images >= 2)) return 20;
  if (images > 1 || /모집|구인|채용|계약직|상세|특징|구성품|detail|features/i.test(brief)) return 15;
  return 10;
}
