import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boxGeometry,parseBoxSize} from '../src/box-geometry.ts';
const size={width:340,depth:250,height:210};
test('all twelve cuboid edges match the supplied millimetres',()=>{
 const model=boxGeometry(size);
 for(let i=0;i<8;i++)for(const [bit,axis] of [[1,'width'],[2,'depth'],[4,'height']])if(!(i&bit)){
  const a=model.vertices[i],b=model.vertices[i|bit];
  assert.equal(Math.hypot(...a.mm.map((v,k)=>v-b.mm[k])),size[axis]);
  assert.ok(Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-size[axis]*model.scale)<1e-9);
 }
 assert.equal(model.photoGeometryVerified,false);
});
test('viewport fitting keeps one uniform scale and all vertices within padding',()=>{
 for(const width of [320,720,1920])for(const height of [400,1080]){
  const m=boxGeometry(size,{width,height,padding:45});
  for(const p of m.vertices){assert.ok(p.x>=45-1e-9&&p.x<=width-45+1e-9);assert.ok(p.y>=45-1e-9&&p.y<=height-45+1e-9);}
  const lengths=m.dimensions.map(d=>Math.hypot(d.end.x-d.start.x,d.end.y-d.start.y));
  assert.ok(Math.abs(lengths[0]/lengths[1]-340/250)<1e-9);
  assert.ok(Math.abs(lengths[0]/lengths[2]-340/210)<1e-9);
 }
});
test('dimension labels use the same values as geometry and update when height changes',()=>{
 const a=boxGeometry(size),b=boxGeometry({...size,height:100});
 assert.deepEqual(a.dimensions.map(d=>[d.axis,d.value,d.unit]),[['width',340,'mm'],['depth',250,'mm'],['height',210,'mm']]);
 assert.notDeepEqual(a.vertices,b.vertices);
 assert.equal(b.normalizedRatios.height,100/340);
 assert.equal(size.height,210);
});
test('zero, omitted, malformed or unbounded dimensions never produce a plausible guide',()=>{
 for(const value of ['','0','-1','NaN','Infinity','1e2','100001','2.123456789',' 340 ','<script>'])assert.throws(()=>parseBoxSize({width:value,depth:'250',height:'210'}));
 for(const value of [0,NaN,Infinity,-1,100001])assert.throws(()=>boxGeometry({...size,height:value}));
 assert.throws(()=>boxGeometry({width:340,depth:250}));
 assert.throws(()=>boxGeometry(size,{width:100,height:100,padding:50}));
 assert.deepEqual(parseBoxSize({width:'340.5',depth:'250',height:'210'}),{width:340.5,depth:250,height:210});
});
