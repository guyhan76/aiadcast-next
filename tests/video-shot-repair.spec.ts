import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {mockSession,protectedScreen} from './helpers/authenticated-session';

// A seekable ten-second VP8 fixture made from one solid-color WebP keyframe.
async function solidMovie(color:string){
  const image=await sharp({create:{width:96,height:64,channels:3,background:color}}).webp().toBuffer();
  const index=image.indexOf(Buffer.from('VP8 ')),size=image.readUInt32LE(index+4);
  const frame=image.subarray(index+8,index+8+size);
  function element(id:string,...body:Buffer[]){
    const data=Buffer.concat(body);
    let length=1;while(data.length>=2**(7*length)-1)length++;
    const header=Buffer.alloc(length);header.writeUIntBE(2**(7*length)+data.length,0,length);
    return Buffer.concat([Buffer.from(id,'hex'),header,data]);
  }
  const byte=(v:number)=>Buffer.from([v]);
  const dur=Buffer.alloc(8);dur.writeDoubleBE(10000);
  const header=element('1a45dfa3',element('4286',byte(1)),element('42f7',byte(1)),element('42f2',byte(4)),element('42f3',byte(8)),element('4282',Buffer.from('webm')),element('4287',byte(2)),element('4285',byte(2)));
  const info=element('1549a966',element('2ad7b1',Buffer.from('0f4240','hex')),element('4489',dur),element('4d80',Buffer.from('test')),element('5741',Buffer.from('test')));
  const tracks=element('1654ae6b',element('ae',element('d7',byte(1)),element('73c5',byte(1)),element('83',byte(1)),element('86',Buffer.from('V_VP8')),element('e0',element('b0',byte(96)),element('ba',byte(64)))));
  const blocks=Array.from({length:50},(_,i)=>{const h=Buffer.from([129,0,0,128]);h.writeInt16BE(i*200,1);return element('a3',h,frame);});
  return Buffer.concat([header,element('18538067',info,tracks,element('1f43b675',element('e7',byte(0)),...blocks))]);
}

test('replace an interval in an existing ad and undo without requesting video generation',async({page})=>{
  test.setTimeout(65000);
  await protectedScreen(page,mockSession('repair-review','admin'));
  await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
  const submissions:string[]=[];
  page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/videos')submissions.push(r.url());});
  await page.goto('/#video');
  await page.getByText('기존 광고 영상 수정',{exact:true}).click();
  await page.getByLabel('완성 영상 파일').setInputFiles({name:'red.webm',mimeType:'video/webm',buffer:await solidMovie('red')});
  const preview=page.getByLabel('완성한 영상');
  await expect(preview).toBeVisible();await page.getByText('완성본 검수 · 구간 수정').click();
  await page.getByLabel('시작(초)').fill('2');
  await page.getByLabel('끝(초)').fill('5');
  await page.getByLabel('교체 파일').setInputFiles({name:'blue.webm',mimeType:'video/webm',buffer:await solidMovie('blue')});
  await page.getByRole('button',{name:'구간 적용',exact:true}).click();
  await expect(page.getByRole('button',{name:'직전 수정 되돌리기'})).toBeVisible({timeout:35000});
  const colors=await preview.evaluate(async(el:HTMLVideoElement)=>{
    const c=document.createElement('canvas');c.width=4;c.height=4;const ctx=c.getContext('2d')!;
    const results=[];
    for(const t of [1,3,7]){
      await new Promise<void>(resolve=>{el.addEventListener('seeked',()=>resolve(),{once:true});el.currentTime=t;});
      ctx.drawImage(el,0,0,4,4);const [r,,b]=ctx.getImageData(2,2,1,1).data;results.push(r>b?'red':'blue');
    }
    return results;
  });
  expect(colors).toEqual(['red','blue','red']);expect(submissions).toEqual([]);
  await page.getByRole('button',{name:'직전 수정 되돌리기'}).click();
  await expect(page.getByRole('button',{name:'직전 수정 되돌리기'})).toHaveCount(0);
});
