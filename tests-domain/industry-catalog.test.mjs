import {test} from 'node:test';
import assert from 'node:assert/strict';
import {industryOptions,browseGroups,searchIndustries} from '../src/industry-catalog.ts';
import {productCategories,industryKindFor} from '../src/industry.ts';

test('every stable category and expanded industry has one reachable product/service group',()=>{
 assert.equal(new Set(industryOptions.map(o=>o.key)).size,industryOptions.length);
 for(const [id] of productCategories)assert.equal(industryOptions.filter(o=>o.key===id).length,1);
 for(const o of industryOptions){
  assert.equal(o.kind,industryKindFor(o.category));
  assert.ok(browseGroups[o.kind].some(([id])=>id===o.group),o.ko);
  assert.ok(searchIndustries(o.ko,x=>x.ko).includes(o),o.ko);
  if(o.en)assert.ok(searchIndustries(o.en,x=>x.en??x.ko).includes(o),o.en);
 }
});
test('direct search resolves aliases across kinds without showing unrelated current selections',()=>{
 for(const [query,key] of [['운동화','shoes'],[' SNEAKERS ','shoes'],['택배박스','boxes'],['카페','cafe']])assert.ok(searchIndustries(query,o=>o.ko).some(o=>o.key===key));
 for(const query of ['미용실','돌봄','software','변호사','물류','건축','반려동물'])assert.ok(searchIndustries(query,o=>o.ko).length,query);
 assert.deepEqual(searchIndustries('존재하지않는맞춤분야',o=>o.ko),[]);
});
