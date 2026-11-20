# Android 사진 활용 업데이트 검증판

- 버전: `0.2.23-preview`, versionCode `25`
- 패키지: `com.selluplabs.aiadcast.next.preview`
- 파일: `aiadcast-preview-0.2.23.apk`
- 크기: 18,415,646 bytes
- SHA-256: `bdeeb488e0e6915511d73a5b7906f2f857b6af8b0427c9bc34553317b732e1f2`
- 기본 서버 주소: `https://aiadcast-next.onrender.com`. API 키는 APK에 포함하지 않는다. 기존 시험 서버 설정이 있으면 유지한다.

웹 빌드, Android 단위 검사 7건, APK 서명과 16 KB zipalign 검사를 통과했다. lint 오류 0건, 경고 1건(WebView JavaScript 사용)이다. 서명 인증서는 이전 `0.2.22-preview`와 일치하며 versionCode가 증가했다. 실제 기기에서 업데이트 설치한 것은 아직 아니다.

기본 사진 단계에서 원본 합성과 AI 새 광고를 선택하고 사진마다 실제 대상 또는 디자인 참고를 지정한다. 이 정보가 저장·복원·생성 요청에 이어진다. 서버가 사진 용도 지원을 명시하지 않으면 디자인 참고 생성을 보류하고 업데이트 필요 안내를 표시한다.

이 APK는 별도 Preview 시험판이다. Google Play 제출용 서명 번들 또는 기존 외주 앱에 대한 스토어 업데이트 완료를 의미하지 않는다. 최신 서버 코드 배포와 로그인·시험 이용권 연결이 필요하며 실제 이미지 우위 비교와 기기 검증은 남아 있다. 호스팅과 공급사 예산을 늘리지 않았다.

기본 서버의 `/api/health`는 Supabase 기반 시험 서버 응답을 반환했다. 계정 기능은 시험 비밀번호 로그인 활성, 관리자 준비 미완료, 실제 결제 비활성으로 응답했다. 인증된 생성 요청은 실행하지 않았다.

재현 시 `ORG_GRADLE_PROJECT_AIADCAST_API_ORIGIN=https://aiadcast-next.onrender.com`을 설정하고 기존 Preview 서명 파일을 유지한 채 `bash native/android-build.sh preview`를 실행한다. 비밀 서명 파일과 인증 정보는 저장소에 넣지 않는다.
