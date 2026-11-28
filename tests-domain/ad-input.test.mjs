import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readAdInput,readImageResultBoundary} from '../src/ad-input.ts';
import {buildGenerationRequest} from '../src/generation.ts';
import {newProject,importProject} from '../src/model.ts';
import {normalizeGenerationRequest} from '../server/generation-service.mjs';
const baseline=JSON.parse(readFileSync(new URL('./fixtures/image-contract-baseline.json',import.meta.url)));
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
test('v1 image request bytes and normalized fingerprints retain all four pre-change baselines',()=>{
 for(const {project,requestHash,normalizedHash} of baseline){const before=JSON.stringify(project),request=buildGenerationRequest(project);assert.equal(hash(request),requestHash);assert.equal(hash(normalizeGenerationRequest(request)),normalizedHash);assert.equal(hash(normalizeGenerationRequest({...request,mediaType:'image'})),normalizedHash);assert.equal(JSON.stringify(project),before);assert.equal('mediaType' in request,false);}
});
test('facts and requested copy are detached from visual direction and no pixel text accuracy is claimed',()=>{
 const p=structuredClone(baseline[0].project),before=JSON.stringify(p),input=readAdInput(p);assert.equal(input.mediaType,'image');assert.equal(input.facts.photos[0].sha256,p.product.sha256);assert.equal(input.facts.profile.material,'User-supplied material');input.facts.profile.material='changed';input.text.requestedCopy.title='changed';assert.equal(JSON.stringify(p),before);
 const text=readAdInput(p).text;p.generation.brief='A completely different scene';assert.deepEqual(readAdInput(p).text,text);assert.equal(readImageResultBoundary(p).visual,null);assert.equal(readImageResultBoundary(p).textAccuracy,'human-review-required');
 p.generated={jobId:'job',asset:p.product,composition:'complete-ad',acceptedAt:'2026-10-23'};assert.equal(readImageResultBoundary(p).visual.sha256,p.product.sha256);assert.equal(readImageResultBoundary(p).textAccuracy,'human-review-required');assert.deepEqual(readImageResultBoundary(p).requestedText,text);
});
test('v1 no-photo projects round-trip with both stored languages and no media migration',async()=>{
 for(const locale of ['en','ko']){const p=newProject();p.locale=locale;p.copy[locale].title='User-approved exact text';const raw=JSON.parse(JSON.stringify(p));const loaded=await importProject(raw);assert.equal(loaded.version,1);assert.equal(loaded.locale,locale);assert.deepEqual(loaded.copy,p.copy);assert.equal('mediaType' in loaded,false);assert.equal(JSON.stringify(raw),JSON.stringify(p));}
});
