import { DatabaseSync } from 'node:sqlite';

export const APPROVAL = 'box-bag-analysis-20261017';
export const HOLD_MICROS = 30_000;
export const MAX_CALLS = 10;
export const MAX_MICROS = 300_000;
export const TARGETS = Object.freeze(['22932.jpg', '22935.jpg']);

// One database per approval, shared by both images and all processes.
// FULL synchronous commit happens before dispatch; crash/timeout holds block reuse.
export class VisionLedger {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS vision_calls (
        id INTEGER PRIMARY KEY, approval TEXT NOT NULL, target TEXT NOT NULL,
        hash TEXT NOT NULL, state TEXT NOT NULL, hold INTEGER NOT NULL,
        actual INTEGER, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
  }
  reserve(target, hash) {
    if (!TARGETS.includes(target) || !/^[a-f0-9]{64}$/.test(hash)) throw Error('UNAUTHORIZED_IMAGE');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const rows = this.rows();
      if (rows.some(r => ['reserved', 'uncertain', 'exceeded'].includes(r.state))) throw Error('RECONCILE_REQUIRED');
      if (rows.length >= MAX_CALLS || rows.reduce((n, r) => n + r.hold, 0) + HOLD_MICROS > MAX_MICROS) throw Error('APPROVAL_LIMIT');
      const result = this.db.prepare('INSERT INTO vision_calls(approval,target,hash,state,hold) VALUES(?,?,?,?,?)')
        .run(APPROVAL, target, hash, 'reserved', HOLD_MICROS);
      this.db.exec('COMMIT');
      return Number(result.lastInsertRowid);
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  settle(id, actual) {
    const known = Number.isSafeInteger(actual) && actual >= 0;
    const state = !known ? 'uncertain' : actual > HOLD_MICROS ? 'exceeded' : 'settled';
    const result = this.db.prepare("UPDATE vision_calls SET state=?,actual=? WHERE id=? AND approval=? AND state='reserved'")
      .run(state, known ? actual : null, id, APPROVAL);
    if (result.changes !== 1) throw Error('NOT_RESERVED');
    return state;
  }
  rows() { return this.db.prepare('SELECT * FROM vision_calls WHERE approval=? ORDER BY id').all(APPROVAL); }
  close() { this.db.close(); }
}
