// Local preparation and mock orchestration only. No credentials or network transport.
import sharp from 'sharp';
import {validateImage,hashBytes,IMAGE_MODEL} from '../../server/openai-image-adapter.mjs';
import {prepareSelectiveProviderInput} from '../../server/selective-image-edit.mjs';
import {OWNER,evidenceStore,trialAdapter} from './runner.mjs';
import {USER_TRIAL_ID} from './connector-ledger.mjs';
import {connectorOnce,consumeLocalOnce} from './connector-once.mjs';
import {evidenceProtocol} from './connector-evidence.mjs';
export const SOURCE=Object.freeze({libraryFileId:'libfile_6757d82ad15c81918adacc1118e0f7dc',fileId:'file_00000000221c81fd98df126690638210',sha256:'fcfcf78a39244c84e36de3ea62f3459cf3776b0c1d0ed9818492e4eed8f52208',bytes:3178610,width:1080,height:1920});
export const MASK_V2=Object.freeze({sha256:'dce38d100484ac6d232a8bc7554fd77effca875190d472a9cf7920bc1a77990e',bytes:15511,selectedPixels:172139,connectedComponents:2,roiPngSha256:'65bcea45a53c7b1527c42ea3594d6357f0bd7b54488e6c3131e00a7ca0eda75a',roiPngBytes:12696});
export const SHOE_PROMPT='앞쪽에 크게 보이는 신발과 다리, 양말은 원본 그대로 유지한다. 뒤쪽의 작은 신발이 앞쪽 발과 반대쪽 발로 자연스럽게 보이도록 뒤쪽 정강이, 바지 끝, 발목, 신발 입구의 연결과 원근을 바로잡는다. 뒤쪽 신발은 현재 뒤·왼쪽 위치 근처에 두고 큰 위치 이동은 피한다. 제품 모델·색상·소재·로고·밑창 형태를 유지한다. 오른쪽 위에 따로 보이는 어두운 바지 조각은 두 다리의 자연스러운 가림 관계에 맞게 정리한다. 모든 문구, 가격, 로고 그래픽, 연락처와 수정 범위 밖 디자인을 보존한다.';
export const ROI=Object.freeze({x:56,y:0,width:1024,height:1536});
const caps=new WeakMap(),digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
async function asset(bytes){return {...await validateImage(bytes,'image/png',{maximumPixels:8294400}),bytes};}
async function crop(raw){const b=Buffer.alloc(ROI.width*ROI.height*4);for(let y=0;y<ROI.height;y++){const start=((y+ROI.y)*SOURCE.width+ROI.x)*4;raw.copy(b,y*ROI.width*4,start,start+ROI.width*4);}return asset(await sharp(b,{raw:{width:ROI.width,height:ROI.height,channels:4}}).png().toBuffer());}
async function prepare({bytes,maskBytes,maskSha256,prompt,ownerId},mock){
 if(ownerId!==OWNER)throw Error('OWNER_MISMATCH');
 if(!digest(maskSha256)||typeof prompt!=='string'||!prompt.trim()||prompt.length>2000)throw Error('MASK_AND_PROMPT_REQUIRED');
 if(!Buffer.isBuffer(bytes)||!Buffer.isBuffer(maskBytes)||bytes.length>10*1024*1024||maskBytes.length>=4000000)throw Error('INVALID_INPUT');
 const source=await asset(Buffer.from(bytes)),mask=await asset(Buffer.from(maskBytes));
 if(source.width!==1080||source.height!==1920||mask.width!==1080||mask.height!==1920||hashBytes(mask.bytes)!==maskSha256)throw Error('INPUT_MISMATCH');
 if(!mock&&prompt!==SHOE_PROMPT)throw Error('PROMPT_CONTRACT_MISMATCH');
 if(!mock&&(hashBytes(source.bytes)!==SOURCE.sha256||source.bytes.length!==SOURCE.bytes))throw Error('SOURCE_CONTRACT_MISMATCH');
 if(IMAGE_MODEL!=='gpt-image-2.6-sunburst')throw Error('MODEL_MISMATCH');
 const a=await sharp(source.bytes).ensureAlpha().raw().toBuffer(),m=await sharp(mask.bytes).ensureAlpha().raw().toBuffer();let count=0;
 for(let y=0;y<1920;y++)for(let x=0;x<1080;x++){const alpha=m[(y*1080+x)*4+3];if(alpha!==0&&alpha!==255)throw Error('INVALID_ALPHA');if(alpha===0){count++;if(x<ROI.x||x>=ROI.x+ROI.width||y<ROI.y||y>=ROI.y+ROI.height)throw Error('MASK_OUTSIDE_ROI');}}
 if(!count)throw Error('EMPTY_MASK');
 if(!mock&&(mask.sha256!==MASK_V2.sha256||mask.bytes.length!==MASK_V2.bytes||count!==MASK_V2.selectedPixels))throw Error('MASK_V2_CONTRACT_MISMATCH');
 const cropped={source:await crop(a),mask:await crop(m)},providerInput=await prepareSelectiveProviderInput({model:IMAGE_MODEL,...cropped});
 const manifest=Object.freeze({trialId:USER_TRIAL_ID,attemptId:USER_TRIAL_ID+'-attempt1',owner:OWNER,sourceKind:mock?'local-mock-export':'user-provided-export',serverArtifactRelation:'unverified',sourceId:SOURCE.libraryFileId,fileId:SOURCE.fileId,sourceHash:source.sha256,sourceBytes:source.bytes.length,width:1080,height:1920,maskHash:mask.sha256,roi:ROI,providerBindingHash:providerInput.bindingHash,model:IMAGE_MODEL,quality:'high',n:1,format:'png',prompt,selectedPixels:count});
 const result=Object.freeze({manifest,requestHash:hashBytes(Buffer.from(JSON.stringify(manifest))),dispatchAuthorized:false});
 caps.set(result,{source,mask,cropped,providerInput,mock});return result;
}
export const prepareUserExportTrial=options=>prepare(options,false);
export const prepareMockExportTrial=options=>prepare(options,true);
function get(f){const c=caps.get(f);if(!c)throw Error('LIVE_PREPARATION_REQUIRED');return c;}
export async function restoreUserExportTrial(f,generated){
 const c=get(f),meta=await validateImage(generated.bytes,'image/png',{maximumPixels:1536*1024,maximumBytes:16000000});
 if(meta.width!==1024||meta.height!==1536)throw Error('PROVIDER_SIZE_MISMATCH');
 const a=await sharp(c.source.bytes).ensureAlpha().raw().toBuffer(),m=await sharp(c.mask.bytes).ensureAlpha().raw().toBuffer(),b=await sharp(generated.bytes).ensureAlpha().raw().toBuffer();
 for(let y=0;y<1536;y++)for(let x=0;x<1024;x++){const dest=((y+ROI.y)*1080+x+ROI.x)*4,src=(y*1024+x)*4;if(m[dest+3]===0)b.copy(a,dest,src,src+4);}
 const bytes=await sharp(a,{raw:{width:1080,height:1920,channels:4}}).png().toBuffer();return {...generated,...await asset(bytes)};
}
// Operator approval evidence is a scoped audit record, not account authentication.
// Create this record only after a NEW explicit user approval; never infer it from
// the old synthetic approval, preparation instructions or the proposed prompt.
export function validateExportApproval(prepared,approval,now=Date.now()){
 const m=prepared?.manifest;
 if(!approval||Object.keys(approval).sort().join(',')!=='approved,expiresAt,issuedAt,ownerId,requestHash,scope,trialId,userEvidenceRef'||approval.approved!==true||approval.scope!=='one-paid-user-export-edit'||approval.ownerId!==OWNER||approval.trialId!==USER_TRIAL_ID||approval.requestHash!==prepared?.requestHash||!digest(approval.requestHash)||typeof approval.userEvidenceRef!=='string'||!/^Sentinel_[a-zA-Z0-9_-]{8,128}$/.test(approval.userEvidenceRef)||!Number.isSafeInteger(approval.issuedAt)||!Number.isSafeInteger(approval.expiresAt)||approval.issuedAt>now||approval.expiresAt<=now||approval.expiresAt-approval.issuedAt>3600000||m?.sourceKind!=='user-provided-export'||m?.sourceHash!==SOURCE.sha256||m?.maskHash!==MASK_V2.sha256||m?.prompt!==SHOE_PROMPT||m?.owner!==OWNER||m?.trialId!==USER_TRIAL_ID)throw Error('NEW_SCOPED_APPROVAL_REQUIRED');
 return Object.freeze({...approval});
}
async function runExport({prepared,directory,execute,now=Date.now,monotonic,dispatch,authorize=()=>{},diagnostics=()=>({})}){
 const c=get(prepared);authorize();
 const f={source:c.source,mask:c.mask,manifest:prepared.manifest,requestHash:prepared.requestHash};
 await evidenceStore(directory).prepare(f);
 let calls=0;
 const outcome=await connectorOnce({profile:'user-export-shoe',hash:f.requestHash,windowMs:180000,execute,now,monotonic,consume:()=>consumeLocalOnce(directory,'user-export-shoe'),dispatch:()=>{
  // No awaited preparation between the final committed-state/time gate and POST.
  authorize();if(calls++)throw Error('ALREADY_DISPATCHED');return dispatch(c);
 }});
 const evidence=evidenceProtocol({profile:'user-export-shoe',loadFixture:async()=>f,merge:(_s,_m,r)=>restoreUserExportTrial(prepared,r)});
 const report=await evidence.archiveOutcome({outcome,directory,hash:f.requestHash,execute,providerRequestId:diagnostics().providerRequestId});
 return {...report,dispatchCallbacks:calls,providerRequestId:diagnostics().providerRequestId??null};
}

function preserveUsageBeforeImage(adapter,directory){
 let observed=null;
 adapter.onSelectiveUsage=async receipt=>{
  await evidenceStore(directory).save('provider-usage-observed.json',receipt);
  observed=receipt; // Only durable validated usage may survive image failure.
 };
 return input=>adapter.editRegion(input).catch(error=>{if(observed)return observed;throw error;});
}
export async function runMockExportTrial(options){
 const c=get(options.prepared);if(!c.mock)throw Error('REAL_SOURCE_DISPATCH_NOT_APPROVED');
 // Optional injected mock transport exercises the real multipart/usage adapter;
 // it cannot be selected by the CLI or fall through to global fetch.
 let adapter,diagnostics=()=>({});if(options.mockFetch){({adapter,diagnostics}=trialAdapter('LOCAL_MOCK_NOT_A_CREDENTIAL',options.mockFetch));}
 const edit=adapter?preserveUsageBeforeImage(adapter,options.directory):null;
 const result=await runExport({...options,diagnostics,dispatch:c=>adapter?edit({...c.cropped,providerInput:c.providerInput,prompt:options.prepared.manifest.prompt,attemptId:USER_TRIAL_ID+'-attempt1'}):Promise.resolve({bytes:c.cropped.source.bytes,usage:{input_tokens:2,input_tokens_details:{text_tokens:1,image_tokens:1},output_tokens:1},cost:{microUsd:43}})});
 return {...result,mockCalls:result.dispatchCallbacks};
}
export async function runApprovedExportTrial({prepared,approval,apiKey,...options}){
 const c=get(prepared);if(c.mock)throw Error('MOCK_SOURCE_FORBIDDEN');
 const approved=validateExportApproval(prepared,approval,options.now?.()??Date.now());
 if(typeof apiKey!=='string'||!apiKey)throw Error('EXISTING_KEY_UNAVAILABLE');
 const {adapter,diagnostics}=trialAdapter(apiKey);
 const edit=preserveUsageBeforeImage(adapter,options.directory);
 await evidenceStore(options.directory).save('user-approval.json',approved);
 return runExport({...options,prepared,diagnostics,authorize:()=>validateExportApproval(prepared,approved,options.now?.()??Date.now()),dispatch:c=>edit({...c.cropped,providerInput:c.providerInput,prompt:SHOE_PROMPT,attemptId:USER_TRIAL_ID+'-attempt1'})});
}
