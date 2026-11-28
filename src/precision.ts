export const textLayers=['brand','title','description','company','contact'] as const;
export type TextLayer=typeof textLayers[number];
export type TextStyle={x:number;y:number;scale:number;font:'sans'|'serif'|'mono';color:string;opacity:number};
export type ExpressionType='neutral'|'smile'|'laugh'|'wink'|'surprised'|'excited'|'cool'|'confident';
export type BackgroundEffect='none'|'blur'|'darken'|'brighten'|'saturate'|'desaturate'|'warm'|'cool';
export type MotionType='none'|'rays'|'swoosh'|'spiral'|'pulse'|'glow'|'shimmer'|'float';
export type PrecisionSettings={
  text:Record<TextLayer,TextStyle>;
  background:{x:number;y:number;zoom:number;opacity:number;effect:BackgroundEffect;effectIntensity:number};
  sticker:{glyph:string;x:number;y:number;size:number;rotation:number};
  expression:ExpressionType;
  motion:MotionType;
};

export const stickerChoices=['','✨','😊','😍','😎','👍','❤️','🎉','⭐','🔥','💬','🌟','💫','🎊','👏','🙌'] as const;
export const expressionChoices=['neutral','smile','laugh','wink','surprised','excited','cool','confident'] as const;
export const expressionLabels:Record<ExpressionType,string>={neutral:'보통',smile:'미소',laugh:'웃음',wink:'윙크',surprised:'놀람',excited:'신나함',cool:'멋진',confident:'자신감'};
export const motionChoices=['none','rays','swoosh','spiral','pulse','glow','shimmer','float'] as const;
export const motionLabels:Record<MotionType,string>={none:'없음',rays:'빛살',swoosh:'곡선',spiral:'소용돌이',pulse:'맥박',glow:'글로우',shimmer:'반짝임',float:'부양'};
export const backgroundEffectChoices:BackgroundEffect[]=['none','blur','darken','brighten','saturate','desaturate','warm','cool'];
export const backgroundEffectLabels:Record<BackgroundEffect,string>={none:'없음',blur:'흐림',darken:'어두워짐',brighten:'밝아짐',saturate:'채도 올림',desaturate:'채도 내림',warm:'따뜻한 톤',cool:'차가운 톤'};

const defaultText=():TextStyle=>({x:0,y:0,scale:1,font:'sans',color:'#000000',opacity:1});
export function defaultPrecision():PrecisionSettings{
  return {
    text:{brand:defaultText(),title:defaultText(),description:defaultText(),company:defaultText(),contact:defaultText()},
    background:{x:0,y:0,zoom:1,opacity:1,effect:'none',effectIntensity:0.5},
    sticker:{glyph:'',x:.8,y:.7,size:85,rotation:0},
    expression:'neutral',
    motion:'none'
  };
}

const inRange=(value:unknown,min:number,max:number)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const isValidColor=(color:unknown)=>typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color);
const isValidExpression=(expr:unknown)=>expressionChoices.includes(expr as ExpressionType);
const isValidMotion=(motion:unknown)=>motionChoices.includes(motion as MotionType);
const isValidEffect=(effect:unknown)=>backgroundEffectChoices.includes(effect as BackgroundEffect);

export function parsePrecision(raw:unknown):PrecisionSettings{
  if(raw===undefined)return defaultPrecision();
  const s=raw as PrecisionSettings;
  if(!s||typeof s!=='object'||!s.text||!s.background||!s.sticker)throw Error('부분 수정 설정을 확인해주세요.');
  
  for(const layer of textLayers){
    const t=s.text[layer];
    if(!t||!inRange(t.x,-.1,.1)||!inRange(t.y,-.1,.1)||!inRange(t.scale,.7,1.3)||!['sans','serif','mono'].includes(t.font)||!isValidColor(t.color)||!inRange(t.opacity,0,1))
      throw Error('문구 위치, 글꼴, 색상 설정을 확인해주세요.');
  }
  
  const b=s.background;
  if(!inRange(b.x,-.5,.5)||!inRange(b.y,-.5,.5)||!inRange(b.zoom,1,2)||!inRange(b.opacity,0,1)||!isValidEffect(b.effect)||!inRange(b.effectIntensity,0,1))
    throw Error('배경 사진 조정값을 확인해주세요.');
  
  const t=s.sticker;
  if(!stickerChoices.includes(t.glyph as typeof stickerChoices[number])||!inRange(t.x,.1,.9)||!inRange(t.y,.1,.9)||!inRange(t.size,40,160)||!inRange(t.rotation,0,360))
    throw Error('이모지 장식 설정을 확인해주세요.');
  
  if(!isValidExpression(s.expression)||!isValidMotion(s.motion))
    throw Error('표정과 움직임 설정을 확인해주세요.');
  
  return {
    text:Object.fromEntries(textLayers.map(layer=>[layer,{...s.text[layer]}])) as PrecisionSettings['text'],
    background:{...b},
    sticker:{...t},
    expression:s.expression,
    motion:s.motion
  };
}
