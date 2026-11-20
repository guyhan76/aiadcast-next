// Offline only. No DB driver, credential lookup, network or policy activation.
// Usage: node scripts/cumulative-budget-audit.mjs <read-only-snapshot.json>
import {readFileSync} from 'node:fs';
import {auditSupplierHistory} from '../server/cumulative-budget-audit.mjs';
const file=process.argv[2];if(!file||process.argv.length!==3)throw Error('SNAPSHOT_FILE_REQUIRED');
try{
 const bytes=readFileSync(file);if(bytes.length>10_000_000)throw Error('SNAPSHOT_TOO_LARGE');
 const snapshot=JSON.parse(bytes.toString('utf8'));
 if(snapshot.sourceChecks?.role!=='admin'||snapshot.sourceChecks?.disabled!==0||snapshot.sourceChecks?.complete!==true||!Array.isArray(snapshot.externalRows))throw Error('SUPPLIER_HISTORY_INCOMPLETE');
 const result=auditSupplierHistory({...snapshot,externalLedgersVerifiedEmpty:false});
 console.log(JSON.stringify({audit:'matched',...result,activation:'not-performed'}));
}catch(error){const allowed=/^(?:EXTERNAL_SUPPLIER_[A-Z_]+|SUPPLIER_[A-Z_]+|INVALID_SUPPLIER_[A-Z_]+|UNKNOWN_SUPPLIER_STATE|CONFLICTING_SUPPLIER_COST|SNAPSHOT_TOO_LARGE)$/;console.error(JSON.stringify({audit:'blocked',code:allowed.test(error.message)?error.message:'INVALID_SNAPSHOT',activation:'not-performed'}));process.exitCode=1;}
