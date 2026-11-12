export const textLayers=['brand','title','description','company','contact'] as const;
export type TextLayer=typeof textLayers[number];
export type TextStyle={x:number;y:number;scale:number;font:'sans'|'serif'|'mono'};
export type PrecisionSettings={text:Record<TextLayer,TextStyle>;background:{x:number;y:number;zoom:number;opacity:number};sticker:{glyph:string;x:number;y:number;size:number};motion:'none'|'rays'|'swoosh'};
export const stickerChoices=['','✨','😊','😍','😎','👍','❤️','🎉','⭐','🔥','💬'] as const;
const defaultText=():TextStyle=>({x:0,y:0,scale:1,font:'sans'});
export function defaultPrecision():PrecisionSettings{return {text:{brand:defaultText(),title:defaultText(),description:defaultText(),company:defaultText(),contact:defaultText()},background:{x:0,y:0,zoom:1,opacity:1},sticker:{glyph:'',x:.8,y:.7,size:85},motion:'none'};}
const inRange=(value:unknown,min:number,max:number)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
export function parsePrecision(raw:unknown):PrecisionSettings{
 if(raw===undefined)return defaultPrecision();
 const s=raw as PrecisionSettings;
 if(!s||typeof s!=='object'||!s.text||!s.background||!s.sticker||!['none','rays','swoosh'].includes(s.motion))throw Error('부분 수정 설정을 확인해주세요.');
 for(const layer of textLayers){const t=s.text[layer];if(!t||!inRange(t.x,-.1,.1)||!inRange(t.y,-.1,.1)||!inRange(t.scale,.7,1.3)||!['sans','serif','mono'].includes(t.font))throw Error('문구 위치와 글꼴 설정을 확인해주세요.');}
 const b=s.background;if(!inRange(b.x,-.5,.5)||!inRange(b.y,-.5,.5)||!inRange(b.zoom,1,2)||!inRange(b.opacity,0,1))throw Error('배경 사진 조정값을 확인해주세요.');
 const t=s.sticker;if(!stickerChoices.includes(t.glyph as typeof stickerChoices[number])||!inRange(t.x,.1,.9)||!inRange(t.y,.1,.9)||!inRange(t.size,40,160))throw Error('이모지 장식 설정을 확인해주세요.');
 return {text:Object.fromEntries(textLayers.map(layer=>[layer,{...s.text[layer]}])) as PrecisionSettings['text'],background:{...b},sticker:{...t},motion:s.motion};
}
