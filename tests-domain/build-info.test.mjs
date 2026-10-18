import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildInfo} from '../server/build-info.mjs';
test('build info exposes only version and validated commit, never environment secrets',()=>{const info=buildInfo({env:{RENDER_GIT_COMMIT:'A'.repeat(40),API_KEY:'secret',DATABASE_URL:'private'},git:()=>{throw Error('must not execute');}});assert.deepEqual(Object.keys(info).sort(),['commit','schemaVersion','service','version']);assert.equal(info.commit,'a'.repeat(40));assert.equal(info.service,'aiadcast-next');assert.equal(info.version,'0.1.0');});
test('invalid deployment metadata falls back to repository HEAD and missing revision stays unknown',()=>{assert.equal(buildInfo({env:{RENDER_GIT_COMMIT:'secret'},git:()=> 'b'.repeat(40)}).commit,'b'.repeat(40));assert.equal(buildInfo({env:{},git:()=>{throw Error('no repository');}}).commit,null);assert.equal(buildInfo({env:{},git:()=>'/private/path'}).commit,null);});
