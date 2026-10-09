import {readFileSync} from 'node:fs';
import {isolationIssues} from '../server/isolation.mjs';
const plan=JSON.parse(readFileSync(new URL('../config/independence.json',import.meta.url),'utf8'));
const issues=isolationIssues(plan);
if(issues.length){console.error(issues.join('\n'));process.exitCode=1;}
else console.log('독립 관리 설정 검사 통과. 외부 계정·서버 연결과 권한 검증은 아직 별도로 필요합니다.');
