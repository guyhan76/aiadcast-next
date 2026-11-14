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
    private WebView webView;
    private ValueCallback<Uri[]> filePicker;
    private boolean filePickerMultiple;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private ExportJournal exportJournal;
    private volatile String exportOwner;
    private ExportJournal.Entry activeExport;
    private AlertDialog exportDialog;
    private DeferredSave deferredSave;
    private volatile WebRelease publishedWeb;
    private boolean assetErrorShown;
    private final ExecutorService webUpdates = Executors.newSingleThreadExecutor();
    private android.app.ProgressDialog webLoading;
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
        if (WebRelease.ORIGIN.equals(BuildConfig.API_ORIGIN)) settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
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
                            if ("export-context".equals(request.optString("type"))) { exportContext(request.optString("owner")); return; }
                            if ("google-sign-in".equals(request.optString("type"))) { openGoogle(request); return; }
                            if ("google-sign-in-clear".equals(request.optString("type"))) { clearGoogle(request.optString("state")); return; }
                            if ("configure-test-server".equals(request.optString("type"))) {
                                configureTestServer(request.getString("origin")); return;
                            }
                        } catch (Exception ignored) { /* Export validation handles other messages. */ }
                    }
                    if(data!=null&&data.startsWith("{\"type\":\"batch-export\",")&&data.length()<=(ExportPolicy.MAX_BYTES*4/3)+4096){
                        try{receiveBatch(new JSONObject(data));}catch(Exception invalid){toast(words("이미지 내보내기 오류","Image export failed"));}return;
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
                    WebRelease release = publishedWeb;
                    if (release != null) {
                        String path = url.getEncodedPath();
                        if (path == null || !path.startsWith("/") || !"GET".equals(request.getMethod())) return blocked(404, "Not found");
                        // Native version metadata belongs to the host APK, never to a remote page.
                        if (!"/native-build.json".equals(path)) {
                            try { return release.response(path.equals("/") ? "index.html" : path.substring(1)); }
                            catch (Exception unavailable) {
                                runOnUiThread(() -> showAssetError());
                                return blocked(503, "Web build unavailable");
                            }
                        }
                    }
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
        openCurrentWeb();
    }

    private void openCurrentWeb() {
        assetErrorShown = false;
        if (!WebRelease.ORIGIN.equals(BuildConfig.API_ORIGIN)) { openEditor(); return; }
        if (webLoading != null) webLoading.dismiss();
        webLoading = new android.app.ProgressDialog(this);
        webLoading.setMessage(words("최신 화면을 불러오는 중입니다.", "Opening the current version."));
        webLoading.setCancelable(false);
        webLoading.show();
        webUpdates.execute(() -> {
            try {
                WebRelease release = WebRelease.current(getApplicationContext());
                runOnUiThread(() -> {
                    if (isDestroyed() || isFinishing()) return;
                    webLoading.dismiss();
                    publishedWeb = release;
                    openEditor();
                });
            } catch (Exception unavailable) {
                runOnUiThread(() -> {
                    if (isDestroyed() || isFinishing()) return;
                    webLoading.dismiss();
                    showAssetError();
                });
            }
        });
    }

    private void openEditor() {
        webView.loadUrl(APP_ORIGIN + "/index.html" + (checkoutReturn(getIntent()) ? "#checkout-return" : ""));
    }

    private void showAssetError() {
        if (assetErrorShown || isDestroyed() || isFinishing()) return;
        assetErrorShown = true;
        new AlertDialog.Builder(this)
            .setMessage(words("최신 화면에 연결할 수 없습니다. 다시 시도하거나 이 기기에 설치된 버전을 여세요.",
                "The current version is unavailable. Retry or open the version installed on this device."))
            .setPositiveButton(words("다시 시도", "Retry"), (d,w) -> openCurrentWeb())
            .setNegativeButton(words("설치된 버전 열기", "Open installed version"), (d,w) -> { publishedWeb = null; openEditor(); })
            .setOnCancelListener(d -> assetErrorShown = false).show();
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
            // Explicit Chrome only: no package query or default-browser fallback.
            // The validated Google URL never contains the original-app proof.
            startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE).setPackage("com.android.chrome"));
        } catch (ActivityNotFoundException | SecurityException unavailable) {
            clearGoogle(request.optString("state"));
            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('aiadcast-google-open-failed',{detail:{code:'CHROME_UNAVAILABLE'}}));",null);
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

    private void exportContext(String owner) {
        if (owner == null || owner.isEmpty() || owner.length() > 512 || owner.matches(".*[\\p{Cntrl}].*")) return;
        String previous = exportOwner; exportOwner = owner;
        if (!owner.equals(previous)) {
            exportInProgress = false; activeExport = null;
            if (exportDialog != null) { exportDialog.dismiss(); exportDialog = null; }
        } else if (exportInProgress) return;
        final DeferredSave result = deferredSave; deferredSave = null;
        io.execute(() -> {
            try {
                journal().isolate(owner);
                if (!owner.equals(exportOwner)) return;
                if (result != null && journal().matches(result.code,owner)) { finishSave(result, owner); return; }
                ExportJournal.Entry entry = journal().recover(owner, System.currentTimeMillis());
                if (entry != null && !journal().writing(entry.id)) runOnUiThread(() -> {
                    if (owner.equals(exportOwner) && !exportInProgress && !isDestroyed()) chooseExport(entry, true);
                });
            } catch (Exception invalid) { runOnUiThread(() -> { if(owner.equals(exportOwner)) emit("error", words("이전 저장 파일을 복구하지 못했습니다. 보관된 광고에서 다시 저장해주세요.", "Could not recover the export file. Save again from your preserved ad.")); }); }
        });
    }
    private ExportJournal journal() throws java.io.IOException {
        if (exportJournal == null) exportJournal = new ExportJournal(new File(getCacheDir(), "exports"), new File(getFilesDir(), "export-request-sequence"));
        return exportJournal;
    }
    private void emitExport(String status, ExportJournal.Entry entry, String message) {
        if (!entry.owner.equals(exportOwner) || webView == null || isDestroyed()) return;
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('aiadcast-native-export',{detail:{status:"
            + JSONObject.quote(status) + ",requestId:" + JSONObject.quote(entry.id) + ",message:" + JSONObject.quote(message) + "}}));", null);
    }
    private void receiveExport(String message) {
        if (exportInProgress) { toast(words("현재 저장 또는 공유를 먼저 마쳐주세요.", "Finish the current export first.")); return; }
        if (exportOwner == null || message == null || message.length() > (ExportPolicy.MAX_BYTES * 4 / 3) + 4096) {
            emit("error", words("저장할 파일과 계정을 확인해주세요.", "Check the export file and account.")); return;
        }
        final String owner = exportOwner;
        exportInProgress = true;
        io.execute(() -> {
            try {
                JSONObject request = new JSONObject(message);
                if (!"export".equals(request.optString("type")) || !owner.equals(request.optString("owner"))) throw new IllegalArgumentException();
                if (!owner.equals(exportOwner)) return;
                ExportJournal.Entry previous = journal().recover(owner,System.currentTimeMillis());
                if (previous != null) { runOnUiThread(() -> chooseExport(previous,true)); return; }
                String mime=request.getString("mime");
                byte[] bytes=Base64.decode(request.getString("base64"),Base64.NO_WRAP);
                if (!ExportPolicy.validContent(bytes,mime)) throw new IllegalArgumentException();
                if ("application/json".equals(mime)) new JSONObject(new String(bytes,StandardCharsets.UTF_8));
                ExportJournal.Entry entry=journal().prepare(request.getString("requestId"),owner,request.optString("filename"),mime,bytes,System.currentTimeMillis());
                if (!owner.equals(exportOwner)) { journal().cancel(entry.id,true); return; }
                runOnUiThread(() -> chooseExport(entry,false));
            } catch (Exception invalid) { runOnUiThread(() -> { if(owner.equals(exportOwner)){ exportInProgress=false; emit("error",words("파일을 준비하지 못했습니다. 보관된 광고에서 다시 저장해주세요.","Could not prepare the file. Save again from your preserved ad.")); } }); }
        });
    }
    private void chooseExport(ExportJournal.Entry entry, boolean restored) {
        if (isFinishing() || isDestroyed() || !entry.owner.equals(exportOwner)) return;
        if (exportDialog != null) return;
        activeExport=entry;exportInProgress=true;
        emitExport("requested",entry,words("저장 또는 공유를 선택해주세요.","Choose saving or sharing."));
        exportDialog=new AlertDialog.Builder(this)
            .setTitle(restored?words("이전 저장 작업 이어하기","Resume previous export"):words("광고 파일 내보내기","Export your ad"))
            .setItems(new String[]{words("파일로 저장","Save to files"),words("다른 앱에 공유","Share to another app")},(dialog,which)->{
                exportDialog=null;
                io.execute(()->{
                    try {
                        if (!entry.owner.equals(exportOwner) || !journal().active(entry.id,entry.owner)) return;
                        if(which==0){
                            ExportJournal.Entry picking=journal().picking(entry.id,entry.owner,System.currentTimeMillis());
                            runOnUiThread(()->{
                                if(isDestroyed()||!entry.owner.equals(exportOwner))return;
                                activeExport=picking;
                                Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(entry.mime).putExtra(Intent.EXTRA_TITLE,entry.filename);
                                try {startActivityForResult(save,picking.code);}catch(ActivityNotFoundException error){exportFailure(entry);}
                            });
                        }else{
                            File file=journal().file(entry);
                            runOnUiThread(()->{
                                if(isDestroyed()||!entry.owner.equals(exportOwner))return;
                                try{
                                    Uri uri=FileProvider.getUriForFile(this,getPackageName()+".exports",file);
                                    Intent send=new Intent(Intent.ACTION_SEND).setType(entry.mime).putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                    send.setClipData(ClipData.newUri(getContentResolver(),entry.filename,uri));
                                    startActivity(Intent.createChooser(send,words("공유할 앱 선택","Share with")));
                                    io.execute(()->{try{journal().cancel(entry.id,false);}catch(Exception ignored){}});
                                    exportInProgress=false;activeExport=null;
                                    emitExport("share-opened",entry,words("공유할 앱에서 전송을 완료해주세요.","Finish sharing in the selected app."));
                                }catch(Exception error){exportFailure(entry);}
                            });
                        }
                    }catch(Exception error){runOnUiThread(()->exportFailure(entry));}
                });
            })
            .setOnCancelListener(dialog->{exportDialog=null;io.execute(()->{try{journal().cancel(entry.id,true);}catch(Exception ignored){}});exportInProgress=false;activeExport=null;emitExport("cancelled",entry,words("저장을 취소했습니다.","Export cancelled."));}).create();
        exportDialog.show();
    }
    private void exportFailure(ExportJournal.Entry entry) {
        if(!entry.owner.equals(exportOwner)||isDestroyed())return;
        exportInProgress=false;activeExport=null;
        emitExport("error",entry,words("저장하지 못했습니다. 다시 저장하면 이전 파일을 이어서 저장할 수 있습니다.","Could not save. Try saving again to resume the previous file."));
    }
    private static final class DeferredSave {
        final int code,result;final Uri uri;
        DeferredSave(int code,int result,Uri uri){this.code=code;this.result=result;this.uri=uri;}
    }
    private void finishSave(DeferredSave result,String owner) {
        ExportJournal.Entry entry=null;
        try {
            if(!owner.equals(exportOwner)||!journal().matches(result.code,owner))return;
            runOnUiThread(()->{if(owner.equals(exportOwner)&&exportDialog!=null){exportDialog.dismiss();exportDialog=null;}});
            if(result.result!=RESULT_OK||result.uri==null){
                entry=journal().recover(owner,System.currentTimeMillis());
                if(entry!=null){journal().cancel(entry.id,true);final ExportJournal.Entry cancelled=entry;runOnUiThread(()->{exportInProgress=false;activeExport=null;emitExport("cancelled",cancelled,words("저장을 취소했습니다.","Export cancelled."));});}return;
            }
            entry=journal().claim(result.code,owner,System.currentTimeMillis());if(entry==null)return;
            if(!"content".equals(result.uri.getScheme()))throw new java.io.IOException("Invalid picker destination");
            if(isDestroyed()||!owner.equals(exportOwner)||!journal().active(entry.id,owner))throw new java.io.IOException("Export cancelled");
            try(OutputStream output=getContentResolver().openOutputStream(result.uri,"wt")){
                if(output==null)throw new java.io.IOException("Destination unavailable");
                journal().copyTo(entry,output,()->!isDestroyed()&&owner.equals(exportOwner));
            }
            journal().finish(entry.id,true);
            final ExportJournal.Entry saved=entry;runOnUiThread(()->{if(owner.equals(exportOwner)){exportInProgress=false;activeExport=null;emitExport("saved",saved,words("파일을 저장했습니다.","File saved."));}});
        }catch(Exception error){
            if(entry!=null){try{journal().finish(entry.id,false);}catch(Exception ignored){}final ExportJournal.Entry failed=entry;runOnUiThread(()->exportFailure(failed));}
            else runOnUiThread(()->{if(owner.equals(exportOwner)){exportInProgress=false;emit("error",words("저장 파일을 확인하지 못했습니다. 보관된 광고에서 다시 저장해주세요.","Could not verify the export. Save again from your preserved ad."));}});
        }
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
        } else if (request >= 4096 && request < 65534) {
            DeferredSave returned=new DeferredSave(request,result,data==null?null:data.getData());
            if(exportOwner==null)deferredSave=returned;
            else {final String owner=exportOwner;io.execute(()->finishSave(returned,owner));}
        }
    }

    private static void copyStream(InputStream input, OutputStream output) throws java.io.IOException {
        byte[] buffer = new byte[16384];
        int count;
        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
    }
    private String batchId, batchOwner, batchMode;
    private int batchCount;
    private final List<File> batchFiles = new ArrayList<>();
    private File batchFolder;

    // The bridge streams one PNG at a time; even ten full-size images need only one decoded buffer.
    private void receiveBatch(JSONObject req) {
        final String id=req.optString("id"), owner=req.optString("owner");
        if (!id.matches("[0-9a-fA-F-]{36}") || !owner.equals(exportOwner)) return;
        io.execute(() -> {
            try {
                if (!owner.equals(exportOwner) || isDestroyed()) return;
                String op=req.getString("op");
                if ("begin".equals(op)) {
                    int count=req.getInt("count");String mode=req.getString("mode");
                    if (count<1 || count>10 || !("save".equals(mode)||"share".equals(mode))) throw new java.io.IOException();
                    // The web producer serializes actions. A new begin also recovers an abandoned run.
                    clearBatch(true);batchId=id;batchOwner=owner;batchMode=mode;batchCount=count;
                    batchFolder=new File(new File(getCacheDir(),"image-batches"),UUID.randomUUID().toString());
                    if(!batchFolder.mkdirs())throw new java.io.IOException();
                } else {
                    if(!id.equals(batchId)||!owner.equals(batchOwner))throw new java.io.IOException();
                    if("file".equals(op)){
                        if(req.getInt("index")!=batchFiles.size()||batchFiles.size()>=batchCount)throw new java.io.IOException();
                        String name=req.getString("name");if(!name.matches("aiadcast-[0-9a-f]{8}-[0-9]{2}\\.png"))throw new java.io.IOException();
                        byte[] bytes=Base64.decode(req.getString("base64"),Base64.DEFAULT);
                        if(!ExportPolicy.validContent(bytes,"image/png"))throw new java.io.IOException();
                        File f=new File(batchFolder,name);if(!f.createNewFile())throw new java.io.IOException();
                        try(OutputStream out=new FileOutputStream(f)){out.write(bytes);}batchFiles.add(f);
                    }else if("finish".equals(op)){
                        if(batchFiles.size()!=batchCount)throw new java.io.IOException();
                        if("save".equals(batchMode)){saveBatch(owner);clearBatch(true);}
                        else{
                            ArrayList<Uri> uris=new ArrayList<>();
                            for(File file:batchFiles)uris.add(FileProvider.getUriForFile(this,getPackageName()+".exports",file));
                            clearBatch(false);
                            runOnUiThread(()->{
                                if(!owner.equals(exportOwner)||isDestroyed())return;
                                try{
                                    Intent intent=new Intent(uris.size()>1?Intent.ACTION_SEND_MULTIPLE:Intent.ACTION_SEND).setType("image/png");
                                    if(uris.size()>1)intent.putParcelableArrayListExtra(Intent.EXTRA_STREAM,uris);else intent.putExtra(Intent.EXTRA_STREAM,uris.get(0));
                                    ClipData clip=ClipData.newRawUri("aiadcast",uris.get(0));
                                    for(int i=1;i<uris.size();i++)clip.addItem(new ClipData.Item(uris.get(i)));
                                    intent.setClipData(clip);intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                    startActivity(Intent.createChooser(intent,words("공유할 앱 선택","Share with")));batchReply(id,owner,true);
                                }catch(Exception e){batchReply(id,owner,false);}
                            });return;
                        }
                    }else if("cancel".equals(op))clearBatch(true);else throw new java.io.IOException();
                }
                batchReply(id,owner,true);
            }catch(Exception e){if(id.equals(batchId))clearBatch(true);batchReply(id,owner,false);}
        });
    }
    private void batchReply(String id,String owner,boolean ok) {
        runOnUiThread(()->{if(owner.equals(exportOwner)&&!isDestroyed())webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('aiadcast-batch-export',{detail:{id:"+JSONObject.quote(id)+",ok:"+ok+"}}))",null);});
    }
    private void saveBatch(String owner) throws java.io.IOException {
        ArrayList<Uri> pending=new ArrayList<>();
        try{
            for(File file:batchFiles){
                if(!owner.equals(exportOwner)||isDestroyed())throw new java.io.IOException();
                android.content.ContentValues row=new android.content.ContentValues();
                row.put(MediaStore.MediaColumns.DISPLAY_NAME,file.getName());row.put(MediaStore.MediaColumns.MIME_TYPE,"image/png");
                row.put(MediaStore.MediaColumns.RELATIVE_PATH,android.os.Environment.DIRECTORY_PICTURES+"/aiadcast");
                row.put(MediaStore.MediaColumns.IS_PENDING,1);
                Uri uri=getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,row);
                if(uri==null)throw new java.io.IOException();pending.add(uri);
                try(InputStream in=new FileInputStream(file);OutputStream out=getContentResolver().openOutputStream(uri)){
                    if(out==null)throw new java.io.IOException();copyStream(in,out);
                }
            }
            if(!owner.equals(exportOwner)||isDestroyed())throw new java.io.IOException();
            android.content.ContentValues done=new android.content.ContentValues();done.put(MediaStore.MediaColumns.IS_PENDING,0);
            for(Uri uri:pending)if(getContentResolver().update(uri,done,null,null)!=1)throw new java.io.IOException();
        }catch(Exception e){for(Uri uri:pending)getContentResolver().delete(uri,null,null);throw new java.io.IOException(e);}
    }
    private void clearBatch(boolean remove) {
        if(remove&&batchFolder!=null)removeBatchFolder(batchFolder);
        batchFiles.clear();batchFolder=null;batchId=null;batchOwner=null;
    }
    private void removeBatchFolder(File folder){
        File[] files=folder.listFiles();if(files!=null)for(File f:files)if(f.isFile())f.delete();
        folder.delete();
    }
    private void cleanOldExports() {
        io.execute(()->{File[] dirs=new File(getCacheDir(),"image-batches").listFiles();
            if(dirs!=null)for(File d:dirs)if(d.isDirectory()&&System.currentTimeMillis()-d.lastModified()>86400000L)removeBatchFolder(d);});
        io.execute(()->{try{journal().clean(System.currentTimeMillis());}catch(Exception ignored){}});
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
        if(exportDialog!=null){exportDialog.dismiss();exportDialog=null;}
        if (webLoading != null) webLoading.dismiss();
        webUpdates.shutdownNow(); webView.destroy(); io.shutdown(); super.onDestroy();
    }
}
