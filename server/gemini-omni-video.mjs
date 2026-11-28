import {omniTurns,omniBudget} from '../src/video-omni.ts';

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
  accepts:body=>omniTurns(body.seconds).length>0 && ['9:16','16:9'].includes(body.ratio) &&
    ['manual','auto'].includes(body.promptMode) && ['service','product'].includes(body.brief?.kind) &&
    Array.isArray(body.references) && body.references.length<=6 && (body.brief.kind==='service'||body.references.length>0),
  upload:async()=>[],
  estimate:async(_key,input)=>omniBudget(input.localExtension?.total??parseInt(input.response_format.duration,10)).holdMicros,
  input(plan){
    const [direction,...references]=plan.content;
    const turns=omniTurns(plan.duration);
    if(!turns.length)throw Error('INVALID_VIDEO_DURATION');
    const images=references.map(reference=>{
      const uri=reference.image_url.url;
      return {type:'image',mime_type:uri.slice(5,uri.indexOf(';')),data:uri.slice(uri.indexOf(',')+1)};
    });
    const text=turns.length===1?direction.text:direction.text+'\nProduction timing: this is a '+plan.duration+'-second plan. Generate only 0–'+turns[0]+'s now; reserve subsequent actions and dialogue for the continuation.';
    return {model,background:true,store:true,input:[...images,{type:'text',text}],
      response_format:{type:'video',aspect_ratio:plan.ratio,resolution:'720p',duration:turns[0]+'s'},
      ...(turns.length>1?{localExtension:{total:plan.duration,ratio:plan.ratio}}:{})};
  },
  async submit(key,{localExtension,...input}){
    const id=await submitInteraction(key,input);
    return localExtension?JSON.stringify({...localExtension,id,turn:0,cost:0}):id;
  },
  async poll(key,saved,download=false,replace){
    if(!saved.startsWith('{'))return readVideo(key,saved,download);
    const state=JSON.parse(saved);
    if(state.claimed)return {state:Date.now()-state.claimed<65000?'running':'uncertain'};
    if(state.failed)return {state:'failed',actualMicros:state.cost};
    const turns=omniTurns(state.total);
    const elapsed=turns.slice(0,state.turn+1).reduce((sum,n)=>sum+n,0);
    const final=state.turn===turns.length-1;
    const result=await readVideo(key,state.id,download&&final,elapsed);
    if(result.state==='running')return result;
    const cost=state.cost+(result.actualMicros??(result.state==='ready'?elapsed*100000:0));
    if(result.state==='failed'||final)return {...result,actualMicros:cost};
    // Persist the claim before sending a billable continuation. An ambiguous network result
    // stays claimed across concurrent polls, restarts and retries.
    const claim=JSON.stringify({...state,claimed:Date.now()});
    if(!await replace(saved,claim))return {state:'running'};
    const next=turns[state.turn+1];
    let id;
    try{
      id=await submitInteraction(key,{model,background:true,store:true,previous_interaction_id:state.id,
        input:'Extend this video. Continue the approved storyboard from '+elapsed+'s through '+(elapsed+next)+'s. Preserve voices, people, setting and product. Perform only the next actions and dialogue, without repeating earlier actions.'+(elapsed+next===state.total?' Finish the approved closing action.':' Reserve the ending for the next turn.'),
        response_format:{type:'video',resolution:'720p',aspect_ratio:state.ratio,duration:next+'s'}});
    }catch(error){
      if([400,401,402,403,404,422,423,429].includes(error.providerStatus)){
        await replace(claim,JSON.stringify({...state,failed:true,cost}));
        return {state:'failed',actualMicros:cost};
      }
      return {state:'uncertain'};
    }
    await replace(claim,JSON.stringify({...state,id,turn:state.turn+1,cost}));
    return {state:'running'};
  }
};

async function submitInteraction(key,input){
  const result=await interaction(key,'',input);
  if(typeof result.id!=='string'||!/^[A-Za-z0-9._~=-]{1,1024}$/.test(result.id))throw Error('GEMINI_MISSING_ID');
  return result.id;
}

// Read the movie header from ISO BMFF boxes. A continuation-only response must
// never be delivered as the full paid ad.
function movieSeconds(file,start=0,end=file.length,insideMoov=false){
  for(let pos=start;pos+8<=end;){
    let size=file.readUInt32BE(pos),header=8;
    if(size===1){if(pos+16>end)return;size=Number(file.readBigUInt64BE(pos+8));header=16;}
    if(size===0)size=end-pos;
    if(size<header||pos+size>end)return;
    const type=file.toString('ascii',pos+4,pos+8),data=pos+header;
    if(type==='moov'&&!insideMoov)return movieSeconds(file,data,pos+size,true);
    if(type==='mvhd'&&insideMoov&&data<pos+size){
      const v=file[data],scaleOffset=data+(v===1?20:12);
      if(v>1||scaleOffset+(v===1?12:8)>pos+size)return;
      const scale=file.readUInt32BE(scaleOffset);
      const duration=v===1?Number(file.readBigUInt64BE(scaleOffset+4)):file.readUInt32BE(scaleOffset+4);
      if(scale)return duration/scale;
    }
    pos+=size;
  }
}

async function readVideo(key,id,download=false,expectedSeconds){
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
    const file=download||expectedSeconds?Buffer.from(video.data,'base64'):undefined;
    if(expectedSeconds){
      const duration=movieSeconds(file);
      if(!Number.isFinite(duration)||Math.abs(duration-expectedSeconds)>0.6)return {state:'failed',actualMicros};
    }
    return {state:'ready',actualMicros,...(download?{file}:{})};
}

