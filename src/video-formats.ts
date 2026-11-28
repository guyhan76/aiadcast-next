export const videoFormats = [
  {ratio:'16:9', width:1280, height:720},
  {ratio:'4:3', width:960, height:720},
  {ratio:'1:1', width:720, height:720},
  {ratio:'3:4', width:720, height:960},
  {ratio:'9:16', width:720, height:1280},
] as const;

export type VideoRatio = typeof videoFormats[number]['ratio'];
export const defaultVideoRatio:VideoRatio = '9:16';

export function getVideoFormat(ratio:unknown = defaultVideoRatio) {
  const format = videoFormats.find(option => option.ratio === ratio);
  if (!format) throw Error('INVALID_VIDEO');
  return format;
}
