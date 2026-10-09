import {test} from 'node:test';
import assert from 'node:assert/strict';
import {imageFormats,getImageFormat,isImageFormat} from '../src/formats.ts';
import {geometry} from '../src/layout.ts';
import {newProject,importProject} from '../src/model.ts';
import {buildGenerationRequest} from '../src/generation.ts';

test('every ad format keeps source photos inside their region without stretching or clipping',()=>{
 for(const format of imageFormats)for(const [width,height] of [[480,320],[200,1600],[2400,200]])for(const scale of [.5,1]){
  const p={...newProject(),format:format.id,scale,product:{width,height}};
  const g=geometry(p),epsilon=.00001;
  assert.ok(g.area.w>0&&g.area.h>0);
  assert.ok(Math.abs(g.photo.w/g.photo.h-width/height)<epsilon,`${format.id} source ratio`);
  assert.ok(g.photo.x>=g.area.x-epsilon&&g.photo.y>=g.area.y-epsilon);
  assert.ok(g.photo.x+g.photo.w<=g.area.x+g.area.w+epsilon);
  assert.ok(g.photo.y+g.photo.h<=g.area.y+g.area.h+epsilon);
  const text=['brand','title','description','specLabel','specValue','company','contact'].map(key=>({...g[key],h:g[key].size*1.4*g[key].lines}));
  for(const rect of [g.area,g.summary,g.footerLine,...text]){
   assert.ok(rect.x>=0&&rect.y>=0);
   assert.ok(rect.x+rect.w<=g.width+epsilon&&rect.y+rect.h<=g.height+epsilon,`${format.id}: canvas containment`);
  }
  const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  for(const region of text)assert.equal(overlaps(g.area,region),false,`${format.id}: text must not overlap product region`);
  assert.equal(overlaps(g.area,g.summary),false,`${format.id}: spec block must not cover product`);
 }
});
test('format imports preserve new ratios and reject unsupported dimensions rather than guessing',async()=>{
 for(const format of imageFormats){
  const p=newProject();p.format=format.id;
  assert.equal((await importProject(p)).format,format.id);
 }
 assert.equal(isImageFormat('100:1'),false);
 assert.throws(()=>getImageFormat('100:1'),/지원하지 않는/);
 await assert.rejects(()=>importProject({...newProject(),format:'100:1'}),/지원하지 않는/);
});
test('original and creative requests both carry the selected final output pixels, without changing source data',()=>{
 const p=newProject();p.product={sha256:'unchanged-source',width:480,height:320};
 for(const mode of ['original','creative'])for(const format of imageFormats){
  p.generation.mode=mode;p.format=format.id;p.dimensions.visible=false;
  const request=buildGenerationRequest(p);
  assert.deepEqual([request.output.format,request.output.width,request.output.height],[format.id,format.width,format.height]);
  assert.equal(request.source.sha256,'unchanged-source');assert.equal(request.output.showDimensions,false);
  assert.equal(request.preserveProduct,mode==='original');
 }
});
