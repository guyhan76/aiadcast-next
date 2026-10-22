package com.selluplabs.aiadcast.next;

import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.ScriptHandler;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Offline editor host. Server authentication and Google Play Billing are separate release gates. */
public final class MainActivity extends ComponentActivity {
    private static final String APP_ORIGIN = "https://appassets.androidplatform.net";
    private static final int PICK_FILE = 71;
    private static final int SAVE_FILE = 72;
    private WebView webView;
    private ValueCallback<Uri[]> filePicker;
    private boolean filePickerMultiple;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private File pendingFile;
    private String pendingMime;
    private String pendingFilename;
    private String bridgeScript;
    private String bridgeSource;
    private volatile String apiOrigin;
    private ScriptHandler documentStartScript;
    private boolean bridgeReady;
    private boolean exportInProgress;

    private String words(String korean, String english) {
        return "ko".equals(Locale.getDefault().getLanguage()) ? korean : english;
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.WHITE);
        frame.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        webView = new WebView(this);
        frame.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // Only documents selected by the Android picker.
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);

        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        try (InputStream source = getAssets().open("native-bridge.js")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            copyStream(source, bytes);
            bridgeSource = new String(bytes.toByteArray(), StandardCharsets.UTF_8);
            apiOrigin = BuildConfig.API_ORIGIN;
            if (BuildConfig.ALLOW_TEST_CONFIG) {
                try { apiOrigin = TestServerOrigin.normalize(getPreferences(MODE_PRIVATE).getString("test-api-origin", apiOrigin)); }
                catch (IllegalArgumentException invalid) { apiOrigin = BuildConfig.API_ORIGIN; }
            }
            updateBridgeScript();
        } catch (Exception error) {
            bridgeScript = "";
            apiOrigin = BuildConfig.API_ORIGIN;
        }

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, "AiadcastNative", Collections.singleton(APP_ORIGIN),
                (view, message, origin, mainFrame, reply) -> {
                    if (!mainFrame || !APP_ORIGIN.equals(origin.toString())) return;
                    String data = message.getData();
                    if (data != null && data.length() <= 8192) {
                        try {
                            JSONObject request = new JSONObject(data);
                            if ("google-sign-in".equals(request.optString("type"))) { openGoogle(request); return; }
                            if ("google-sign-in-clear".equals(request.optString("type"))) { clearGoogle(request.optString("state")); return; }
                            if ("configure-test-server".equals(request.optString("type"))) {
                                configureTestServer(request.getString("origin")); return;
                            }
                        } catch (Exception ignored) { /* Export validation handles other messages. */ }
                    }
                    receiveExport(data);
                });
            bridgeReady = true;
            if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                documentStartScript = WebViewCompat.addDocumentStartJavaScript(webView, bridgeScript, Collections.singleton(APP_ORIGIN));
            }
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (sameOrigin(url, APP_ORIGIN)) {
                    WebResourceResponse local = assets.shouldInterceptRequest(url);
                    return local != null ? local : blocked(404, "Not found");
                }
                if (!apiOrigin.isEmpty() && sameOrigin(url, apiOrigin)) return null;
                return blocked(403, "Network origin is not configured");
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (sameOrigin(request.getUrl(), APP_ORIGIN)) return false;
                if (!request.isForMainFrame()) return true;
                if (!request.hasGesture()) return true;
                String scheme = request.getUrl().getScheme();
                if ("https".equals(scheme) || "mailto".equals(scheme) || "tel".equals(scheme)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); }
                    catch (ActivityNotFoundException ignored) { toast(words("이 링크를 열 앱이 없습니다.", "No app can open this link.")); }
                }
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (sameOrigin(Uri.parse(url), APP_ORIGIN) && bridgeReady) view.evaluateJavascript(bridgeScript, null);
                if (!bridgeReady) toast(words("저장 기능을 사용하려면 Android System WebView를 업데이트하세요.", "Update Android System WebView to use export."));
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame()) return;
                new AlertDialog.Builder(MainActivity.this).setTitle(words("앱 화면을 열지 못했습니다", "Could not open the app"))
                    .setMessage(words("다시 열어주세요. 저장한 프로젝트는 이 기기에 남아 있습니다.", "Try again. Saved projects remain on this device."))
                    .setPositiveButton(words("다시 열기", "Retry"), (dialog, which) -> webView.loadUrl(APP_ORIGIN + "/index.html"))
                    .setNegativeButton(words("닫기", "Close"), null).show();
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                view.destroy();
                recreate();
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> result, FileChooserParams parameters) {
                if (filePicker != null) filePicker.onReceiveValue(null);
                filePicker = result;
                String[] accepted = parameters.getAcceptTypes();
                boolean json = accepted.length == 1 && accepted[0].contains("json");
                filePickerMultiple = !json && parameters.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
                Intent fallback = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                    .setType(json ? "application/json" : "image/*")
                    .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, filePickerMultiple);
                if (!json) fallback.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/jpeg", "image/png", "image/webp"});
                Intent intent = fallback;
                if (!json && Build.VERSION.SDK_INT >= 33) {
                    intent = new Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*");
                    if (filePickerMultiple) intent.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, Math.min(10, MediaStore.getPickImagesMaxLimit()));
                }
                try { startActivityForResult(intent, PICK_FILE); }
                catch (ActivityNotFoundException error) {
                    try { startActivityForResult(fallback, PICK_FILE); }
                    catch (ActivityNotFoundException unavailable) {
                        filePicker.onReceiveValue(null); filePicker = null;
                        toast(words("파일 선택 앱을 열지 못했습니다.", "Could not open the document picker."));
                    }
                }
                return true;
            }
        });
        webView.setDownloadListener((url, userAgent, contentDisposition, mime, length) ->
            toast(words("앱의 PNG 또는 프로젝트 저장 버튼을 사용하세요.", "Use the app's PNG or project export button.")));
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { handleBack(); }
        });
        cleanOldExports();
        webView.loadUrl(APP_ORIGIN + "/index.html" + (checkoutReturn(getIntent()) ? "#checkout-return" : ""));
    }

    private boolean checkoutReturn(Intent intent) {
        return BuildConfig.APPLICATION_ID.equals("com.selluplabs.aiadcast.next.demo")
            && intent != null && Intent.ACTION_VIEW.equals(intent.getAction())
            && CheckoutReturnPolicy.valid(intent.getDataString());
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null && Intent.ACTION_VIEW.equals(intent.getAction()) && GoogleSignInPolicy.returnUrl(intent.getDataString(), BuildConfig.APPLICATION_ID)) {
            setIntent(intent); googleResume(); return;
        }
        if (checkoutReturn(intent)) {
            setIntent(intent);
            // A fixed wake-up signal only. No URLs, order identifiers or credentials enter JS.
            webView.evaluateJavascript("window.dispatchEvent(new Event('aiadcast-checkout-return'));", null);
        }
    }

    private static boolean sameOrigin(Uri uri, String allowed) {
        Uri origin = Uri.parse(allowed);
        return "https".equals(uri.getScheme()) && origin.getHost() != null && origin.getHost().equals(uri.getHost())
            && uri.getPort() == origin.getPort() && uri.getUserInfo() == null;
    }

    private void updateBridgeScript() {
        bridgeScript = "window.__AIADCAST_API_ORIGIN__=" + JSONObject.quote(apiOrigin)
            + ";window.__AIADCAST_NATIVE_VERSION__={versionName:" + JSONObject.quote(BuildConfig.VERSION_NAME)
            + ",versionCode:" + BuildConfig.VERSION_CODE + ",packageName:" + JSONObject.quote(BuildConfig.APPLICATION_ID) + "};"
            + "window.dispatchEvent(new Event('aiadcast-native-version'));"
            + "window.__AIADCAST_GOOGLE_NATIVE__={version:1,packageId:" + JSONObject.quote(BuildConfig.APPLICATION_ID) + ",pending:" + googlePending() + "};"
            + "window.__AIADCAST_TEST_CONNECTION__=" + BuildConfig.ALLOW_TEST_CONFIG + ";" + bridgeSource;
    }

    private String googlePending() {
        try {
            JSONObject flow = new JSONObject(getPreferences(MODE_PRIVATE).getString("google-flow", "{}"));
            if (flow.optLong("expires") <= System.currentTimeMillis() || !apiOrigin.equals(flow.optString("origin"))) {
                getPreferences(MODE_PRIVATE).edit().remove("google-flow").apply(); return "null";
            }
            return flow.toString();
        } catch (Exception invalid) { return "null"; }
    }
    private void refreshGoogleBridge() {
        updateBridgeScript();
        if (bridgeReady && WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            if (documentStartScript != null) documentStartScript.remove();
            documentStartScript = WebViewCompat.addDocumentStartJavaScript(webView, bridgeScript, Collections.singleton(APP_ORIGIN));
        }
    }
    private void clearGoogle(String state) {
        try {
            JSONObject pending = new JSONObject(googlePending());
            if (!state.equals(pending.optString("state"))) return;
            getPreferences(MODE_PRIVATE).edit().remove("google-flow").commit(); refreshGoogleBridge();
        } catch (Exception ignored) { }
    }
    private void openGoogle(JSONObject request) {
        try {
            String url=request.getString("url"), state=request.getString("state"), proof=request.getString("proof");
            long expires=request.getLong("expires");
            if (!GoogleSignInPolicy.start(url,state,proof,expires,System.currentTimeMillis(),apiOrigin,BuildConfig.APPLICATION_ID)) throw new IllegalArgumentException();
            try { if (state.equals(new JSONObject(googlePending()).optString("state"))) return; } catch (Exception absent) { }
            JSONObject flow=new JSONObject().put("state",state).put("proof",proof).put("expires",expires).put("native",true).put("origin",apiOrigin).put("owner",request.getString("owner"));
            if (!getPreferences(MODE_PRIVATE).edit().putString("google-flow",flow.toString()).commit()) throw new IllegalStateException();
            refreshGoogleBridge();
            // ACTION_VIEW leaves WebView. The Google page never receives the app proof.
            startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (Exception error) {
            clearGoogle(request.optString("state"));
            webView.evaluateJavascript("window.dispatchEvent(new Event('aiadcast-google-open-failed'));",null);
        }
    }
    private void googleResume() {
        if (webView != null && !"null".equals(googlePending()))
            webView.evaluateJavascript("window.dispatchEvent(new Event('aiadcast-google-return'));",null);
    }
    @Override protected void onResume() { super.onResume(); googleResume(); }

    private void configureTestServer(String value) {
        if (!BuildConfig.ALLOW_TEST_CONFIG || exportInProgress) {
            connectionError(); return;
        }
        try {
            String next = TestServerOrigin.normalize(value);
            if (!getPreferences(MODE_PRIVATE).edit().putString("test-api-origin", next).commit()) throw new IllegalStateException();
            apiOrigin = next;
            updateBridgeScript();
            if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                if (documentStartScript != null) documentStartScript.remove();
                documentStartScript = WebViewCompat.addDocumentStartJavaScript(webView, bridgeScript, Collections.singleton(APP_ORIGIN));
            }
            // Drop authentication/order grants on a server change. Local project DBs are retained.
            webView.evaluateJavascript("sessionStorage.clear();location.hash='home';location.reload();", null);
        } catch (Exception invalid) { connectionError(); }
    }

    private void connectionError() {
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('aiadcast-test-connection',{detail:{status:'error'}}));", null);
    }

    private static WebResourceResponse blocked(int code, String message) {
        return new WebResourceResponse("text/plain", "UTF-8", code, message, Collections.emptyMap(), new ByteArrayInputStream(message.getBytes(StandardCharsets.UTF_8)));
    }

    private void receiveExport(String message) {
        if (exportInProgress) { toast(words("먼저 현재 파일의 저장 또는 공유를 마쳐주세요.", "Finish the current export first.")); return; }
        if (message == null || message.length() > (ExportPolicy.MAX_BYTES * 4 / 3) + 2048) {
            emit("error", words("파일이 너무 큽니다.", "The file is too large.")); return;
        }
        exportInProgress = true;
        io.execute(() -> {
            try {
                JSONObject request = new JSONObject(message);
                if (!"export".equals(request.optString("type"))) throw new IllegalArgumentException("Invalid operation");
                String mime = request.getString("mime");
                String filename = ExportPolicy.safeFilename(request.optString("filename"), mime);
                byte[] bytes = Base64.decode(request.getString("base64"), Base64.NO_WRAP);
                if (!ExportPolicy.validContent(bytes, mime)) throw new IllegalArgumentException("Invalid export file");
                if ("application/json".equals(mime)) new JSONObject(new String(bytes, StandardCharsets.UTF_8));
                File folder = new File(getCacheDir(), "exports");
                if (!folder.exists() && !folder.mkdirs()) throw new IllegalStateException("Export directory unavailable");
                File file = new File(folder, UUID.randomUUID() + "-" + filename);
                try (FileOutputStream output = new FileOutputStream(file)) { output.write(bytes); }
                runOnUiThread(() -> chooseExport(file, mime, filename));
            } catch (Exception error) {
                runOnUiThread(() -> { exportInProgress = false; emit("error", words("파일을 준비하지 못했습니다. 다시 시도해주세요.", "Could not prepare the file. Please try again.")); });
            }
        });
    }

    private void chooseExport(File file, String mime, String filename) {
        if (isFinishing() || isDestroyed()) { file.delete(); return; }
        pendingFile = file; pendingMime = mime; pendingFilename = filename;
        new AlertDialog.Builder(this).setTitle(words("광고 파일 내보내기", "Export your ad"))
            .setItems(new String[]{words("파일로 저장", "Save to files"), words("다른 앱에 공유", "Share to another app")}, (dialog, which) -> {
                if (which == 0) {
                    Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE, filename);
                    try { startActivityForResult(save, SAVE_FILE); }
                    catch (ActivityNotFoundException error) { clearPending(true); emit("error", words("저장할 앱이 없습니다.", "No app can save this document.")); }
                } else {
                    Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".exports", file);
                    Intent send = new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    send.setClipData(ClipData.newUri(getContentResolver(), filename, uri));
                    try { startActivity(Intent.createChooser(send, words("공유할 앱 선택", "Share with"))); emit("share-opened", words("공유할 앱에서 전송을 완료해주세요.", "Finish sharing in the selected app.")); }
                    catch (ActivityNotFoundException error) { emit("error", words("공유할 앱이 없습니다.", "No app can share this file.")); }
                    clearPending(false); // Receiving apps may still read the granted cache file.
                }
            })
            .setOnCancelListener(dialog -> { clearPending(true); emit("cancelled", words("저장을 취소했습니다.", "Export cancelled.")); }).show();
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILE && filePicker != null) {
            ValueCallback<Uri[]> callback = filePicker; filePicker = null;
            Uri[] selected = null;
            if (result == RESULT_OK && data != null) {
                List<String> clips = new ArrayList<>();
                ClipData clip = data.getClipData();
                if (clip != null) for (int i = 0; i < clip.getItemCount(); i++) {
                    Uri uri = clip.getItemAt(i).getUri();
                    if (uri != null) clips.add(uri.toString());
                }
                List<String> uris = SelectedDocuments.collect(data.getData() == null ? null : data.getData().toString(), clips, filePickerMultiple);
                if (!uris.isEmpty()) {
                    selected = new Uri[uris.size()];
                    for (int i = 0; i < uris.size(); i++) selected[i] = Uri.parse(uris.get(i));
                }
            }
            callback.onReceiveValue(selected);
        } else if (request == SAVE_FILE && pendingFile != null) {
            if (result != RESULT_OK || data == null || data.getData() == null) {
                clearPending(true); emit("cancelled", words("저장을 취소했습니다.", "Export cancelled.")); return;
            }
            File source = pendingFile;
            Uri destination = data.getData();
            io.execute(() -> {
                boolean saved = false;
                try (InputStream input = new FileInputStream(source); OutputStream output = getContentResolver().openOutputStream(destination, "wt")) {
                    if (output == null) throw new IllegalStateException("Destination unavailable");
                    copyStream(input, output); saved = true;
                } catch (Exception ignored) {}
                boolean success = saved;
                runOnUiThread(() -> {
                    clearPending(true);
                    emit(success ? "saved" : "error", success ? words("파일을 저장했습니다.", "File saved.") : words("저장하지 못했습니다. 저장 공간을 확인해주세요.", "Could not save. Check available storage."));
                });
            });
        }
    }

    private void clearPending(boolean delete) {
        if (delete && pendingFile != null) pendingFile.delete();
        pendingFile = null; pendingFilename = null; pendingMime = null; exportInProgress = false;
    }
    private static void copyStream(InputStream input, OutputStream output) throws java.io.IOException {
        byte[] buffer = new byte[16384];
        int count;
        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
    }
    private void cleanOldExports() {
        File[] files = new File(getCacheDir(), "exports").listFiles();
        if (files != null) for (File file : files) if (file.isFile() && System.currentTimeMillis() - file.lastModified() > 24L * 60 * 60 * 1000) file.delete();
    }
    private void emit(String status, String message) {
        if (webView == null || isDestroyed()) return;
        toast(message);
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('aiadcast-native-export',{detail:{status:" + JSONObject.quote(status) + ",message:" + JSONObject.quote(message) + "}}))", null);
    }
    private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }
    private void handleBack() {
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('aiadcast-native-back',{cancelable:true}))", unhandled -> {
            if ("false".equals(unhandled)) return; // React handled a screen/modal transition.
            if (webView.canGoBack()) webView.goBack(); else finish();
        });
    }
    @Override protected void onDestroy() {
        if (filePicker != null) { filePicker.onReceiveValue(null); filePicker = null; }
        webView.destroy(); io.shutdown(); super.onDestroy();
    }
}
