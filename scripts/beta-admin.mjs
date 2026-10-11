// Bootstrap roles only on the private beta host. The web dashboard cannot promote accounts.
import {BetaStore} from '../server/beta-store.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const [action,...args]=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||!args[i+1])throw Error('Expected --name value pairs');options[args[i].slice(2)]=args[i+1];}
const directory=resolve(process.env.AIADCAST_BETA_DATA_DIR??'release/beta-runtime');
const store=new BetaStore(directory,{monthlyBudgetMicros:Number(process.env.AIADCAST_BETA_MONTHLY_BUDGET_USD??0)*1e6});
try{
 let result;
 if(action==='create'){if(options.role&&!['member','admin'].includes(options.role))throw Error('Use member or admin role');result=store.provision({label:options.label,budgetMicros:Number(options['budget-usd']??0)*1e6,credits:Number(options.credits??3)});if(options.role==='admin')store.setRole(result.userId,'admin');}
 else if(action==='invite')result={userId:options.user,...store.issueInvite(options.user)};
 else if(action==='budget'){store.setBudget(Number(options.usd)*1e6);console.log('Budget increased. Update the matching environment value before restarting.');}
 else if(action==='allocation'){store.setAllocation(options.user,Number(options.usd)*1e6);console.log('Allocation increased. Restart the beta server to apply.');}
 else if(action==='role'){store.setRole(options.user,options.role);console.log('Role updated. Existing sessions were revoked; sign in again.');}
 else if(action==='revoke'){store.revoke(options.user);console.log('Tester access revoked.');}
 else throw Error('Use create, invite, revoke, budget, allocation or role');
 if(result){const output=resolve(options.output??`${directory}/invitations/${result.userId}.json`);mkdirSync(dirname(output),{recursive:true,mode:0o700});writeFileSync(output,JSON.stringify(result,null,2),{mode:0o600,flag:'wx'});console.log('Invitation saved to owner-only file: '+output);}
}finally{store.close();}

