import {test} from 'node:test';import assert from 'node:assert/strict';
import {newProject} from '../src/model.ts';
import {acceptedEditSourceMatches} from '../src/selective-source.ts';
import {completeAdKey} from '../src/complete-ad.ts';
import {generatedCompatibilityKey} from '../src/generated.ts';
import {generationSourceHash} from '../src/generation-input.ts';
function fixture(){
 const p=newProject();p.generation.mode='creative';p.dimensions.visible=false;
 const hash='a'.repeat(64),asset={name:'ad.png',data:'data:image/png;base64,AA==',sha256:hash,width:1080,height:1920};
 p.generated={jobId:'accepted-job',mode:'creative',role:'creative',sourceHash:generationSourceHash(p),asset,model:'fixture',createdAt:new Date().toISOString(),specificationKey:generatedCompatibilityKey(p),composition:'complete-ad',compositionKey:completeAdKey(p)};
 const job={id:p.generated.jobId,projectId:p.id,state:'accepted',mode:'creative',sourceHash:p.generated.sourceHash,composition:'complete-ad',compositionKey:completeAdKey(p),artifactId:hash,artifact:{id:hash,sha256:hash,dataUrl:asset.data,width:1080,height:1920,role:'creative'}};
 return {p,job};
}
test('accepted edit uses only the exact saved job, project and verified artifact identity',()=>{
 const {p,job}=fixture();assert.equal(acceptedEditSourceMatches(p,job),true);
 for(const change of [{id:'different-job'},{projectId:'another-image'},{state:'ready'},{mode:'original'},{artifactId:'b'.repeat(64)},{sourceHash:'b'.repeat(64)},{compositionKey:'changed'},{artifact:{...job.artifact,width:941}},{artifact:null}])assert.equal(acceptedEditSourceMatches(p,{...job,...change}),false);
});
test('local text overlays and unverified input changes cannot edit a stale saved source',()=>{
 const {p,job}=fixture();for(const change of [{textEdit:{}},{exactTextVersion:1},{productName:'Changed product'}])assert.equal(acceptedEditSourceMatches({...p,...change},job),false);
});
