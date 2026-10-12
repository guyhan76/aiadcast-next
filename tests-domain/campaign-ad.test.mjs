import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/model.ts';
import {campaignContent,campaignAdGeometry} from '../src/campaign-ad.ts';
import {adDetails} from '../src/ad-copy.ts';
import {imageFormats} from '../src/formats.ts';
import {photographSize,promptFor} from '../server/openai-image-adapter.mjs';

function fixture(){
 const p=newProject();p.presentation='campaign';p.productName='우체국3호박스';p.productProfile.category='boxes';
 p.dimensions={...p.dimensions,width:'340',depth:'250',height:'210',displayUnit:'mm'};
 p.copy.ko={title:p.productName,description:'B골, 크라프트재질. 크라프트재질로 내구성이 튼튼하고 습기에 강하다. 택배물류 박스에 표준규격. 우체국박스로 믿을 수 있는 든든함. 빠른배송. 10개 19,800원',company:'셀업랩스',contact:'010-5635-6211',email:'selluplabs@gmail.com',website:'https://selluplabs-homepage.selluplabs.workers.dev/'};
 return p;
}
const photo={name:'fixture',width:1536,height:864,data:'fixture',sha256:'a'.repeat(64)};
test('advertising hierarchy includes a hook, exact supplied benefits, quantity, price and optional contact fields',()=>{
 const p=fixture(),before=structuredClone(p),c=campaignContent(p);
 assert.equal(c.headline,'배송의 시작,\n든든하게.');assert.equal(c.name,p.productName);
 assert.equal(c.offer,'10개 19,800원');assert.equal(c.delivery,'빠른배송');assert.equal(c.features.length,3);
 for(const fact of ['B골','크라프트','튼튼','습기','표준규격','우체국'])assert.ok(c.features.join('').includes(fact));
 assert.deepEqual(p,before);
 p.copy.ko.title='대표님이 확정한 제목';assert.equal(campaignContent(p).headline,p.copy.ko.title);
 p.footer={company:false,contact:true,email:false,website:false};const hidden=campaignContent(p);
 assert.equal(hidden.company,'');assert.equal(hidden.email,'');assert.equal(hidden.website,'');assert.equal(hidden.phone,'010-5635-6211');
 assert.equal(adDetails('빠른배송').delivery,'빠른배송');assert.equal(adDetails('재질 안내').offer,'');
});
test('all seven sizes keep the complete source photograph undistorted and information blocks separate',()=>{
 for(const {id} of imageFormats){
  for(const asset of [photo,{...photo,width:864,height:1536}]){
   const p=fixture();p.format=id;const g=campaignAdGeometry(p,asset);
   assert.ok(g.hero.h>0);assert.ok(g.photo.x>=0&&g.photo.y>=0);assert.ok(g.photo.x+g.photo.w<=g.width+.0001&&g.photo.y+g.photo.h<=g.height+.0001);
   assert.ok(Math.abs(g.photo.w/asset.width-g.photo.h/asset.height)<1e-10);
   assert.ok(g.offer.x>=g.summary.x+g.summary.w);assert.ok(g.offer.y+g.offer.size*1.22<g.footerLine.y);
   assert.ok(g.features.every(f=>f.rect.y+f.rect.h<=g.summary.y));
   assert.ok(g.contact.y+3*44*g.unit<=g.height);
   if(id==='9:16'){assert.ok(g.title.y>=190);assert.ok(g.contact.y+3*44*g.unit<=1570);assert.ok(g.contact.x+g.contact.w<=920);}
  }
 }
});
test('campaign hero photograph framing is independent of final output ratio and does not request a giant empty copy area',()=>{
 const r={mode:'creative',subjectType:'physical-product',productProfile:{category:'boxes'},output:{format:'9:16'},creativeDirection:{visual:{id:'auto'}}};
 assert.equal(photographSize(r),'1536x864');assert.equal(photographSize({...r,output:{format:'16:9'}}),'1024x1024');
 assert.equal(photographSize({...r,mode:'original'}),'864x1536');assert.equal(photographSize({...r,output:{format:'invalid'}}),undefined);
 const prompt=promptFor(r);assert.match(prompt,/HERO PLATE/);assert.match(prompt,/70–85%/);assert.match(prompt,/faithful/);assert.match(prompt,/human review/);
 assert.match(prompt,/not proof of true 3D/);assert.match(prompt,/Never render a CTA/);assert.match(prompt,/Avoid anonymous beige warehouses/);
});
