import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/model.ts';
import {withCategory} from '../src/product.ts';
import {marketingPlanForProject,parseMarketingPlan} from '../src/marketing-plan.ts';
import {keywordCandidates,recommendedChannels,channelInfo} from '../src/publishing.ts';

function sample(name,category='boxes',locale='ko'){
 const p=withCategory(newProject(),category);p.productName=name;p.locale=locale;p.copy[locale].company='Example Supplier';return p;
}
test('postal box recommendations use the requested product and related shopping nouns, not broad box headings or the supplier name',()=>{
 const p=sample('우체국3호박스');
 const expected=['우체국3호박스','우체국박스','택배박스','포장박스','종이박스','이사박스'];
 assert.deepEqual(keywordCandidates(p),expected);
 assert.deepEqual(marketingPlanForProject(p).keywords,expected);
 assert.ok(!keywordCandidates(p).some(k=>['박스','Example Supplier','박스 소개','박스 선택 가이드','박스 상세 정보'].includes(k)));
 const channels=recommendedChannels(p);for(const id of ['instagram','youtube','website','blog','brochure','lookbook'])assert.ok(channels.includes(id));
 assert.match(channelInfo('youtube','ko').name,/유튜브/);assert.match(channelInfo('brochure','ko').name,/기업 홍보물/);
});
test('specific product and service names select related nouns without borrowing unrelated catalog types',()=>{
 const gift=keywordCandidates(sample('명절 선물박스'));
 assert.ok(gift.includes('선물포장박스'));assert.ok(!gift.includes('택배박스'));assert.ok(!gift.includes('이사박스'));
 const appliance=keywordCandidates(sample('가정용 공기청정기','electronics'));
 assert.ok(appliance.includes('공기청정기'));assert.ok(!appliance.includes('소형가전'));
 const course=keywordCandidates(sample('성인 영어 회화','education'));
 assert.ok(course.includes('영어수업'));assert.ok(!course.includes('코딩수업'));
 const english=keywordCandidates(sample('Everyday tote bag','bags','en'));
 assert.ok(english.includes('tote bag'));assert.ok(!english.includes('backpack'));
});
test('use explicit place information, ignore contacts/prices and do not manufacture six phrases when details are insufficient',()=>{
 const p=sample('라떼','cafe');p.campaign={goal:'awareness',contentType:'poster',tone:'minimal',attributes:[{name:'지역',value:'인천'},{name:'내부 연락처',value:'010-0000-0000'},{name:'이메일',value:'private@example.com'},{name:'가격',value:'19,800원'}]};
 assert.ok(keywordCandidates(p).includes('인천 라떼'));
 assert.ok(keywordCandidates(p).every(k=>!/@|010-|19,800/.test(k)));
 const unknown=sample('새로운 도구','other'),plan=marketingPlanForProject(unknown);
 assert.deepEqual(plan.keywords,['새로운 도구']);assert.equal(plan.keywordCount,1);
});
test('legacy saved recommendations refresh from their original input without a new image or trusting old keywords',()=>{
 const plan=marketingPlanForProject(sample('우체국3호박스'));
 const old={...plan,method:'category-spec-rules-v2',channels:['website','blog'],keywords:['박스 소개'],keywordCount:6};
 const refreshed=parseMarketingPlan(JSON.parse(JSON.stringify(old)));
 assert.deepEqual(refreshed.keywords,plan.keywords);assert.deepEqual(refreshed.channels,plan.channels);
 assert.equal(refreshed.input.sourceHash,plan.input.sourceHash);
 assert.throws(()=>parseMarketingPlan({...old,input:{...old.input,attributes:[{name:'지역',value:'x'.repeat(2001)}]}}));
});
