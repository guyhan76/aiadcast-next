// Explicit test data, not semantic model output or current provider pricing.
export function mockRecommendationAdapter({actualMicros=125}={}){
 let calls=0;
 const adapter=async({snapshot,locale})=>{calls++;const ko=locale==='ko';return {actualMicros,output:{provenance:'mock-ai',channels:[{channel:'website',reason:ko?'모의 상품 소개 제안':'Mock product presentation suggestion',usage:ko?'상품 정보 옆에 배치':'Place beside product details',evidence:['productName','format']}],keywords:[snapshot.productName,...(ko?['모의 검색어 1','모의 검색어 2','모의 검색어 3','모의 검색어 4','모의 검색어 5']:['Mock phrase 1','Mock phrase 2','Mock phrase 3','Mock phrase 4','Mock phrase 5'])]}};};
 return {adapter,get calls(){return calls;}};
}
