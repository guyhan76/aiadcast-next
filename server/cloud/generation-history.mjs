import {ApiFailure} from '../generation-service.mjs';
// One tenant-scoped SELECT gives metadata a single PostgreSQL statement snapshot.
// No global cache, writes, expiry, provider calls or accounting locks are introduced.
export async function readGenerationHistory(service,projectId){
 if(projectId!==undefined&&(typeof projectId!=='string'||! /^[A-Za-z0-9_-]{8,100}$/.test(projectId)))throw new ApiFailure('INVALID_PROJECT_ID',400);
 const filter=projectId===undefined?'':'WHERE project_id=?';
 const rows=await service.db.prepare(`WITH recent AS (
  SELECT * FROM generation_records ${filter} ORDER BY created_at DESC LIMIT 30
 ) SELECT g.*,j.id AS history_billing_id,j.status AS history_status,j.reason AS history_reason,
 j.credits AS history_credits,j.expires_at AS history_expires_at,
 p.unit AS history_unit,p.policy AS history_policy,p.captured AS history_captured,
 a.job_id AS history_exempt,d.state AS history_defect,
 ARRAY(SELECT k.request_id FROM generation_keys k WHERE k.job_id=g.id ORDER BY k.request_id DESC) AS history_keys
 FROM recent g LEFT JOIN jobs j ON j.id=g.id
 LEFT JOIN job_policies p ON p.job_id=g.id
 LEFT JOIN admin_test_jobs a ON a.job_id=g.id
 LEFT JOIN defect_reports d ON d.job_id=g.id
 ORDER BY g.created_at DESC`).all(...(projectId===undefined?[]:[projectId]));
 const jobs=[];
 for(const row of rows){
  // Preserve job()'s fail-closed identity guard before reading billing metadata.
  if(typeof row.id!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(row.id))throw new ApiFailure('JOB_NOT_FOUND',404);
  if(!row.history_billing_id)throw Error('Job not found');
  const billing={status:row.history_status,reason:row.history_reason,credits:row.history_credits,expires_at:row.history_expires_at,unit:row.history_unit??'legacy-ticket',policy:row.history_policy??'legacy-accept-v1',captured:Boolean(row.history_captured),creditExempt:Boolean(row.history_exempt)};
  jobs.push(await service.jobView(row,billing,row.history_keys,row.history_defect===null?undefined:{state:row.history_defect},{includeArtifact:false}));
 }
 return {jobs,wallet:await service.wallet()};
}
