import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';
const socket=process.env.AIADCAST_LOCAL_PG_SOCKET;
test('local PostgreSQL maintenance gate rejects new holds, drains late costs, rolls back new jobs, and resumes unchanged',{skip:!socket},async t=>{
 assert.equal(socket,'/tmp/aiadcast-rec-pg-socket');
 const db=new pg.Client({host:socket,user:'postgres',database:'postgres'});await db.connect();
 const schema='maintenance_mock_'+process.pid;
 t.after(async()=>{await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await db.end();});
 await db.query(`CREATE SCHEMA ${schema};SET search_path=${schema},public;
 CREATE TABLE budgets(period TEXT PRIMARY KEY,spent_micros BIGINT,held_micros BIGINT);
 CREATE TABLE jobs(id TEXT PRIMARY KEY);INSERT INTO budgets VALUES('old',500,100),('new',0,0);
 CREATE FUNCTION pause() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.held_micros > (CASE WHEN TG_OP='INSERT' THEN 0 ELSE OLD.held_micros END) THEN RAISE EXCEPTION 'MAINTENANCE_NO_NEW_PROVIDER_RESERVATIONS'; END IF;RETURN NEW;END $$;
 BEGIN;SELECT pg_advisory_xact_lock(hashtext('aiadcast-next-budget-transactions-v1'));
 CREATE TRIGGER pause BEFORE INSERT OR UPDATE OF held_micros ON budgets FOR EACH ROW EXECUTE FUNCTION pause();COMMIT;`);
 let providerCalls=0;
 async function dispatch(){await db.query('BEGIN');try{await db.query("SELECT pg_advisory_xact_lock(hashtext('aiadcast-next-budget-transactions-v1'))");await db.query("INSERT INTO jobs VALUES('new')");await db.query("UPDATE budgets SET held_micros=held_micros+50 WHERE period='new'");await db.query('COMMIT');providerCalls++;}catch(e){await db.query('ROLLBACK');throw e;}}
 await assert.rejects(dispatch(),/MAINTENANCE_NO_NEW_PROVIDER_RESERVATIONS/);assert.equal(providerCalls,0);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM jobs')).rows[0].n,0);
 await assert.rejects(db.query("INSERT INTO budgets VALUES('future',0,50)"),/MAINTENANCE_NO_NEW_PROVIDER_RESERVATIONS/);
 // Only local synthetic late settlement: production settlement is NOT requested.
 await db.query("UPDATE budgets SET held_micros=0,spent_micros=575 WHERE period='old'");
 assert.deepEqual((await db.query("SELECT spent_micros::int AS spent,held_micros::int AS held FROM budgets WHERE period='old'")).rows[0],{spent:575,held:0});
 await db.query('DROP TRIGGER pause ON budgets');await dispatch();assert.equal(providerCalls,1);
 assert.equal((await db.query("SELECT spent_micros::int AS spent FROM budgets WHERE period='old'")).rows[0].spent,575);
});
