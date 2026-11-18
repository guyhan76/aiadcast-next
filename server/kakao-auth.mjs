import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {ApiFailure} from './generation-service.mjs';
const digest = s => createHash('sha256').update(s).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const valid = s => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s);
const fail = (code, status) => { throw new ApiFailure(code, status); };

export class KakaoAuth {
  constructor(store, {provider, now = () => Date.now()} = {}) {
    this.store = store;
    this.db = store.db;
    this.provider = provider;
    this.now = now;
    this.db.exec(`CREATE TABLE IF NOT EXISTS kakao_identities (
      subject TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS kakao_requests (state_hash TEXT PRIMARY KEY, proof_hash TEXT NOT NULL,
      session_hash TEXT NOT NULL, intent TEXT NOT NULL, expires INTEGER NOT NULL);`);
  }
  startKakao(intent, authorization) {
    if (!this.provider) fail('KAKAO_UNAVAILABLE', 503);
    if (!['login','signup','link'].includes(intent) || (intent === 'link') !== Boolean(authorization))
      fail('KAKAO_INTENT_INVALID', 400);
    if (authorization) this.store.authenticate(authorization);
    const state = secret(), proof = secret(), expires = this.now() + 600000;
    this.store.transaction(() => {
      this.db.prepare('DELETE FROM kakao_requests WHERE expires<=?').run(this.now());
      if (this.db.prepare('SELECT COUNT(*) n FROM kakao_requests').get().n >= 1000) fail('RATE_LIMITED',429);
      this.db.prepare('INSERT INTO kakao_requests VALUES(?,?,?,?,?)').run(digest(state), digest(proof),
        authorization ? digest(authorization) : '', intent, expires);
    });
    return {state, proof, expires, javascriptKey:this.provider.javascriptKey, redirectUri:this.provider.redirectUri};
  }
  async finishKakao(body, authorization) {
    if (!this.provider) fail('KAKAO_UNAVAILABLE', 503);
    if (!valid(body?.state) || !valid(body?.proof) || typeof body.code !== 'string' ||
        !body.code.length || body.code.length > 4096) fail('KAKAO_FLOW_INVALID', 401);
    const sessionHash = authorization ? digest(authorization) : '';
    const flow = this.store.transaction(() => {
      const row = this.db.prepare('DELETE FROM kakao_requests WHERE state_hash=? AND proof_hash=? AND session_hash=? AND expires>? RETURNING intent,expires')
        .get(digest(body.state), digest(body.proof), sessionHash, this.now());
      if (!row) fail('KAKAO_FLOW_INVALID',401);
      if (authorization) this.store.authenticate(authorization);
      return row;
    });
    let subject;
    try { subject = await this.provider.subjectForCode(body.code); }
    catch { fail('KAKAO_VERIFICATION_FAILED',401); }
    return this.store.transaction(() => {
      if (flow.expires <= this.now()) fail('KAKAO_FLOW_INVALID',401);
      const owner = authorization ? this.store.authenticate(authorization) : undefined;
      const identity = this.db.prepare('SELECT user_id FROM kakao_identities WHERE subject=?').get(subject);
      let userId = identity?.user_id;
      if (owner) {
        const connected = this.db.prepare('SELECT subject FROM kakao_identities WHERE user_id=?').get(owner.id);
        if ((userId && userId !== owner.id) || (connected && connected.subject !== subject))
          fail('KAKAO_LINK_CONFLICT',409);
        userId = owner.id;
      } else if (!userId) {
        if (flow.intent !== 'signup') fail('KAKAO_ACCOUNT_UNKNOWN',409);
        if (this.db.prepare('SELECT COUNT(*) n FROM users').get().n >= 20) fail('BETA_ALLOCATION_EXCEEDED',409);
        userId = randomUUID();
        this.db.prepare('INSERT INTO users(id,label,budget,credits) VALUES(?,?,0,0)').run(userId,'카카오 회원');
        this.db.prepare('INSERT INTO welcome_ad_eligibility(user_id) VALUES(?)').run(userId);
      }
      if (!identity) this.db.prepare('INSERT INTO kakao_identities(subject,user_id) VALUES(?,?)').run(subject,userId);
      const user = this.db.prepare('SELECT * FROM users WHERE id=? AND disabled=0').get(userId);
      if (!user) fail('AUTH_REQUIRED',401);
      return this.store.createSession(user);
    });
  }
}
