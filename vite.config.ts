import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const apiProxy={target:'http://127.0.0.1:8787',changeOrigin:true,configure(proxy:any){
 proxy.on('proxyReq',(out:any,req:any,res:any)=>{
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){
   out.destroy();if(!res.headersSent){res.writeHead(403);res.end('Local development API only');}
  }
 });
}};
const proxies={'/api/material-render':{...apiProxy,target:'http://127.0.0.1:8792'},'/api':apiProxy};
export default defineConfig({plugins:[react()],base:'./',build:{assetsInlineLimit:0},server:{host:'127.0.0.1',port:5180,strictPort:true,proxy:proxies},preview:{host:'127.0.0.1',port:4180,strictPort:true,proxy:proxies}});
