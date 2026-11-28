import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/model.ts';
import {withCategory,productCategories} from '../src/product.ts';
import {defaultCampaign} from '../src/campaign.ts';
import {channelInfo,currentDraft,hashtagText,keywordCandidates,parsePublishing,publicationText,publishingBasis,publishingChannels,recommendedChannels,savePublishingDraft,suggestedDraft} from '../src/publishing.ts';
function sample(){const p=withCategory(newProject(),'cafe');p.productName='가을 라떼';p.copy.ko={title:'가을 라떼를 만나보세요',description:'가격 6,900원 · 10월 31일까지',company:'카페 봄',contact:'010-1234-5678',website:'https://example.com'};p.campaign={...defaultCampaign(),attributes:[{name:'지역',value:'인천'},{name:'수량',value:'100'},{name:'내부 연락처',value:'010-9999-8888'}]};return p;}
test('all channel drafts preserve supplied prices, dates and contacts without inventing offers or service dimensions',()=>{
 const p=sample();for(const channel of publishingChannels){const d=suggestedDraft(p,channel);assert.match(d.body,/6,900원 · 10월 31일까지/);assert.match(d.body,/010-1234-5678/);assert.doesNotMatch(d.body,/mm|할인|무료|최저/);assert.equal(d.basis,publishingBasis(p));}
});
test('search phrases use explicit places and names, not arbitrary price/phone attributes; hashtags are separated and deduplicated',()=>{
 const p=sample(),keywords=keywordCandidates(p);assert.ok(keywords.includes('가을 라떼'));assert.ok(keywords.some(v=>v.startsWith('인천 ')));assert.ok(keywords.every(v=>!/100|010-|6,900/.test(v)));
 assert.equal(hashtagText('가을 라떼, 가을라떼, Café, <script>'), '#가을라떼 #Café #script');
 assert.ok(publicationText(suggestedDraft(p,'instagram')).includes('#가을라떼'));assert.ok(!publicationText(suggestedDraft(p,'blog')).includes('#가을라떼'));
});
test('recommendations fit B2B, fashion and inquiry goals and every industry gets a usable plan',()=>{
 assert.deepEqual(recommendedChannels(withCategory(sample(),'boxes')),['website','blog','instagram','youtube','brochure','lookbook']);assert.deepEqual(recommendedChannels(withCategory(sample(),'fashion')),['instagram','lookbook','youtube','website','blog','brochure']);
 const p=sample();p.campaign.goal='inquiry';assert.deepEqual(recommendedChannels(p),['blog','website','instagram','youtube','brochure']);
 for(const [id] of productCategories)for(const locale of ['ko','en']){const p=withCategory(newProject(),id);p.locale=locale;for(const channel of publishingChannels){assert.ok(channelInfo(channel,locale).steps.length);assert.ok(suggestedDraft(p,channel).body.length<=6000);}}
});
test('manual drafts survive information changes and remain stale until explicitly reviewed, while view changes do not invalidate them',()=>{
 let p=sample();const original=suggestedDraft(p,'instagram');p=savePublishingDraft(p,{...original,body:'직접 수정한 글 6,900원'});
 p={...p,format:'1:1',background:{...p.background,color:'#ffffff'}};assert.equal(currentDraft(p,'instagram').stale,false);
 p={...p,copy:{...p.copy,ko:{...p.copy.ko,description:'7,900원'}}};assert.equal(currentDraft(p,'instagram').stale,true);assert.match(currentDraft(p,'instagram').draft.body,/6,900/);
 assert.match(suggestedDraft(p,'instagram').body,/7,900/);
 p=savePublishingDraft(p,{...currentDraft(p,'instagram').draft,basis:publishingBasis(p),body:'확인한 글 7,900원'});assert.equal(currentDraft(p,'instagram').stale,false);
 p.locale='en';assert.equal(currentDraft(p,'instagram').edited,false);p=savePublishingDraft(p,{...suggestedDraft(p,'instagram'),body:'English version'});p.locale='ko';assert.match(currentDraft(p,'instagram').draft.body,/확인한 글/);assert.equal(p.publishing.drafts.length,2);
});
test('valid visible dimensions use named axes; hidden or invalid values do not leak into customer copy',()=>{
 const p=withCategory(sample(),'boxes');p.productProfile.specType='rectangular';p.dimensions.visible=true;assert.match(suggestedDraft(p,'website').body,/가로 300 mm · 세로 200 mm · 높이 100 mm/);p.dimensions.width='';assert.doesNotMatch(suggestedDraft(p,'website').body,/mm/);p.dimensions.visible=false;assert.doesNotMatch(suggestedDraft(p,'website').body,/mm/);
});
test('legacy imports remain compatible and draft parser rejects invalid channels, duplicates and oversized content',()=>{
 assert.equal(parsePublishing(undefined),undefined);const draft=suggestedDraft(sample(),'blog');assert.deepEqual(parsePublishing({version:1,drafts:[draft]}),{version:1,drafts:[draft]});
 for(const d of [{...draft,channel:'__proto__'},{...draft,locale:'fr'},{...draft,body:'x'.repeat(6001)},{...draft,basis:null},{...draft,keywords:34}])assert.throws(()=>parsePublishing({version:1,drafts:[d]}));
 assert.throws(()=>parsePublishing({version:1,drafts:[draft,draft]}));
 const all=publishingChannels.flatMap(channel=>['ko','en'].map(locale=>({...suggestedDraft(sample(),channel),locale})));
 assert.equal(parsePublishing({version:1,drafts:all}).drafts.length,publishingChannels.length*2);
});

