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

function toneWav(seconds:number){
  const rate=16000, samples=rate*seconds, bytes=samples*2;
  const wav=Buffer.alloc(44+bytes);
  wav.write('RIFF',0);wav.writeUInt32LE(36+bytes,4);wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);
  wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(bytes,40);
  for(let i=0;i<samples;i++)wav.writeInt16LE(Math.round(12000*Math.sin(2*Math.PI*440*i/rate)),44+2*i);
  return wav;
}

test('replace sound and mute a smaller interval while preserving surrounding audio',async({page})=>{
  test.setTimeout(90000);
  await protectedScreen(page,mockSession('repair-audio','admin'));
  await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
  await page.goto('/#video');
  await page.getByText('기존 광고 영상 수정',{exact:true}).click();
  await page.getByLabel('완성 영상 파일').setInputFiles({name:'silent.webm',mimeType:'video/webm',buffer:await solidMovie('red')});
  async function apply(mode:'audio'|'mute',from:number,to:number){
    const preview=page.getByLabel('완성한 영상');
    await expect(preview).toBeVisible();
    const previous=await preview.getAttribute('src');
    await page.getByText('완성본 검수 · 구간 수정',{exact:true}).click();
    await page.getByLabel('시작(초)').fill(String(from));await page.getByLabel('끝(초)').fill(String(to));
    await page.getByLabel('수정 방식').selectOption(mode);
    if(mode==='audio')await page.getByLabel('교체 파일').setInputFiles({name:'tone.wav',mimeType:'audio/wav',buffer:toneWav(7)});
    await page.getByRole('button',{name:'구간 적용',exact:true}).click();
    await expect(preview).not.toHaveAttribute('src',previous!,{timeout:30000});
    await expect(preview).toHaveAttribute('src',/^blob:/);
  }
  await apply('audio',2,8);
  await apply('mute',4,6);
  const audible=await page.getByLabel('완성한 영상').evaluate(async (video:HTMLVideoElement)=>{
    const ctx=new AudioContext(),analyser=ctx.createAnalyser();analyser.fftSize=1024;
    const node=ctx.createMediaElementSource(video);node.connect(analyser);await ctx.resume();
    const data=new Float32Array(analyser.fftSize),out=[];
    try{
      for(const t of [1,3,5,7,9]){
        await new Promise<void>(resolve=>{video.addEventListener('seeked',()=>resolve(),{once:true});video.currentTime=t;});
        await video.play();await new Promise(resolve=>setTimeout(resolve,220));
        analyser.getFloatTimeDomainData(data);video.pause();
        out.push(data.some(v=>Math.abs(v)>.03));
      }
    }finally{video.pause();node.disconnect();await ctx.close();}
    return out;
  });
  expect(audible).toEqual([false,true,false,true,false]);
});
