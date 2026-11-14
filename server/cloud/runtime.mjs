import {createServer} from 'node:http';
import {createCloudBackend} from './beta.mjs';
const listen=(server,port)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',()=>{server.removeListener('error',reject);resolve();});});
const close=server=>new Promise(resolve=>server.close(resolve));
export async function startCloudServer(config,env=process.env,options={}){
 let standby;
 try{
  const app=await createCloudBackend(config,env,{...options,onStandby:async()=>{
   // Render switches traffic only after the new instance is healthy. A passive
   // instance lets that handover finish, without recovering or dispatching work
   // while the old instance still holds its PostgreSQL session lock.
   standby=createServer((req,res)=>{
    const health=req.method==='GET'&&req.url.split('?')[0]==='/api/health';
    res.writeHead(health?200:503,{'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':'3','X-Content-Type-Options':'nosniff'});
    res.end(JSON.stringify(health?{mode:'invite-beta',ready:false,state:'activating',commercialReady:false}:{error:{code:'CLOUD_ACTIVATING'}}));
   });standby.requestTimeout=10000;standby.headersTimeout=5000;standby.maxConnections=100;
   await listen(standby,config.port);
  }});
  if(standby){await close(standby);standby=null;}
  try{await listen(app.server,config.port);}catch(e){await app.close();throw e;}
  return app;
 }catch(e){if(standby)await close(standby);throw e;}
}
