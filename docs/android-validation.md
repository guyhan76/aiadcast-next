# Android 검증 기록 — 2026-10-10

별도 설치판(0.2.18-preview)의 APK와 확인 범위는 [설치 실패 대응 기록](android-install-preview-20261011.md)을 참고한다. 모바일 기능 변경(0.2.17-dev)은 [2026-10-11 기록](mobile-validation-20261011.md)에 남겼다. 아래 내용은 초기 빌드 기록이다.

## 확인한 범위

- JDK 21, Android SDK 36, build-tools 36.0.0, Gradle 8.13, Android Gradle Plugin 8.13.2로 실제 Android Java 코드를 컴파일했다.
- `testDebugUnitTest`: 테스트 2개 통과, 실패·오류·건너뜀 0개. 파일명 경로 침범, 확장자, MIME, PNG 헤더, JSON 형태, 용량 상한을 확인했다.
- `lintDebug`: 오류 0개. React 화면에 JavaScript를 허용한다는 `SetJavaScriptEnabled` 경고 1개가 남으며 숨기지 않았다. 로컬 앱 origin, 최상위 프레임 메시지 검증, 명시한 서버 origin, 파일 URL 접근 금지로 범위를 제한했다.
- `assembleDebug`: 개발 APK 생성 성공. `apksigner verify`로 APK 서명 검증을 통과했다.
- `aapt dump badging`: `com.selluplabs.aiadcast.next.dev`, versionCode 1, minSdk 29, targetSdk 36 확인. 기존 외주 앱 식별자를 사용하지 않는다.
- `node native/test-android-bridge.mjs`: 브라우저에서 PNG·JSON 다운로드 전달, 중복 초기화 방지, 허용하지 않은 형식 및 원격 URL 거부 확인.
- `python3 native/setup-android-cloud.py`: 고정 체크섬을 재검증하고 클라우드 빌드 환경을 재설정하는 과정 통과. 공급사 키는 사용하지 않았다.

APK의 웹 화면은 `dist`를 다시 빌드한 후 `native/prepare-android.mjs`로 복사한 시점의 결과다. 이후 웹 코드를 바꾸면 Android 패키징을 다시 해야 한다. 아티팩트의 생성 시간과 SHA-256은 `release/android/build-evidence.json`으로 확인한다.

## 아직 확인하지 않은 범위

Android 실기기·에뮬레이터에서 실행하거나 저장·공유·파일 선택기를 눌러보지는 않았다. 위 브라우저 테스트는 Android 시스템 UI 또는 앱 전환 후 복귀를 검증한 것이 아니다. 화면 회전, 키보드, 앱 종료·재시작, 저장 공간 부족, 실제 PNG/JSON 복원과 공유는 실기기 검증이 필요하다.

신규 앱의 Google Play 등록, 운영 AAB 서명, 심사 제출·승인, Google Play Billing 실결제, 서버 회원 동기화, 실제 유료 AI 생성, 영상 기능은 이 Android 빌드 결과로 완료 처리하지 않는다. 기본 APK는 공개 API origin을 연결하지 않은 독립 편집 검증 앱이다.

개발 도구가 읽기 전용 사용자 홈 때문에 Android 사용 통계 초기화 경고를 냈다. 빌드용 디렉터리와 개발 서명은 `/tmp`에 지정했고, 빌드·테스트·서명 검증은 성공했다. 인증키·비밀번호·개발 서명 비밀키는 다운로드 아티팩트에 포함하지 않는다.

