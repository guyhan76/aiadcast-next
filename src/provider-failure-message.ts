export function providerFailureMessage(code:string|null,language:string):string|null {
 const messages:Record<string,[string,string]>={
  PROVIDER_QUOTA_EXHAUSTED:['이미지 공급사의 잔액 또는 사용 한도에 도달했습니다. 관리자에게 확인을 요청해주세요. 자동 재시도하지 않습니다.','The image provider reports exhausted credits or a usage limit. Ask the administrator to check. No automatic retry.'],
  PROVIDER_TEMPORARY_RATE_LIMIT:['이미지 공급사의 일시 호출 제한입니다. 자동 재시도하지 않습니다. 잠시 후 상태를 확인해주세요.','The image provider is temporarily rate limiting requests. No automatic retry. Check the status later.'],
  PROVIDER_429_UNCLASSIFIED:['이미지 공급사가 요청을 제한했지만 세부 원인을 확인하지 못했습니다. 관리자에게 확인을 요청해주세요. 자동 재시도하지 않습니다.','The image provider rejected the request with HTTP 429, but the reason is unconfirmed. Ask the administrator to check. No automatic retry.']
 };
 if(code==='PROVIDER_RATE_LIMITED')code='PROVIDER_429_UNCLASSIFIED'; // Older servers used this code for every 429.
 return code&&messages[code]?messages[code][language==='en'?1:0]:null;
}
