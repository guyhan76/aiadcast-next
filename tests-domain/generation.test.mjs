import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildGenerationRequest,defaultGeneration,parseGeneration} from '../src/generation.ts';
import {newProject,exportErrors} from '../src/model.ts';
const project=()=>({...newProject(),product:{name:'example.png',data:'data:image/png;base64,test',width:480,height:320,sha256:'source-checksum'}});
test('new and older projects default to original product preservation',()=>{
 assert.equal(defaultGeneration().mode,'original');assert.equal(parseGeneration(undefined).mode,'original');
 const request=buildGenerationRequest(project());assert.equal(request.operation,'compose-original');assert.equal(request.source.role,'protected-product');assert.equal(request.preserveProduct,true);
 assert.throws(()=>parseGeneration({mode:'unrecognized',brief:''}));
});
test('creative intent is separate from dimension display and never promises the original product',()=>{
 const p=project();p.generation={mode:'creative',brief:'새로운 무광 용기'};p.productProfile.specType='cylindrical';p.dimensions.width='80';p.dimensions.height='210';p.dimensions.visible=false;p.dimensions.lines=false;
 const request=buildGenerationRequest(p);assert.equal(request.source.role,'visual-reference');assert.equal(request.source.sha256,p.product.sha256);assert.equal(request.operation,'image-product-concept');assert.equal(request.preserveProduct,false);assert.equal(request.claims.exactGeometry,false);assert.equal(request.output.showDimensions,false);assert.deepEqual(request.specifications,[{axis:'diameter',value:'80',unit:'mm'},{axis:'height',value:'210',unit:'mm'}]);
 assert.equal(p.product.sha256,'source-checksum');assert.ok(exportErrors(p).some(e=>e.includes('AI 연결 후')));
});
test('creative requests require valid reference dimensions even when the annotations are hidden',()=>{
 const p=project();p.generation={mode:'creative',brief:''};p.dimensions.visible=false;p.dimensions.width='-1';
 assert.throws(()=>buildGenerationRequest(p),/규격/);p.productProfile.specType='none';assert.deepEqual(buildGenerationRequest(p).specifications,[]);
});
