// Beta accounts use real server sessions; only email ownership verification is skipped.
import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {ApiFailure} from './generation-service.mjs';
const fail=(code,status=400)=>{throw new ApiFailure(code,status);};
const normalize=raw=>typeof raw==='string'?raw.trim().toLowerCase():'';
const validEmail=value=>value.length<=254&&/^[-a-z0-9.!#$%&'*+/=?^_`{|}~]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(value);
const validPassword=(value,min=8)=>typeof value==='string'&&value.length>=min&&value.length<=128&&Buffer.byteLength(value)<=512;
const derive=(password,salt)=>scryptSync(password,salt,32,{N:16384,r:8,p:1,maxmem:32*1024*1024});
const matches=(password,row)=>timingSafeEqual(derive(password,row?.salt??'aiadcast-missing-account'),Buffer.from(row?.password_hash??'0'.repeat(64),'hex'));
const digest=value=>createHash('sha256').update(value).digest('hex');
export class PasswordAuth {
 constructor(store,{enabled=false,adminEmail='selluplabs@gmail.com',adminPassword}={},now=()=>Date.now()){
  Object.assign(this,{store,db:store.db,enabled,adminEmail:normalize(adminEmail),adminPassword,now});
  if(!validEmail(this.adminEmail)||(adminPassword!==undefined&&!validPassword(adminPassword,12)))throw Error('INVALID_TEST_AUTH_CONFIG');
  this.db.exec(`CREATE TABLE IF NOT EXISTS email_identities(email TEXT PRIMARY KEY,user_id TEXT UNIQUE NOT NULL REFERENCES users(id));
   CREATE TABLE IF NOT EXISTS test_passwords(user_id TEXT PRIMARY KEY REFERENCES users(id),salt TEXT NOT NULL,password_hash TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS test_auth_attempts(email_hash TEXT PRIMARY KEY,failures INTEGER NOT NULL,window_start INTEGER NOT NULL);`);
 }
 available(){return this.enabled;}
 ownerReady(){return this.enabled&&Boolean(this.db.prepare('SELECT p.user_id FROM test_passwords p JOIN users u ON u.id=p.user_id JOIN email_identities e ON e.user_id=u.id WHERE e.email=? AND u.role=\'admin\' AND u.disabled=0').get(this.adminEmail));}
 bootstrapOwner(){
  if(!this.enabled||this.adminPassword===undefined)return;
  this.store.transaction(()=>{
   let user=this.db.prepare('SELECT u.* FROM users u JOIN email_identities e ON e.user_id=u.id WHERE e.email=?').get(this.adminEmail);
   if(this.db.prepare("SELECT id FROM users WHERE role='admin' AND id<>?").get(user?.id??''))throw Error('TEST_AUTH_OWNER_MISMATCH');
   if(user?.disabled)throw Error('TEST_AUTH_OWNER_DISABLED');
   let roleChanged=false;
   if(!user){
    if(this.db.prepare('SELECT COUNT(*) n FROM users').get().n>=20)throw Error('TEST_AUTH_OWNER_LIMIT');
    const allocated=this.db.prepare('SELECT COALESCE(SUM(budget),0) n FROM users').get().n;
    const id=randomUUID();this.db.prepare("INSERT INTO users(id,label,budget,credits,role) VALUES(?,?,?,3,'admin')").run(id,'셀업랩스 관리자',Math.max(0,this.store.cap-allocated));
    this.db.prepare('INSERT INTO email_identities VALUES(?,?)').run(this.adminEmail,id);
    user=this.db.prepare('SELECT * FROM users WHERE id=?').get(id);
   }else if(user.role!=='admin'){
    this.db.prepare("UPDATE users SET role='admin' WHERE id=?").run(user.id);
    roleChanged=true;
   }
   const old=this.db.prepare('SELECT * FROM test_passwords WHERE user_id=?').get(user.id);
   if(roleChanged||!old||!matches(this.adminPassword,old)){
    const salt=randomBytes(16).toString('hex'),passwordHash=derive(this.adminPassword,salt).toString('hex');
    this.db.prepare('INSERT INTO test_passwords VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET salt=excluded.salt,password_hash=excluded.password_hash').run(user.id,salt,passwordHash);
    this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    this.db.prepare('DELETE FROM invites WHERE user_id=?').run(user.id);
    this.db.prepare('DELETE FROM test_auth_attempts WHERE email_hash=?').run(digest(this.adminEmail));
   }
  });
  // Do not keep the plaintext administrator credential on this instance.
  this.adminPassword=undefined;
 }
 signup(body){
  if(!this.enabled)fail('TEST_AUTH_UNAVAILABLE',503);
  const email=normalize(body?.email),password=body?.password,label=typeof body?.name==='string'?body.name.trim():'';
  if(!validEmail(email))fail('INVALID_EMAIL');
  if(!validPassword(password))fail('INVALID_PASSWORD');
  if(email===this.adminEmail)fail('ADMIN_LOGIN_REQUIRED',409);
  if(label.length>80)fail('INVALID_ACCOUNT_NAME');
  return this.store.transaction(()=>{
   if(this.db.prepare('SELECT user_id FROM email_identities WHERE email=?').get(email))fail('ACCOUNT_EXISTS',409);
   if(this.db.prepare('SELECT COUNT(*) n FROM users').get().n>=20)fail('BETA_ALLOCATION_EXCEEDED',409);
   const id=randomUUID(),salt=randomBytes(16).toString('hex');
   this.db.prepare("INSERT INTO users(id,label,budget,credits,role) VALUES(?,?,0,0,'member')").run(id,label||email.slice(0,80));
   this.db.prepare('INSERT INTO email_identities VALUES(?,?)').run(email,id);
   this.db.prepare('INSERT INTO test_passwords VALUES(?,?,?)').run(id,salt,derive(password,salt).toString('hex'));
   return this.store.createSession(this.db.prepare('SELECT * FROM users WHERE id=?').get(id));
  });
 }
 signIn(body){
  if(!this.enabled)fail('TEST_AUTH_UNAVAILABLE',503);
  const email=normalize(body?.email),password=body?.password;
  if(!validEmail(email)||!validPassword(password))fail('INVALID_CREDENTIALS',401);
  const result=this.store.transaction(()=>{
   const key=digest(email),now=this.now(),windowStart=now-10*60_000;
   this.db.prepare('DELETE FROM test_auth_attempts WHERE window_start<?').run(windowStart);
   const attempt=this.db.prepare('SELECT failures FROM test_auth_attempts WHERE email_hash=?').get(key);
   if(attempt?.failures>=5)fail('AUTH_RATE_LIMIT',429);
   const row=this.db.prepare('SELECT u.*,p.salt,p.password_hash FROM users u JOIN email_identities e ON e.user_id=u.id JOIN test_passwords p ON p.user_id=u.id WHERE e.email=?').get(email);
   const valid=matches(password,row);
   if(!row||row.disabled||!valid){
    this.db.prepare('INSERT INTO test_auth_attempts VALUES(?,1,?) ON CONFLICT(email_hash) DO UPDATE SET failures=test_auth_attempts.failures+1').run(key,now);
    return null;
   }
   this.db.prepare('DELETE FROM test_auth_attempts WHERE email_hash=?').run(key);
   return this.store.createSession(row);
  });
  if(!result)fail('INVALID_CREDENTIALS',401);
  return result;
 }
}
