import {spawn} from 'node:child_process';
import sharp from 'sharp';

function readWords(png,layout){
  return new Promise((resolve,reject)=>{
    const child=spawn('tesseract',['stdin','stdout','-l','kor+eng','--psm',layout,'tsv'],{
      stdio:['pipe','pipe','ignore'],env:{...process.env,OMP_THREAD_LIMIT:'1'},timeout:16000,killSignal:'SIGKILL'
    });
    const chunks=[];let size=0;
    child.once('error',reject);
    child.stdin.on('error',()=>{});
    child.stdout.on('data',part=>{size+=part.length;if(size>2_000_000)child.kill('SIGKILL');else chunks.push(part);});
    child.once('close',code=>code===0?resolve(Buffer.concat(chunks).toString('utf8')):reject(Error('CAPTURE_UNREADABLE')));
    child.stdin.end(png);
  });
}
function linesFromTsv(tsv){
  const groups=new Map();
  for(const row of tsv.split('\n')){
    const cells=row.split('\t');
    if(cells[0]!=='5'||!cells[11]?.trim())continue;
    const key=cells.slice(1,5).join('-');
    const x=Number(cells[6]),y=Number(cells[7]),w=Number(cells[8]),h=Number(cells[9]),word=cells[11].trim();
    let line=groups.get(key);
    if(!line){line={x,y,right:x,h,heights:[],text:''};groups.set(key,line);}
    if(line.text&&x-line.right>Math.max(2,h*.29))line.text+=' ';
    line.text+=word;line.right=x+w;line.heights.push(h);
  }
  for(const line of groups.values()){
    line.heights.sort((a,b)=>a-b);
    line.h=line.heights[Math.floor(line.heights.length/2)];
  }
  return [...groups.values()].sort((a,b)=>a.y-b.y||a.x-b.x);
}
export function extractCaptureFields(tsv,width,height){
  const lines=linesFromTsv(tsv);
  // Sparse OCR can put the monthly installment label in a separate text block.
  const amounts=lines.filter(l=>/^(?:₩\s*[\d,]+|[\d,]+\s*원)$/.test(l.text));
  const prices=amounts.filter(amount=>!lines.some(label=>
    Math.abs(label.y-amount.y)<amount.h*.5&&label.right<=amount.x&&amount.x-label.right<amount.h&&
    /(?:월|매월|할부)\s*$/.test(label.text)));
  if(prices.length>1)throw Error('CAPTURE_PRICE_AMBIGUOUS');
  if(!prices.length)throw Error('CAPTURE_UNREADABLE');
  const price=prices[0];
  const aligned=lines.filter(l=>Math.abs(l.x-price.x)<Math.max(width*.04,price.h*.7));
  const candidates=aligned.filter(l=>l.y<price.y&&price.y-l.y<price.h*8&&l.h>=price.h*.42&&
    l.text.length>=2&&!/상품평|리뷰|별점|평점|장바구니|배송|로그인|구매|할인|모아보기/.test(l.text.replace(/\s/g,'')));
  const maxHeight=Math.max(0,...candidates.map(l=>l.h));
  const titles=candidates.filter(l=>l.h>=maxHeight*.88);
  const last=titles.at(-1);
  let start=titles.length-1;
  while(start>0&&titles[start].y-titles[start-1].y<maxHeight*1.9)start--;
  const first=titles[start];
  const titleRows=first?lines.filter(l=>l.y>=first.y&&l.y<=last.y+maxHeight*.35&&l.x>=first.x-maxHeight&&
    l.h>=maxHeight*.7):[];
  let title=titleRows.map(l=>l.text).join(' ');
  const pieces=title.split(/\s+/);
  const repeat=pieces.findIndex((v,i)=>i>0&&v===pieces[i-1]);
  if(repeat>0){
    const models=title.match(/\b(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z][A-Z0-9-]{4,19}\b/g)??[];
    title=pieces.slice(0,repeat).join(' ');
    for(const model of new Set(models))if(!title.includes(model))title+=' '+model;
  }
  const below=aligned.filter(l=>l.y>price.y);
  const compact=s=>s.replace(/\s/g,'');
  function option(label) {
    for(const [i,line] of below.entries()){
      const match=label.exec(line.text);
      if(!match)continue;
      const inline=match[1]?.trim();
      if(inline)return inline;
      const next=below[i+1];
      if(next&&next.y-line.y<line.h*4&&/^[\p{L}\d][\p{L}\d ()/-]{0,20}$/u.test(next.text)&&!/[배송적립]|사이즈|색상/.test(next.text))return next.text;
    }
    return '';
  }
  const shipping=below.find(l=>l.y-price.y<price.h*10&&/^(?:[^가-힣]{0,2})무료배송(?:$|[·•|]|CJ대한통운)/i.test(compact(l.text)))?'무료배송':'';
  const size=option(/^사\s*이\s*즈\s*[:：]?\s*(.*)$/);
  const color=option(/^색\s*상\s*[:：]?\s*(.*)$/);
  // In a wide two-column listing the hero sits to the left of the matching price column.
  // Keep this only as a visible candidate, never render the browser chrome as the product.
  let crop;
  if(first&&width>height*1.4&&price.x>width*.42&&price.x<width*.7){
    const left=Math.round(price.x*.23),top=Math.max(0,Math.round(first.y-first.h*1.15));
    const side=Math.floor(price.x*.74);
    crop={left,top,width:side,height:Math.min(side,height-top)};
  }
  return {title:title.slice(0,100),option:[color,size].filter(Boolean).join(' · '),price:compact(price.text),shipping,description:'',crop};
}
export async function importProductCapture(data){
  if(typeof data!=='string'||data.length>7_000_000||!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(data))throw Error('CAPTURE_UNREADABLE');
  const source=sharp(Buffer.from(data.slice(data.indexOf(',')+1),'base64'),{limitInputPixels:18_000_000});
  const meta=await source.metadata();
  if(!['jpeg','png','webp'].includes(meta.format)||!meta.width||!meta.height)throw Error('CAPTURE_UNREADABLE');
  const scale=Math.min(1.5,2800/Math.max(meta.width,meta.height));
  const {data:scaled,info}=await source.rotate().resize({width:Math.max(1,Math.round((meta.autoOrient?.width||meta.width)*scale))}).flatten({background:'white'}).png().toBuffer({resolveWithObject:true});
  const ocr=await sharp(scaled).grayscale().sharpen().png().toBuffer();
  let parsed;
  for(const layout of ['11','6']){
    const tsv=await readWords(ocr,layout);
    try{parsed=extractCaptureFields(tsv,info.width,info.height);}catch(error){
      if(error.message!=='CAPTURE_UNREADABLE'||layout==='6')throw error;
    }
    if(parsed?.title)break;
  }
  if(!parsed?.title)throw Error('CAPTURE_UNREADABLE');
  const {crop,...fields}=parsed;
  const image=crop?'data:image/jpeg;base64,'+(await sharp(scaled).extract(crop).resize({width:1000,withoutEnlargement:true}).jpeg({quality:90}).toBuffer()).toString('base64'):'';
  return {...fields,image};
}
