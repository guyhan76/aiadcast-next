import {createHash} from 'node:crypto';
import {ApiFailure} from './generation-service.mjs';
const fail=(code,status=409)=>{throw new ApiFailure(code,status);};
// This reviewed approval is one October transfer, not a general grant facility.
const OWNER='selluplabs@gmail.com',MEMBER='guyhan76@gmail.com',PERIOD='2026-10';
export async function demoSupport(admin,actor,body,apply=false){
 admin.require(actor);
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['userId','email',...(apply?['requestId','quoteToken']:[])].includes(k))||body.email!==MEMBER)fail('DEMO_SUPPORT_TARGET_MISMATCH',400);
 if(apply&&(typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(body.requestId)||typeof body.quoteToken!=='string'))fail('INVALID_DEMO_SUPPORT',400);
 const {store,db}=admin;
 // SQLite uses separate files; refuse instead of claiming cross-file atomicity.
 if(!db.atomicSchemas)fail('DEMO_SUPPORT_ATOMIC_STORAGE_REQUIRED',503);
 if(admin.ownerEmail!==OWNER)fail('DEMO_SUPPORT_OWNER_REQUIRED',403);
 const initial=await admin.user(body.userId),ownerInitial=await admin.user(actor.id);
 const ownerService=await admin.service(ownerInitial),memberService=await admin.service(initial);
 if(ownerService.db.pool!==db.pool||memberService.db.pool!==db.pool)fail('DEMO_SUPPORT_ATOMIC_STORAGE_REQUIRED',503);
 return store.transaction(async()=>{
  if(store.budgetPeriod()!==PERIOD)fail('MONTH_APPROVAL_EXPIRED');
  const owner=await admin.user(actor.id),member=await admin.user(body.userId);
  const ownerIdentity=await db.prepare('SELECT user_id FROM email_identities WHERE email=?').get(OWNER),identity=await db.prepare('SELECT user_id FROM email_identities WHERE email=?').get(MEMBER);
  if(owner.role!=='admin'||ownerIdentity?.user_id!==owner.id)fail('DEMO_SUPPORT_OWNER_REQUIRED',403);
  if(member.role!=='member'||identity?.user_id!==member.id||member.id===owner.id)fail('DEMO_SUPPORT_TARGET_MISMATCH',403);
  const approval=await store.monthApproval();
  if(!approval||approval.user_id!==owner.id||approval.total_micros!==5000000||approval.allocation_micros!==5000000)fail('MONTH_APPROVAL_CONFLICT');
  const old=await db.prepare('SELECT * FROM monthly_demo_support WHERE period=?').get(PERIOD);
  if(old){if(old.owner_id!==owner.id||old.user_id!==member.id||old.email!==MEMBER||old.micros!==1000000)fail('DEMO_SUPPORT_CONFLICT');return {applied:true,reused:true,period:PERIOD,email:MEMBER,addedCredits:old.credits,memberLimitMicros:1000000,ownerLimitMicros:4000000,totalMicros:5000000,wallet:await memberService.wallet()};}
  const other=await db.prepare('SELECT COALESCE(SUM(budget),0) n FROM users WHERE id<>?').get(owner.id);
  if(member.budget!==0||other.n!==0)fail('MONTH_APPROVAL_CONFLICT');
  const budget=await ownerService.ledger.budget(PERIOD),wallet=await memberService.wallet();
  const spentMicros=budget?.spent_micros??0,heldMicros=budget?.held_micros??0;
  if(spentMicros+heldMicros>4000000)fail('DEMO_SUPPORT_OWNER_BUDGET_IN_USE');
  const addedCredits=Math.max(0,3-wallet.available-wallet.reserved);
  const quote={applied:false,period:PERIOD,email:MEMBER,userId:member.id,ownerId:owner.id,totalMicros:5000000,memberLimitMicros:1000000,ownerLimitMicros:4000000,spentMicros,heldMicros,wallet,addedCredits};
  const quoteToken=createHash('sha256').update(JSON.stringify(quote)).digest('hex');
  if(!apply)return {...quote,quoteToken};
  if(body.quoteToken!==quoteToken)fail('DEMO_SUPPORT_QUOTE_CHANGED');
  await db.prepare('INSERT INTO monthly_demo_support VALUES(?,?,?,?,?,?,?,?)').run(PERIOD,owner.id,member.id,MEMBER,1000000,addedCredits,body.requestId,admin.now());
  if(addedCredits)await admin.grant(actor,{userId:member.id,credits:addedCredits,requestId:'demo-support-'+PERIOD+'-'+member.id});
  await admin.audit(actor,'october-demo-support',member.id,{email:MEMBER,period:PERIOD,totalMicros:5000000,ownerFromMicros:5000000,ownerToMicros:4000000,memberToMicros:1000000,addedCredits,spentMicros,heldMicros,requestId:body.requestId},'demo-support-'+PERIOD);
  // Fail closed at a month boundary, including slow transactions.
  if(store.budgetPeriod()!==PERIOD)fail('MONTH_APPROVAL_EXPIRED');
  return {...quote,applied:true,reused:false,wallet:await memberService.wallet()};
 });
}
