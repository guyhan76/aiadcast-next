import test from 'node:test';import assert from 'node:assert/strict';
import {externalSupplierTotals} from '../server/external-supplier-budget.mjs';
import {auditSupplierHistory} from '../server/cumulative-budget-audit.mjs';
const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const row=(id,state,actual,actor_id=owner)=>({id,actor_id,state,hold:30000,actual});
test('known trial actuals and unresolved holds counted once across both trial approvals',()=>{
 const rows=[row('a','settled',12000),row('b','exceeded',45000),row('c','uncertain',null),row('d','reserved',null),row('e','settled',80000,'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')];
 assert.deepEqual(externalSupplierTotals(rows,owner),{spent:57000,held:60000});
 const view=auditSupplierHistory({budgets:[{period:'2020-01',spent_micros:100,held_micros:0}],attempts:[{period:'2020-01',status:'completed',actual_micros:100}],assistants:[],recommendations:[],externalRows:rows,ownerId:owner});assert.equal(view.spentMicros,57100);assert.equal(view.heldMicros,60000);
});
test('missing ownership, unknown cost/state and duplicate records fail closed',()=>{
 for(const rows of [[row('a','settled',1,null)],[row('a','settled',null)],[row('a','uncertain',5)],[row('a','invalid',0)],[row('a','settled',1),row('a','settled',1)]])assert.throws(()=>externalSupplierTotals(rows,owner),/EXTERNAL_SUPPLIER_/);
});
test('late external settlement replaces hold, never accumulates both',()=>{
 const rows=[row('a','uncertain',null)];assert.deepEqual(externalSupplierTotals(rows,owner),{spent:0,held:30000});rows[0]=row('a','settled',17000);assert.deepEqual(externalSupplierTotals(rows,owner),{spent:17000,held:0});assert.deepEqual(externalSupplierTotals(rows,owner),{spent:17000,held:0});
});

test('missing audit owner and empty legacy actor cannot produce zero historical cost',()=>{assert.throws(()=>externalSupplierTotals([row('a','settled',50000000)],undefined),/OWNER_UNKNOWN/);assert.throws(()=>externalSupplierTotals([row('a','settled',1,'')],owner),/OWNER_UNKNOWN/);});
