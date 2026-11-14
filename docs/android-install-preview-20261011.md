# Android 설치 실패 대응 — 2026-10-11

## 관찰과 판단

사용자가 Samsung 설치 화면의 `앱이 설치되지 않음` 메시지를 제보했다. 화면의 대상은 `aiadcast Dev`, 다운로드 파일은 `aiadcast-dev-0.2.17.apk`다. 다운로드 폴더의 다른 APK가 현재 설치된 앱이라는 증거는 없으며, 실패 코드·기기 Android 버전·기존 설치 앱의 서명은 확인되지 않았다.

보관 중인 0.2.17 APK의 ZIP CRC와 APK v2 서명 검사는 통과했다. `testOnly` 속성은 없고 minSdk 29, targetSdk 36, 네이티브 ABI별 라이브러리가 없는 APK다. 사용자 휴대폰에 다운로드된 파일의 바이트 일치 여부는 확인하지 않았다. 서명/버전 충돌은 가능성 중 하나이며 원인으로 확정하지 않는다.

## 대응

0.2.18에 `preview` build type을 추가했다. `initWith debug`를 사용하되 `debuggable false`, 이름 `aiadcast Preview`, applicationId `com.selluplabs.aiadcast.next.preview`를 지정했다. 기존 정식 및 Dev applicationId는 유지한다. FileProvider와 AndroidX startup authority, 동적 receiver 권한도 Preview 패키지로 분리된다.

이 파일은 기존 Dev 앱의 업데이트가 아닌 별도 시험 설치판이다. 기존 앱 삭제·데이터 초기화·Play Protect 등 보안 기능 해제를 요구하지 않는다. 기존 프로젝트를 자동 이전하지 않으며, 필요하면 기존 앱의 프로젝트 JSON 백업을 Preview로 가져온다.

`bash native/android-build.sh preview`로 재현할 수 있다. 인자 없이 실행하면 기존 debug 빌드가 유지되며 잘못된 인자는 작업 전에 종료한다. 운영 서명이나 스토어 배포는 변경하지 않았다. 같은 Preview 패키지의 후속 업데이트에는 같은 서명키와 증가한 versionCode를 유지해야 한다. 임시 개발 키를 회사 운영 키로 간주하지 않는다.

## 실제 검증

- 웹 빌드 및 Android assets 준비 성공.
- `testPreviewUnitTest`: 2개 통과, 실패/오류/건너뜀 0.
- `lintPreview`: 오류 0, 기존 `SetJavaScriptEnabled` 경고 1.
- `assemblePreview`: 성공.
- `apksigner verify --verbose --print-certs`: v2 서명 검증 성공.
- `zipalign -c 4`: 성공. ZIP CRC 검사 오류 없음.
- 컴파일된 manifest/badging: Preview 패키지, versionCode 20, minSdk 29, targetSdk 36, 올바른 launcher 확인. `testOnly` 없음, debuggable 비활성 확인.
- 두 provider authority와 receiver 권한에서 기존 `.dev` 식별자를 사용하지 않음 확인.
- APK의 148개 웹 파일이 `dist`와 바이트 단위로 동일함. native bridge도 소스와 동일함.
- 빌드 스크립트 구문 검사 및 잘못된 인자 종료 코드 2 확인.

| 아티팩트 | 값 |
|---|---|
| 배포 파일명 | `aiadcast-preview-0.2.18.apk` |
| 버전 | `0.2.18-preview` / code 20 |
| 크기 | 11,687,063 bytes |
| APK SHA-256 | `cc961b5fd4e6d15b347329b0c799c55b28fb0fdb392ddcd73046a08035dae01e` |
| 개발 서명 인증서 SHA-256 | `4df47020da101fcde3ab80cfa72449603d636e1f25e24ee7eb8423317f7d0dcd` |
| 웹 빌드 digest | `1decb16d9af4bcd2ee8551f081844e27c0e2d0478d6ce3a87cb9e406debaa5b7` |

## 미확인 사항

Android 기기 또는 에뮬레이터에서 이번 APK를 설치·실행하지 않았다. 빌드·정적 검증의 성공을 실기기 설치 성공으로 표현하지 않는다. 휴대폰에서 다시 실패하면 기종, Android 버전, 새 파일의 오류 화면과 가능한 경우 정확한 PackageManager 설치 실패 코드를 확인한다. 기기 로그 없이 서명 충돌, 저장 공간, 파일 다운로드 손상, 보안 정책 중 하나를 단정하지 않는다.

기본 APK는 외부 생성 서버가 연결되지 않은 편집 검증판이다. 유료 AI 호출·서버 배포·회원/결제 연결은 이번 설치 대응에 포함하지 않았다. 기능 코드나 기존 프로젝트 데이터 형식을 변경하지 않았다.

Android 서명/업데이트 규칙 참고: https://developer.android.com/studio/publish/app-signing
