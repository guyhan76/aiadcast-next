import {readFileSync} from 'node:fs';
import {assertLocalRecommendationMode} from './safety-policy.mjs';
// Explicit test setup only. Production migration requires separate reviewed runner.
export async function migrateLocalRecommendationSchema(db,{executionMode}={}){
 assertLocalRecommendationMode(executionMode);
 await db.transaction(async()=>{await db.exec(readFileSync(new URL('./migration-draft.sql',import.meta.url),'utf8'));});
}
