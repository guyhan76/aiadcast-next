import {test} from 'node:test';import assert from 'node:assert/strict';
import React from 'react';import {act,create} from 'react-test-renderer';
import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import ts from 'typescript-compiler';
const require=createRequire(import.meta.url);
let source=await readFile(new URL('../src/SelectiveComparison.tsx',import.meta.url),'utf8');
source=source.replace("import {useUiLanguage} from './ui-language';",'const useUiLanguage=()=>({t:ko=>ko});').replace("from './selective-preservation'",`from ${JSON.stringify(new URL('../src/selective-preservation.ts',import.meta.url).href)}`);
const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from ["'](react(?:\/jsx-runtime)?)["']/g,(_,name)=>`from ${JSON.stringify(pathToFileURL(require.resolve(name)).href)}`);
const {SelectiveComparison}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));globalThis.IS_REACT_ACT_ENVIRONMENT=true;
test('wipe endpoints and cropped view retain identical original/result geometry',async()=>{
 const props={original:'original.png',result:'result.png',width:941,height:1672,bounds:{x:830,y:782,width:95,height:48}},before=structuredClone(props);let r;
 try{
  await act(()=>{r=create(React.createElement(SelectiveComparison,props));});
  const images=()=>r.root.findAllByType('img'),after=()=>r.root.findByProps({className:'selective-wipe-after'});
  assert.deepEqual(images()[0].props.style,images()[1].props.style);assert.equal(after().props.style.clipPath,'inset(0 0 0 50%)');
  for(const value of [0,100]){await act(()=>r.root.findByType('input').props.onChange({target:{value:String(value)}}));assert.equal(after().props.style.clipPath,`inset(0 0 0 ${value}%)`);}
  await act(()=>r.root.findByType('button').props.onClick());assert.deepEqual(images()[0].props.style,images()[1].props.style);assert.ok(parseFloat(images()[0].props.style.width)>100);assert.ok(parseFloat(images()[0].props.style.left)<0);assert.equal(images()[0].props.src,props.original);assert.equal(images()[1].props.src,props.result);
  await act(()=>r.root.findByType('button').props.onClick());assert.equal(images()[0].props.style.width,'100%');assert.equal(images()[0].props.style.left,'0%');assert.deepEqual(props,before);
 }finally{if(r)await act(()=>r.unmount());}
});
test('missing selection bounds allow comparison but do not fabricate a zoom target',async()=>{
 let r;try{await act(()=>{r=create(React.createElement(SelectiveComparison,{original:'a',result:'b',width:64,height:64}));});assert.equal(r.root.findAllByType('button').length,0);assert.equal(r.root.findByProps({className:'selective-wipe'}).props.style.aspectRatio,'64/64');}finally{if(r)await act(()=>r.unmount());}
});
