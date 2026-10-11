import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdirSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {ApiFailure} from './generation-service.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
const code=()=>randomBytes(32).toString('base64url');
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(id);
const fail=(message,status=400)=>{throw new ApiFailure(message,status);};
export class BetaStore {
 constructor(directory,{monthlyBudgetMicros=0,now=()=>Date.now()}={}) {
  if(!Number.isSafeInteger(monthlyBudgetMicros)||monthlyBudgetMicros<0||monthlyBudgetMicros>100_000_000)throw Error('INVALID_BETA_BUDGET');
  mkdirSync(directory,{recursive:true,mode:0o700});this.directory=directory;this.now=now;
  const path=join(directory,'accounts.sqlite');this.db=new DatabaseSync(path);chmodSync(path,0o600);
  this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,label TEXT NOT NULL,budget INTEGER NOT NULL,credits INTEGER NOT NULL,disabled INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS invites(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS projects(user_id TEXT NOT NULL REFERENCES users(id),id TEXT NOT NULL,revision INTEGER NOT NULL,name TEXT NOT NULL,json TEXT NOT NULL,bytes INTEGER NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(user_id,id));`);
  if(!this.db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='role'))this.db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','admin'))");
  this.db.prepare("INSERT INTO settings VALUES('budget',?) ON CONFLICT DO NOTHING").run(monthlyBudgetMicros);
  if(this.db.prepare("SELECT value FROM settings WHERE key='budget'").get().value!==monthlyBudgetMicros){this.db.close();throw Error('BETA_BUDGET_CONFIG_CHANGED');}
  this.cap=monthlyBudgetMicros;
 }
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 provision({label,budgetMicros=0,credits=3}) {
  if(typeof label!=='string'||!label.trim()||label.length>80||!Number.isSafeInteger(budgetMicros)||budgetMicros<0||!Number.isSafeInteger(credits)||credits<0||credits>30)fail('INVALID_INVITE');
  return this.transaction(()=>{
   const stats=this.db.prepare('SELECT COUNT(*) n,COALESCE(SUM(budget),0) budget FROM users').get();
   if(stats.n>=20||stats.budget+budgetMicros>this.cap)fail('BETA_ALLOCATION_EXCEEDED',409);
   const id=randomUUID();this.db.prepare('INSERT INTO users(id,label,budget,credits) VALUES(?,?,?,?)').run(id,label.trim(),budgetMicros,credits);
   return {userId:id,...this.issueInvite(id)};
  });
 }
 setBudget(micros){if(!Number.isSafeInteger(micros)||micros<this.cap||micros>100_000_000)fail('BUDGET_INCREASE_ONLY');this.db.prepare("UPDATE settings SET value=? WHERE key='budget'").run(micros);this.cap=micros;}
 setAllocation(id,micros){return this.transaction(()=>{const user=this.db.prepare('SELECT budget FROM users WHERE id=? AND disabled=0').get(id);if(!user)fail('USER_NOT_FOUND',404);if(!Number.isSafeInteger(micros)||micros<user.budget)fail('ALLOCATION_INCREASE_ONLY');const total=this.db.prepare('SELECT COALESCE(SUM(budget),0) total FROM users').get().total;if(total-user.budget+micros>this.cap)fail('BETA_ALLOCATION_EXCEEDED',409);this.db.prepare('UPDATE users SET budget=? WHERE id=?').run(micros,id);});}
 issueInvite(id){const u=this.db.prepare('SELECT id FROM users WHERE id=? AND disabled=0').get(id);if(!u)fail('USER_NOT_FOUND',404);const invite=code(),expires=this.now()+24*60*60*1000;this.db.prepare('DELETE FROM invites WHERE user_id=? OR expires<=?').run(id,this.now());this.db.prepare('INSERT INTO invites VALUES(?,?,?)').run(digest(invite),id,expires);return {invite,expires};}
 login(invite){
  if(typeof invite!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(invite))fail('INVALID_INVITE',401);
  return this.transaction(()=>{
   const row=this.db.prepare('SELECT u.* FROM invites i JOIN users u ON i.user_id=u.id WHERE i.hash=? AND i.expires>? AND u.disabled=0').get(digest(invite),this.now());
   if(!row)fail('INVALID_INVITE',401);
   this.db.prepare('DELETE FROM invites WHERE hash=?').run(digest(invite));
   return this.createSession(row);
  });
 }
 createSession(row){
   this.db.prepare('DELETE FROM sessions WHERE expires<=?').run(this.now());
   const count=this.db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').get(row.id).n;
   if(count>=5)this.db.prepare('DELETE FROM sessions WHERE hash IN(SELECT hash FROM sessions WHERE user_id=? ORDER BY expires LIMIT 1)').run(row.id);
   const token=code(),expires=this.now()+24*60*60*1000;this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),row.id,expires);
   return {token,expires,user:{id:row.id,label:row.label,role:row.role??'member'}};
 }
 authenticate(header){if(typeof header!=='string'||!/^Bearer [A-Za-z0-9_-]{43}$/.test(header))fail('AUTH_REQUIRED',401);const u=this.db.prepare('SELECT u.* FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.hash=? AND s.expires>? AND u.disabled=0').get(digest(header.slice(7)),this.now());if(!u)fail('AUTH_REQUIRED',401);return u;}
 logout(header){if(typeof header==='string')this.db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(header.slice(7)));}
 setRole(id,role){if(!['member','admin'].includes(role))fail('INVALID_ROLE');const result=this.db.prepare('UPDATE users SET role=? WHERE id=? AND disabled=0').run(role,id);if(!result.changes)fail('USER_NOT_FOUND',404);this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);}
 revoke(id){this.db.prepare('UPDATE users SET disabled=1 WHERE id=?').run(id);this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);this.db.prepare('DELETE FROM invites WHERE user_id=?').run(id);}
 list(userId){return this.db.prepare('SELECT id,revision,name,updated FROM projects WHERE user_id=? ORDER BY updated DESC').all(userId);}
 project(userId,id){if(!validId(id))fail('PROJECT_NOT_FOUND',404);const row=this.db.prepare('SELECT revision,json FROM projects WHERE user_id=? AND id=?').get(userId,id);if(!row)fail('PROJECT_NOT_FOUND',404);return {revision:row.revision,project:JSON.parse(row.json)};}
 save(userId,id,body){
  const p=body?.project,revision=body?.revision;
  if(!validId(id)||!p||p.version!==1||p.id!==id||typeof p.name!=='string'||p.name.length>80||!Number.isSafeInteger(revision)||revision<0)fail('INVALID_PROJECT');
  const json=JSON.stringify(p),bytes=Buffer.byteLength(json);if(bytes>40_000_000)fail('PROJECT_TOO_LARGE',413);
  return this.transaction(()=>{
   const old=this.db.prepare('SELECT revision,bytes FROM projects WHERE user_id=? AND id=?').get(userId,id);
   if((old?.revision??0)!==revision)fail('PROJECT_CONFLICT',409);
   const stats=this.db.prepare('SELECT COUNT(*) n,COALESCE(SUM(bytes),0) bytes FROM projects WHERE user_id=?').get(userId);
   if((!old&&stats.n>=20)||stats.bytes-(old?.bytes??0)+bytes>200_000_000)fail('STORAGE_LIMIT',413);
   const next=revision+1,updated=new Date(this.now()).toISOString();
   this.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET revision=excluded.revision,name=excluded.name,json=excluded.json,bytes=excluded.bytes,updated=excluded.updated').run(userId,id,next,p.name,json,bytes,updated);
   return {revision:next,updated};
  });
 }
 close(){this.db.close();}
}

