import {getEncoding} from 'js-tiktoken';
const encoding=getEncoding('o200k_base');
export const countTextTokens=text=>encoding.encode(text,[],[]).length;
// Official tiktoken GPT-5 mapping: o200k_base. Model framing/schema transformation
// is not reproduced locally. This full-payload estimate is NOT a provider hard cap.
export function recommendationInputEstimate(body,{width,height}){
 if(body.model!=='gpt-5.4-mini-2026-03-17'||![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=1024))throw Error('UNSUPPORTED_INPUT_ACCOUNTING');
 let images=0;const clean=structuredClone(body);
 for(const message of clean.input??[])for(const item of message.content??[])if(item.type==='input_image'){images++;if(item.detail!=='high')throw Error('UNSUPPORTED_INPUT_ACCOUNTING');item.image_url='[image pixels accounted separately]';}
 if(images!==1)throw Error('UNSUPPORTED_INPUT_ACCOUNTING');
 const textTokens=countTextTokens(JSON.stringify(clean));
 const imageTokens=Math.ceil(Math.ceil(width/32)*Math.ceil(height/32)*1.2)+1;
 const framingAllowance=1024;
 return {textTokens,imageTokens,framingAllowance,estimatedInputTokens:textTokens+imageTokens+framingAllowance,providerExact:false};
}
export function verifyRecommendationInput(body,dimensions,policy){
 const estimate=recommendationInputEstimate(body,dimensions);
 if(estimate.estimatedInputTokens>policy.maxInputTokens)throw Error('RECOMMENDATION_INPUT_LIMIT');
 const raw=BigInt(estimate.estimatedInputTokens)*BigInt(policy.pricing.input)+BigInt(policy.maxOutputTokens)*BigInt(policy.pricing.output);
 // Additional 25% arithmetic margin; no cached discount or unsupported spend guarantee.
 const estimatedMicros=Number((raw*125n+99_999_999n)/100_000_000n);
 if(!Number.isSafeInteger(estimatedMicros)||estimatedMicros>policy.reservationMicros)throw Error('RECOMMENDATION_RESERVATION_TOO_SMALL');
 return {...estimate,estimatedMicros,providerCostBoundVerified:false};
}
