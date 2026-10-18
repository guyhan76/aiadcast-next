// Separate opt-in localhost prototype. Never imported by the production beta server.
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {MaterialRenderJobs} from './material-render-jobs.mjs';
const origins=new Set(['http://127.0.0.1:5180','http://localhost:5180','http://127.0.0.1:4180','http://localhost:4180']);
export function createMaterialServer(jobs=new MaterialRenderJobs()){
 if(process.env.NODE_ENV==='production')throw Error('LOCAL_PROTOTYPE_ONLY');
 return createServer(async(req,res)=>{
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||!['127.0.0.1','localhost'].some(host=>req.headers.host===`${host}:${req.socket.localPort}`)||req.headers.origin&&!origins.has(req.headers.origin))return send(403,{error:'LOCAL_ONLY'});
  const path=new URL(req.url,'http://localhost').pathname,match=path.match(/^\/api\/material-render\/jobs\/([a-f0-9-]{36})(\/image)?$/);
  try{
   if(req.method==='POST'&&path==='/api/material-render/jobs'){
    if(req.headers['x-aiadcast-local-render']!=='1'||!req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'LOCAL_REQUEST_REQUIRED'});
    let body='';for await(const chunk of req){body+=chunk;if(body.length>2048)return send(413,{error:'INPUT_TOO_LARGE'});}
    return send(202,jobs.start(JSON.parse(body)));
   }
   if(match&&req.method==='DELETE'){if(req.headers['x-aiadcast-local-render']!=='1')return send(403,{error:'LOCAL_REQUEST_REQUIRED'});const j=jobs.cancel(match[1]);return send(j?200:404,j??{error:'JOB_NOT_FOUND'});}
   if(match&&req.method==='GET'){
    if(match[2]){const png=jobs.image(match[1]);if(!png)return send(404,{error:'IMAGE_NOT_READY'});res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(png);}
    const j=jobs.status(match[1]);return send(j?200:404,j??{error:'JOB_NOT_FOUND'});
   }
   send(404,{error:'NOT_FOUND'});
  }catch(e){send(e.message==='RENDER_BUSY'?409:400,{error:e.message==='RENDER_BUSY'?'RENDER_BUSY':'INVALID_RENDER_INPUT'});}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url))createMaterialServer().listen(8792,'127.0.0.1',()=>console.log('Local material renderer: 127.0.0.1:8792'));
