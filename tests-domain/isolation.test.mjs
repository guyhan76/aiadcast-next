import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isolationIssues,providerBinding} from '../server/isolation.mjs';
import {releaseGates,releaseReport} from '../server/release-gates.mjs';
const plan=()=>JSON.parse(readFileSync(new URL('../config/independence.json',import.meta.url)));
const evidence=()=>JSON.parse(readFileSync(new URL('../config/release-evidence.json',import.meta.url)));
test('the checked-in plan is independent and cannot claim release readiness',()=>{
 const p=plan();assert.deepEqual(isolationIssues(p),[]);
 for(const target of ['internal','production']){
  const report=releaseReport(p,evidence(),target);assert.equal(report.readyForSubmission,false);assert.ok(report.blockers.length>=10);
 }
});
test('legacy identity, inherited resources and cross-environment sharing are rejected',()=>{
 for(const mutate of [
  p=>{p.android.storeApplicationId=p.android.legacyApplicationId;},
  p=>{p.android.stagingApplicationId=p.android.storeApplicationId;},
  p=>{p.legacyPolicy.importAccountsOrCredits=true;},
  p=>{p.environments.staging.resources.database='shared-db';p.environments.production.resources.database='shared-db';},
  p=>{p.legacyPolicy.resourceIds=['old-mvp-project'];p.environments.staging.resources.openaiProject='old-mvp-project';},
  p=>{p.environments.local.billingMode='live';},
  p=>{p.environments.production.secrets.openai='OPENAI_API_KEY';},
  p=>{p.environments.staging.apiOrigin='https://user:secret@example.invalid';},
  p=>{p.environments.staging.apiOrigin='https://same.example.invalid';p.environments.production.apiOrigin='https://same.example.invalid/';},
 ]){const p=plan();mutate(p);assert.ok(isolationIssues(p).length);}
});
test('provider bindings never borrow the MVP or generic API key as a fallback',()=>{
 const p=plan();p.environments.local.resources.openaiProject='local-test-project';
 assert.throws(()=>providerBinding(p,'local',{OPENAI_API_KEY:'test-placeholder'}),/binding is missing/);
 assert.throws(()=>providerBinding(p,undefined,{}),/Explicit environment/);
 const binding=providerBinding(p,'local',{AIADCAST_NEXT_LOCAL_OPENAI_API_KEY:'test-placeholder'});
 assert.deepEqual(binding,{environment:'local',projectId:'local-test-project',secretBinding:'AIADCAST_NEXT_LOCAL_OPENAI_API_KEY'});
 assert.equal(Object.values(binding).includes('test-placeholder'),false);
 assert.throws(()=>providerBinding(p,'staging',{AIADCAST_NEXT_STAGING_OPENAI_API_KEY:'test-placeholder'}),/연결|저장소/);
});
test('gate success requires review metadata and public release needs additional evidence',()=>{
 const p=plan();p.repository={...p.repository,remote:'https://github.com/guyhan76/aiadcast-next.git',ownershipVerified:true};
 p.legacyPolicy.inventoryVerified=true;p.android.registrationStatus='created';p.android.signingOwnerVerified=true;
 for(const [name,env] of Object.entries(p.environments)){
  env.apiOrigin=`https://${name}.example.invalid`;env.companyControlVerified=true;
  for(const key of Object.keys(env.resources))env.resources[key]=`${name}-${key}`;
 }
 const record=evidence();record.gates={};
 for(const [id,,stage] of releaseGates)if(stage==='internal')record.gates[id]={status:'passed',artifact:'test-fixture-only',reviewedBy:'test-reviewer',reviewedOn:'2026-10-09'};
 assert.equal(releaseReport(p,record,'internal').readyForSubmission,true);
 assert.equal(releaseReport(p,record,'production').readyForSubmission,false);
 delete record.gates['android-build'].artifact;
 assert.equal(releaseReport(p,record,'internal').readyForSubmission,false);
 assert.throws(()=>releaseReport(p,record,'unknown'),/Unknown release/);
});
