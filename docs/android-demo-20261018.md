# 2026-10-18 별도 설치 시연 APK

사용자가 Android SDK 약관·설치와 별도 시연 applicationId·새 시연 서명키 생성을 명시적으로 승인했다. PR #23 `d46036a5712f67e36188af979bf3766ac4863c39`의 기능을 보존한 `feat/android-demo-apk-20261018` 후보다. APK 제작은 운영 배포나 Play 출시 승인이 아니다.

- 표시 이름: **aiadcast 시연**
- applicationId: **com.selluplabs.aiadcast.next.demo**
- versionName: **0.2.28-demo**, versionCode: **30**
- Android 10(API 29) 이상, target/compile API 36
- 외주 `com.selluplabs.aiadcast`, 기존 `.next.dev`, `.next.preview`, 향후 `.next`와 별도 설치·데이터 영역이다. 기존 앱 삭제나 자동 데이터 이관을 하지 않는다.
- 연결 주소는 `https://aiadcast-next.onrender.com`으로 빌드에 고정한다. 시연판의 테스트 서버 주소 변경과 WebView 디버깅은 비활성이다. 외주 Fly 서버를 연결하지 않는다.

## 서명 보관

시연 전용 RSA 3072 키를 승인된 개발 환경의 Git 제외 `release/demo-signing`에 생성했다. 디렉터리 0700, 키·암호 파일 0600이며 소스·APK·Library·채팅에 비밀을 포함하지 않는다. 이 환경 밖의 백업이나 보안 저장소로 복사하지 않았다. 환경 소멸 시 키를 잃을 수 있으므로 향후 같은 시연 앱 업데이트를 위해서는 소유자가 승인한 별도 보관 절차가 필요하다. 정식 출시/업로드 서명으로 자동 재사용하지 않는다.

시연 인증서 SHA256:
`57:6E:AD:9F:54:6B:2D:22:72:50:32:3D:68:8C:90:87:B0:E2:06:BF:10:1B:85:60:A9:92:2B:1E:E7:93:B6:38`

빌드는 명시적인 `AIADCAST_DEMO_KEYSTORE`와 `AIADCAST_DEMO_STORE_PASSWORD` 환경 변수가 없으면 중단한다. debug/Preview 키를 대신 생성하거나 사용하는 경로가 아니다. `bash native/android-build.sh demo`는 웹 빌드 후 demo unit test·Android lint·APK 조립·서명·zipalign을 확인한다. 도구는 공식 아카이브 체크섬을 확인해 `/tmp/aiadcast-android-tools`에 설치했다. SDK 약관은 사용자 동의 후 기록했다.

## 기능과 검증의 한계

기준 PR #23은 로컬·원격 CI에서 types/build/cloud/isolation, 도메인 353개, 브라우저 270개(기존 skip 2개)가 통과했다. 시연 빌드 후보의 최종 SHA와 검사 결과는 해당 draft PR을 확인한다. APK 조립 성공은 실기기 설치·로그인·생성·저장 왕복 성공이 아니다.

현재 운영 전달 기준 `3cc93189725c36bf281f773ef506b89b7721f407`에는 사진 없는 상품 예시 기능의 새 서버 계약이 없다. 최신 APK만 설치해 이 기능이 작동한다고 설명하지 않는다. API capability가 없으면 화면에서 차단하며, 별도 승인 후 정확한 후보 SHA의 프런트/API 배포가 필요하다. 운영 서비스·환경·연결 브랜치·데이터 소유권을 먼저 재확인한다.

로컬 Blender 재질 렌더는 localhost 프로토타입으로 운영 Render에 연결되지 않았다. 실제 이메일 인증·Toss sandbox·Play Billing·유료 AI 품질 검증은 완료되지 않았다. 기존 대체 공급사 테스트는 실제 결제/광고 품질 증거가 아니다. 실제 기기에서는 별도 설치, 기존 앱 보존, 사진 첨부, 로그인, 승인 범위 내 생성, PNG 저장/공유를 확인해야 한다. 유료 호출·실제 결제·외부 권한이나 설정 변경은 이 빌드 작업에 포함하지 않는다.
