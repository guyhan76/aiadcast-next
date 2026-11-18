# 카카오 로그인 Preview 연동

웹과 Android가 기존 aiadcast 회원번호를 공유하도록 서버에서 카카오 서비스 사용자 ID를 연결한다. 인가 코드 교환과 액세스 토큰 검증은 서버에서 수행한다. 클라이언트로 전달하는 키는 JavaScript 키 하나다.

## Preview 설정

카카오디벨로퍼스에서 고도화 버전용 앱을 선택하고 카카오 로그인을 활성화한다. JavaScript 키에 Preview 웹 도메인을 등록하고 로그인 리다이렉트 URI로 `https://<preview-host>/?kakao=1`을 등록한다. 서버 환경에 아래 값을 설정한다.

| 환경 변수 | 값 |
| --- | --- |
| `AIADCAST_BETA_PUBLIC_ORIGIN` | 등록한 Preview HTTPS 웹 주소 |
| `AIADCAST_KAKAO_APP_ID` | 카카오 앱의 숫자 ID |
| `AIADCAST_KAKAO_JS_KEY` | 같은 앱의 JavaScript 키 |
| `AIADCAST_KAKAO_REST_KEY` | 같은 앱의 REST API 키 |
| `AIADCAST_KAKAO_CLIENT_SECRET` | REST API 키의 클라이언트 시크릿 |
| `AIADCAST_KAKAO_ENABLED` | Preview 연동 준비가 끝나면 `true` |

## 웹 클라이언트와 서버 사이의 흐름

1. 클라이언트는 `GET /api/account/capabilities`의 `kakao.enabled`로 지원 여부를 확인한다.
2. `POST /api/auth/kakao/start`에 `intent`를 전달한다. `login`은 기존 연결로 로그인하고, `signup`은 명시적 가입을 처리한다. `link`는 현재 로그인한 사용자의 세션이 필요하다.
3. 응답 중 `proof`는 시작한 탭에 보관한다. 공식 JavaScript SDK의 `Kakao.Auth.authorize`에는 `redirectUri`와 `state`를 전달한다.
4. 복귀한 탭에서 저장한 상태와 콜백 상태가 일치하는지 검사하고 `POST /api/auth/kakao/finish`에 `state`, `proof`, `code`를 보낸다. 연결을 시작했을 때와 같은 aiadcast 세션을 사용한다.
5. 연결된 회원이 없는 로그인은 `KAKAO_ACCOUNT_UNKNOWN`을 반환한다. 기존 회원에게는 Google 로그인 후 카카오 연결을, 처음 이용하는 사용자에게는 신규 가입을 안내한다.

운영 공개 전에는 실제 웹 로그인과 취소, Android에서 카카오톡으로 이동한 뒤 앱으로 복귀, 카카오톡 미설치 기기의 카카오계정 로그인, 기존 회원의 크레딧과 프로젝트 접근을 Preview에서 확인한다.

[카카오 로그인 설정](https://developers.kakao.com/docs/ko/kakaologin/prerequisite) · [JavaScript 간편로그인](https://developers.kakao.com/docs/ko/kakaologin/js)
