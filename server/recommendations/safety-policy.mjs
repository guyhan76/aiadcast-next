// Pure local contracts. No model, credential, provider-price or production grant.
export function assertLocalRecommendationMode(mode){
 if(mode!=='local-test'||process.env.NODE_ENV==='production')throw Error('RECOMMENDATION_LIVE_POLICY_NOT_APPROVED');
}
export function validateRecommendationLimits(value){
 const fields=['maxInputTextTokens','maxOutputTokens','maxImageBytes','maxImageEdge','maxImages'];
 if(!value||typeof value!=='object'||Object.keys(value).some(k=>!fields.includes(k))||fields.some(k=>!Number.isSafeInteger(value[k])||value[k]<1)||value.maxImages!==1||value.maxImageBytes>10_000_000||value.maxImageEdge>2048||value.maxInputTextTokens>3000||value.maxOutputTokens>1000)throw Error('INVALID_RECOMMENDATION_LIMITS');
 return Object.freeze({...value});
}
// Only validates explicitly measured evidence. No byte-to-token inference.
export function validateRecommendationMeasurements(limits,measurement){
 const policy=validateRecommendationLimits(limits);
 if(!measurement||Object.keys(measurement).some(k=>!['inputTextTokens','outputTokens','imageBytes','imageWidth','imageHeight','imageCount'].includes(k))||['inputTextTokens','outputTokens','imageBytes','imageWidth','imageHeight','imageCount'].some(k=>!Number.isSafeInteger(measurement[k])||measurement[k]<0)||measurement.imageCount!==1||measurement.imageWidth<1||measurement.imageHeight<1||measurement.imageBytes<1||measurement.inputTextTokens>policy.maxInputTextTokens||measurement.outputTokens>policy.maxOutputTokens||measurement.imageBytes>policy.maxImageBytes||Math.max(measurement.imageWidth,measurement.imageHeight)>policy.maxImageEdge)throw Error('RECOMMENDATION_LIMIT_EXCEEDED');
 return {withinConfiguredLimits:true,providerCostBoundVerified:false};
}
