// Seed an order quoted by the pre-v2 server, not a newly sold legacy SKU.
import {randomUUID} from 'node:crypto';
export function legacyOrder(db,userId,pack,requestId,now=Date.now()){
 const packs={trial:[3,6900],basic:[10,19900],bundle:[30,49900]},[credits,amount]=packs[pack];
 return db.prepare("INSERT INTO test_orders(id,user_id,request_id,pack,credits,amount,created,ticket_hash) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id,request_id) DO NOTHING").run('ad_'+randomUUID(),userId,requestId,pack,credits,amount,now,'old-ticket-hash');
}
