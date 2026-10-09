import {writeFile,mkdir} from 'node:fs/promises';
import {discoverModels} from '../server/model-evolution.mjs';
// Explicitly local/new-app credential; never fall back to legacy/generic keys.
const key=process.env.AIADCAST_NEXT_LOCAL_OPENAI_API_KEY;
if(!key){console.log('SKIPPED: 독립 aiadcast 프로젝트의 API 키가 없어 모델 목록 조회를 실행하지 않았습니다. 이미지 생성·과금 호출은 없습니다.');process.exit(0);}
const response=await fetch('https://api.openai.com/v1/models',{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(20000)});
if(!response.ok){console.error(`모델 목록 조회 실패: HTTP ${response.status}. 키와 응답 본문은 출력하지 않습니다.`);process.exit(1);}
const candidates=discoverModels(await response.json());
await mkdir('release',{recursive:true});await writeFile('release/model-discovery.json',JSON.stringify({queriedAt:new Date().toISOString(),scope:'model-catalogue-only',candidates},null,2));
console.log(`모델 ${candidates.length}개를 발견했습니다. API 목록은 기능·가격·출시 적합성 검증이 아닙니다. 자동 적용하지 않았습니다.`);
