const endpoint='https://generativelanguage.googleapis.com/v1beta/interactions';
const model='gemini-omni-1.2-flash';
const maxResponseBytes=64*1024*1024;

async function interaction(key,path,body){
  const response=await fetch(endpoint+path,{
    method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(55000),
    headers:{'x-goog-api-key':key,'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  if(!response.ok){
    await response.body?.cancel();
    throw Object.assign(Error('GEMINI_HTTP_ERROR'),{providerStatus:response.status});
  }
  const chunks=[];let size=0;
  for await(const chunk of response.body){
    size+=chunk.length;
    if(size>maxResponseBytes)throw Error('GEMINI_RESPONSE_TOO_LARGE');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export const geminiOmni={
  model,revision:'gemini/'+model+'/pilot-v1',singleSubmit:true,
  key:()=>process.env.GEMINI_API_KEY?.trim(),
  accepts:body=>body.seconds===10 && body.ratio==='9:16' && body.promptMode==='auto' &&
    body.references?.length===1 && body.brief?.kind==='product' && ['product','presenter'].includes(body.brief.style??body.brief.kind),
  upload:async()=>[],
  // Budget reservation per 10-second pilot, including input and output headroom.
  estimate:async()=>1_000_000,
  input(plan){
    const [direction,reference]=plan.content;
    const uri=reference.image_url.url,index=uri.indexOf(',');
    return {model,background:true,store:true,input:[
      {type:'image',mime_type:uri.slice(5,uri.indexOf(';')),data:uri.slice(index+1)},
      {type:'text',text:direction.text}
    ],response_format:{type:'video',aspect_ratio:'9:16',resolution:'720p',duration:'10s'}};
  },
  async submit(key,input){
    const result=await interaction(key,'',input);
    if(typeof result.id!=='string'||!/^[A-Za-z0-9._~=-]{1,1024}$/.test(result.id))throw Error('GEMINI_MISSING_ID');
    return result.id;
  },
  async poll(key,id,download=false){
    const result=await interaction(key,'/'+encodeURIComponent(id));
    if(['in_progress','queued','processing'].includes(result.status))return {state:'running'};
    if(['failed','cancelled','requires_action','incomplete'].includes(result.status))return {state:'failed'};
    if(result.status!=='completed')throw Error('GEMINI_UNKNOWN_STATUS');
    const video=result.steps?.filter(step=>step.type==='model_output').flatMap(step=>step.content??[])
      .find(item=>item.type==='video'&&item.mime_type==='video/mp4'&&typeof item.data==='string');
    if(!video||Buffer.from(video.data.slice(0,16),'base64').toString('ascii',4,8)!=='ftyp')return {state:'failed'};
    const usage=result.usage;
    const actualMicros=Number.isSafeInteger(usage?.total_output_tokens)&&usage.total_output_tokens>0 &&
      Number.isSafeInteger(usage?.total_input_tokens)?Math.ceil(usage.total_output_tokens*12+usage.total_input_tokens*1.5):undefined;
    return {state:'ready',actualMicros,...(download?{file:Buffer.from(video.data,'base64')}:{})};
  }
};
