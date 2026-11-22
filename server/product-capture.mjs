import {spawn} from 'node:child_process';
import sharp from 'sharp';

function readWords(png){
  return new Promise((resolve,reject)=>{
    const child=spawn('tesseract',['stdin','stdout','-l','kor+eng','--psm','11','tsv'],{
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
    if(!line){line={x,y,right:x,h,text:''};groups.set(key,line);}
    if(line.text&&x-line.right>Math.max(2,h*.29))line.text+=' ';
    line.text+=word;line.right=x+w;line.h=Math.max(line.h,h);
  }
  return [...groups.values()].sort((a,b)=>a.y-b.y||a.x-b.x);
}
export function extractCaptureFields(tsv,width,height){
  const lines=linesFromTsv(tsv);
  const prices=lines.filter(l=>/^(?:₩\s*[\d,]+|[\d,]+\s*원)$/.test(l.text));
  const price=prices.length===1?prices[0]:null;
  if(!price)throw Error('CAPTURE_UNREADABLE');
  const aligned=lines.filter(l=>Math.abs(l.x-price.x)<Math.max(width*.04,price.h*2));
  const titles=aligned.filter(l=>l.y<price.y&&price.y-l.y<price.h*5.3&&l.h>=price.h*.42&&
    l.text.length>=3&&!/상품평|리뷰|별점|평점|장바구니|배송|로그인|구매|할인/.test(l.text));
  const maxHeight=Math.max(0,...titles.map(l=>l.h));
  const first=titles.find(l=>l.h>=maxHeight*.94);
  let title=first?.text??'';
  const pieces=title.split(/\s+/);
  const repeat=pieces.findIndex((v,i)=>i>0&&v===pieces[i-1]);
  if(repeat>0)title=pieces.slice(0,repeat).join(' ');
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
  const shipping=below.find(l=>l.y-price.y<price.h*10&&compact(l.text)==='무료배송')?'무료배송':'';
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
  const {crop,...fields}=extractCaptureFields(await readWords(ocr),info.width,info.height);
  const image=crop?'data:image/jpeg;base64,'+(await sharp(scaled).extract(crop).resize({width:1000,withoutEnlargement:true}).jpeg({quality:90}).toBuffer()).toString('base64'):'';
  return {...fields,image};
}
