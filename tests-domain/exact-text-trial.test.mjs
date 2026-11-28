import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {BetaStore} from '../server/beta-store.mjs';import {createBetaServer} from '../server/beta-server.mjs';
test('trial capability is owner-only; all submissions are blocked before service or accounting',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'exact-trial-')),store=new BetaStore(dir,{monthlyBudgetMicros:0});let services=0;
 writeFileSync(join(dir,'index.html'),'<html>trial shell</html>');
 const app=createBetaServer({staticDirectory:dir,store,publicUrl:'https://trial.example',serviceFactory:()=>{services++;throw Error('MUST_NOT_INITIALIZE');}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
 const sessions=[];for(const role of ['admin','admin','member']){const u=store.provision({label:role,budgetMicros:0,credits:0});store.setRole(u.userId,role);sessions.push(store.login(u.invite));}
 const owner=sessions[0];store.db.prepare('INSERT INTO email_identities(email,user_id) VALUES(?,?)').run('selluplabs@gmail.com',owner.user.id);
 const shell=await fetch('http://127.0.0.1:'+app.server.address().port+'/exact-text-trial');assert.equal(shell.status,200);assert.match(await shell.text(),/trial shell/);
 const call=async(token,path='/api/admin/exact-text-trial',body)=>{const r=await fetch('http://127.0.0.1:'+app.server.address().port+path,{method:body?'POST':'GET',headers:{Origin:'https://trial.example',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json','X-Aiadcast-Client':'local-studio'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 assert.equal((await call()).status,401);for(const s of sessions.slice(1))assert.equal((await call(s.token)).status,403);
 assert.equal((await call(owner.token)).data.generationEnabled,false);
 for(const s of sessions){assert.equal((await call(s.token,'/api/admin/exact-text-trial',{role:'admin'})).status,403);assert.equal((await call(s.token,'/api/generations',{request:{output:{exactText:{version:2}}}})).data.error.code,'PAID_TRIAL_NOT_APPROVED');}
 assert.equal(services,0);store.logout('Bearer '+owner.token);assert.equal((await call(owner.token)).status,401);
});
test('cloud route awaits owner check and no paid enable flag is exposed',()=>{const s=readFileSync('server/cloud/http-base.mjs','utf8');assert.match(s,/await admin\.exactTextTrial\(user\)/);assert.match(s,/PAID_TRIAL_NOT_APPROVED/);});
