import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IDBFactory} from 'fake-indexeddb';
import ts from 'typescript-compiler';
import {newProject} from '../src/model.ts';
import {createResultSet} from '../src/result-set.ts';
let source=await readFile(new URL('../src/storage.ts',import.meta.url),'utf8');
source=source.replace("import {storageNamespace} from './beta-session';","const storageNamespace=()=>globalThis.storageTestOwner;")
 .replace("from './product'",`from ${JSON.stringify(new URL('../src/product.ts',import.meta.url).href)}`);
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {saveProjectSet,saveProject,projects}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
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
