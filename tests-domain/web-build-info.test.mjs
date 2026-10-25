import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebBuild} from '../scripts/web-build-info.mjs';
const sha='a'.repeat(40),now=()=>new Date('2026-10-25T00:00:00Z');
test('Render build records only explicit metadata, never secrets',()=>{const b=createWebBuild({env:{RENDER_GIT_COMMIT:sha,SECRET:'never-expose'},runGit:()=>{throw Error('no git');},now,version:'0.1.0'});assert.deepEqual(b,{schemaVersion:1,version:'0.1.0',commit:sha,commitSource:'render',dirty:false,builtAt:now().toISOString()});assert.ok(!JSON.stringify(b).includes('never-expose'));});
test('local source preserves dirty provenance',()=>{const b=createWebBuild({env:{},runGit:args=>args[0]==='rev-parse'?sha:' M src/App.tsx',now});assert.equal(b.commit,sha);assert.equal(b.dirty,true);assert.equal(b.commitSource,'git');});
test('missing or invalid source stays unknown without invented server identity',()=>{for(const value of ['', 'invalid']){const b=createWebBuild({env:{RENDER_GIT_COMMIT:value},runGit:()=>{throw Error('missing');},now});assert.equal(b.commit,null);assert.equal(b.commitSource,'unavailable');assert.equal(b.dirty,null);assert.equal(b.version,'0.1.0');}});
test('Android metadata preparation preserves web identity and rejects missing provenance before replacing assets',async()=>{
 const {mkdtemp,mkdir,writeFile,readFile,copyFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFileSync}=await import('node:child_process');
 const dir=await mkdtemp(join(tmpdir(),'build-metadata-'));
 try{await mkdir(join(dir,'native'));await mkdir(join(dir,'dist'));await copyFile(new URL('../native/prepare-android.mjs',import.meta.url),join(dir,'native/prepare-android.mjs'));await writeFile(join(dir,'native/android-download-bridge.js'),'// fixture');await writeFile(join(dir,'dist/index.html'),'<div id="root"></div>');const web=createWebBuild({env:{RENDER_GIT_COMMIT:sha},now});await writeFile(join(dir,'dist/web-build.json'),JSON.stringify(web));execFileSync(process.execPath,[join(dir,'native/prepare-android.mjs')],{stdio:'pipe'});const path=join(dir,'android/app/src/main/assets/native-build.json');const before=await readFile(path,'utf8');const native=JSON.parse(before);assert.deepEqual(native.webBuild,web);assert.match(native.webBuildDigest,/^[a-f0-9]{64}$/);await rm(join(dir,'dist/web-build.json'));assert.throws(()=>execFileSync(process.execPath,[join(dir,'native/prepare-android.mjs')],{stdio:'pipe'}));assert.equal(await readFile(path,'utf8'),before);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('release check refuses missing or mismatched commit while local unknown remains explicit',async()=>{
 const {verifyWebBuild}=await import('../scripts/check-web-build.mjs');const build=createWebBuild({env:{RENDER_GIT_COMMIT:sha},now});assert.equal(verifyWebBuild(build,{requireCommit:true,expectedCommit:sha}),build);assert.throws(()=>verifyWebBuild({...build,commit:null},{requireCommit:true}),/missing/);assert.throws(()=>verifyWebBuild(build,{expectedCommit:'b'.repeat(40)}),/does not match/);assert.equal(verifyWebBuild({...build,commit:null}).commit,null);
});
