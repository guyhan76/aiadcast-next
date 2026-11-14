import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudGenerationService} from '../server/cloud/beta.mjs';
import {hashBytes} from '../server/openai-image-adapter.mjs';
function fixture(){
 let row,uploads=0,failUpload=false,failRecord=false;
 const bytes=Buffer.from('mock immutable image bytes'),asset={bytes,sha256:hashBytes(bytes),mime:'image/png',width:20,height:30};
 const service=new CloudGenerationService();service.cloudUser='tenant-fixture';
 service.db={prepare:sql=>({get:async()=>row,run:async(hash,mime,width,height,bytes)=>{if(failRecord)throw Error('simulated record failure');row={hash,mime,width,height,bytes};}})};
 service.storage={verifyAsset:async()=>true,put:async()=>{uploads++;if(failUpload)throw Error('simulated upload failure');}};
 return {service,asset,get row(){return row;},set row(v){row=v;},uploads:()=>uploads,failUpload:v=>failUpload=v,failRecord:v=>failRecord=v};
}
test('committed metadata and verified object permit upload reuse; every byte hash is still checked',async()=>{
 const f=fixture();await f.service.storeAsset(f.asset);await f.service.storeAsset(f.asset);assert.equal(f.uploads(),1);
 await assert.rejects(f.service.storeAsset({...f.asset,bytes:Buffer.from('different')}),/STORAGE_CONTENT_MISMATCH/);assert.equal(f.uploads(),1);
 for(const change of [{mime:'image/webp'},{width:21},{height:31},{bytes:100}]){const old=f.row;f.row={...old,...change};await assert.rejects(f.service.storeAsset(f.asset),/STORAGE_CONTENT_MISMATCH/);f.row=old;}
 f.service.storage.verifyAsset=async()=>{throw Error('SUPABASE_CONNECTION_FAILED');};await assert.rejects(f.service.storeAsset(f.asset),/SUPABASE_CONNECTION_FAILED/);assert.equal(f.uploads(),1);
});
test('an upload failure or lost metadata commit cannot become false stored-output proof',async()=>{
 for(const kind of ['upload','record']){
  const f=fixture();if(kind==='upload')f.failUpload(true);else f.failRecord(true);
  await assert.rejects(f.service.storeAsset(f.asset));assert.equal(f.row,undefined);
  f.failUpload(false);f.failRecord(false);await f.service.storeAsset(f.asset);assert.equal(f.uploads(),2);assert.ok(f.row);
 }
});
test('separate tenant metadata cannot authorize another tenant to skip its upload',async()=>{
 const a=fixture(),b=fixture();await a.service.storeAsset(a.asset);await b.service.storeAsset(b.asset);assert.equal(a.uploads(),1);assert.equal(b.uploads(),1);
});
