# Android 0.2.22-preview 검증 — 2026-10-15

- applicationId: `com.selluplabs.aiadcast.next.preview`
- versionName: `0.2.22-preview`, versionCode: `24`
- minSdk: 29, targetSdk / compileSdk: 36
- APK: `aiadcast-preview-0.2.22.apk` (18,414,326 bytes)
- SHA-256: `9a2ce73236b08f037306bb85ac36c7166f31e9ced110f0cdea078ff130543bd4`
- 웹 빌드 digest: `1233c081106688fc8b2fec22c38091d6434ef4d0a573b339e8642c8b880422c4`

## 확인한 결과

`native/android-build.sh preview`로 웹 빌드, Android 자산 복사, clean, 단위 검사, lint, APK 생성과 서명·정렬 검사를 실행했다. Android 단위 검사 7건이 통과했으며 실패·오류·건너뜀은 0건이다. lint는 오류 0건, 경고 1건이다. WebView JavaScript 사용 경고를 숨기지 않았다.

`apksigner verify`와 `zipalign -c -P 16 4`가 통과했다. 이전 0.2.21-preview APK와 서명 인증서가 일치하고 versionCode가 증가한 것을 확인했다. 기존 설치를 실제 기기에서 업데이트한 것은 아직 아니다. 개발 서명 비밀키는 APK·저장소·사용자 다운로드에 포함하지 않는다.

## 포함한 변경

48개 상품·서비스 분류의 연출 지침, 서비스 요청의 제품 치수/골판지 지침 분리, 선택적 7개 이미지 제작 지침, 결과의 제작 의도·추천 채널·검색어 표시를 포함하는 개발 소스와 함께 빌드했다. 이미지 생성은 서버 기능이다. APK를 설치한 것만으로 서버 코드가 업데이트되지 않으므로 같은 개발 브랜치의 서버를 배포해야 한다.

관련 도메인 검사 35건과 웹 빌드, PostgreSQL 공통 규칙 일치 검사가 통과했다. 브라우저 화면 검사는 Chromium 배포 파일 다운로드가 불완전해 실행하지 못했다.

## 남은 실제 검증

- 실제 Render 서비스 연결과 동일 브랜치 서버 배포.
- 실제 OpenAI 광고 생성과 이전 외주 앱 결과 비교.
- Android 실기기 설치, 회원 로그인, 사진 선택, 생성, 저장·공유와 앱 재시작.
- Google Play용 운영 서명과 제출·심사. 이 APK는 Play 공개 출시 파일이 아니다.

기본 공개 서버 주소를 추정해 APK에 넣지 않았다. Preview는 기존의 테스트 서버 연결 기능을 유지한다. 실제 연결 전에는 광고 생성 성공이나 최고 수준의 디자인 품질을 주장하지 않는다.
