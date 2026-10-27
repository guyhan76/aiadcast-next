import {ApiFailure} from '../generation-service.mjs';
import {cloudSchema} from './postgres.mjs';
import {generationPageQuery,generationPage,generationStateSql} from '../admin-generation-page.mjs';
// No generation service construction, expiry, wallet writes or provider access.
export async function readAdminGenerationPage({pool,actor,search='',guard=()=>{},now=Date.now}){
 if(actor?.role!=='admin'||actor.disabled)throw new ApiFailure('ADMIN_REQUIRED',403);
 const filter=generationPageQuery(search,now());guard();let client,timer,expired=false;
 try{
  client=await Promise.race([pool.connect().then(c=>{if(expired){c.release();throw Error('TIMEOUT');}return c;}),new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('TIMEOUT'));},2000);})]);clearTimeout(timer);
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout='2500ms'; SET LOCAL lock_timeout='750ms'; SET LOCAL idle_in_transaction_session_timeout='8000ms'");
  const members=(await client.query('SELECT id,label FROM aiadcast_accounts.users ORDER BY id LIMIT 201')).rows;
  if(members.length>200)throw new ApiFailure('ADMIN_OVERVIEW_MEMBER_LIMIT',503);
  const catalog=await client.query("SELECT n.nspname,array_agg(c.relname::text) tables FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid WHERE n.nspname=ANY($1::text[]) AND c.relname IN ('generation_records','jobs') GROUP BY n.nspname",[members.map(u=>cloudSchema(u.id))]);
  const schemas=new Map(catalog.rows.map(r=>[r.nspname,r.tables]));
  const args=[filter.since,filter.state,filter.cursor?.[0]??null,filter.cursor?.[1]??null,filter.cursor?.[2]??null],selects=[];
  for(const u of members){const schema=cloudSchema(u.id),tables=schemas.get(schema);if(!tables)continue;if(tables.length!==2)throw new ApiFailure('ADMIN_OVERVIEW_INCOMPLETE',503);
   args.push(u.id,u.label);const owner='$'+(args.length-1),label='$'+args.length;
   selects.push(`(SELECT g.id,g.created_at,${owner}::text user_id,${label}::text user_label,${generationStateSql} state,g.error_code,g.request_json::json->'output'->>'format' format,g.metadata_json::json->>'model' model,g.metadata_json::json->'cost'->>'microUsd' cost FROM "${schema}".generation_records g JOIN "${schema}".jobs j ON j.id=g.id WHERE g.created_at >= $1 AND ($2='' OR (${generationStateSql})=$2) AND ($3::bigint IS NULL OR (g.created_at,${owner}::text,g.id)<($3::bigint,$4::text,$5::text)) ORDER BY g.created_at DESC,g.id DESC LIMIT 11)`);
  }
  const rows=selects.length?(await client.query(`SELECT * FROM (${selects.join(' UNION ALL ')}) history ORDER BY created_at DESC,user_id DESC,id DESC LIMIT 11`,args)).rows:[];
  guard();await client.query('COMMIT');return generationPage(rows);
 }catch(error){if(client)try{await client.query('ROLLBACK');}catch{}if(error instanceof ApiFailure)throw error;throw new ApiFailure('ADMIN_HISTORY_UNAVAILABLE',503);}
 finally{clearTimeout(timer);client?.release();}
}
