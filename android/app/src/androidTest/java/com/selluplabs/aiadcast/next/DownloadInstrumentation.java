package com.selluplabs.aiadcast.next;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import java.util.concurrent.atomic.AtomicReference;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** Exercises the installed Preview's production batch handler and reopens the published gallery entries. */
public final class DownloadInstrumentation extends Instrumentation {
    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            Intent launch = new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            MainActivity activity = (MainActivity) startActivitySync(launch);
            String owner = "download-test-" + UUID.randomUUID();
            Method context = MainActivity.class.getDeclaredMethod("exportContext", String.class);
            Method receive = MainActivity.class.getDeclaredMethod("receiveBatch", JSONObject.class);
            Field executor = MainActivity.class.getDeclaredField("io");
            context.setAccessible(true);
            receive.setAccessible(true);
            executor.setAccessible(true);

            Bitmap image = Bitmap.createBitmap(8, 6, Bitmap.Config.ARGB_8888);
            image.eraseColor(0xff134abc);
            String[] extensions = {"png", "jpg", "webp"};
            String[] mimes = {"image/png", "image/jpeg", "image/webp"};
            Bitmap.CompressFormat[] formats = {Bitmap.CompressFormat.PNG, Bitmap.CompressFormat.JPEG, Bitmap.CompressFormat.WEBP};
            byte[][] bytes = new byte[3][];
            String[] names = new String[3];
            for (int i = 0; i < 3; i++) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                if (!image.compress(formats[i], 94, out)) throw new AssertionError("encode");
                bytes[i] = out.toByteArray();
                names[i] = "aiadcast-" + UUID.randomUUID().toString().substring(0, 8) + "-01." + extensions[i];
            }
            // A single tap, then a second transaction containing two files.
            runOnMainSync(() -> {
                try {
                    context.invoke(activity, owner);
                    for (int start : new int[]{0, 1}) {
                        String id = UUID.randomUUID().toString();
                        int count = start == 0 ? 1 : 2;
                        receive.invoke(activity, message(id, owner, "begin").put("mode", "save").put("count", count));
                        for (int i = 0; i < count; i++)
                            receive.invoke(activity, message(id, owner, "file").put("index", i).put("name", names[start + i])
                                .put("base64", Base64.encodeToString(bytes[start + i], Base64.NO_WRAP)));
                        receive.invoke(activity, message(id, owner, "finish"));
                    }
                } catch (Exception e) { throw new IllegalStateException(e); }
            });
            ((ExecutorService) executor.get(activity)).submit(() -> {}).get(30, TimeUnit.SECONDS);
            for (int i = 0; i < 3; i++) verify(activity.getContentResolver(), names[i], mimes[i], bytes[i]);
            verifyPrecisionPicker(activity);
            result.putString("picker", "photos and JSON in one document picker");
            runOnMainSync(activity::finish);
            result.putString("files", "3 originals reopened from Pictures/aiadcast");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable failure) {
            result.putString("failure", android.util.Log.getStackTraceString(failure));
            finish(Activity.RESULT_CANCELED, result);
        }
    }
    private void verifyPrecisionPicker(MainActivity activity) throws Exception {
        Field field = MainActivity.class.getDeclaredField("webView");
        field.setAccessible(true);
        WebView webView = (WebView) field.get(activity);
        AtomicReference<Intent> launched = new AtomicReference<>();
        ActivityMonitor monitor = new ActivityMonitor() {
            @Override public ActivityResult onStartActivity(Intent intent) {
                launched.set(new Intent(intent));
                return new ActivityResult(Activity.RESULT_CANCELED, null);
            }
        };
        addMonitor(monitor);
        try {
            runOnMainSync(() -> webView.getWebChromeClient().onShowFileChooser(webView, ignored -> {}, new WebChromeClient.FileChooserParams() {
                @Override public int getMode() { return MODE_OPEN; }
                @Override public String[] getAcceptTypes() { return new String[]{"image/png", "image/jpeg", "image/webp", "application/json", ".json"}; }
                @Override public boolean isCaptureEnabled() { return false; }
                @Override public CharSequence getTitle() { return null; }
                @Override public String getFilenameHint() { return null; }
                @Override public Intent createIntent() { return new Intent(Intent.ACTION_GET_CONTENT); }
            }));
        } finally { removeMonitor(monitor); }
        Intent intent = launched.get();
        if (intent == null || !Intent.ACTION_OPEN_DOCUMENT.equals(intent.getAction()) || !"*/*".equals(intent.getType())
                || intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, true) || !intent.hasCategory(Intent.CATEGORY_OPENABLE))
            throw new AssertionError("Expected a single document picker for photos and backups");
        String[] types = intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES);
        if (types == null || !Arrays.asList(types).containsAll(Arrays.asList("application/json", "image/png", "image/jpeg", "image/webp")))
            throw new AssertionError("Missing supported photo or backup types");
    }

    private static JSONObject message(String id, String owner, String op) throws Exception {
        return new JSONObject().put("id", id).put("owner", owner).put("op", op);
    }
    private static void verify(ContentResolver resolver, String name, String mime, byte[] expected) throws Exception {
        Uri gallery = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
        String[] columns = {"_id", "mime_type", "relative_path", "is_pending"};
        try (Cursor rows = resolver.query(gallery, columns, "_display_name=?", new String[]{name}, null)) {
            if (rows == null || !rows.moveToFirst()) throw new AssertionError("missing " + name);
            if (!mime.equals(rows.getString(1)) || !"Pictures/aiadcast/".equals(rows.getString(2)) || rows.getInt(3) != 0)
                throw new AssertionError("unpublished or wrong location: " + name);
            Uri item = ContentUris.withAppendedId(gallery, rows.getLong(0));
            try (InputStream input = resolver.openInputStream(item)) {
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] chunk = new byte[4096];
                int length;
                while ((length = input.read(chunk)) != -1) buffer.write(chunk, 0, length);
                byte[] actual = buffer.toByteArray();
                Bitmap decoded = BitmapFactory.decodeByteArray(actual, 0, actual.length);
                if (!Arrays.equals(expected, actual) || decoded == null || decoded.getWidth() != 8 || decoded.getHeight() != 6)
                    throw new AssertionError("wrong original: " + name);
            } finally { resolver.delete(item, null, null); }
        }
    }
}
