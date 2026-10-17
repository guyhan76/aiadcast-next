import {test} from 'node:test';import assert from 'node:assert/strict';
import {dimensionGuide} from '../src/dimension-guide.ts';import {makeDimensionPlan} from '../src/dimension-generation.ts';
import {newProject} from '../src/model.ts';import {buildGenerationRequest,parseGeneration} from '../src/generation.ts';import {generatedCompatibilityKey} from '../src/generated.ts';import {normalizeGenerationRequest} from '../server/generation-service.mjs';
function fixture(shape='rectangular',values=['450','300','400'],basis){const axes=shape==='rectangular'?['width','depth','height']:shape==='flat'?['width','depth']:['width','height'];const key={sourceHash:'a'.repeat(64),productProfile:{category:'boxes',specType:shape,material:''},specifications:axes.map((axis,i)=>({axis,value:values[i],unit:'mm'}))};return {specificationKey:JSON.stringify(key),...(basis?{dimensionPlan:makeDimensionPlan({sourceHash:key.sourceHash,specType:shape,basis,specifications:key.specifications.map(s=>({...s,axis:shape==='cylindrical'&&s.axis==='width'?'diameter':s.axis}))})}:{})};}
test('450 × 300 × 400 body is projected with a shared scale and exact saved labels',()=>{
 const input=fixture(),before=JSON.stringify(input),g=dimensionGuide(input).guide;assert.ok(g);assert.equal(g.basis,'unspecified');assert.deepEqual(g.values,['450','300','400']);const [front,top]=g.primitives.filter(p=>p.kind==='polygon');const w=front.points[1][0]-front.points[0][0],h=front.points[0][1]-front.points[3][1],dx=top.points[2][0]-top.points[1][0];assert.ok(Math.abs(w/h-450/400)<1e-9);assert.ok(Math.abs(dx/w-.6*300/450)<1e-9);const text=g.primitives.filter(p=>p.kind==='text').map(p=>p.text).join('\n');for(const value of ['450 mm','300 mm','400 mm','기준 미지정','열린 날개','실측 결과가 아닙니다','CAD'])assert.ok(text.includes(value),value);assert.equal(JSON.stringify(input),before);
});
test('explicit interior/exterior/body basis persists without guessing wall thickness',()=>{
 for(const basis of ['inner-body','outer-body','body']){const g=dimensionGuide(fixture('rectangular',['450','300','400'],basis)).guide;assert.equal(g.basis,basis);assert.ok(g.primitives.some(p=>p.kind==='text'&&p.text.includes('벽 두께는 추정하지 않음')));}
 const p=newProject();p.product={name:'x.png',data:'fixture',sha256:'a'.repeat(64),width:100,height:100};p.generation={mode:'creative',brief:'',dimensionBased:true,dimensionBasis:'inner-body'};p.productProfile.specType='rectangular';p.dimensions.width='450';p.dimensions.depth='300';p.dimensions.height='400';const r=normalizeGenerationRequest(buildGenerationRequest(p));assert.equal(r.dimensionPlan.basis,'inner-body');assert.equal(parseGeneration(p.generation).dimensionBasis,'inner-body');const saved={specificationKey:generatedCompatibilityKey(p),dimensionPlan:r.dimensionPlan};p.dimensions.width='999';assert.deepEqual(dimensionGuide(saved).guide.values,['450','300','400']);
});
test('flat and cylindrical drawings use two supplied axes; capacity supplies no dimension',()=>{
 for(const [shape,values] of [['flat',['0.25','0.125']],['cylindrical',['65','170']]]){const g=dimensionGuide(fixture(shape,values,'outer-body')).guide;assert.equal(g.shape,shape);assert.deepEqual(g.values,values);assert.equal(g.primitives.filter(p=>p.kind==='text'&&p.text.endsWith(' mm')).length,2);}
 const missing=fixture('cylindrical',['500 ml','170']);assert.equal(dimensionGuide(missing).guide,undefined);
});
test('invalid, missing, extreme and apparel inputs give unavailable explanations',()=>{
 assert.equal(dimensionGuide(undefined).guide,undefined);
 for(const v of ['0','-1','NaN','100001','450 mm',''])assert.equal(dimensionGuide(fixture('rectangular',[v,'300','400'])).guide,undefined);
 assert.match(dimensionGuide(fixture('flat',['0.00000001','100000'])).reason,/비율/);
 const apparel=fixture('flat',['520','700'],'garment-flat');assert.equal(dimensionGuide(apparel).guide,undefined);
 const mislabeled=fixture();const key=JSON.parse(mislabeled.specificationKey);key.productProfile.category='fashion';mislabeled.specificationKey=JSON.stringify(key);assert.equal(dimensionGuide(mislabeled).guide,undefined);
});
test('small and large valid drawings stay within the export frame and preserve all decimal digits',()=>{
 for(const values of [['0.000001','0.000002','0.000003'],['99999.99999999','70000','80000'],['450','30','400']])for(const lang of ['ko','en']){const g=dimensionGuide(fixture('rectangular',values),lang).guide;assert.ok(g);assert.deepEqual(g.values,values);for(const p of g.primitives){const points=p.kind==='text'?[[p.x,p.y]]:p.kind==='ellipse'?[[p.x-p.rx,p.y-p.ry],[p.x+p.rx,p.y+p.ry]]:p.points;for(const [x,y] of points){assert.ok(x>=0&&x<=g.width);assert.ok(y>=0&&y<=g.height);}}}
});
