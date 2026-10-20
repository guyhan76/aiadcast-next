import test from 'node:test';
import assert from 'node:assert/strict';
import {hasSavedAcceptedAd} from '../src/generated.ts';
const generated={jobId:'accepted-job',specificationKey:'saved-inputs',createdAt:'2026-10-20T00:00:00.000Z',mode:'creative',role:'creative',asset:{sha256:'a'.repeat(64),width:100,height:100}};
test('input drafts and thumbnails are not accepted ads',()=>{assert.equal(hasSavedAcceptedAd({product:generated.asset}),false);assert.equal(hasSavedAcceptedAd({generated:{asset:generated.asset}}),false);});
test('legacy accepted metadata remains visible independently of current inputs or missing local bytes',()=>{assert.equal(hasSavedAcceptedAd({generated}),true);assert.equal(hasSavedAcceptedAd({generated,copy:{ko:{title:'changed'}}}),true);});
test('explicit acceptance keeps current saved ads visible and rejects malformed markers',()=>{assert.equal(hasSavedAcceptedAd({generated:{...generated,acceptedAt:generated.createdAt}}),true);assert.equal(hasSavedAcceptedAd({generated:{...generated,acceptedAt:'invalid'}}),false);assert.equal(hasSavedAcceptedAd({generated:{...generated,jobId:''}}),false);});
