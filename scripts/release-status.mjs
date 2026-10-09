import {readFileSync} from 'node:fs';
import {releaseReport} from '../server/release-gates.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../config/'+name,import.meta.url),'utf8'));
const args=process.argv.slice(2);const target=args[0]??'internal';const strict=args.includes('--strict');
const report=releaseReport(read('independence.json'),read('release-evidence.json'),target);
console.log(JSON.stringify(report,null,2));
if(strict&&!report.readyForSubmission)process.exitCode=1;
