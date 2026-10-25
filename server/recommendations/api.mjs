// Standalone authenticated contract for local tests; not mounted in beta server.
export function recommendationApi({authenticate,service,origin,enabled=false}){
 const send=(status,data)=>Response.json(status>=400&&typeof data?.error==='string'?{error:{code:data.error}}:data,{status,headers:{'Cache-Control':'no-store'}});
 return async request=>{
  if(!enabled)return send(503,{error:'RECOMMENDATIONS_DISABLED'});
  try{
   const user=await authenticate(request.headers.get('authorization'));
   if(!user||!user.id||user.disabled)return send(401,{error:'AUTH_REQUIRED'});
   const context={userId:user.id},url=new URL(request.url);
   const get=/^\/api\/recommendations\/([A-Za-z0-9_-]{1,100})$/.exec(url.pathname);
   if(request.method==='GET'&&get)return send(200,await service.read(context,get[1]));
   const post=/^\/api\/generations\/([A-Za-z0-9_-]{1,100})\/recommendations$/.exec(url.pathname);
   if(request.method==='GET'&&post)return send(200,{recommendation:await service.readForGeneration(context,post[1])});
   if(request.method!=='POST'||!post)return send(404,{error:'NOT_FOUND'});
   if(request.headers.get('origin')!==origin||request.headers.get('x-aiadcast-client')!=='local-studio')return send(403,{error:'ORIGIN_NOT_ALLOWED'});
   if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return send(415,{error:'JSON_REQUIRED'});
   const reader=request.body?.getReader();if(!reader)return send(400,{error:'INVALID_REQUEST'});
   let bytes=0,parts=[];for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2048){await reader.cancel();return send(413,{error:'REQUEST_TOO_LARGE'});}parts.push(Buffer.from(value));}
   let body;try{body=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{return send(400,{error:'INVALID_REQUEST'});}
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['requestId','locale'].includes(k)))return send(400,{error:'INVALID_REQUEST'});
   return send(200,await service.request(context,{...body,generationId:post[1]}));
  }catch(e){const code=e?.message;const map={AUTH_REQUIRED:401,NOT_FOUND:404,OWNED_PERSISTED_IMAGE_REQUIRED:404,INVALID_REQUEST:400,INVALID_SNAPSHOT:409,IDEMPOTENCY_CONFLICT:409,EXPLICIT_REFRESH_NOT_IMPLEMENTED:409,RECOMMENDATIONS_DISABLED:503,RECOMMENDATION_BUDGET_UNAVAILABLE:409,SHARED_BUDGET_UNAVAILABLE:409};return send(map[code]??503,{error:map[code]?code:'RECOMMENDATION_UNAVAILABLE'});}
 };
}
