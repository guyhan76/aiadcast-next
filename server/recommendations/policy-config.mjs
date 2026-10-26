import {validateServerRecommendationPolicy} from './safety-policy.mjs';
// Invalid or incomplete config disables only recommendations. Never reads a key.
export function recommendationPolicyFromEnv(env){
 if(env.AIADCAST_RECOMMENDATIONS_ENABLED!=='true')return undefined;
 const str=name=>env['AIADCAST_RECOMMENDATIONS_'+name];
 const integer=name=>{const v=str(name);return typeof v==='string'&&/^[1-9][0-9]*$/.test(v)?Number(v):NaN;};
 try{return validateServerRecommendationPolicy({kind:str('POLICY'),customerPolicy:str('CUSTOMER_POLICY'),customerCharge:str('CUSTOMER_CHARGE')==='0'?0:NaN,model:str('MODEL'),promptVersion:str('PROMPT_VERSION'),inputAccounting:str('INPUT_ACCOUNTING'),maxInputTokens:integer('MAX_INPUT_TOKENS'),reservationMicros:integer('RESERVATION_MICROS'),monthlyCapMicros:integer('MONTHLY_CAP_MICROS'),maxOutputTokens:integer('MAX_OUTPUT_TOKENS'),pricing:{input:integer('INPUT_PRICE_MICROS_PER_MILLION'),cached:integer('CACHED_PRICE_MICROS_PER_MILLION'),output:integer('OUTPUT_PRICE_MICROS_PER_MILLION')}});}catch{return undefined;}
}
