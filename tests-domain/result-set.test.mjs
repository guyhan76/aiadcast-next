import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newProject,importProject} from '../src/model.ts';
import {createResultSet,imageCounts,orderedResults,parseResultSet} from '../src/result-set.ts';
import {creativeCampaignDraft} from '../src/consumer-campaign.ts';

for(const count of imageCounts)test(`${count} results retain inputs and isolate each project's identity`,async()=>{
 const original=newProject(),before=structuredClone(original),items=await createResultSet(original,count);
 assert.equal(items.length,count);assert.equal(new Set(items.map(p=>p.id)).size,count);assert.deepEqual(original,before);
 for(const item of items){assert.deepEqual(item.copy,original.copy);assert.deepEqual(item.dimensions,original.dimensions);assert.equal(item.requestedImageCount,count);assert.ok(item.name.length<=80);}
 if(count>1){items[0].copy.ko.title='Edited';assert.equal(items[1].copy.ko.title,original.copy.ko.title);assert.deepEqual(items[0].resultSet.projectIds,items.map(p=>p.id));}
});
test('repeated submission uses the same identities; changed input or new draft does not',async()=>{
 const source=newProject(),a=await createResultSet(source,4),b=await createResultSet({...source,updatedAt:new Date(0).toISOString()},4);
 assert.deepEqual(a.map(p=>p.id),b.map(p=>p.id));
 assert.notEqual((await createResultSet({...source,productName:'Changed'},4))[0].id,a[0].id);
 assert.notEqual((await createResultSet(creativeCampaignDraft(source),4))[0].id,a[0].id);
});
test('selection remains tied to project identity when storage order changes',async()=>{
 const items=await createResultSet(newProject(),4),selected={...items[2],name:'Latest selected original'},intruder={...items[1],resultSet:{...items[1].resultSet,projectIds:[...items[1].resultSet.projectIds].reverse()}};
 const result=orderedResults(selected,[items[3],intruder,items[0],items[1],items[2]]);
 assert.deepEqual(result.map(p=>p.id),items.map(p=>p.id));assert.equal(result[2],selected);
 assert.equal(orderedResults(selected,[items[0],intruder]).length,2);
});
test('invalid memberships and unsupported counts fail before dispatch',async()=>{
 const p=newProject();for(const count of [0,3,5,7,9,11,NaN,2.5])await assert.rejects(createResultSet(p,count),/INVALID_IMAGE_COUNT/);
 for(const group of [{id:'x',projectIds:[p.id,p.id]},{id:'x',projectIds:['elsewhere']},{id:'x',projectIds:[p.id,'b','c']}])assert.throws(()=>parseResultSet(group,p.id),/INVALID_RESULT_SET/);
});
test('standalone project import detaches collection while retaining inputs and photos',async()=>{
 const [p]=await createResultSet(newProject(),2),copy=await importProject(p);
 assert.notEqual(copy.id,p.id);assert.equal(copy.resultSet,undefined);assert.deepEqual(copy.copy,p.copy);assert.deepEqual(copy.product,p.product);assert.equal(copy.requestedImageCount,2);
});
test('new design drafts detach from previous siblings',async()=>{
 const [p]=await createResultSet(newProject(),6),next=creativeCampaignDraft(p);
 assert.equal(next.resultSet,undefined);assert.notEqual(next.id,p.id);assert.equal(p.resultSet.projectIds.length,6);
});
