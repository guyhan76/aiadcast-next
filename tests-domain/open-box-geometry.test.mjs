import test from 'node:test';import assert from 'node:assert/strict';
import{openBoxGeometry,projectOpenBox}from'../src/open-box-geometry.ts';
test('500x350x200 body is numerically 10:7:4 and height excludes every illustrative flap',()=>{
 const m=openBoxGeometry({width:500,depth:350,height:200});assert.deepEqual(m.body,{width:500,depth:350,height:200});
 for(const a of m.axes)assert.equal(Math.hypot(...a.end.map((v,i)=>v-a.start[i])),a.value);
 assert.deepEqual(m.axes.map(a=>a.value/50),[10,7,4]);assert.equal(Math.max(...m.vertices.map(p=>p[2])),200);
 assert.ok(m.faces.filter(f=>f.surface==='flap').some(f=>f.points.some(p=>p[2]>200)));assert.equal(m.referenceGeometryVerified,false);assert.equal(m.flaps.measured,false);
 const p=projectOpenBox(m);for(const a of p.axes)assert.ok(Math.abs(Math.hypot(a.end.x-a.start.x,a.end.y-a.start.y)/p.scale-a.value)<1e-9);
});
test('one projection scale fits all body and flap points and rejects invalid inputs',()=>{
 for(const size of [{width:500,depth:350,height:200},{width:200,depth:100,height:900}])for(const viewport of [{width:320,height:500,padding:35},{width:1080,height:1080,padding:100}]){
 const p=projectOpenBox(openBoxGeometry(size),viewport);for(const f of p.faces)for(const q of f.points){assert.ok(q.x>=viewport.padding-1e-9&&q.x<=viewport.width-viewport.padding+1e-9);assert.ok(q.y>=viewport.padding-1e-9&&q.y<=viewport.height-viewport.padding+1e-9);}}
 assert.throws(()=>openBoxGeometry({width:0,depth:350,height:200}));assert.throws(()=>openBoxGeometry({width:500,depth:350,height:200},{flapAngleDegrees:NaN,flapFraction:.4}));
});
