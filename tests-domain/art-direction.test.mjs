import {test} from 'node:test';
import assert from 'node:assert/strict';
import {artDirectionFor,requestedCallToAction} from '../src/art-direction.ts';
import {fitAdText} from '../src/ad-type.ts';
import {newProject} from '../src/model.ts';
import {withCategory} from '../src/product.ts';
import {withCreative,creativeCopy,creativeContract} from '../src/creative.ts';
import {makeCopyRequest} from '../src/ai-copy.ts';
import {promptFor} from '../server/openai-image-adapter.mjs';

const categories=['beauty','bags','fashion','jewelry','electronics','travel','lodging','insurance','hospital','lease'];
test('ten production briefs offer distinct concepts and share their copy zone with the image adapter',()=>{
 const ids=new Set();
 for(const category of categories){
  const direction=artDirectionFor(category,'4:5');ids.add(direction.id);assert.equal(direction.concepts.length,3);
  const prompt=promptFor({mode:'creative',productProfile:{category},output:{format:'4:5'},creativeDirection:{}});
  for(const technique of direction.techniques)assert.ok(prompt.includes(technique));
  assert.match(prompt,/human review/);assert.match(prompt,/Never render a CTA/);
  assert.ok(prompt.includes({top:'upper 30%',left:'left 42%',bottom:'lower 32%'}[direction.copyZone]));
 }
 assert.equal(ids.size,10);
 assert.equal(artDirectionFor('rental','4:5').id,artDirectionFor('lease','4:5').id);
 assert.equal(artDirectionFor('unknown','4:5').id,'editorial-product');
 const cloned=artDirectionFor('beauty','4:5');cloned.concepts.push('tampering');assert.equal(artDirectionFor('beauty','4:5').concepts.length,3);
});
test('layout instructions change the matching type zone without compromising protected source mode',()=>{
 assert.equal(artDirectionFor('beauty','4:5','문구는 하단에 넣어주세요').copyZone,'bottom');
 assert.equal(artDirectionFor('lease','4:5','헤드라인은 상단').copyZone,'top');
 assert.equal(artDirectionFor('beauty','16:9').copyZone,'left');
 const prompt=promptFor({mode:'original',productProfile:{category:'beauty'},output:{format:'4:5'},creativeDirection:{additionalInstructions:'문구 하단'}});
 assert.match(prompt,/ONLY an empty/);assert.match(prompt,/without modifying its pixels/);assert.match(prompt,/upper 30% calm/);
});
test('CTA opt-in requires an explicit request and negative requests take priority',()=>{
 for(const note of ['', '문의가 늘어나면 좋겠어요','예약 서비스 소개','CTA 넣지 말아주세요','구매하기 문구는 제외','no CTA','remove call to action','CTA 추가, 하지만 CTA 없이 제작'])assert.equal(requestedCallToAction(note),'',note);
 assert.equal(requestedCallToAction('CTA 문구를 추가해주세요'),'requested');
 assert.equal(requestedCallToAction('하단에 문의하기 문구를 넣어주세요'),'문의하기');
 assert.equal(requestedCallToAction('include a CTA'),'requested');
 assert.equal(requestedCallToAction('add shop now'),'shop now');
 for(const category of categories){const p=withCreative(withCategory(newProject(),category),{directionId:'offer'});assert.equal(creativeContract(p).ctaPolicy,'omit');assert.equal(creativeContract(p).direction.callToAction,'');}
});
test('explicit CTA survives supplied description and is sent separately to the copy assistant',()=>{
 const base=withCategory(newProject(),'beauty');base.productName='토너';base.productProfile.material='140ml';
 const p=withCreative(base,{note:'문의하기 문구를 추가해주세요'});
 assert.equal(creativeCopy(p).description,'140ml 문의하기');
 assert.deepEqual(makeCopyRequest(p,'suggest','ko').cta,{requested:true,text:'문의하기'});
 assert.deepEqual(makeCopyRequest(base,'suggest','ko').cta,{requested:false,text:''});
});
test('type fitting preserves exact numbers and characters while shrinking; impossible fits remain errors',()=>{
 const measure=(text,size)=>Array.from(text).length*size;
 const copy='토너 140ml + 로션 140ml · 2,265,000원';
 const fit=fitAdText(copy,150,24,10,3,measure);
 assert.equal(fit.overflow,false);assert.ok(fit.size<24);assert.equal(fit.lines.join(''),copy);assert.ok(fit.lines.every(line=>measure(line,fit.size)<=150));
 const overflow=fitAdText(copy,50,24,16,2,measure);assert.equal(overflow.overflow,true);assert.equal(overflow.lines.join(''),copy);
 const multiline=fitAdText('첫 줄\n둘째 줄',150,16,10,2,measure);assert.deepEqual(multiline.lines,['첫 줄','둘째 줄']);
});
