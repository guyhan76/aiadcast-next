# 무료 베타 서버 검증 기록

2026-10-11 UTC. 대상: `feat/patent-product-generation-20261011`의 Render Free + Supabase Free 서버.

## 통과한 검사

| 검사 | 결과 |
|---|---|
| 전체 도메인 테스트 | 218/218 통과 |
| 추가 PostgreSQL/클라우드 테스트 | 위218건에 포함된11/11 통과 |
| TypeScript·Vite·단일 HTML 빌드 | 통과 |
| PostgreSQL 비동기 규칙 생성물 일치 | `npm run check:cloud` 통과 |

클라우드 테스트는 PGlite의 PostgreSQL 엔진에 실제 SQL을 실행했다. 단일 연결을 mutex로 임대하는 테스트 pool을 사용하며, PostgreSQL의 트랜잭션·FK·스키마·RLS·함수 권한을 검사했다. 외부 Storage HTTP, 이메일, OpenAI, 결제 공급사는 fixture다. 한 장의 실제 API 이미지 생성 성공을 뜻하지 않는다.

확인 범위:

- Session pooler5432·프로젝트 사용자명·TLS 검증 강제, 비밀값이 포함된 시작 오류의 비노출.
- `BIGINT` 및 `SUM(BIGINT)`의`NUMERIC`을 정수로 파싱하여 비용/파일 할당량에 문자열 덧셈이 발생하지 않음.
- 트랜잭션 실패 시 잔액 변경 전체 취소, 동시 잔액 갱신 직렬화.
- 이메일 승인 후 원래 요청 기기에서 세션 교환, 일반 회원의 관리자 API 거부.
- 프로젝트 사용자 분리·낙관적 버전 충돌·비공개 Storage JSON 참조와 재시작 후 원본 복원.
- 동시에 같은 내용의 이미지 요청 두 개를 보내도 공급사 호출 한 번. 생성 결과·입력 규격·요청 키·사용량·이용권을 재시작 후 보존. 확정 요청 두 번에 한 번 차감.
- 관리자 테스트 이용권 중복 지급 방지와 증가 배정 보존.
- 공급사 호출 결과가 불확실하면$0.50 보류 보존·고객 이용권 반환·재시작 후 자동 재호출 없음.
- 비공개 SQL Editor용 관리자 초대:24시간/1회, 해시 저장, 기존 관리자 주소 변경 거부, 공개/anon/authenticated/service_role 실행 권한 없음.
- 시험 결제 동시 승인·재시작 후 재처리에도 승인/이용권 지급 한 번.
- Storage 업로드 전에 할당량 예약, 다른 사용자 파일 거부, 바이트 변조 SHA-256 검사.
- 재배포 잠금 대기와 소유 잠금 상실 시 DB 쓰기 중단 경계. 실제 Render의 인스턴스 전환은 아직 원격 시험 전.

## 원격 확인이 남은 부분

Render Docker 빌드와 HTTPS 배포, Supabase 실제 Session pooler/TLS 및 Storage 통신, 실제 인증메일 수신, OpenAI API 생성 및 공급사 Usage 대조, TossPayments 시험 승인, 실제 Android에서 서버 연결·사진 선택·PNG 다운로드/복원. 기존 APK/브라우저 검증은 별도 모바일 기록을 따른다. 이번 서버 변경은 앱 버전이나 APK를 바꾸지 않았다.

## 재현

```bash
npm run check:cloud
npm run test:domain
npm run build
```

외부 API 키 없이도 위 fixture 검증을 실행할 수 있다. 실제 배포는 [무료 베타 연결 안내](free-beta-deployment.md)를 따른다. 기존 SQL/사용량을 삭제하거나 원장을 초기화해 시험을 통과시키지 않는다.
