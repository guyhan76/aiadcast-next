# 비공개 모바일 테스트 서버

2026-10-11. 이 단계는 최대20명의 비공개 시험용이다. 초대 로그인과 이메일 인증 가입을 지원하지만 실제 메일 공급사·외부 HTTPS 호스팅은 아직 연결하지 않았다. 실제 결제·Google Play 운영 출시가 아니다. 기존 회사 홈페이지 및 외주 MVP의 서버·계정·키를 연결하지 않는다.

## 구현한 범위

- 256비트 무작위 일회용 초대코드(24시간) → 세션 로그인(24시간). 저장소에는 코드/세션의 SHA-256 해시만 보관한다. 사용자당 동시 세션5개, 로그아웃·운영자 접근 취소를 지원한다.
- 이메일 인증 가입·로그인: 인증 링크에서 사용자가 직접 확인하고, 가입을 요청한 기기에서 인증 상태를 확인해야 세션이 생긴다. 메일 링크를 연 브라우저에 자동 로그인하지 않는다. 실제 메일 발송은 Resend 설정이 필요하며 계정 복구·일반 공개 가입 정책은 후속 작업이다.
- 관리자 역할은 서버의 비공개 CLI로만 부여한다. 대시보드는 회원·생성 이력·공급사 비용·테스트 결제 내역·관리 작업 기록을 조회한다. 회원당 누적 최대30개의 테스트 이용권과 총예산 범위 안의 증가 배정, 회원 접근 중지를 지원한다. 일반 회원·비로그인·클라이언트가 전달한 role로는 관리자 API를 사용할 수 없다.
- 서버가 인증한 사용자 ID로 생성 DB·이용권·사용량을 분리한다. 요청으로 전달한 userId를 신뢰하지 않는다. 다른 사용자에게 같은 프로젝트 ID가 있어도 내용이 섞이지 않는다.
- 프로젝트는 자동 동기화가 아닌 명시적 ‘현재 작업 서버 저장’과 ‘서버 작업 열기’다. 버전이 다르면409로 멈춘다. 기존 기기 편집과 같은 ID의 서버 작업을 열 때는 변경된 기기 작업을 별도 보관본으로 남긴다. 서버 데이터는 클라이언트의 프로젝트/이미지 검증을 거친 뒤 연다.
- 기기 저장 DB와 진행 중 요청 ID도 로그인 계정별로 구분한다. 비로그인 기기 작업은 원래 저장소에 유지한다. 로그아웃은 기기의 파일을 완전히 지우는 작업이 아니므로 공용 기기에는 개인정보를 남기지 않도록 안내한다.
- 계정별 월 API 예산 배정 합계를 운영자 총예산 이하로 제한한다. 취소한 계정의 배정액을 즉시 회수하지 않는다. 비용 기록을 지우거나 자동으로 모델을 교체하지 않는다. API 동시 실행2개, HTTP 요청 및 로그인 횟수 제한, 프로젝트20개/계정·총200MB/계정·파일40MB 제한을 둔다.
- 개발 테스트 이용권은 실제 구매가 아니며 오류/반려·검토/확정 원장은 기존 엔진을 사용한다. 이미지 모델은 Sunburst, 문구는 Chat Completions의 gpt-5.4-mini다.

## 기본값과 배포 조건

`npm run api:beta`는 `scripts/run-beta.sh`를 통해 프로세스 잠금을 잡고 시작한다. `flock`이 필요하다. 한 개 인스턴스와 영구 디스크가 필수이며 임시 파일시스템·다중 복제본에는 배포하지 않는다. 강제 종료 후에도 커널 잠금은 해제되며 다음 시작에서 불확실한 생성 작업은 자동 재호출하지 않는다.

환경 변수:

| 이름 | 용도 / 기본값 |
|---|---|
| `AIADCAST_BETA_PUBLIC_ORIGIN` | 실제 HTTPS 주소. Render에서는 자동 제공 `RENDER_EXTERNAL_URL`을 대체값으로 사용 |
| `AIADCAST_BETA_DATA_DIR` | 영구 보관 경로. 컨테이너는 `/data` |
| `PORT` | 기본8790, HTTPS 종료 프록시 뒤의 내부 포트 |
| `AIADCAST_BETA_MONTHLY_BUDGET_USD` | 전체 월 시험 예산, 기본0. 최대100, 사업 운영 금액과 다름 |
| `AIADCAST_BETA_ENABLE_GENERATION` | 기본false |
| `AIADCAST_BETA_ENABLE_ASSISTANT` | 기본false |
| `AIADCAST_NEXT_STAGING_OPENAI_API_KEY` | 새 앱 테스트 전용 공급사 키. 호스팅 서비스의 비밀값 설정에만 입력 |
| `AIADCAST_BETA_OPENAI_KEY_FILE` | 선택적 읽기 전용 secret 파일. 설정하면 위 변수보다 우선 |
| `AIADCAST_EMAIL_ENABLED` | 실제 인증 메일 발송, 기본false |
| `AIADCAST_RESEND_API_KEY` | 서버의 비밀값 설정으로만 전달하는 메일 공급사 키 |
| `AIADCAST_EMAIL_FROM` | 메일 공급사에서 사용할 수 있는 검증된 발신 주소 |
| `AIADCAST_TOSS_TEST_ENABLED` | 결제사 시험 모드, 기본false |
| `AIADCAST_TOSS_TEST_CLIENT_KEY` | `test_ck_`로 시작하는 시험 클라이언트 키 |
| `AIADCAST_TOSS_TEST_SECRET_KEY` | 서버 비밀값, `test_sk_` 시험 키만 허용 |
| `AIADCAST_TOSS_TEST_SECRET_KEY_FILE` | 선택적 읽기 전용 시험 결제 secret 파일 |

기존 Codex 네트워크 시크릿은 외부 호스팅 서버로 자동 이전되지 않는다. 키를 Git·APK·일반 파일·채팅에 넣지 않는다. 이미지·문구 호출은 예산과 스위치와 키가 함께 설정돼야 가능하다. 이 문서나 컨테이너 준비가 새 지출 승인은 아니다.

이미지 호출당$0.50, 문구$0.03을 입장 예약금으로 잡지만 공급사의 실제 과금 절대 상한은 아니다. 미확정 호출은 예약을 유지하며, 기록된 실사용 비용을 확인한다. 공급사 프로젝트 예산 알림과 사용량 대조가 추가로 필요하다.

## HTTPS와 앱 연결

웹 앱도 같은 컨테이너에서 제공하고 `/api`만 인증 API로 쓴다. TLS는 호스팅 서비스 또는 HTTPS 프록시가 종료한다. 앱 서버 포트를 인터넷에 HTTP로 직접 공개하지 않는다. 허용 Origin은 실제 HTTPS 주소와 Android의 `https://appassets.androidplatform.net`뿐이다. 고객 입력으로 허용 Origin을 늘리지 않는다. 앱 안에 공급사 키를 넣지 않는다.

Android에 주소를 넣으려면 웹 자산 준비 후 `./gradlew -PAIADCAST_API_ORIGIN=https://실제-서버주소 assembleDebug`로 빌드한다. 공개 주소가 없는 APK에서는 로컬 편집만 가능하다. 현재 제공하는 APK에는 실제 공개 서버 주소를 아직 넣지 않았다.

## 배포 패키지

`Dockerfile.beta`는 Node24.19.0, 잠금 파일 기반 npm 설치, TypeScript/웹 빌드, 서버와 런타임이 참조하는 src 모듈을 묶는다. 런타임은 root가 아닌 node 사용자다. 세션/초대/프로젝트/비용 DB는 이미지 밖의 영구 디스크에 저장한다. `.dockerignore`로 키·작업 DB·기존 APK·Git 이력을 제외한다. 이번 환경에는 Docker 실행기가 없어 컨테이너 빌드·외부 배포는 검증하지 않았다.

```
docker build -f Dockerfile.beta -t aiadcast-next-beta .
```

Codex 환경 안에서 빌드할 때는 관리 환경 문서에 따라 proxy CA를 BuildKit secret으로 전달한다. 인증서 검증을 끄거나 인증서를 이미지에 복사하지 않는다.

`render.yaml`은 **선택 가능한 유료 서버의 배포 초안**이다. 아직 계정을 만들거나 서비스를 개설하지 않았다. Starter와1GB 영구 디스크를 요청하며 자동 배포는 끈다. 현재 가격은 이 환경에서 공식 페이지 접근이 되지 않아 검증하지 못했다. 신청 화면에서 월 서버·디스크·트래픽·세금을 확인하고 사용자 동의 후 개설한다. Cloudflare Workers에 이 Node/SQLite/sharp 컨테이너를 그대로 올릴 수는 없다. 기존 Cloudflare 홈페이지를 변경하지 않는다. Render 이외의 영구 디스크를 제공하는 소형 Linux 서버에도 사용할 수 있다.

## 운영자 초대 발급

새로 배포한 서버의 private shell에서 실행한다. 관리자 승격·전체 예산 변경은 대시보드에서 할 수 없다.

```
node scripts/beta-admin.mjs create --label "테스터 이름" --budget-usd 0 --credits 3 --output /data/invitations/tester.json
node scripts/beta-admin.mjs create --label "운영자" --role admin --budget-usd 0 --credits 0 --output /data/invitations/operator.json
node scripts/beta-admin.mjs invite --user 사용자ID --output /data/invitations/second-device.json
node scripts/beta-admin.mjs role --user 사용자ID --role admin
node scripts/beta-admin.mjs revoke --user 사용자ID
```

초대는0600권한의 파일에 보관하며 콘솔에는 파일 위치만 표시한다. 해당 사용자에게만 코드 전달 후 파일을 삭제한다. 기존 사용자에게 추가 기기용 코드를 발급할 때 새 계정을 만들지 않고 `invite`를 쓴다.

관리자로 로그인하면 상단 **관리자**에서 대시보드를 연다. CLI로 역할을 변경하면 이전 세션은 해제되므로 다시 로그인한다. 관리자 `/api/admin/*`도 모든 요청에서 서버가 역할을 확인한다. 지급 요청 ID를 재사용하면 한 번만 이용권을 지급하고 실제 구매 영수증·매출과 구분해 기록한다. API 키·세션·영수증 비밀값·사용자 원본 사진은 대시보드 응답에 포함하지 않는다.

예산을 올릴 때는 먼저 승인 금액을 확인하고 `budget --usd 금액`으로 총예산을 올린 뒤 환경 변수에도 같은 금액을 반영한다. 사용자 배정은 관리자 화면에서 즉시 늘리거나 `allocation --user 사용자ID --usd 금액` 후 서버를 재시작한다. 기존 사용량·보류 금액은 보존된다. 중지 계정의 배정도 총예산에 남는다. 자동 감소/회수는 지원하지 않으며 예산 설정 불일치는 시작을 중단한다. 생성 중 긴급 중단은 호스팅의 서비스 중지와 공급사 접근 중단을 이용한다.

## 출시 전에 남는 작업

외부 HTTPS 배포, 실제 Android 기기에서 접속·파일 선택·다운로드·복원, 백업/복구 및 디스크 암호화 설정, 사용자 동의·보관/삭제·계정 복구, 실제 인증메일 수신, 결제사 시험 승인 및 구매 영수증/환불 검증, 장애 대응, 여러 상품의 AI 품질 평가가 필요하다. 초기 테스트는 실제 고객 결제 없이 진행한다. 원본과 서버 DB는 정기 백업하고, 복구할 때 비용 원장을 과거로 되돌려 공급사 지출을 누락하지 않도록 대조한다.

