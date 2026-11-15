import {storageNamespace} from './beta-session';

type NativeBridge={postMessage:(json:string)=>void};
type NativeWindow=Window & {AiadcastNative?:NativeBridge};
const crcTable=Uint32Array.from({length:256},(_,i)=>{let n=i;for(let b=0;b<8;b++)n=n&1?(n>>>1)^0xedb88320:n>>>1;return n>>>0;});

// Keep the original image bytes in uncompressed ZIP entries.
export async function pngArchive(files:File[]){
 const parts:BlobPart[]=[],directory:Uint8Array<ArrayBuffer>[]=[],encoder=new TextEncoder();
 let offset=0;
 for(const file of files){
  const name=encoder.encode(file.name),bytes=new Uint8Array(await file.arrayBuffer());
  let crc=0xffffffff;for(const byte of bytes)crc=(crc>>>8)^crcTable[(crc^byte)&255];crc=(~crc)>>>0;
  const header=new Uint8Array(30+name.length),h=new DataView(header.buffer);
  h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(12,33,true);h.setUint32(14,crc,true);
  h.setUint32(18,bytes.length,true);h.setUint32(22,bytes.length,true);h.setUint16(26,name.length,true);header.set(name,30);
  const entry=new Uint8Array(46+name.length),d=new DataView(entry.buffer);
  d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);entry.set(header.subarray(4,28),6);d.setUint32(42,offset,true);entry.set(name,46);
  parts.push(header,file);directory.push(entry);offset+=header.length+bytes.length;
 }
 const end=new Uint8Array(22),e=new DataView(end.buffer);
 e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);
 e.setUint32(12,directory.reduce((n,x)=>n+x.length,0),true);e.setUint32(16,offset,true);
 return new Blob([...parts,...directory,end],{type:'application/zip'});
}
async function nativeExport(bridge:NativeBridge,files:File[],mode:'save'|'share',signal:AbortSignal){
 const id=crypto.randomUUID(),owner=storageNamespace();
 const send=(data:object)=>new Promise<void>((resolve,reject)=>{
  const clean=()=>{clearTimeout(timer);window.removeEventListener('aiadcast-batch-export',reply);signal.removeEventListener('abort',abort);};
  const abort=()=>{clean();reject(new DOMException('Cancelled','AbortError'));};
  const reply=(event:Event)=>{const v=(event as CustomEvent).detail;if(v?.id!==id)return;clean();if(v.ok)resolve();else reject(Error('EXPORT_FAILED'));};
  const timer=setTimeout(()=>{clean();reject(Error('EXPORT_TIMEOUT'));},60000);
  window.addEventListener('aiadcast-batch-export',reply);signal.addEventListener('abort',abort,{once:true});
  try{signal.throwIfAborted();bridge.postMessage(JSON.stringify({type:'batch-export',id,owner,...data}));}catch(e){clean();reject(e);}
 });
 await send({op:'begin',mode,count:files.length});
 try{
  for(const [index,file] of files.entries()){
   const encoded=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('FILE_READ'));reader.readAsDataURL(file);});
   await send({op:'file',index,name:file.name,base64:encoded});
  }
  await send({op:'finish'});
 }catch(e){bridge.postMessage(JSON.stringify({type:'batch-export',id,owner,op:'cancel'}));throw e;}
}
let nativeQueue:Promise<void>=Promise.resolve();
export function hasNativeExport(){return !!(window as NativeWindow).AiadcastNative;}
export async function exportBatch(files:File[],mode:'save'|'share',signal:AbortSignal,archive=false){
 signal.throwIfAborted();
 const native=(window as NativeWindow).AiadcastNative;
 if(native){
  const owner=storageNamespace();
  const transaction=nativeQueue.then(async()=>{
   signal.throwIfAborted();
   if(owner!==storageNamespace())throw Error('SESSION_CHANGED');
   window.dispatchEvent(new Event('aiadcast-export-context-needed'));
   await nativeExport(native,files,mode,signal);
  });
  nativeQueue=transaction.catch(()=>{});
  return transaction;
 }
 if(mode==='share'){
  if(!navigator.canShare?.({files}))throw Error('SHARE_UNAVAILABLE');
  await navigator.share({files});return;
 }
 const single=files.length===1&&!archive,blob=single?files[0]:await pngArchive(files);
 signal.throwIfAborted();
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=single?files[0].name:'aiadcast-images.zip';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
