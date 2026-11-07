// Explicit approval mode requires exact real files and a new scoped audit record.
import {open} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
import {OWNER} from './runner.mjs';
import {prepareUserExportTrial,prepareMockExportTrial,runMockExportTrial,runApprovedExportTrial,validateExportApproval} from './user-export-trial.mjs';
import {createHandoff} from './mcp-handoff.mjs';
const [mode,sourcePath,maskPath,manifestPath,directory,approvalPath]=process.argv.slice(2);
if(!['--validate-only','--mock','--execute-approved-user-export'].includes(mode)||!sourcePath||!maskPath||!manifestPath||(mode!=='--validate-only'&&!directory))throw Error('EXPLICIT_MODE_AND_INPUTS_REQUIRED');
async function boundedRead(path,maximum){const f=await open(path,'r');try{const stat=await f.stat();if(!stat.isFile()||stat.size>maximum)throw Error('INPUT_TOO_LARGE');const b=Buffer.alloc(maximum+1);let length=0;while(length<b.length){const {bytesRead}=await f.read(b,length,b.length-length,null);if(!bytesRead)break;length+=bytesRead;}if(length>maximum)throw Error('INPUT_TOO_LARGE');return b.subarray(0,length);}finally{await f.close();}}
const spec=JSON.parse((await boundedRead(manifestPath,16384)).toString('utf8'));
if(Object.keys(spec).sort().join(',')!=='maskSha256,ownerId,prompt'||spec.ownerId!==OWNER)throw Error('INVALID_INPUT_MANIFEST');
const prepared=await (mode==='--mock'?prepareMockExportTrial:prepareUserExportTrial)({...spec,bytes:await boundedRead(sourcePath,10*1024*1024),maskBytes:await boundedRead(maskPath,3999999)});
if(mode==='--validate-only'){process.stdout.write(JSON.stringify({mode,manifest:prepared.manifest,requestHash:prepared.requestHash,dispatchAuthorized:false})+'\n');}
else{
 const real=mode==='--execute-approved-user-export';
 const approval=real?validateExportApproval(prepared,JSON.parse((await boundedRead(approvalPath,16384)).toString('utf8'))):null;
 if(real&&!process.env.AIADCAST_NEXT_LOCAL_OPENAI_API_KEY)throw Error('EXISTING_KEY_UNAVAILABLE');
 const bridge=await createHandoff({directory:resolve(directory),mode:real?'approved-trial':'mock',profile:'user-export-shoe',emit:r=>process.stdout.write(JSON.stringify(r)+'\n')});
 const input=createInterface({input:process.stdin});input.on('line',line=>{try{void bridge.accept(JSON.parse(line)).catch(()=>bridge.stop());}catch{bridge.stop();}});input.on('close',()=>bridge.stop());
 try{const r=await (real?runApprovedExportTrial:runMockExportTrial)({prepared,directory:resolve(directory),execute:bridge.execute,...(real?{approval,apiKey:process.env.AIADCAST_NEXT_LOCAL_OPENAI_API_KEY}:{})});process.stdout.write(JSON.stringify({kind:'finished',...r})+'\n');}finally{bridge.stop();input.close();}
}
