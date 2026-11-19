package com.selluplabs.aiadcast.next;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import org.junit.Test;

public final class KakaoReturnTest {
    @Test public void onlyTheCurrentAppsHttpsOrDeepLinkReturnCompletesLogin() {
        String https = "https://studio.example.com/api/auth/kakao/app-return#";
        String app = "com.selluplabs.aiadcast.next.preview://kakao/return#";
        String state = "s".repeat(43), receipt = "r".repeat(43);
        String fragment = state + "." + receipt;
        assertEquals(fragment, KakaoTalkLoginActivity.matchingReturn(https + fragment, https, app, state));
        assertEquals(fragment, KakaoTalkLoginActivity.matchingReturn(app + fragment, https, app, state));
        assertNull(KakaoTalkLoginActivity.matchingReturn(https + fragment, https, app, "t".repeat(43)));
        assertNull(KakaoTalkLoginActivity.matchingReturn(https + fragment + "&other", https, app, state));
        assertNull(KakaoTalkLoginActivity.matchingReturn(app + state + ".", https, app, state));
        assertNull(KakaoTalkLoginActivity.matchingReturn(https.replace("studio.", "other.") + fragment, https, app, state));
    }
}
