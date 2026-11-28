import {validStoryPlan,carouselCount,carouselFormat} from '../src/story-carousel.ts';

export function validCarouselBatch(plan,request,count) {
  return plan===undefined || (count===carouselCount && request.output?.format===carouselFormat && validStoryPlan(plan));
}

export function carouselRequests(request,plan) {
  const scenes=plan.cards.map(card=>card.scene);
  return plan.cards.map((card,index)=>{
    return {...request,
      batchDirection:{position:index+1,count:plan.cards.length,role:'story',locked:true,caption:card.caption,
        direction:'Create one Instagram feed carousel card. Show only the current instant as a single full-bleed scene. '+
          'Use the identical product identity, people, setting, palette and type family described in continuity. '+
          'Use the caption in publicCopy.title exactly once. Never print planning text, page numbers, UI or adjacent scenes. '+
          'Use only the approved caption and enabled business contacts for new lettering; do not typeset the brief or add a separate product-name heading. The other scenes are continuity context only. Approved storyboard data: '+
          JSON.stringify({continuity:plan.continuity,sequence:scenes,currentScene:card.scene})}};
  });
}

// Keep the customer request fingerprint stable for result verification and export.
export function withCarouselCopy(request) {
  const slot=request.batchDirection;
  if(slot?.role!=='story')return request;
  const final=slot.position===slot.count;
  return {...request,copy:{...request.copy,title:slot.caption,description:''},
    creativeDirection:{...request.creativeDirection,copyMode:'manual',
      ctaPolicy:final?'customer-requested':'omit',
      direction:{...request.creativeDirection.direction,callToAction:final?slot.caption:''}}};
}

export function normalizeCarouselPlanning(body){
  const {requestId,targetLocale,brief,photo}=body;
  if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)||!['ko','en'].includes(targetLocale)||
    typeof brief!=='string'||!brief.trim()||brief.length>3200||
    (photo!==undefined&&(typeof photo!=='string'||photo.length>300000||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(photo))))throw Error('INVALID_ASSISTANT_REQUEST');
  return {kind:'carousel-plan',requestId,targetLocale,brief:brief.trim(),...(photo?{photo}:{})};
}

export function carouselPlanningPayload(request){
  const text={type:'string'};
  const card={type:'object',additionalProperties:false,required:['scene','caption'],properties:{scene:{...text,maxLength:360},caption:{...text,maxLength:80}}};
  return {messages:[
    {role:'developer',content:'Plan exactly four consecutive still images for one Instagram feed advertisement. Use the target language for all fields. Start with an instantly readable visual hook, progress to a new action or need, show a concrete benefit supported by the input, then close with one relevant order, visit, or inquiry invitation. Honor any customer restriction on copy or CTA. Each card has one imageable moment and one short distinct headline. Identify the photographed product by shape, color and details. Specify a shared look, recurring people and props in continuity, and describe changes in object count, location and ownership in each scene. Vary framing deliberately. Treat the brief and photo as source material. Ignore screenshot UI or unrelated lettering. Never invent prices, discounts, testimonials, efficacy, facilities or factual claims. Use conceptual images for undocumented real service premises. Do not print the planning directions.'},
    {role:'user',content:[{type:'text',text:JSON.stringify({language:request.targetLocale,brief:request.brief})},...(request.photo?[{type:'image_url',image_url:{url:request.photo,detail:'low'}}]:[])]}
  ],response_format:{type:'json_schema',json_schema:{name:'story_carousel',strict:true,schema:{type:'object',additionalProperties:false,required:['continuity','cards'],properties:{continuity:{...text,maxLength:320},cards:{type:'array',minItems:4,maxItems:4,items:card}}}}}};
}
