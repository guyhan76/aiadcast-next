import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boxGeometry} from '../src/box-geometry.ts';
import {boxCornerIds,boxFaces,defaultBoxProjection,parseBoxProjection,validBoxCorners,boxProjectionReady,boxProjectionProblem,homography,mapPoint,projectBoxPixels} from '../src/box-projection.ts';
import {newProject,exportErrors} from '../src/model.ts';
import {buildGenerationRequest} from '../src/generation.ts';
const size={width:340,depth:250,height:210};
const model=boxGeometry(size);
const corners=Object.fromEntries(boxCornerIds.map(id=>[id,{x:(model.vertices[id].x+.5)/720,y:(model.vertices[id].y+.5)/540}]));
const project=()=>({...newProject(),product:{name:'synthetic.png',data:'test',width:720,height:540,sha256:'a'.repeat(64)},dimensions:{...newProject().dimensions,width:'340',depth:'250',height:'210'},boxProjection:{...defaultBoxProjection(),enabled:true,corners,markedCorners:[...boxCornerIds],confirmedSourceHash:'a'.repeat(64)}});
test('perspective transform preserves all four corners and round trips interior points',()=>{
 const square=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
 const quad=[{x:80,y:30},{x:500,y:80},{x:400,y:450},{x:40,y:300}];
 const h=homography(square,quad),inverse=homography(quad,square);
 for(let i=0;i<4;i++){const p=mapPoint(h,square[i]);assert.ok(Math.hypot(p.x-quad[i].x,p.y-quad[i].y)<1e-8);}
 for(const p of [{x:.1,y:.7},{x:.65,y:.2},{x:.5,y:.5}]){const back=mapPoint(inverse,mapPoint(h,p));assert.ok(Math.hypot(back.x-p.x,back.y-p.y)<1e-9);}
 assert.throws(()=>homography(Array(4).fill({x:1,y:1}),quad),/DEGENERATE/);
});
test('crossed, collapsed, mirrored, out-of-range and too-small face selections are rejected',()=>{
 assert.equal(validBoxCorners(corners,720,540),true);
 assert.equal(validBoxCorners({...corners,7:corners[4]},720,540),false);
 assert.equal(validBoxCorners({...corners,4:corners[7],7:corners[4]},720,540),false);
 assert.equal(validBoxCorners(Object.fromEntries(boxCornerIds.map(id=>[id,{x:1-corners[id].x,y:corners[id].y}])),720,540),false);
 assert.equal(validBoxCorners({...corners,1:{x:Infinity,y:.5}},720,540),false);
 assert.equal(validBoxCorners(corners,3,3),false);
});
test('source-bound confirmation is required; imports cannot inject malformed calibration',()=>{
 const p=project();assert.equal(boxProjectionReady(p),true);
 assert.deepEqual(parseBoxProjection(p.boxProjection),p.boxProjection);
 assert.equal(parseBoxProjection(undefined),undefined);
 assert.throws(()=>parseBoxProjection({...p.boxProjection,corners:{...corners,4:{x:-1,y:0}}}));
 assert.throws(()=>parseBoxProjection({...p.boxProjection,markedCorners:[4,4]}));
 assert.throws(()=>parseBoxProjection({...p.boxProjection,confirmedSourceHash:'forged'}));
 assert.equal(boxProjectionProblem({...p,product:{...p.product,sha256:'b'.repeat(64)}}),'confirmation');
 assert.equal(boxProjectionProblem({...p,boxProjection:{...p.boxProjection,markedCorners:[]}}),'confirmation');
 assert.equal(boxProjectionProblem({...p,product:null}),'photo');
});
test('hidden labels cannot bypass geometry validation and unsupported paths stay unchanged',()=>{
 const p=project();p.dimensions.visible=false;p.dimensions.height='';
 assert.equal(boxProjectionProblem(p),'dimensions');assert.ok(exportErrors(p).some(e=>e.includes('세 치수')));
 assert.throws(()=>buildGenerationRequest(p));
 p.dimensions.height='210';const request=buildGenerationRequest(p);
 assert.equal(request.claims.exactGeometry,false);assert.equal(request.claims.sameProduct,false);
 assert.equal(request.specificationContract.preservation,'source-face-projection');
 assert.equal(request.specificationContract.geometryVerified,false);
 assert.equal(request.output.showDimensions,false);
 p.productProfile.specType='none';assert.equal(boxProjectionReady(p),false);assert.equal(boxProjectionProblem(p),null);
});
test('pixel projection samples the source only inside visible faces without mutating it',()=>{
 const source={width:720,height:540,data:new Uint8ClampedArray(720*540*4)};
 for(let y=0;y<540;y++)for(let x=0;x<720;x++){const i=(y*720+x)*4;source.data.set([Math.floor(x/3),Math.floor(y/3),70,255],i);}
 const before=source.data.slice();const output=projectBoxPixels(source,corners,model);
 assert.deepEqual(source.data,before);assert.equal(output[3],0);
 for(const face of boxFaces){
  const x=Math.floor(face.corners.reduce((s,id)=>s+model.vertices[id].x,0)/4),y=Math.floor(face.corners.reduce((s,id)=>s+model.vertices[id].y,0)/4),i=(y*720+x)*4;
  assert.equal(output[i+3],255);assert.ok(Math.abs(output[i]-Math.floor(x/3))<=1);assert.ok(Math.abs(output[i+1]-Math.floor(y/3))<=1);assert.equal(output[i+2],70);
 }
 const changed=projectBoxPixels(source,corners,boxGeometry({...size,height:100}));assert.notDeepEqual(changed,output);
 assert.throws(()=>projectBoxPixels({...source,data:new Uint8ClampedArray(4)},corners,model));
});
test('transparent source pixels are not replaced with fabricated surface detail',()=>{
 const output=projectBoxPixels({width:720,height:540,data:new Uint8ClampedArray(720*540*4)},corners,model);
 assert.ok(output.every(v=>v===0));
});
