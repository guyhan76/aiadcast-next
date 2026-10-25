import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:1500,stdio:['ignore','pipe','ignore']}).trim();
export function createWebBuild({env=process.env,runGit=git,now=()=>new Date(),version=JSON.parse(readFileSync(new URL('package.json',root),'utf8')).version}={}){
 let commit=null,commitSource='unavailable',dirty=null;
 if(/^[a-f0-9]{40}$/i.test(env.RENDER_GIT_COMMIT??'')){commit=env.RENDER_GIT_COMMIT.toLowerCase();commitSource='render';dirty=false;}
 else try{const head=runGit(['rev-parse','HEAD']);if(/^[a-f0-9]{40}$/i.test(head)){commit=head.toLowerCase();commitSource='git';try{dirty=Boolean(runGit(['status','--porcelain','--untracked-files=no']));}catch{}}}catch{}
 return {schemaVersion:1,version,commit,commitSource,dirty,builtAt:now().toISOString()};
}
