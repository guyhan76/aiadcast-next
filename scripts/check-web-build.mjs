import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export function verifyWebBuild(build,{requireCommit=false,expectedCommit}={}){
 if(build?.schemaVersion!==1||typeof build.version!=='string'||!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(build.version)||!Number.isFinite(Date.parse(build.builtAt)))throw Error('Invalid web build metadata');
 if(build.commit!==null&&(typeof build.commit!=='string'||!/^[a-f0-9]{40}$/.test(build.commit)))throw Error('Invalid web build commit');
 if(requireCommit&&!build.commit)throw Error('Web source commit missing: provide the build-time source revision before releasing');
 if(expectedCommit&&build.commit!==expectedCommit.toLowerCase())throw Error('Web build revision does not match the requested source');
 return build;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const build=JSON.parse(readFileSync(new URL('../dist/web-build.json',import.meta.url),'utf8'));
 verifyWebBuild(build,{requireCommit:process.argv.includes('--require-commit'),expectedCommit:process.env.RENDER_GIT_COMMIT||undefined});
 console.log('Web build metadata verified.');
}
