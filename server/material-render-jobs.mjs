import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

export function renderInput(raw){
 if(!raw||!['open-carton','cylinder'].includes(raw.shape))throw Error('UNSUPPORTED_SHAPE');
 const value=k=>{const n=raw[k];if(typeof n!=='number'||!Number.isFinite(n)||n<10||n>2000)throw Error('DIMENSIONS_10_TO_2000_MM');return n;};
 const widthMm=value('widthMm'),heightMm=value('heightMm'),depthMm=raw.shape==='cylinder'?widthMm:value('depthMm');
 if(Math.max(widthMm,depthMm,heightMm)/Math.min(widthMm,depthMm,heightMm)>10)throw Error('ASPECT_RATIO_NOT_SUPPORTED');
 return{shape:raw.shape,widthMm,depthMm,heightMm};
}
export async function runBlender(input,{signal,onProgress}){
 const dir=await mkdtemp(join(tmpdir(),'aiadcast-material-'));
 try{
  const file=join(dir,'input.json');await writeFile(file,JSON.stringify(input));
  await new Promise((ok,fail)=>{
   const child=spawn('blender',['-b','-t','2','--python',resolve('scripts/geometry/render-product.py'),'--',file,dir],{signal,stdio:['ignore','pipe','pipe']});
   let tail='';const output=data=>{tail=(tail+data.toString()).slice(-4000);for(const m of tail.matchAll(/Sample (\d+)\s*\/\s*(\d+)/g))onProgress(Math.min(95,5+Math.round(Number(m[1])/Number(m[2])*90)));};
   child.stdout.on('data',output);child.stderr.on('data',output);
   const timeout=setTimeout(()=>child.kill('SIGKILL'),240000);
   const abort=()=>{const kill=setTimeout(()=>child.kill('SIGKILL'),1500);kill.unref();};signal.addEventListener('abort',abort,{once:true});
   let spawnError;child.once('error',e=>{spawnError=e;});
   child.once('close',code=>{clearTimeout(timeout);signal.removeEventListener('abort',abort);code===0&&!spawnError?ok():fail(spawnError??Error('BLENDER_RENDER_FAILED'));});
  });
  const png=await readFile(join(dir,'product.png')),manifest=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));
  if(manifest.sha256!==createHash('sha256').update(png).digest('hex')||manifest.shape!==input.shape||['width','depth','height'].some(axis=>!Number.isFinite(manifest.bodyMm[axis])||Math.abs(manifest.bodyMm[axis]-input[axis+'Mm'])>1e-6))throw Error('RENDER_RESULT_MISMATCH');
  return{png,manifest};
 }finally{await rm(dir,{recursive:true,force:true});}
}
export class MaterialRenderJobs{
 constructor(runner=runBlender){this.runner=runner;this.jobs=new Map();this.active=null;}
 start(raw){
  const input=renderInput(raw);if(this.active)throw Error('RENDER_BUSY');
  for(const[id,j]of this.jobs)if(Date.now()-j.created>3600000||this.jobs.size>=5)this.jobs.delete(id);
  const job={id:randomUUID(),input,state:'rendering',progress:1,created:Date.now(),controller:new AbortController()};this.jobs.set(job.id,job);this.active=job.id;
  Promise.resolve().then(()=>this.runner(input,{signal:job.controller.signal,onProgress:n=>{if(job.state==='rendering')job.progress=Math.max(job.progress,n);}})).then(result=>{if(job.state==='rendering'){job.result=result;job.state='done';job.progress=100;}}).catch(e=>{if(job.state!=='cancelled'){job.state='failed';job.error=e.code==='ENOENT'?'BLENDER_NOT_INSTALLED':'RENDER_FAILED';}}).finally(()=>{if(this.active===job.id)this.active=null;});
  return this.status(job.id);
 }
 status(id){const j=this.jobs.get(id);if(!j)return null;return{id:j.id,input:j.input,state:j.state,progress:j.progress,error:j.error,...(j.result?{manifest:j.result.manifest,imageUrl:`/api/material-render/jobs/${j.id}/image`}:{})};}
 cancel(id){const j=this.jobs.get(id);if(!j)return null;if(j.state==='rendering'){j.state='cancelled';j.controller.abort();}return this.status(id);}
 image(id){const j=this.jobs.get(id);return j?.state==='done'?j.result.png:null;}
}
