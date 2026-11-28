import {test} from 'node:test';import assert from 'node:assert/strict';
import {marketingPlanForProject} from '../src/marketing-plan.ts';import {marketingPresentation} from '../src/marketing-presentation.ts';
import {newProject} from '../src/model.ts';import {withCategory} from '../src/product.ts';
for(const [name,noun] of [['Lenovo ThinkPad P16 노트북','노트북'],['Aster laptop','laptop'],['Orion tablet','tablet'],['공기청정기','공기청정기'],['Unknown Model Z9',null]])test(`display keywords use confirmed product ${name}`,()=>{
 const locale=/[가-힣]/.test(name)?'ko':'en';const p=withCategory(newProject(),'electronics');p.productName=name;p.locale=locale;const plan=marketingPlanForProject(p);const saved=JSON.stringify(plan);const shown=marketingPresentation(plan,locale);assert.ok(shown.keywords.includes(name));if(noun)assert.ok(shown.keywords.includes(noun));assert.ok(!shown.keywords.some(w=>/소형가전|생활가전|household appliances|small appliances/.test(w)));assert.equal(JSON.stringify(plan),saved);assert.ok(shown.keywords.length<=6);
});

test('unrecognized product does not inherit category filler; display does not change generation request',()=>{
 const p=withCategory(newProject(),'fashion');p.productName='Model X9';const plan=marketingPlanForProject(p),before=JSON.stringify(plan);const shown=marketingPresentation(plan,'ko');assert.deepEqual(shown.keywords,['Model X9']);assert.equal(JSON.stringify(plan),before);
});
