import {marketingPlanForProject,marketingChannels} from './marketing-plan.ts';
import {dimensionLabel,dimensionUnit,validMillimeters} from './dimension-units.ts';
import type {Locale,Project} from './model.ts';
import type {ImageFormat} from './formats.ts';
import {industryLabel} from './industry.ts';
import {axisLabel,dimensionAxes} from './product.ts';
import {uiEnglish} from './ui-translations.ts';
import {requestedCallToAction} from './art-direction.ts';

export const publishingChannels=marketingChannels;
export type PublishingChannel=typeof publishingChannels[number];
export type PublishingDraft={channel:PublishingChannel;locale:Locale;basis:string;title:string;body:string;keywords:string};
export type Publishing={version:1;drafts:PublishingDraft[]};
export function parsePublishing(raw:unknown):Publishing|undefined{
 if(raw===undefined)return undefined;
 const r=raw as Publishing;
 if(!r||r.version!==1||!Array.isArray(r.drafts)||r.drafts.length>publishingChannels.length*2)throw Error('게시글 저장 정보를 확인해주세요.');
 const drafts=r.drafts.map(d=>{
  if(!d||!publishingChannels.includes(d.channel)||!['ko','en'].includes(d.locale)||typeof d.basis!=='string'||d.basis.length>16000||typeof d.title!=='string'||d.title.length>400||typeof d.body!=='string'||d.body.length>6000||typeof d.keywords!=='string'||d.keywords.length>500)throw Error('게시글 내용과 길이를 확인해주세요.');
  return {channel:d.channel,locale:d.locale,basis:d.basis,title:d.title,body:d.body,keywords:d.keywords};
 });
 if(new Set(drafts.map(d=>`${d.channel}:${d.locale}`)).size!==drafts.length)throw Error('중복된 매체별 게시글입니다.');
 return {version:1,drafts};
}
// Captions follow the ad language, not UI language. View changes and image exports do not stale copy.
export function publishingBasis(p:Project):string{
 return JSON.stringify({version:1,locale:p.locale,productName:p.productName,profile:p.productProfile,copy:p.copy[p.locale],goal:p.campaign?.goal??'awareness',cta:requestedCallToAction(p.campaign?.creative?.note??''),attributes:p.campaign?.attributes??[],dimensions:p.dimensions.visible?dimensionAxes(p.productProfile).map(a=>[a,p.dimensions[a],dimensionUnit(p.dimensions.displayUnit)]):[]});
}
export function recommendedChannels(p:Project):PublishingChannel[]{
 return marketingPlanForProject(p).channels;
}
export function channelInfo(channel:PublishingChannel,locale:Locale){
 const t=(ko:string,en:string)=>locale==='ko'?ko:en;
 const data:Record<PublishingChannel,{name:string;format:ImageFormat;reason:string;steps:string[];measure:string}>={
  instagram:{name:t('인스타그램','Instagram'),format:'4:5',reason:t('사진과 짧은 글로 첫 관심을 끌 때 좋아요.','Start with an image and a short introduction.'),steps:[t('피드 이미지를 저장하고 아래 게시글을 붙여넣으세요.','Save the feed image and paste the caption below.'),t('연결할 주소는 프로필에도 등록하세요. 게시글의 URL은 클릭되지 않을 수 있어요.','Add your destination to your profile too; caption URLs may not be clickable.'),t('게시 미리보기에서 글자 잘림을 확인하세요.','Check text cropping in the platform preview.')],measure:t('좋아요보다 저장·프로필 방문·실제 문의를 살펴보세요.','Look at saves, profile visits and actual inquiries, beyond likes.')},
  blog:{name:t('블로그','Blog'),format:'16:9',reason:t('검색하는 고객에게 상세 정보와 선택 기준을 설명하기 좋아요.','Explain details and decision criteria to people searching for them.'),steps:[t('제목에 상품명과 핵심 검색어를 자연스럽게 넣으세요.','Use the subject and a relevant search phrase naturally in the title.'),t('본문에 대표 이미지와 실제 사용 사진을 함께 배치하세요.','Include the main image and actual use photos in the article.'),t('마지막에 문의·구매 경로를 분명히 남기세요.','Finish with a clear inquiry or purchase route.')],measure:t('검색 유입과 글을 본 뒤 발생한 문의를 비교하세요.','Compare search visits and inquiries after reading.')},
  shortform:{name:t('숏폼·릴스','Short video / Reels'),format:'9:16',reason:t('상품이나 서비스를 짧은 장면으로 소개할 때 활용하세요.','Introduce your offer in a short sequence of scenes.'),steps:[t('0–3초: 아래 제목으로 관심을 끌고 실제 상품·공간을 보여주세요.','0–3 sec: Open with the title and show the actual product or place.'),t('3–10초: 게시글의 핵심 정보를 실제 사용 장면과 함께 보여주세요.','3–10 sec: Show the key information alongside real use footage.'),t('10–15초: 문의·방문 경로를 보여주며 마무리하세요.','10–15 sec: Finish with the inquiry or visit route.')],measure:t('초반 이탈·완주·문의 중 어디에서 반응이 달라지는지 보세요.','Compare early drop-off, completion and inquiries.')},
  youtube:{name:t('유튜브·쇼츠','YouTube / Shorts'),format:'9:16',reason:t('상품·서비스를 소개하는 영상과 원페이지 쇼츠의 이미지 소재로 활용하세요.','Use as a visual for product videos and single-page Shorts.'),steps:[t('세로 이미지를 저장한 뒤 영상 편집 도구에서 영상으로 변환하세요.','Save the vertical image and turn it into video in a video editor.'),t('제목·상품명과 핵심 내용을 영상 및 설명에 맞게 정리하세요.','Adapt the title, product name and key details for the video and description.'),t('실제 게시 화면에서 글자 가림과 연락처 가독성을 확인하세요.','Check text obstruction and contact readability in the publishing preview.')],measure:t('시청 유지율과 채널 방문·실제 문의를 함께 살펴보세요.','Compare audience retention, channel visits and actual inquiries.')},
  website:{name:t('홈페이지·상세페이지','Website / product page'),format:'3:4',reason:t('구매나 상담 전에 확인할 정보를 한곳에 정리하기 좋아요.','Gather the information needed before a purchase or inquiry.'),steps:[t('이미지 옆에 제목과 본문을 실제 텍스트로 넣으세요.','Place the title and body beside the image as actual text.'),t('사진 설명에는 실제 보이는 상품·서비스를 적으세요.','Describe what the image actually shows in its alt text.'),t('문의 버튼을 실제 연락처나 신청 페이지에 연결하세요.','Connect the inquiry button to a working contact or request page.')],measure:t('방문 수와 문의 버튼 클릭·접수 완료 수를 함께 보세요.','Compare visits with inquiry clicks and completed requests.')},
  lookbook:{name:t('광고 룩북','Ad lookbook'),format:'3:4',reason:t('브랜드와 여러 상품을 순서대로 소개할 때 활용하세요.','Present a brand and its products in a clear sequence.'),steps:[t('1장: 브랜드와 이번 소개의 핵심 제목을 배치하세요.','Page 1: Introduce the brand and the collection headline.'),t('2장: 실제 상품 사진과 입력한 특징·조건을 보여주세요.','Page 2: Show real product photos and supplied details.'),t('3장: 문의·주문 방법을 넣으세요. 추가 상품은 프로젝트를 따로 만들어 이어 붙이세요.','Page 3: Add inquiry or ordering details. Prepare additional products in separate projects.')],measure:t('전달한 고객 중 상담·주문으로 이어진 반응을 기록하세요.','Record which recipients continue to an inquiry or order.')},
  brochure:{name:t('기업 홍보물·제안서','Company materials / proposals'),format:'3:4',reason:t('기업 소개서, 제품 카탈로그, 브로슈어와 영업 제안서의 광고 이미지로 활용하세요.','Use the image in company profiles, product catalogs, brochures and sales proposals.'),steps:[t('이미지를 저장해 소개서·카탈로그·제안서에 삽입하세요.','Save the image and place it in a company profile, catalog or proposal.'),t('고객에게 필요한 제품 사양과 연락처를 문서 본문에도 넣으세요.','Include relevant specifications and contacts in the document text too.'),t('인쇄할 때는 출력 크기에 맞는 해상도와 글자 선명도를 확인하세요.','For print, check the resolution and text clarity at the intended size.')],measure:t('자료 전달 후 상담·견적 요청으로 이어진 반응을 기록하세요.','Track inquiries and quotation requests after sharing the materials.')},
 };
 return data[channel];
}
function unique(values:string[]){return [...new Map(values.map(v=>[v.toLocaleLowerCase(),v])).values()];}
export function keywordCandidates(p:Project):string[]{
 return marketingPlanForProject(p).keywords;
}
export function hashtagText(keywords:string):string{
 return unique(keywords.split(/[,，\n]/).map(v=>v.replace(/[^\p{L}\p{N}_]/gu,'')).filter(v=>v.length>1&&v.length<=40)).slice(0,6).map(v=>`#${v}`).join(' ');
}
export function suggestedDraft(p:Project,channel:PublishingChannel):PublishingDraft{
 const t=(ko:string,en:string)=>p.locale==='ko'?ko:en,copy=p.copy[p.locale];
 const label=industryLabel(p.productProfile.category),subject=p.productName.trim()||(p.locale==='ko'?label:uiEnglish[label]??'Our offer');
 const title=copy.title.trim()||subject;
 const facts=unique([p.productProfile.material.trim(),...(p.campaign?.attributes??[]).map(a=>`${a.name}: ${a.value}`)].filter(Boolean));
 const dims=dimensionAxes(p.productProfile);
 if(p.dimensions.visible&&dims.length&&dims.every(a=>validMillimeters(p.dimensions[a])))facts.push(dims.map(a=>`${axisLabel(a,p.locale,p.productProfile)} ${dimensionLabel(p.dimensions[a],p.dimensions.displayUnit)}`).join(' · '));
 const contact=[copy.contact.trim(),copy.website.trim()].filter(Boolean).join('\n');
 const action=requestedCallToAction(p.campaign?.creative?.note??'');
 const cta=contact?(action?`${action==='requested'?t('문의·자세한 안내','Inquiries and details'):action}\n${contact}`:contact):'';
 const detail=unique([copy.description.trim(),...facts].filter(Boolean)).join('\n');
 let body=[copy.company.trim(),subject!==title?subject:'',detail,cta].filter(Boolean).join('\n\n');
 if(channel==='blog')body=[unique([subject,title,copy.description.trim()].filter(Boolean)).join('\n'),facts.length?`${t('알아두면 좋은 정보','Details to know')}\n${facts.join('\n')}`:'',cta].filter(Boolean).join('\n\n');
 if(channel==='shortform'||channel==='youtube')body=[subject,copy.description.trim(),...facts,cta].filter(Boolean).join('\n\n');
 return {channel,locale:p.locale,basis:publishingBasis(p),title:channel==='blog'?`${subject}${t(' 소개',' — an introduction')}`.slice(0,400):title,body,keywords:keywordCandidates(p).join(', ')};
}
export function currentDraft(p:Project,channel:PublishingChannel){
 const saved=p.publishing?.drafts.find(d=>d.channel===channel&&d.locale===p.locale);
 return {draft:saved??suggestedDraft(p,channel),edited:!!saved,stale:!!saved&&saved.basis!==publishingBasis(p)};
}
export function savePublishingDraft(p:Project,draft:PublishingDraft):Project{
 const others=(p.publishing?.drafts??[]).filter(d=>d.channel!==draft.channel||d.locale!==draft.locale);
 return {...p,publishing:parsePublishing({version:1,drafts:[...others,draft]})};
}
export function publicationText(draft:PublishingDraft){return [draft.title,draft.body,...(['instagram','shortform','youtube'].includes(draft.channel)?[hashtagText(draft.keywords)]:[])].filter(Boolean).join('\n\n');}


