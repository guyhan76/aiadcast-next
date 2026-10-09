import {isolationIssues} from './isolation.mjs';
// Evidence is a reviewed release record, not a substitute for tests or a Play
// approval. This module reports blockers and does not deploy or sign an app.
export const releaseGates=[
 ['company-ownership','회사 소유 계정·권한·복구 수단 확인','internal'],
 ['new-play-app','별도 Google Play 앱·패키지·서명 설정','internal'],
 ['android-build','서명된 Android AAB 빌드와 실제 설치','internal'],
 ['real-ai-quality','실제 원본 상품·한글·규격·업종별 AI 품질','internal'],
 ['auth-and-storage','회원 인증·권한·파일 저장·삭제','internal'],
 ['billing-sandbox','테스트 결제·서버 영수증 검증·복원','internal'],
 ['device-recovery','실기기·네트워크 중단·앱 종료 후 복구','internal'],
 ['cost-limits','실제 API 비용 측정·한도·중복 요청 방지','internal'],
 ['privacy-and-disclosures','개인정보 처리·스토어 데이터 보안·필수 고지','internal'],
 ['beta-acceptance','외부 베타 검증·중대 결함 0건·사용자 인수','production'],
 ['billing-production','실서비스 결제·취소·환불·원장 대사','production'],
 ['operations','모니터링·문의 대응·백업 복원·모델 롤백','production'],
 ['play-policy-review','배포 국가·계정의 최신 Play 요건 확인','production'],
 ['owner-release-decision','대표자의 최종 출시 결정','production'],
];
export function releaseReport(plan,evidence,target='internal'){
 if(!['internal','production'].includes(target))throw Error('Unknown release target');
 const blockers=isolationIssues(plan,{requireConnected:true,environment:target==='production'?'production':'staging'});
 if(evidence?.schemaVersion!==1||evidence.projectId!==plan.projectId)blockers.push('출시 증거 기록의 프로젝트가 다릅니다.');
 for(const [id,label,stage] of releaseGates){
  if(target==='internal'&&stage==='production')continue;
  const item=evidence?.gates?.[id];
  if(item?.status!=='passed'||typeof item?.artifact!=='string'||!item.artifact.trim()||typeof item?.reviewedBy!=='string'||!item.reviewedBy.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(item?.reviewedOn??''))blockers.push(label);
 }
 if(plan.android?.registrationStatus!=='created'||plan.android.signingOwnerVerified!==true)blockers.push('Play 앱 생성과 회사의 서명 관리가 확인되지 않았습니다.');
 if(target==='production'&&plan.environments?.production?.billingMode!=='live')blockers.push('실서비스 결제는 아직 비활성화 상태입니다.');
 return {target,readyForSubmission:blockers.length===0,blockers,notice:'증거를 바탕으로 한 준비 점검이며 Google Play 심사 승인이나 무결함 보증이 아닙니다.'};
}
