import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {createWebBuild} from './scripts/web-build-info.mjs';
import {writeWebReleaseManifest} from './scripts/web-release-manifest.mjs';
const webBuild=createWebBuild();
const apiProxy={target:'http://127.0.0.1:8787',changeOrigin:true,configure(proxy:any){
 proxy.on('proxyReq',(out:any,req:any,res:any)=>{
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){
   out.destroy();if(!res.headersSent){res.writeHead(403);res.end('Local development API only');}
  }
 });
}};
const proxies={'/api/material-render':{...apiProxy,target:'http://127.0.0.1:8792'},'/api':apiProxy};
export default defineConfig({define:{__AIADCAST_WEB_BUILD__:JSON.stringify(webBuild)},plugins:[react(),{name:'web-build-metadata',async closeBundle(){if(this.meta.watchMode)return;await writeWebReleaseManifest('dist',webBuild.commit);},apply:'build',generateBundle(){this.emitFile({type:'asset',fileName:'web-build.json',source:JSON.stringify(webBuild)});}}],css:{postcss:{plugins:[{
 // Existing phone rules follow the centered shell, not the desktop viewport.
 // Leave motion preferences and vendor styles as viewport media queries.
 postcssPlugin:'app-shell-responsive-css',AtRule(rule:any){
  if(rule.name==='media'&&/\b(?:min-|max-)?width\s*:/.test(rule.params)&&rule.source?.input.file?.includes('/src/')){
   rule.name='container';rule.params='app-shell '+rule.params;
  }
 }
}]}},base:'./',build:{assetsInlineLimit:0},server:{host:'127.0.0.1',port:5180,strictPort:true,proxy:proxies},preview:{host:'127.0.0.1',port:4180,strictPort:true,proxy:proxies}});
