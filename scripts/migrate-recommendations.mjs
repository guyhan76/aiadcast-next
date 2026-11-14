import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import pg from 'pg';import {postgresConfiguration} from '../server/cloud/postgres.mjs';import {recommendationMigrationPlan,migrateRecommendations} from '../server/recommendations/migrate.mjs';
export async function main(args,env=process.env){
 const allowed=new Set(['--schema','--plan','--apply','--approve-rls-revoke']);let schema;for(let i=0;i<args.length;i++){if(!allowed.has(args[i]))throw Error('INVALID_MIGRATION_ARGUMENT');if(args[i]==='--schema'){if(schema)throw Error('INVALID_MIGRATION_ARGUMENT');schema=args[++i];}}
 const plan=recommendationMigrationPlan(schema);if(!args.includes('--apply'))return plan;
 if(args.includes('--plan')||!args.includes('--approve-rls-revoke'))throw Error('EXPLICIT_MIGRATION_APPROVAL_REQUIRED');
 // Existing authenticated DB configuration only; never print it or create credentials.
 const pool=new pg.Pool(postgresConfiguration(env.DATABASE_URL,env.SUPABASE_URL,env));
 try{return await migrateRecommendations({pool,schema,apply:true,approveRlsRevoke:true});}finally{await pool.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).then(x=>console.log(JSON.stringify(x))).catch(()=>{console.error('RECOMMENDATION_MIGRATION_FAILED; no credentials or database details are logged.');process.exitCode=1;});
