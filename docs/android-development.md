# aiadcast 독립 Android 앱

이 프로젝트는 기존 외주 앱과 별개의 Android 앱이다. React 편집 화면을 앱 내부에 포함하는 Java/WebView 구조를 사용하며, 외주 앱의 서버·회원·결제·서명 키를 연결하지 않는다.

| 항목 | 값 |
|---|---|
| 정식 등록용 applicationId | `com.selluplabs.aiadcast.next` |
| 개발 APK applicationId | `com.selluplabs.aiadcast.next.dev` |
| 별도 설치 Preview applicationId | `com.selluplabs.aiadcast.next.preview` |
| 최소 Android | Android 10 / API 29 |
| compile / target SDK | API 36 |
| Android Gradle Plugin / Gradle | 8.13.2 / 8.13 |
| Java 소스 / 필요한 도구 | Java 17 문법 / 전체 JDK 17 이상 |

Google Play 내부·비공개·정식 트랙에는 같은 정식 applicationId를 사용한다. `.dev` APK는 별도 시험 설치용이며 정식 앱 업데이트 파일이 아니다. target SDK 숫자는 출시일의 Play 요구사항을 자동 보증하지 않는다.

## 빌드

Android Studio 또는 전체 JDK, Android SDK platform 36 및 build-tools 36.0.0이 필요하다. Windows에서도 저장소의 `android` 폴더를 Android Studio로 열 수 있다. NPM 의존성 추가나 Capacitor 설치는 필요하지 않다.

```bash
npm ci
npm run build
node native/prepare-android.mjs
cd android
./gradlew testDebugUnitTest lintDebug assembleDebug
```

한 번에 실행하려면 JDK와 SDK 환경 변수를 설정한 뒤 `bash native/android-build.sh`를 사용한다. Gradle wrapper는 공식 배포 ZIP의 SHA-256을 검증한다. APK 출력은 `android/app/build/outputs/apk/debug/app-debug.apk`다. 웹 코드가 바뀔 때마다 웹 빌드·prepare·Android 빌드를 다시 실행해야 APK에 반영된다.

기존 Dev APK 설치 실패를 분리해 확인하려면 `bash native/android-build.sh preview`를 사용한다. `android/app/build/outputs/apk/preview/app-preview.apk`에 **aiadcast Preview**가 생성된다. 개발 서명키를 사용하지만 디버깅을 끄고 별도 applicationId와 provider authority를 사용한다. 정식/Dev 앱을 덮어쓰거나 데이터를 지우지 않으며, 기존 프로젝트는 자동 이전되지 않는다. 필요하면 기존 앱에서 JSON을 백업해 Preview에 가져온다. Preview도 운영 배포판은 아니며 기존 앱 삭제나 기기의 보안 기능 해제를 해결책으로 전제하지 않는다.

서로 다른 환경의 개발 서명키로 동일 applicationId를 빌드하면 기존 설치본 업데이트가 거부될 수 있다. 같은 Preview 앱의 다음 업데이트에는 동일한 서명키와 더 높은 versionCode를 유지해야 한다. 이번 설치 실패의 정확한 코드와 기존 설치본 서명은 확인되지 않았으므로, 별도 설치판 생성 자체를 원인 확정이나 실기기 설치 성공으로 기록하지 않는다.

Codex 클라우드의 읽기 전용 사용자 홈 환경에서는 다음 준비 경로를 사용할 수 있다. 공식 다운로드의 고정 SHA-256을 검증하며 `/tmp/aiadcast-android-tools`에만 도구를 설치한다. 시스템 TLS 검증과 기존 프록시를 유지한다.

```bash
python3 native/setup-android-cloud.py
source /tmp/aiadcast-android-tools/env.sh
bash native/android-build.sh
```

클라우드 도구 준비는 Linux x64 기준이다. Android SDK 원본은 공식 repository2-3.xml의 체크섬으로 최초 검증한 뒤 이 스크립트에 SHA-256을 고정했다. JDK는 Eclipse Temurin 21.0.8+9이며 공식 GitHub 릴리스의 SHA-256을 검증한다. APK 안에는 포함되지 않는다. 개발 서명키는 Git 제외 경로 `release/android-signing`에 유지한다. 임시 도구 폴더를 다시 설치해도 개발 서명이 바뀌지 않도록 한다. Android Gradle의 사용 통계 초기화가 읽기 전용 사용자 홈 때문에 경고를 낼 수 있지만, 빌드용 사용자 데이터와 개발 서명은 지정한 `ANDROID_USER_HOME`에서 관리한다.

`release` 빌드에는 서명을 자동 설정하지 않는다. 회사가 직접 보유한 업로드 키·Play App Signing·신규 Play 앱 등록 후 별도 안전한 빌드 환경에서 AAB를 서명한다. 키와 비밀번호를 Git 또는 채팅에 넣지 않는다. `app-debug.apk`는 개발 키로 서명한 시험 파일이므로 Play 상용 출시 파일로 사용하지 않는다.

## 현재 연결한 기능

- WebViewAssetLoader가 앱에 포함된 화면·폰트를 `https://appassets.androidplatform.net`의 로컬 리소스로 제공한다. 이 주소는 앱 내부용이며 사용자에게 공유하는 웹사이트 주소가 아니다.
- 파일 선택은 Android 문서 선택기를 사용한다. PNG/JPEG/WebP 사진과 프로젝트 JSON 선택을 지원하며 전체 사진·저장소 권한을 요청하지 않는다.
- 기존 웹 화면의 PNG/JSON 다운로드를 Android의 **파일로 저장 / 다른 앱에 공유** 선택창으로 연결한다. `ACTION_CREATE_DOCUMENT`로 사용자가 저장 위치를 고르며 `FileProvider`로 공유 앱에 해당 파일의 임시 읽기 권한만 준다.
- 네이티브 다운로드 bridge는 앱 내부 origin의 최상위 프레임에서만 메시지를 받는다. 임의 원격 다운로드, HTML 내보내기, 32 MB 초과 파일, 잘못된 PNG/JSON 파일을 거부한다.
- WebView 저장 데이터는 현재 기기에만 남는다. 앱 삭제·데이터 초기화 시 사라지므로 프로젝트 JSON 백업을 제공한다. 이것은 회원 기반 서버 동기화가 아니다.
- API 키는 앱에 포함하지 않는다. 패키징 도구는 번들의 공급사 키 형태 및 직접 OpenAI API URL을 검사한다. 이 검사는 비밀값 검토 전체를 대체하지 않는다.

JS bridge는 `window`에서 `aiadcast-native-export` 이벤트를 보낸다. `detail.status`는 `requested`, `saved`, `share-opened`, `cancelled`, `error`다. 공유 앱을 여는 것과 실제 업로드가 끝난 것은 다르므로 `share-opened`를 업로드 성공으로 표시하지 않는다.

Android 뒤로가기 버튼·제스처는 취소 가능한 `aiadcast-native-back` 이벤트를 먼저 보낸다. React 화면이 이벤트에서 `preventDefault()`를 호출하면 화면 닫기를 앱 UI가 처리하며, 처리하지 않으면 WebView 방문 이력으로 돌아가거나 앱을 종료한다. `window.__aiadcastNativeDownloads === true`이면 네이티브 파일 저장이 연결된 상태다.

## 서버 연결 경계

기본 APK는 외부 서버 origin이 빈 상태다. 로컬 편집 검증에는 외부 API가 필요하지 않다. 서버 배포 후 회사의 공개 HTTPS origin만 Gradle property `AIADCAST_API_ORIGIN`에 지정한다. 값에는 경로·계정·비밀번호·query를 넣을 수 없다.

```bash
./gradlew assembleDebug -PAIADCAST_API_ORIGIN=https://api.example-company.com
```

위 주소는 형식 예시이며 실제 서비스 주소가 아니다. 서버 CORS에는 앱 내부 origin을 허용하고, 프런트엔드는 공개 백엔드 주소로 요청하도록 별도로 설정해야 한다. 네이티브는 공개 origin을 `window.__AIADCAST_API_ORIGIN__`에 전달한다. 이 값만 설정했다고 회원 인증이나 AI 요청이 연결되는 것은 아니다. 공급사 비밀키·OpenAI 직접 주소는 넣지 않는다. 릴리스 환경에서 API origin을 정할 때 회사 소유권·TLS·인증·요청 제한·서버 오류 복원을 함께 검증한다.

## 검증 범위와 남은 출시 조건

브라우저 bridge 검증은 `node native/test-android-bridge.mjs`, 파일명·MIME·내용·크기 제한의 Java 검증은 Gradle `testDebugUnitTest`로 실행한다. 브라우저 검증은 실제 Android 저장·공유창 작동을 대체하지 않는다.

실기기에서는 최소 다음을 확인해야 한다.

1. Android 10 및 최신 Android에서 실행·키보드·뒤로가기·화면 회전·시스템 여백.
2. 사진 선택, 프로젝트 JSON 가져오기, 사진 포함 프로젝트 재열기.
3. 1:1·4:5·9:16 PNG 저장 및 갤러리/Files에서 열기, JSON 저장·복원.
4. 공유 취소·성공, 저장 공간 부족, 동시 내보내기, 최대 파일 크기.
5. 앱 종료 후 프로젝트 유지, 앱 삭제 시 데이터 삭제와 백업 안내.
6. 실제 생성 서버 연결 시 인증·과금 예약/확정/복원, 네트워크 단절 및 중복 요청.

현재 Google Play Billing, 회원 서버 동기화, AAB 운영 서명, Play Console 심사 제출, 영상 생성은 이 네이티브 껍데기만으로 완료되지 않는다. 실기기 검증과 이 출시 조건을 통과하기 전에는 상용 앱 완성이나 결제 가능으로 표시하지 않는다.

