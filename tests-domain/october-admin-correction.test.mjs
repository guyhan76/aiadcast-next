import {test} from 'node:test';
import assert from 'node:assert/strict';
import {correctedOctoberOwnerLimit as limit} from '../server/october-admin-budget.mjs';
const fixture=()=>({now:Date.UTC(2026,9,24,15,1),user:{id:'owner',role:'admin',disabled:0},ownerId:'owner',demo:true,limit:4000000,approval:{user_id:'owner',period:'2026-10',total_micros:5000000,allocation_micros:5000000,created:Date.UTC(2026,9,18)},support:{owner_id:'owner',user_id:'a3c39e4d-8621-4f0d-9021-2621a8cecdee',period:'2026-10',micros:1000000,created:Date.UTC(2026,9,18)}});
test('finite correction requires the existing active identity and exact pre-approval support record',()=>{
 assert.equal(limit(fixture()),5000000);
 for(const change of [f=>f.user.role='member',f=>f.user.disabled=1,f=>f.ownerId='other',f=>f.user.id='new-admin',f=>f.demo=false,f=>f.approval.created=f.now,f=>f.support.created=f.now,f=>f.support.user_id='other',f=>f.support.micros=0,f=>f.approval.total_micros=6000000,f=>f.now=Date.UTC(2026,10,1)]){const f=fixture();change(f);assert.equal(limit(f),4000000);}
});
