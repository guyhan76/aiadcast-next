# 카카오 로그인 Preview 연동

웹과 Android가 기존 aiadcast 회원번호를 공유하도록 서버에서 카카오 서비스 사용자 ID를 연결한다. 카카오 공식 화면에서 계정을 인증한 뒤 aiadcast 서버가 인가 코드를 교환하고 액세스 토큰을 검증한다.

## Preview 설정

카카오디벨로퍼스에서 고도화 버전용 앱을 선택하고 카카오 로그인을 활성화한다. REST API 키의 카카오 로그인 리다이렉트 URI에 `https://<preview-host>/api/auth/kakao/callback`을 등록한다. 서버 환경에 아래 값을 설정한다.

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
3. 웹은 `destination=web`, Android는 설치된 앱의 패키지명을 보낸다. 응답의 `proof`는 시작한 탭 또는 앱에만 보관한다. 반환된 주소를 열면 서버가 카카오 공식 인가 페이지로 바로 이동시킨다. `prompt=login`을 지정해 로그인할 때마다 카카오계정 인증을 요청한다.
4. 서버가 카카오 콜백을 처리하면 웹은 원래 탭으로 이동하고 Android는 앱 링크로 복귀한다. 콜백으로 받은 일회용 값과 시작할 때 보관한 증명값을 함께 `POST /api/auth/kakao/poll`로 보내 aiadcast 세션을 받는다. 계정 연결에는 처음과 같은 aiadcast 세션이 필요하다.
5. 연결된 회원이 없는 로그인은 `unknown` 상태로 끝난다. 기존 회원에게는 Google 로그인 후 내 계정에서 카카오 연결을, 처음 이용하는 사용자에게는 명시적 신규 가입을 안내한다.

운영 공개 전에는 실제 웹 로그인과 취소, Android 브라우저에서 카카오계정 인증 후 aiadcast로 복귀, 기존 회원의 크레딧과 프로젝트 접근을 확인한다.

[카카오 로그인 설정](https://developers.kakao.com/docs/ko/kakaologin/prerequisite) · [REST API 로그인](https://developers.kakao.com/docs/ko/kakaologin/rest-api)
