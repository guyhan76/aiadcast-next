# 한국 Google Play 크레딧 결제

고도화 앱의 Android 패키지는 `com.selluplabs.aiadcast.next`입니다. 한국 내 출시를 위한 소모성 일회성 상품을 다음과 같이 등록합니다. 앱은 Play가 반환하는 원화 가격을 표시합니다.

| Play 상품 ID | 지급 크레딧 | 한국 기준 가격 |
| --- | ---: | ---: |
| `credits_30` | 30 (광고 3장) | 3,300원 |
| `credits_100` | 100 (광고 10장) | 9,900원 |

2026-11-17 확정 가격. 첫 신규 가입 계정에는 10크레딧(광고 1장)을 한 번 지급합니다. 기존 `credits_180` 상품은 신규 판매 목록에서 제외하고, 이미 결제한 영수증의 복구·검증은 유지합니다. Play Console 가격도 위 금액으로 설정해야 하며 앱에서는 Play가 반환한 실제 결제 가격을 표시합니다.

### 내부 테스트 연결

1. 셀업랩스 조직 계정에서 이 패키지의 앱을 만들고 한국 판매용 상품에 기본 구매 옵션을 설정합니다.
2. 회사가 관리하는 업로드 키로 서명한 release AAB를 내부 테스트 트랙에 올립니다. Preview와 시연 APK는 별도의 패키지입니다.
3. 백엔드의 Google 서비스 계정에 해당 앱 구매 조회 및 처리 권한을 부여하고 Android Publisher API를 활성화합니다. 테스트 서버의 비밀 파일 경로를 `AIADCAST_PLAY_SERVICE_ACCOUNT_FILE`에 설정하고 `AIADCAST_PLAY_BILLING_ENABLED=true`로 연결합니다.
4. Play Console의 내부 테스터와 라이선스 테스트에 구매용 Google 계정을 추가합니다. 내부 테스트 초대 링크를 통해 앱을 설치한 뒤 테스트 결제수단이 표시되는지 확인합니다.
5. 세 상품의 가격·지급량을 확인합니다. 승인·거절·취소·지연 승인을 각각 시험하고 앱 재시작, 네트워크 복구, 계정 전환 및 같은 상품 재구매 때 잔액을 확인합니다.

서버는 Google에서 받은 구매 상태, 계정 식별자, 상품 및 수량을 검증합니다. 완료된 구매 토큰을 기준으로 크레딧을 지급한 뒤 소모 처리합니다. 운영 판매 전에는 스토어 환불·구매 취소 후의 잔액 조정과 앱을 다시 열지 않은 구매의 서버 재처리도 검증해야 합니다.

[Google Play 일회성 구매 처리](https://developer.android.com/google/play/billing/lifecycle/one-time) · [테스트 결제](https://developer.android.com/google/play/billing/test)
