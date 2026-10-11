import fs from 'node:fs';
import path from 'node:path';
const files=fs.readdirSync('dist/assets');
const index=fs.readFileSync('dist/index.html','utf8');
const js=path.basename(index.match(/<script[^>]+src="([^"]+)"/)?.[1]??'');const css=path.basename(index.match(/<link[^>]+href="([^"]+\.css)"/)?.[1]??'');
if(!js||!css)throw Error('Missing build assets');
let styles=fs.readFileSync('dist/assets/'+css,'utf8');
styles=styles.replace(/url\(([^)]+)\)/g,(match,url)=>{const name=path.basename(url.replace(/['"]/g,''));if(!name.endsWith('.woff2'))return match;return `url(data:font/woff2;base64,${fs.readFileSync('dist/assets/'+name).toString('base64')})`;});
let script=fs.readFileSync('dist/assets/'+js,'utf8').replace(/<\/script/gi,'<\\/script');
// Homepage campaigns must remain available in the downloadable single-file preview.
for(const name of files.filter(name=>/\.(webp|png|jpe?g)$/.test(name))){
 const extension=path.extname(name).slice(1),mime=extension==='jpg'?'jpeg':extension;
 const data=`data:image/${mime};base64,${fs.readFileSync('dist/assets/'+name).toString('base64')}`;
 script=script.replaceAll(`new URL(\`${name}\`,import.meta.url).href`,JSON.stringify(data));
 script=script.replaceAll(`/assets/${name}`,data);
 if(script.includes(name))throw Error(`Standalone image was not embedded: ${name}`);
}
const html=`<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#191a18"><title>aiadcast Studio · 편집 검증판</title><style>${styles}</style></head><body><div id="root"></div><script type="module">${script}</script></body></html>`;
fs.mkdirSync('release',{recursive:true});fs.writeFileSync('release/aiadcast-studio.html',html);console.log('Standalone HTML: '+(Buffer.byteLength(html)/1048576).toFixed(1)+' MB');
fs.copyFileSync('docs/preview-guide.txt','release/사용안내.txt');
for(const name of ['FONT-LICENSE.txt','THIRD-PARTY-NOTICES.txt'])fs.copyFileSync('licenses/'+name,'release/'+name);


