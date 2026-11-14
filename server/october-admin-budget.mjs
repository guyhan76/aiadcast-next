// Approved October-only correction for the pre-existing owner/support pair.
// Pure read-time policy: never changes stored allocations, usage, holds or roles.
export function correctedOctoberOwnerLimit({now,user,approval,support,ownerId,demo,limit}) {
 const approvedAt=Date.UTC(2026,9,24,15,1),expiresAt=Date.UTC(2026,10,1);
 if(now<approvedAt||now>=expiresAt||!demo||limit!==4000000)return limit;
 if(user?.role!=='admin'||user.disabled||user.id!==ownerId||approval?.user_id!==user.id||support?.owner_id!==user.id)return limit;
 if(approval.period!=='2026-10'||support.period!=='2026-10'||approval.total_micros!==5000000||approval.allocation_micros!==5000000||support.micros!==1000000||support.user_id!=='a3c39e4d-8621-4f0d-9021-2621a8cecdee')return limit;
 if(!Number.isSafeInteger(approval.created)||!Number.isSafeInteger(support.created)||approval.created>=approvedAt||support.created>=approvedAt)return limit;
 // Additional explicit approval, effective only for the same existing owner.
 return now>=Date.UTC(2026,9,25,9,35)?100000000:5000000;
}
