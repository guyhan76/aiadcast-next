import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toMillimeters,fromMillimeters,dimensionUnit,validMillimeters,dimensionLabel} from '../src/dimension-units.ts';
import {newProject,importProject} from '../src/model.ts';
import {specSummary} from '../src/product.ts';
import {generatedCompatibilityKey} from '../src/generated.ts';
import {buildGenerationRequest} from '../src/generation.ts';
import {parseBoxSize} from '../src/box-geometry.ts';
test('cm and inch input convert exactly to mm, including fractional inches',()=>{
 for(const [value,unit,mm] of [['20','cm','200'],['1','inch','25.4'],['0.125','inch','3.175'],['1.234567','inch','31.3580018'],['0.000001','cm','0.00001'],['0.','cm','0']])assert.equal(toMillimeters(value,unit),mm);
 for(const raw of ['-3','Infinity','1e2','1,2','NaN','abc','1.23456789012'])assert.equal(toMillimeters(raw,'inch'),'');
 assert.equal(toMillimeters('11.811023622','inch'),'300');
 assert.equal(toMillimeters('12.811023622','inch'),'325.4');
 assert.equal(validMillimeters('31.3580018'),true);
 for(const raw of ['0','-1','','100001','0.000000001'])assert.equal(validMillimeters(raw),false);
});
test('display conversion and unit labels use mm without cumulative rounding',()=>{
 assert.equal(fromMillimeters('200','cm'),'20');assert.equal(fromMillimeters('25.4','inch'),'1');
 assert.equal(fromMillimeters('300','inch'),'11.811023622');assert.equal(dimensionLabel('3.175','inch'),'0.125 inch');
 const p=newProject(),key=generatedCompatibilityKey(p);
 for(let i=0;i<100;i++)for(const unit of ['cm','inch','mm']){p.dimensions.displayUnit=unit;specSummary(p.dimensions,p.productProfile);}
 assert.equal(p.dimensions.width,'300');assert.equal(generatedCompatibilityKey(p),key);
 p.dimensions.displayUnit='cm';assert.equal(specSummary(p.dimensions,p.productProfile),'30 × 20 × 10 cm');
 p.productProfile.specType='cylindrical';assert.equal(specSummary(p.dimensions,p.productProfile),'Ø 30 × 10 cm');
});
test('legacy projects stay in mm while selected units survive validated imports',async()=>{
 const legacy=newProject(),restored=await importProject(legacy);assert.equal(restored.dimensions.width,'300');assert.equal(dimensionUnit(restored.dimensions.displayUnit),'mm');
 for(const unit of ['cm','mm','inch']){legacy.dimensions.displayUnit=unit;assert.equal((await importProject(legacy)).dimensions.displayUnit,unit);}
 legacy.dimensions.displayUnit='feet';await assert.rejects(()=>importProject(legacy),/규격 단위/);
});
test('API and geometry retain canonical mm precision independently of display',()=>{
 const p=newProject();p.product={name:'p.png',data:'data:image/png;base64,test',sha256:'source',width:100,height:100};
 p.dimensions.displayUnit='inch';p.dimensions.width=toMillimeters('1.234567','inch');p.dimensions.visible=false;
 const request=buildGenerationRequest(p);assert.equal(request.specifications[0].value,'31.3580018');assert.equal(request.specifications[0].unit,'mm');assert.equal(request.output.showDimensions,false);
 assert.equal(parseBoxSize(p.dimensions).width,31.3580018);
});

test('decimal-adjacent spaces normalize without joining separated digits or guessing locale',()=>{
 for(const raw of ['30. 23','30 .23',' 30 . 23 ','30.\u00a023','30\u202f.\u202f23']){
  assert.equal(toMillimeters(raw,'mm'),'30.23');assert.equal(toMillimeters(raw,'cm'),'302.3');assert.equal(toMillimeters(raw,'inch'),'767.842');
 }
 for(const raw of ['30 23','3 0.23','30,23','30mm','３０．２３','30.\n23','1e3','-30','30..23'])assert.equal(toMillimeters(raw,'mm'),'');
 assert.equal(validMillimeters('30. 23'),false);assert.equal(validMillimeters('100000'),true);assert.equal(validMillimeters(toMillimeters('10000. 01','cm')),false);
});
test('canonical decimal reaches server; raw ambiguous input is rejected and identifies the axis',async()=>{
 const {normalizeGenerationRequest}=await import('../server/generation-service.mjs');const {generationIssues}=await import('../src/generation.ts');
 const p=newProject();p.product={name:'p.png',data:'data:image/png;base64,test',sha256:'a'.repeat(64),width:100,height:100};p.dimensions.height=toMillimeters('30. 23','mm');
 assert.equal(normalizeGenerationRequest(buildGenerationRequest(p)).specifications.find(s=>s.axis==='height').value,'30.23');
 p.dimensions.height='30 23';assert.ok(generationIssues(p).some(x=>x.startsWith('높이 규격')));
 const r=buildGenerationRequest({...p,dimensions:{...p.dimensions,height:'30.23'}});r.specifications.find(s=>s.axis==='height').value='30 23';assert.throws(()=>normalizeGenerationRequest(r),/INVALID_SPECIFICATIONS/);
});
