import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/model.ts';
import {toMillimeters} from '../src/dimension-units.ts';
import {buildProportionReport,emptyMeasurement,measureFrontRatio,proportionContext} from '../src/proportion-review.ts';

const image={sha256:'a'.repeat(64),width:1000,height:800};
const output={sha256:'b'.repeat(64),width:1080,height:1920};
function marks(i,w,h,angle=0){
 const x=i.width/2,y=i.height/2,r=angle*Math.PI/180;
 const p=(dx,dy)=>({x:(x+dx)/i.width,y:(y+dy)/i.height});
 return {view:'front',points:[p(-w/2*Math.cos(r),-w/2*Math.sin(r)),p(w/2*Math.cos(r),w/2*Math.sin(r)),p(h/2*Math.sin(r),-h/2*Math.cos(r)),p(-h/2*Math.sin(r),h/2*Math.cos(r))]};
}
function fixture(category='boxes',type='rectangular',w=340,d=250,h=210){
 const p=newProject();p.productProfile={category,specType:type,material:''};p.product={...image,name:'synthetic.png',data:'test-fixture'};
 p.dimensions={...p.dimensions,width:String(w),depth:String(d),height:String(h)};
 const v=type==='flat'?d:h;
 return {p,context:proportionContext(p,output),measurement:{source:marks(image,w,v),result:marks(output,w*1.5,v*1.5),sameExtentConfirmed:true,extent:'synthetic front silhouette'}};
}
test('box, bag, bottle, appliance, clock and flat label compare their appropriate two axes',()=>{
 const cases=[['boxes','rectangular',340,250,210],['bags','rectangular',300,120,220],['beauty','cylindrical',60,0,150],['electronics','rectangular',240,180,330],['home','rectangular',300,50,300],['labels','flat',100,60,0]];
 for(const args of cases){const {context,measurement}=fixture(...args);const r=buildProportionReport(context,measurement);assert.equal(r.status,'consistent-in-plane',args[0]);assert.ok(r.source.relativeError<1e-12);assert.ok(r.result.relativeError<1e-12);assert.equal(r.geometryVerified,false);assert.equal(r.identityVerified,false);assert.equal(r.automaticallyDetected,false);assert.deepEqual(r.unmeasuredAxes,args[1]==='rectangular'?['depth']:[]);}
});
test('pixel aspect ratio is used rather than normalised coordinate length',()=>{
 const f=fixture();const r=buildProportionReport(f.context,f.measurement);
 assert.ok(Math.abs(r.expectedRatio-340/210)<1e-12);assert.ok(Math.abs(r.source.ratio-r.result.ratio)<1e-12);
});
test('rotation within the front plane and uniform scaling do not change ratios',()=>{
 const f=fixture('bags');f.measurement.source=marks(image,340,210,27);f.measurement.result=marks(output,510,315,-14);
 assert.equal(buildProportionReport(f.context,f.measurement).status,'consistent-in-plane');
});
test('stretched output fails even with an unchanged source and correct dimension labels',()=>{
 const f=fixture();f.measurement.result=marks(output,600,210);
 const r=buildProportionReport(f.context,f.measurement);assert.equal(r.status,'mismatch');assert.equal(r.source.status,'consistent-in-plane');assert.equal(r.result.status,'mismatch');
});
test('two identically wrong silhouettes cannot validate each other',()=>{
 const f=fixture();f.measurement.source=marks(image,600,210);f.measurement.result=marks(output,600,210);
 const r=buildProportionReport(f.context,f.measurement);assert.equal(r.status,'mismatch');assert.ok(r.sourceToResultRelativeChange<1e-12);
});
test('opposite deviations within the individual threshold still detect excessive source-to-result drift',()=>{
 const f=fixture();f.measurement.source=marks(image,340*.91,210);f.measurement.result=marks(output,340*1.09,210);
 const r=buildProportionReport(f.context,f.measurement);assert.equal(r.source.status,'consistent-in-plane');assert.equal(r.result.status,'consistent-in-plane');assert.equal(r.status,'mismatch');assert.ok(r.sourceToResultRelativeChange>.1);
});
test('perspective, unknown view, missing points and different measurement extent stay unverified',()=>{
 for(const patch of [{view:'perspective'},{view:'unconfirmed'},{points:[]}]){
  const f=fixture();Object.assign(f.measurement.result,patch);assert.equal(buildProportionReport(f.context,f.measurement).status,'unverified');
 }
 for(const patch of [{sameExtentConfirmed:false},{extent:'  '}]){const f=fixture();Object.assign(f.measurement,patch);assert.equal(buildProportionReport(f.context,f.measurement).status,'unverified');}
});
test('zero, out of image, short and parallel measurement edges are invalid',()=>{
 const f=fixture();
 for(const points of [[{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0}], [{x:-1,y:0},{x:.5,y:0},{x:.5,y:0},{x:.5,y:.5}], [{x:.1,y:.1},{x:.5,y:.1},{x:.1,y:.2},{x:.5,y:.2}], [{x:.1,y:.1},{x:NaN,y:.1},{x:.1,y:.2},{x:.1,y:.8}]]){
  f.measurement.result.points=points;assert.equal(buildProportionReport(f.context,f.measurement).status,'invalid');
 }
});
test('10 percent boundary remains inclusive despite floating point rounding',()=>{
 const mark=marks(image,374,210);assert.equal(measureFrontRatio(image,mark,340/210,true).status,'consistent-in-plane');
 assert.equal(measureFrontRatio(image,marks(image,375,210),340/210,true).status,'mismatch');
});
test('cm and inch input produce identical millimetre evidence; visibility does not bypass comparison',()=>{
 const f=fixture('bags','rectangular',254,50.8,127);
 f.p.dimensions.width=toMillimeters('10','inch');f.p.dimensions.depth=toMillimeters('5.08','cm');f.p.dimensions.height=toMillimeters('5','inch');f.p.dimensions.visible=false;
 assert.deepEqual(proportionContext(f.p,output).specifications,f.context.specifications);
 assert.equal(buildProportionReport(proportionContext(f.p,output),f.measurement).status,'consistent-in-plane');
});
test('a frozen record retains its photos, axes and points after caller edits',()=>{
 const f=fixture();const r=buildProportionReport(f.context,f.measurement,'2026-10-11T12:00:00.000Z');
 f.context.source.sha256='c'.repeat(64);f.context.specifications[0].value=1;f.measurement.source.points[0].x=0;
 assert.equal(r.context.source.sha256,image.sha256);assert.equal(r.context.specifications[0].value,340);assert.notEqual(r.measurement.source.points[0].x,0);
 assert.equal(r.createdAt,'2026-10-11T12:00:00.000Z');assert.equal(r.externallyCertified,false);
});
test('unsupported or malformed evidence cannot be exported as a result',()=>{
 const f=fixture();assert.throws(()=>buildProportionReport({...f.context,result:{...output,sha256:'bad'}},f.measurement),/INVALID_REVIEW_IMAGE/);
 assert.throws(()=>buildProportionReport({...f.context,specifications:[f.context.specifications[0],f.context.specifications[0]]},f.measurement),/INVALID_REVIEW_SPECIFICATIONS/);
 assert.throws(()=>buildProportionReport(f.context,f.measurement,'yesterday'),/INVALID_REVIEW_TIME/);
});
test('dimensionless products and services do not acquire fabricated measurements',()=>{
 const f=fixture('travel','none');const r=buildProportionReport(f.context,emptyMeasurement());assert.equal(r.status,'not-applicable');assert.equal(r.expectedRatio,null);assert.deepEqual(r.checkedAxes,[]);
});
test('context includes only image identity metadata and no duplicated image bytes',()=>{
 const f=fixture();const c=proportionContext(f.p,{...output,name:'result.png',data:'test-fixture'});assert.deepEqual(Object.keys(c.result).sort(),['height','sha256','width']);
});
