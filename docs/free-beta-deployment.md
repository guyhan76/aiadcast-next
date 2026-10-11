# aiadcast 무료 베타 서버 연결

2026-10-11 UTC. Render Free에서 웹 앱·Node·sharp·OpenAI 호출을 실행하고, Supabase Free에 회원·세션·프로젝트·사용량·원본/생성 이미지를 보관한다. 실제 원격 배포와 OpenAI 호출은 아직 확인하지 않았다. OpenAI 사용료는 호스팅 무료 요금과 별도다.

## 1. 현재 Render 화면에서 추가할 설정

이미 입력한 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `AIADCAST_NEXT_STAGING_OPENAI_API_KEY`를 유지한다. 새 OpenAI 키를 만들 필요는 없다.

Supabase 프로젝트 상단 **Connect → Connection string → Method: Session pooler**에서 연결 문자열을 복사한다. 포트는 **5432**다. `[YOUR-PASSWORD]`를 Supabase 프로젝트 생성 시 정한 **데이터베이스 비밀번호**로 바꾼다. OpenAI 키나 Supabase secret key를 넣는 자리가 아니다. 비밀번호의 예약 문자(`@`, `:`, `/`, `#`, `%`, `?` 등)는 URL 인코딩해야 한다. 비밀번호를 채팅에 보내지 않는다. 프로젝트 화면에서 복사한 호스트를 그대로 사용하며, 지역명으로 추정하지 않는다.

| Render 환경 변수 KEY | VALUE |
|---|---|
| `DATABASE_URL` | 위 Session pooler 연결 문자열 전체 |
| `AIADCAST_BETA_DATA_DIR` | `/tmp/aiadcast-beta` |
| `AIADCAST_BETA_ENABLE_GENERATION` | `true` |
| `AIADCAST_BETA_ENABLE_ASSISTANT` | `false` |
| `AIADCAST_BETA_MONTHLY_BUDGET_USD` | `1` |
| `AIADCAST_EMAIL_ENABLED` | `false` — 첫 시험은 관리자 초대 로그인 |
| `AIADCAST_TOSS_TEST_ENABLED` | `false` — 결제사 시험 키 연결 전 |

`DATABASE_URL` 형식은 다음과 같다. 대괄호가 남아 있으면 안 된다.

```text
postgresql://postgres.PROJECT_REF:URL_ENCODED_DATABASE_PASSWORD@EXACT_POOLER_HOST:5432/postgres
```

서버는 PostgreSQL 트랜잭션으로 예산/크레딧/중복 요청을 관리한다. 그래서 Storage 접근용 secret key 외에 DB 연결 문자열이 필요하다. Session pooler를 선택해야 서버의 세션 잠금이 유지된다. Transaction pooler의6543과 IPv6 전용 direct URL은 이 구성에 사용하지 않는다.

## 2. 배포

| 항목 | 설정 |
|---|---|
| GitHub 저장소 | `guyhan76/aiadcast-next` |
| Branch | `feat/patent-product-generation-20261011` |
| Runtime | Docker |
| Dockerfile Path | `./Dockerfile.beta` |
| Root Directory / Docker Command | 비워둠 |
| Instance Type | **Free** |
| Disk | 추가하지 않음 |
| Health Check Path | `/api/health` |
| Auto Deploy | Off |

**Deploy web service**를 누른다. 이미 서비스가 있으면 환경 변수 저장 후 **Manual Deploy → Deploy latest commit**을 실행한다. 성공 로그는 `Supabase-backed beta server started; real payments disabled.`다. 상태가 **Live**가 되면 Render가 제공한 `https://…onrender.com` 주소를 연다.

서버가 SQL 스키마와 비공개 `aiadcast-private-beta` 버킷을 자동으로 만든다. Supabase에 GitHub 저장소를 연결하거나 Render Postgres를 새로 만들 필요는 없다. 비용 DB를 Render 임시 디스크에 저장하지 않는다. 새 스키마는 공개 Data API에 추가하지 않는다.

첫 배포의 `/api/health`는 `ready:true`, `storage:"supabase"`를 반환한다. 재배포 때 기존 서버가 작업을 마칠 때까지 새 서버는 `ready:false`, `state:"activating"`이며 생성/계정 요청은503이다. 기존 서버가 세션 잠금을 놓으면 새 서버가 상태를 복구한 뒤 활성화된다. 불확실한 OpenAI 작업은 재시작으로 다시 호출하지 않는다.

### 시작 실패 로그

| 안전한 오류 코드 | 확인할 내용 |
|---|---|
| `DATABASE_URL_REQUIRED` | Session pooler 연결 문자열 전체가 설정됐는지 |
| `SUPABASE_SESSION_POOLER_REQUIRED` | 프로젝트 REF가 맞고 Session pooler5432인지 |
| `POSTGRES_AUTH_FAILED` | DB 비밀번호와 URL 인코딩이 맞는지 |
| `DATABASE_CONNECTION_FAILED` | 복사한 pooler 호스트, Supabase 프로젝트 일시 중지 여부 |
| `SUPABASE_DB_CA_REQUIRED` | Supabase Database 설정에서 CA 인증서를 받아 `AIADCAST_SUPABASE_DB_CA` 환경 변수에 PEM 전체를 넣거나 Render secret file을 `PGSSLROOTCERT`로 지정 |
| `SUPABASE_BUCKET_SETUP_FAILED` | 해당 프로젝트의 `sb_secret_` 서버 키가 맞는지 |
| `BETA_BUDGET_CONFIG_CHANGED` | 저장된 총예산과 환경 변수가 일치하는지. DB/비용 기록 삭제로 해결하지 않음 |

TLS 인증서 검증은 켜져 있다. CA 오류를 해결하려고 검증을 끄지 않는다. 서버 로그는 API 키·DB 비밀번호·원시 공급사 응답을 출력하지 않는다.

## 3. 관리자 첫 로그인

**Live가 된 뒤** Supabase **SQL Editor → New query**에서 아래 한 줄을 실행한다. SQL Editor의 프로젝트 운영자 권한으로만 실행할 수 있으며, 앱/일반 회원에게 관리자 승격 API는 없다.

```sql
SELECT * FROM aiadcast_accounts.create_owner_invitation('selluplabs@gmail.com');
```

결과의 `invite`를 복사한다. 24시간 내 한 번만 쓸 수 있는 관리자 초대코드다. DB에는 해시만 저장된다. SQL Editor 결과와 코드는 공개하지 않는다. 첫 관리자는3개의 시험 이용권과 미배정된 전체 시험 예산을 받는다. 실제 구매/매출이 아니다. 이미 다른 관리자가 있으면 새 주소로 관리자 계정을 만들지 않는다. 같은 관리자 주소로 다시 실행하면 기존 로그인과 초대가 해제되고 새 코드가 발급된다.

Render 웹 앱에서 **광고 만들기 → 테스트 로그인 → 초대코드**에 붙여넣는다. 로그인 후 상단 **관리자**를 열면 회원·생성 이력·이용권·실사용 비용을 조회할 수 있다. 먼저 관리자 본인 계정으로 이미지 한 장을 시험한다.

설치된 Preview0.2.21 APK에서는 **사용 안내 → 가입·결제 테스트 연결**에 공개 Render 주소만 입력하고 저장한다. APK를 다시 만들거나 API 키를 앱에 넣지 않는다. 기기 편집 작업은 유지하며 서버 주소 변경 시 로그인은 해제된다.

## 4. 실제 이미지 시험

1. 상품명·설명·가격·회사 정보와 원본 사진을 입력한다. 규격은 필요한 상품에 입력한다.
2. **원본 보존 모드**에서는 상품 사진을 직접 보존하고 OpenAI가 배경을 만든다. **콘셉트 모드**는 상품을 다시 그릴 수 있으므로 실물 규격 정확도를 보증하지 않는다.
3. **새 시안 생성**을 한 번 요청한다. 준비 상태만으로 실제 생성 성공이라 표시하지 않는다.
4. 시안이 표시되면 문구·원본/상품 비율·출력 크기·릴스 안전 영역을 확인한다. **사용 확정**할 때 이용권이 한 번 차감된다. 고객 반려와 오류 처리에도 공급사에서 발생한 실제 비용 기록은 남는다.
5. **현재 작업 서버 저장**, 로그아웃/재로그인, **서버 작업 열기**, PNG 다운로드를 시험한다. 다른 회원에게 같은 프로젝트 ID를 보내도 접근할 수 없다.

이미지 호출당$0.50의 입장 예약을 잡으며 실제 응답의 사용량으로 정산한다. 월$1은 이 앱의 작은 시험 예산이며 공급사 청구의 절대 상한이 아니다. 계정의 남은 예산이 예약보다 작으면 호출 전에 멈춘다. 알 수 없는 호출 결과는 비용 보류를 유지하며 자동 재시도하지 않는다. OpenAI Usage 화면과 대조한다. 화면의 `$0.11` 월 사용량은 키를 사용해 발생한 누적 API 비용이며 키 자체의 월 회비가 아니다.

## 5. 이메일 가입 시험 연결

첫 초대 로그인/이미지 시험이 끝난 뒤 다음을 설정한다.

- Supabase **Authentication → URL Configuration**: Site URL에 Render HTTPS 주소, Redirect URLs에 그 주소의 `/**` 경로를 허용한다. 이 시험 프로젝트에 필요한 주소만 추가한다.
- **Authentication → Email Templates**에서 **Confirm sign up**과 **Magic Link**를 모두 아래처럼 설정한다. 신규 Supabase 메일 대상에는 확인 메일 템플릿이 사용될 수 있다.

```html
<h2>aiadcast 이메일 인증</h2>
<p>아래 버튼을 누른 뒤 가입을 요청한 앱으로 돌아가세요.</p>
<p><a href="{{ .RedirectTo }}">이메일 인증 확인</a></p>
```

- Render 환경 변수: `AIADCAST_EMAIL_PROVIDER=supabase`, `AIADCAST_EMAIL_ENABLED=true`. 저장 후 재배포한다.
- 앱에서 이메일을 입력하고, 수신 메일 링크를 열어 **인증 확인**을 누른 뒤 원래 앱으로 돌아온다. 인증을 요청한 기기의 poll token이 있어야 로그인된다. 새 회원은 시험 예산·이용권0부터 시작하며 관리자가 배정한다.

이 구현은 기존 앱의 일회용 메일 승인/세션 인증을 PostgreSQL에 보존하고 **Supabase Auth를 메일 발송 경로로 사용**한다. 앱 세션은 Supabase JWT가 아니며, Supabase Auth의 confirmed 플래그로 관리자 권한을 결정하지 않는다. 기본 SMTP는 프로젝트 조직 팀에 등록된 주소로만 발송하며 현재2통/시간 제한이다. 임의 테스터 주소에 보내려면 Supabase Custom SMTP에 발송 공급사를 연결해야 한다. 메일 수신 시험을 하기 전에는 회원가입 전체가 검증됐다고 표시하지 않는다. 기존 Resend 직접 발송 구성도 지원한다.

## 6. 테스트 결제

기존 TossPayments 시험 어댑터를 유지한다. Render에 `AIADCAST_TOSS_TEST_CLIENT_KEY=test_ck_…`, `AIADCAST_TOSS_TEST_SECRET_KEY=test_sk_…`, `AIADCAST_TOSS_TEST_ENABLED=true`를 설정해야 결제 버튼이 활성화된다. 실제 키는 거부한다. 외부 승인 결과를 서버에서 확인한 뒤 시험 이용권을 한 번만 지급한다. 결제 공급사 미설정 상태에서 구매 성공을 흉내 내지 않는다. 실제 공급사 시험 승인은 아직 수행하지 않았다.

## 검증과 한계

- PGlite의 PostgreSQL 엔진으로 실제 SQL·제약·트랜잭션을 실행해 가입/로그인·권한·프로젝트 버전 충돌·비공개 파일 해시·중복 생성·확정 차감·관리자 지급·결제 재처리·서버 재시작 후 복구를 검사한다.
- 원격 Supabase HTTP/SMTP와 OpenAI/Toss 호출은 fixture를 사용했다. 실제 서버 TLS 연결·실제 OpenAI 이미지·실제 메일/결제·Docker 컨테이너 빌드는 별도 확인이 필요하다.
- DB: 계정 스키마와 사용자별 생성 스키마. 공개 역할 권한 제거 및 RLS 활성화. 회원 최대20명. 개인 Storage100MB, 전체900MB, 파일40MB 제한. 프로젝트 JSON에는 Storage 경로/해시를 보관하며 원본 이미지를 DB에 base64로 복제하지 않는다.
- 파일 업로드 결과나 DB 반영 결과가 불확실하면 파일/예약을 보존한다. 자동 삭제로 비용·원본 기록을 잃지 않는다. 운영자 정리/백업 정책은 후속 작업이다.
- Render 무료는 유휴 시 잠들며 첫 요청이 늦을 수 있다. Supabase 무료 프로젝트도 장기 미사용 시 일시 중지될 수 있다. Free의 요금/쿼터 범위 안에서 시험하는 구성이며 무제한 운영이 아니다.

## 공식 참고

- [Render Free](https://render.com/docs/free)
- [Supabase Session pooler](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase private Storage](https://supabase.com/docs/guides/storage/serving/downloads)
- [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase default/custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
