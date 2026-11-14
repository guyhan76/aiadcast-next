import {test} from 'node:test';
import assert from 'node:assert/strict';
import {correctedOctoberOwnerLimit as limit} from '../server/october-admin-budget.mjs';
const fixture=()=>({now:Date.UTC(2026,9,24,15,1),user:{id:'owner',role:'admin',disabled:0},ownerId:'owner',demo:true,limit:4000000,approval:{user_id:'owner',period:'2026-10',total_micros:5000000,allocation_micros:5000000,created:Date.UTC(2026,9,18)},support:{owner_id:'owner',user_id:'a3c39e4d-8621-4f0d-9021-2621a8cecdee',period:'2026-10',micros:1000000,created:Date.UTC(2026,9,18)}});
test('finite correction requires the existing active identity and exact pre-approval support record',()=>{
 assert.equal(limit(fixture()),5000000);
 for(const change of [f=>f.user.role='member',f=>f.user.disabled=1,f=>f.ownerId='other',f=>f.user.id='new-admin',f=>f.demo=false,f=>f.approval.created=f.now,f=>f.support.created=f.now,f=>f.support.user_id='other',f=>f.support.micros=0,f=>f.approval.total_micros=6000000,f=>f.now=Date.UTC(2026,10,1)]){const f=fixture();change(f);assert.equal(limit(f),4000000);}
});

test('new approval keeps earlier limits and expires exactly at November UTC boundary',()=>{
 const f=fixture();for(const [at,expected] of [[Date.UTC(2026,9,25,9,34,59,999),5000000],[Date.UTC(2026,9,25,9,35),100000000],[Date.UTC(2026,9,31,23,59,59,999),100000000],[Date.UTC(2026,10,1),4000000]]){f.now=at;assert.equal(limit(f),expected);}
 f.now=Date.UTC(2026,9,25,10);for(const mutate of [x=>x.user.id='another-admin',x=>x.ownerId='another-admin',x=>x.user.role='member',x=>x.user.disabled=1,x=>x.limit=0,x=>x.demo=false]){const x=structuredClone(f);mutate(x);assert.equal(limit(x),x.limit);}
});
