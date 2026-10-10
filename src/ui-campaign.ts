import {campaignGuide} from './campaign';
import {industryLabel} from './industry';
import {dimensionAxes,isServiceCategory} from './product';
import type {Project} from './model';
import type {UiLanguage} from './ui-language';

/** Translate the rule-based guide's presentation, never the customer's supplied facts. */
export function localizedCampaignGuide(project:Project,language:UiLanguage,text:(ko:string)=>string){
 const guide=campaignGuide(project);if(language==='ko')return guide;
 const service=isServiceCategory(project.productProfile.category),label=text(industryLabel(project.productProfile.category));
 const wholesale=guide.target==='구매·유통 담당자';
 const target=wholesale?'Purchasing and distribution teams':`Customers exploring ${label.toLowerCase()}`;
 const channels=guide.channels.map(channel=>({
  ...channel,name:({'상품 상세·제안서':'Product detail / proposal','기업 블로그':'Business blog','인스타그램 피드':'Instagram Feed','블로그·웹 배너':'Blog / web banner','상품 상세페이지':'Product detail page'} as Record<string,string>)[channel.name]??channel.name,
  reason:channel.format==='4:5'?(service?'Introduce your service and how to get started.':'Show your actual product and its confirmed features.'):channel.format==='16:9'?'Explain the context, terms and next steps.':'Bring together the details customers need to decide.',
 }));
 const suppliedValues=[project.productName,...(project.campaign?.attributes.map(item=>item.value)??[]),project.productProfile.material];
 const keywords=guide.keywords.map(word=>suppliedValues.includes(word)?word:word===industryLabel(project.productProfile.category)?label:({'상담 안내':'Inquiries','상품 소개':'Product highlights','서비스 안내':'Service details','제품 정보':'Product details'} as Record<string,string>)[word]??word);
 return {...guide,target,channels,keywords,reason:wholesale?'A starting suggestion based on the product category and supplied order details.':`A starting suggestion based on your ${service?'service':'product'} category.`,intent:`A ${project.campaign?.contentType==='card'?'card':'poster'} introducing ${project.productName||label}. ${dimensionAxes(project.productProfile).length?'Dimensions are stored separately; you choose whether to show them.':'Created around your copy and imagery without dimensions.'}`};
}
