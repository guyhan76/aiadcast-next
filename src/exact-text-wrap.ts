// Preserve every character. Prefer whitespace-delimited words; only a token
// wider than the available line may be split, and then only at grapheme edges.
export function wrapExactText(value:string,width:number,measure:(text:string)=>number):string[]{
 if(!Number.isFinite(width)||width<=0)throw Error('EXACT_TEXT_OVERFLOW');
 const lines:string[]=[];let line='';
 const flush=()=>{if(line){lines.push(line);line='';}};
 const appendGraphemes=(token:string)=>{
  for(const {segment} of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(token)){
   if(measure(segment)>width)throw Error('EXACT_TEXT_OVERFLOW');
   if(line&&measure(line+segment)>width)flush();line+=segment;
  }
 };
 for(const token of value.match(/\r\n|[\r\n]|[^\S\r\n]+|[^\s]+/gu)??[]){
  if(/^[\r\n]/.test(token)){flush();continue;}
  if(measure(token)<=width){if(line&&measure(line+token)>width)flush();line+=token;}
  else{flush();appendGraphemes(token);}
 }
 flush();return lines;
}
