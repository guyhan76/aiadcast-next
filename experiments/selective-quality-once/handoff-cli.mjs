// Live process with explicit operator MCP handoff. No restart/resume permission.
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
import {createHandoff} from './mcp-handoff.mjs';
import {fixture,evidenceStore,trialAdapter,PROMPT,TRIAL_ID} from './runner.mjs';
import {connectorOnce,consumeLocalOnce} from './connector-once.mjs';
import {prepareSelectiveProviderInput} from '../../server/selective-image-edit.mjs';
import {IMAGE_MODEL} from '../../server/openai-image-adapter.mjs';
import {archiveOutcome} from './connector-evidence.mjs';
const [mode,directoryArg]=process.argv.slice(2);
if(!['--mock','--execute-approved-trial'].includes(mode)||!directoryArg)throw Error('EXPLICIT_MODE_AND_DIRECTORY_REQUIRED');
const directory=resolve(directoryArg),f=await fixture();
if(mode==='--execute-approved-trial'&&!process.env.AIADCAST_NEXT_LOCAL_OPENAI_API_KEY)throw Error('EXISTING_KEY_UNAVAILABLE');
const providerInput=await prepareSelectiveProviderInput({model:IMAGE_MODEL,...f});
await evidenceStore(directory).prepare(f);
// Real credentials are accessed only in the actual dispatch callback, never printed or persisted.
let calls=0,providerRequestId=null;
const bridge=await createHandoff({directory,mode:mode==='--mock'?'mock':'approved-trial',emit:r=>process.stdout.write(JSON.stringify(r)+'\n')});
const input=createInterface({input:process.stdin});
input.on('line',line=>{let r;try{r=JSON.parse(line);}catch{bridge.stop();return;}void bridge.accept(r).catch(()=>bridge.stop());});
input.on('close',()=>bridge.stop());
const outcome=await connectorOnce({hash:f.requestHash,execute:bridge.execute,consume:()=>consumeLocalOnce(directory),windowMs:180000,dispatch:async()=>{
 if(calls++)throw Error('ONE_SHOT_ALREADY_DISPATCHED');
 if(mode==='--mock')return {bytes:f.source.bytes,usage:{input_tokens:2,input_tokens_details:{text_tokens:1,image_tokens:1},output_tokens:1},cost:{microUsd:43}};
 const key=process.env.AIADCAST_NEXT_LOCAL_OPENAI_API_KEY;if(!key)throw Error('EXISTING_KEY_UNAVAILABLE');
 const {adapter,diagnostics}=trialAdapter(key);
 try{return await adapter.editRegion({...f,providerInput,prompt:PROMPT,attemptId:TRIAL_ID+'-attempt1'});}finally{providerRequestId=diagnostics().providerRequestId;}
}});
const report=await archiveOutcome({outcome,directory,hash:f.requestHash,execute:bridge.execute,providerRequestId});
await evidenceStore(directory).save('handoff-outcome.json',{mode,state:report.state,dispatchCallbacks:calls,providerRequestId});
bridge.stop();input.close();process.stdout.write(JSON.stringify({kind:'finished',mode,state:report.state,dispatchCallbacks:calls,providerRequestId})+'\n');
