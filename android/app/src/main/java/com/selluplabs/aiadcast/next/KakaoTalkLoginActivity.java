package com.selluplabs.aiadcast.next;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Hosts the official SDK on the registered HTTPS origin, without the editor's native bridge. */
public final class KakaoTalkLoginActivity extends Activity {
    private static final String TALK_PACKAGE = "com.kakao.talk";
    private static final String LOGIN_ACTION = "com.kakao.talk.intent.action.CAPRI_LOGGED_IN_ACTIVITY";
    static final int USE_BROWSER = RESULT_FIRST_USER;
    static final int FAILED = RESULT_FIRST_USER + 1;
    private String state, browserUrl, launchUrl, callbackUrl, returnUrl;
    private WebView authView;
    private boolean openedTalk;
    private final Runnable expire = () -> complete(FAILED);

    static boolean available(PackageManager packages) {
        return new Intent(LOGIN_ACTION).setPackage(TALK_PACKAGE).resolveActivity(packages) != null;
    }

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        state = getIntent().getStringExtra("state");
        String origin = getIntent().getStringExtra("origin");
        long remaining = getIntent().getLongExtra("expires", 0) - System.currentTimeMillis();
        // An external callback can clear this activity before MainActivity receives its new intent.
        // Only an explicit back action should cancel the pending login in that case.
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, () -> complete(RESULT_CANCELED));
        }
        if (saved != null || state == null || !state.matches("[A-Za-z0-9_-]{43}") ||
            origin == null || !origin.startsWith("https://") || remaining <= 0) {
            complete(FAILED);
            return;
        }
        browserUrl = origin + "/api/auth/kakao/authorize?state=" + state;
        launchUrl = browserUrl + "&talk=1";
        callbackUrl = origin + "/api/auth/kakao/callback";
        returnUrl = origin + "/api/auth/kakao/app-return#";
        authView = new WebView(this);
        authView.getSettings().setUserAgentString(authView.getSettings().getUserAgentString() + " AiadcastKakaoReturn/1");
        authView.getSettings().setJavaScriptEnabled(true);
        authView.getSettings().setAllowFileAccess(false);
        authView.getSettings().setAllowContentAccess(false);
        authView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return true;
                Uri uri = request.getUrl();
                String url = uri.toString();
                if (launchUrl.equals(view.getUrl()) && "intent".equals(uri.getScheme())) {
                    launchTalk(url);
                    return true;
                }
                // Older servers redirect every launch to the account form. Open that flow in the default browser.
                if (browserUrl.equals(url) || url.startsWith("https://kauth.kakao.com/oauth/authorize?")) {
                    if (!acceptCallbackCookie()) complete(USE_BROWSER);
                    return true;
                }
                if (url.startsWith(callbackUrl + "?") && state.equals(uri.getQueryParameter("state"))) return false;
                if (acceptReturn(url)) return true;
                complete(FAILED);
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                acceptReturn(url);
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (url.startsWith(callbackUrl + "?") || url.startsWith(returnUrl)) {
                    if (!acceptReturn(url)) acceptCallbackCookie();
                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && !acceptCallbackCookie()) complete(FAILED);
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && !acceptCallbackCookie()) complete(FAILED);
            }
        });
        authView.setFitsSystemWindows(true);
        setContentView(authView);
        authView.postDelayed(expire, remaining);
        authView.loadUrl(launchUrl);
    }

    @Override protected void onResume() {
        super.onResume();
        if (callbackUrl != null) acceptCallbackCookie();
    }

    private boolean acceptCallbackCookie() {
        String cookies = CookieManager.getInstance().getCookie(callbackUrl);
        if (cookies == null) return false;
        String name = "__Host-aiadcast-kakao-return=";
        for (String cookie : cookies.split(";")) {
            String item = cookie.trim();
            if (item.startsWith(name) && acceptReturn(returnUrl + item.substring(name.length()))) return true;
        }
        return false;
    }

    private boolean acceptReturn(String url) {
        String appLink = BuildConfig.APPLICATION_ID + "://kakao/return#";
        String fragment = matchingReturn(url, returnUrl, appLink, state);
        if (fragment == null) return false;
        if (!isFinishing() && !isDestroyed()) {
            setResult(RESULT_OK, resultIntent().setAction(Intent.ACTION_VIEW).setData(Uri.parse(appLink + fragment)));
            finish();
        }
        return true;
    }

    static String matchingReturn(String url, String httpsPrefix, String appPrefix, String state) {
        if (url == null) return null;
        String prefix = url.startsWith(httpsPrefix) ? httpsPrefix : appPrefix;
        if (!url.startsWith(prefix + state + ".")) return null;
        String fragment = url.substring(prefix.length());
        return fragment.substring(state.length() + 1).matches("[A-Za-z0-9_-]{43}") ? fragment : null;
    }

    private void launchTalk(String url) {
        if (openedTalk) return;
        try {
            Intent request = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
            String extra = "com.kakao.sdk.talk.";
            if (!LOGIN_ACTION.equals(request.getAction()) || !state.equals(request.getStringExtra(extra + "state")) ||
                !callbackUrl.equals(request.getStringExtra(extra + "redirectUri"))) {
                complete(FAILED);
                return;
            }
            Intent talk = new Intent(LOGIN_ACTION).setPackage(TALK_PACKAGE);
            for (String field : new String[]{"appKey", "redirectUri", "kaHeader", "extraparams", "state"})
                talk.putExtra(extra + field, request.getStringExtra(extra + field));
            startActivity(talk);
            openedTalk = true;
        } catch (ActivityNotFoundException unavailable) {
            complete(USE_BROWSER);
        } catch (Exception invalid) {
            complete(FAILED);
        }
    }

    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() { complete(RESULT_CANCELED); }

    private Intent resultIntent() { return new Intent().putExtra("state", state); }
    private void complete(int result) {
        if (isFinishing() || isDestroyed()) return;
        setResult(result, resultIntent());
        finish();
    }
    @Override protected void onDestroy() {
        if (authView != null) {
            authView.removeCallbacks(expire);
            android.view.ViewGroup parent = (android.view.ViewGroup) authView.getParent();
            if (parent != null) parent.removeView(authView);
            authView.destroy();
        }
        super.onDestroy();
    }
}
