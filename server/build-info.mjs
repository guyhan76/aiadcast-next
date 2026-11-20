import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
export function buildInfo({env=process.env,git=()=>execFileSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(root),encoding:'utf8',timeout:1000,stdio:['ignore','pipe','ignore']}).trim()}={}){
 let commit=null;const supplied=env.RENDER_GIT_COMMIT;
 if(/^[a-f0-9]{40}$/i.test(supplied??''))commit=supplied.toLowerCase();
 else try{const value=git();if(/^[a-f0-9]{40}$/i.test(value))commit=value.toLowerCase();}catch{}
 return {schemaVersion:1,service:'aiadcast-next',version:JSON.parse(readFileSync(new URL('package.json',root),'utf8')).version,commit};
}
export const serverBuild=Object.freeze(buildInfo());
