import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMarketingPlan} from '../src/marketing-plan.ts';
import {marketingPresentation} from '../src/marketing-presentation.ts';
for(const ad of ['ko','en'])for(const ui of ['ko','en'])test(`explanations follow ${ui}, keywords follow ad ${ad}, stored plan stays unchanged`,()=>{
 const stored=createMarketingPlan({name:'ACME',category:'fashion',subjectType:'physical-product',locale:ad,mode:'creative',sourceHash:'a'.repeat(64),brand:'ACME',goal:'awareness',contentType:'poster',attributes:[],specifications:[]});
 const before=JSON.stringify(stored),display=marketingPresentation(stored,ui);
 assert.equal(JSON.stringify(stored),before);assert.equal(display.keywords.length,4);assert.equal(new Set(display.keywords).size,4);assert.ok(display.keywords.includes('ACME'));
 if(ui==='ko'){assert.match(display.intent,/기획입니다/);assert.doesNotMatch(display.intent,/A poster|Customers considering/);assert.match(display.target.reason,/규격이 없어/);}else{assert.match(display.intent,/A poster/);assert.match(display.target.reason,/No dimensions supplied/);}
 assert.ok(display.keywords.includes(ad==='ko'?'의류':'clothing'));assert.ok(!display.keywords.includes(ad==='ko'?'clothing':'의류'));
});

for(const locale of ['ko','en'])test(`hoodie suggestions use named product facts without changing saved metadata (${locale})`,()=>{
 const stored=createMarketingPlan({name:locale==='ko'?'나이키 후드집업':'Nike zip-up hoodie',category:'fashion',subjectType:'physical-product',locale,mode:'creative',sourceHash:null,brand:'',goal:'awareness',contentType:'poster',attributes:[],specifications:[]});
 const before=JSON.stringify(stored),shown=marketingPresentation(stored,locale);assert.equal(shown.keywords.length,6);assert.ok(shown.keywords.every(k=>locale==='ko'?k.includes('후드'):/hood/i.test(k)));assert.equal(JSON.stringify(stored),before);
});
