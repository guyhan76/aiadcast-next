import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IDBFactory} from 'fake-indexeddb';
import ts from 'typescript-compiler';
import {newProject} from '../src/model.ts';
import {createResultSet} from '../src/result-set.ts';
import {visibleLibraryProjects,readLibraryBatch} from '../src/library-batches.ts';
let source=await readFile(new URL('../src/storage.ts',import.meta.url),'utf8');
source=source.replace("import {storageNamespace} from './beta-session';","const storageNamespace=()=>globalThis.storageTestOwner;")
 .replace("from './product'",`from ${JSON.stringify(new URL('../src/product.ts',import.meta.url).href)}`)
 .replace("from './library-batches.ts'",`from ${JSON.stringify(new URL('../src/library-batches.ts',import.meta.url).href)}`);
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {saveProjectSet,saveProject,deleteProjects,projects}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
beforeEach(()=>{globalThis.indexedDB=new IDBFactory();globalThis.storageTestOwner='owner-a';});
test('collection save keeps existing originals and all siblings through repeated submission',async()=>{
 const items=await createResultSet(newProject(),4),saved=await saveProjectSet(items),accepted={...saved[1],name:'Previously accepted original'};
 await saveProject(accepted);const again=await saveProjectSet(items);
 assert.equal(again[1].name,accepted.name);assert.equal((await projects()).length,4);
 assert.deepEqual(again.filter(p=>p.id!==accepted.id),items.filter(p=>p.id!==accepted.id));
});
test('partial transaction failure leaves no orphan collection members',async()=>{
 const [p]=await createResultSet(newProject(),2);await assert.rejects(saveProjectSet([p,p]));assert.deepEqual(await projects(),[]);
});
test('explicit owner binding does not save into a later account',async()=>{
 const items=await createResultSet(newProject(),2),pending=saveProjectSet(items,'owner-a');globalThis.storageTestOwner='owner-b';await pending;
 assert.deepEqual(await projects(),[]);globalThis.storageTestOwner='owner-a';assert.equal((await projects()).length,2);
});

const batchId='ads-'+'a'.repeat(64);
const parent=count=>({...newProject(),id:batchId,adBatch:{id:batchId,count},name:'같은 광고',productName:'같은 상품',presentation:'campaign'});
const output=slot=>({...parent(2),id:batchId+'-'+slot,adBatch:undefined,generated:{jobId:'job-'+slot,mode:'creative',role:'creative',createdAt:new Date().toISOString(),specificationKey:'{}',asset:{sha256:'b'.repeat(64),width:128,height:128}}});

test('previously saved outputs reconcile legacy requests by ID, survive stale writes and deliberate deletion',async()=>{
 const request=parent(2),one=output(1),two=output(2);
 const otherId='ads-'+'c'.repeat(64),other={...parent(1),id:otherId,adBatch:{id:otherId,count:1}};
 await saveProject(request);await saveProject(other);await saveProject(one);await saveProject(two);
 const rows=await projects(true);
 assert.deepEqual(new Set(visibleLibraryProjects(rows).map(p=>p.id)),new Set([one.id,two.id,other.id]));
 await saveProject(request);await deleteProjects([two.id]);
 assert.deepEqual(new Set(visibleLibraryProjects(await projects(true)).map(p=>p.id)),new Set([one.id,other.id]));
 assert.equal((await projects()).find(p=>p.id===request.id).productName,request.productName);
});
test('disjoint saves preserve edits and resolve each slot exactly once even across retries',async()=>{
 const request=parent(2),one=output(1),two=output(2);
 await saveProject(request);await saveProjectSet([one]);
 assert.deepEqual((await projects()).find(p=>p.id===batchId).adBatch.savedSlots,[1]);
 assert.equal(visibleLibraryProjects(await projects()).length,2);
 await saveProject({...one,name:'직접 수정한 광고'});await saveProject({...two,generated:undefined});
 await Promise.all([saveProjectSet([one,two]),saveProject(request)]);
 const list=visibleLibraryProjects(await projects());
 assert.equal(list.length,2);assert.equal(list.find(p=>p.id===one.id).name,'직접 수정한 광고');assert.equal(list.find(p=>p.id===two.id).generated.jobId,'job-2');
});
test('only server-confirmed running members display in progress and unsaved results remain accessible',()=>{
 const batch={id:batchId,count:2,savedSlots:[1]};
 const jobs=['ready','running'].map((state,i)=>({id:'job-'+i,projectId:batchId+'-'+(i+1),state,artifactId:i===0?'asset':null}));
 const result=()=>readLibraryBatch(batch,{id:batchId,jobs});
 assert.equal(result().state,'running');
 jobs[1].state='ready';jobs[1].artifactId='another';assert.equal(result().state,'ready');assert.equal(result().cover.id,'job-1');
 jobs[1].state='failed';assert.equal(result().state,'partial');
 jobs[0].state='uncertain';assert.equal(result().state,'unknown');
 jobs[0].state='expired';assert.equal(result().state,'unavailable');
 jobs[0].projectId='other';assert.throws(result,/INVALID_BATCH/);
});
