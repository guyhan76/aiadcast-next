// Executes the actual React controller with in-memory storage/session and child
// callbacks. This is component logic coverage, not a browser/layout test.
import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import React,{useState} from 'react';
import {act,create} from 'react-test-renderer';
import ts from 'typescript-compiler';
import {newProject} from '../src/model.ts';
import {createResultSet} from '../src/result-set.ts';
const require=createRequire(import.meta.url);
let source=await readFile(new URL('../src/AdResultSet.tsx',import.meta.url),'utf8');
source=source.replace("import {projects} from './storage';",'const projects=async()=>globalThis.resultSetTest.items;')
 .replace("import {storageNamespace} from './beta-session';",'const storageNamespace=()=>globalThis.resultSetTest.owner;')
 .replace("import {useUiLanguage} from './ui-language';",'const useUiLanguage=()=>({t:(ko)=>ko});')
 .replace("import './result-set.css';",'')
 .replace("from './result-set'",`from ${JSON.stringify(new URL('../src/result-set.ts',import.meta.url).href)}`);
let compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
compiled=compiled.replace(/from ["'](react(?:\/jsx-runtime)?)["']/g,(_,name)=>`from ${JSON.stringify(pathToFileURL(require.resolve(name)).href)}`);
const {AdResultSet}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let renderer;
afterEach(async()=>{if(renderer)await act(()=>renderer.unmount());renderer=null;delete globalThis.resultSetTest;delete globalThis.document;delete globalThis.window;});
async function mount(count=4,intent='explicit-click',options={}){
 const items=await createResultSet(newProject(),count),state={items:options.missing?items.slice(0,-1):items,owner:'owner-a',child:null,changes:[],handled:0};globalThis.resultSetTest=state;
 globalThis.document=new EventTarget();document.visibilityState='visible';globalThis.window=new EventTarget();
 function Harness(){const [project,setProject]=useState(items[0]),[token,setToken]=useState(intent);return React.createElement(AdResultSet,{project,autoRequest:token,onAutoHandled:()=>{state.handled++;setToken(undefined);},change:fn=>setProject(p=>{const next=fn(p);state.changes.push(next.id);return next;})},props=>{state.child=props;return React.createElement('output',{'data-project':props.project.id});});}
 await act(async()=>{renderer=create(React.createElement(Harness));});return state;
}
test('four results advance in order only after a verified ready callback; duplicates do not skip',async()=>{
 const state=await mount();assert.equal(state.handled,1);assert.equal(state.child.project.id,state.items[0].id);
 for(let i=0;i<4;i++){const child=state.child;assert.equal(child.project.id,state.items[i].id);await act(()=>{child.onResultReady(child.project.id,`preview-${i}`);child.onResultReady(child.project.id,`preview-${i}`);});}
 assert.deepEqual(state.changes,state.items.slice(1).map(p=>p.id));assert.equal(state.child.autoRequest,undefined);
});
test('manual selection stops the remaining queue and never reuses another image callback',async()=>{
 const state=await mount(),stale=state.child;
 await act(()=>renderer.root.findByProps({'aria-label':'3번 광고 선택'}).props.onClick());
 assert.equal(state.child.project.id,state.items[2].id);assert.equal(state.child.autoRequest,undefined);
 await act(()=>stale.onResultReady(stale.project.id,'late-original'));
 assert.deepEqual(state.changes,[state.items[2].id]);
});
test('reload without explicit intent performs no generation advance',async()=>{
 const state=await mount(2,null);await act(()=>state.child.onResultReady(state.child.project.id,'recovered'));
 assert.equal(state.handled,0);assert.deepEqual(state.changes,[]);assert.equal(state.child.autoRequest,undefined);
});
test('backgrounding stops subsequent requests and does not restart on focus',async()=>{
 const state=await mount();await act(()=>{document.visibilityState='hidden';document.dispatchEvent(new Event('visibilitychange'));});
 await act(()=>{document.visibilityState='visible';document.dispatchEvent(new Event('visibilitychange'));state.child.onResultReady(state.child.project.id,'late');});
 assert.deepEqual(state.changes,[]);assert.equal(state.child.autoRequest,undefined);
});
test('owner change cannot advance the old collection',async()=>{
 const state=await mount();state.owner='owner-b';await act(()=>{window.dispatchEvent(new Event('aiadcast-session-change'));state.child.onResultReady(state.child.project.id,'late');});assert.deepEqual(state.changes,[]);
});
test('explicit preparation cancellation prevents later recovery from starting the remaining images',async()=>{
 const state=await mount();await act(()=>state.child.onQueueCancelled());await act(()=>state.child.onResultReady(state.child.project.id,'recovered'));
 assert.deepEqual(state.changes,[]);assert.equal(state.child.autoRequest,undefined);
});
test('pagehide stops the sequence even before the document visibility changes',async()=>{
 const state=await mount();await act(()=>window.dispatchEvent(new Event('pagehide')));await act(()=>state.child.onResultReady(state.child.project.id,'late'));
 assert.deepEqual(state.changes,[]);assert.equal(state.child.autoRequest,undefined);
});
test('partial collection read does not begin paid work',async()=>{
 const state=await mount(4,'explicit-click',{missing:true});assert.equal(state.child,null);assert.equal(state.handled,0);assert.equal(renderer.root.findByProps({role:'alert'}).children.length,1);
});
