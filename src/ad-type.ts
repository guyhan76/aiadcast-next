// Measurement-based fitting preserves exact copy. It never paraphrases, hides a
// price or silently treats truncated words as a successful export.
export function fitAdText(value:string,width:number,initial:number,min:number,maxLines:number,measure:(text:string,size:number)=>number){
 const wrap=(size:number)=>{
  const lines:string[]=[];
  for(const paragraph of value.split('\n')){
   let line='';
   for(const char of Array.from(paragraph)){
    if(line&&measure(line+char,size)>width){lines.push(line);line=char;}else line+=char;
   }
   lines.push(line);
  }
  return lines;
 };
 let size=initial,lines=wrap(size);
 while(size>min&&(lines.length>maxLines||lines.some(line=>measure(line,size)>width))){size=Math.max(min,size-1);lines=wrap(size);}
 return {size,lines,overflow:lines.length>maxLines||lines.some(line=>measure(line,size)>width)};
}
