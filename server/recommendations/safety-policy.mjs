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

// Supplied only by a reviewed server deployment, never by an HTTP request.
// No default model, token prices, reservation or commercial approval.
export function validateServerRecommendationPolicy(p){
 if(!p||p.reservationMicros!==20000||p.monthlyCapMicros!==500000||p.model!=='gpt-5.4-mini-2026-03-17'||p.inputAccounting!=='local-conservative-v1'||!Number.isSafeInteger(p.maxInputTokens)||p.maxInputTokens<1||p.maxInputTokens>8192||p.kind!=='approved-server-policy-v1'||p.customerPolicy!=='included-first-approved'||p.customerCharge!==0||typeof p.model!=='string'||!/^gpt-[a-z0-9.-]{1,80}$/.test(p.model)||!/^recommendation-v[0-9]+$/.test(p.promptVersion)||!Number.isSafeInteger(p.reservationMicros)||p.reservationMicros<1||!Number.isSafeInteger(p.monthlyCapMicros)||p.monthlyCapMicros<p.reservationMicros||!Number.isSafeInteger(p.maxOutputTokens)||p.maxOutputTokens<1||p.maxOutputTokens>1000||!p.pricing||['input','cached','output'].some(k=>!Number.isSafeInteger(p.pricing[k])||p.pricing[k]<0)||p.pricing.input<1||p.pricing.output<1||p.pricing.cached>p.pricing.input)throw Error('RECOMMENDATION_LIVE_POLICY_NOT_APPROVED');
 return structuredClone(p);
}
export function assertRecommendationExecution(mode,policy){if(mode==='local-test')return assertLocalRecommendationMode(mode);if(mode!=='server')throw Error('RECOMMENDATION_LIVE_POLICY_NOT_APPROVED');return validateServerRecommendationPolicy(policy);}
