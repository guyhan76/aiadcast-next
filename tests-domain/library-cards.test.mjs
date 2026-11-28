import {test} from 'node:test';
import assert from 'node:assert/strict';
import {libraryCards} from '../src/library-cards.ts';

const draft={id:'project-1',name:'같은 광고',productName:'상품',presentation:'campaign',updatedAt:'2026-11-17T00:00:00Z'};
const delivery={id:'job-1',projectId:draft.id,name:draft.name,createdAt:draft.updatedAt,reviewRequired:false};
const backup={id:draft.id,name:draft.name,revision:1};
test('the draft, its sole delivery and its backup share a card',()=>{
 const [card,...rest]=libraryCards([draft],[delivery],[backup]);
 assert.deepEqual(rest,[]);assert.equal(card.project,draft);assert.equal(card.delivery,delivery);
 assert.deepEqual(card.backups,[backup]);assert.deepEqual(card.deviceIds,[draft.id]);
 assert.equal(libraryCards([],[delivery],[backup]).length,1);
});
test('two results with the same name and project ID stay independently addressable',()=>{
 const second={...delivery,id:'job-2'};
 const cards=libraryCards([],[delivery,second],[backup]);
 assert.deepEqual(cards.map(c=>c.id),['job:job-1','job:job-2','backup:project-1']);
});
test('a fully delivered batch opens from its children, and a partial batch still has a progress card',()=>{
 const id='ads-'+'a'.repeat(64),batch={...draft,id,adBatch:{id,count:2}};
 const a={...delivery,projectId:id+'-1'},b={...delivery,id:'job-2',projectId:id+'-2'};
 const all=libraryCards([batch],[a,b],[]);assert.equal(all.length,2);
 assert.ok(all.every(c=>c.reviewProject===batch));
 const partial=libraryCards([batch],[a],[]);assert.equal(partial.length,2);assert.ok(partial.some(c=>c.project===batch));
});
