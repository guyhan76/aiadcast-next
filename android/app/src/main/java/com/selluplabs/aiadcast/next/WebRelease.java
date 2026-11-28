package com.selluplabs.aiadcast.next;

import android.content.Context;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceResponse;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Collections;
import java.util.Iterator;
import java.util.Locale;
import javax.net.ssl.HttpsURLConnection;

/** Serve the published web build under the existing WebView origin, preserving local projects. */
final class WebRelease {
    // UI bytes with native bridge privileges may come only from the company web frontend.
    static final String ORIGIN = "https://aiadcast-next.onrender.com";
    private static final int MAX_FILES = 3000;
    private static final int MAX_FILE = 32 * 1024 * 1024;
    private static final long CACHE_LIMIT = 180L * 1024 * 1024;
    private final File cache;
    private final JSONObject files;
    final String commit;

    private WebRelease(Context context, JSONObject manifest) throws IOException, JSONException {
        if (manifest.getInt("schema") != 1) throw new IOException("Unsupported web manifest");
        commit = manifest.getString("commit");
        files = manifest.getJSONObject("files");
        if (!commit.matches("[0-9a-f]{40}") || files.length() > MAX_FILES ||
            !files.has("index.html") || !files.has("web-build.json")) throw new IOException("Incomplete release");
        for (Iterator<String> keys = files.keys(); keys.hasNext();) {
            String name = keys.next();
            JSONObject entry = files.getJSONObject(name);
            if (!validName(name) || !entry.getString("sha256").matches("[0-9a-f]{64}") ||
                entry.getLong("size") < 0 || entry.getLong("size") > MAX_FILE)
                throw new IOException("Invalid release file");
        }
        cache = new File(context.getCacheDir(), "published-web-v1");
        if (!cache.isDirectory() && !cache.mkdirs() && !cache.isDirectory()) throw new IOException("Cache unavailable");
    }

    static boolean validName(String name) {
        if (name.length() > 300 || name.startsWith("/") || name.contains("..") ||
            name.contains("//") || name.startsWith("api/") || name.startsWith("native-")) return false;
        return name.matches("[a-zA-Z0-9_@][a-zA-Z0-9_./@-]*");
    }

    static WebRelease current(Context context) throws IOException, JSONException {
        // The query also busts immutable metadata cached by pre-parity web deployments.
        ByteArrayOutputStream manifest = new ByteArrayOutputStream();
        download("web-release.json?check=" + System.currentTimeMillis(), manifest, 1024 * 1024);
        WebRelease release = new WebRelease(context, new JSONObject(manifest.toString("UTF-8")));
        release.prune();
        return release;
    }

    private static void download(String name, OutputStream out, int limit) throws IOException {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(ORIGIN + "/" + name).openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(35000);
            if (connection.getResponseCode() != 200) throw new IOException("Web asset unavailable");
            try (InputStream input = connection.getInputStream()) {
                byte[] bytes = new byte[16384];
                int n, total = 0;
                while ((n = input.read(bytes)) != -1) {
                    total += n;
                    if (total > limit) throw new IOException("Oversized web asset");
                    out.write(bytes, 0, n);
                }
            }
        } finally {
            connection.disconnect();
        }
    }

    // Cache only content-addressed public application files. Never cache user data or API responses.
    private void prune() {
        File[] objects = cache.listFiles();
        if (objects == null) return;
        java.util.Arrays.sort(objects, (a,b) -> Long.compare(a.lastModified(), b.lastModified()));
        long total = 0;
        for (File f : objects) total += f.length();
        for (File f : objects) {
            if (total <= CACHE_LIMIT) break;
            long size = f.length();
            if (f.getName().matches("[0-9a-f]{64}") && f.delete()) total -= size;
        }
    }

    private static MessageDigest sha256() {
        try { return MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException impossible) { throw new AssertionError(impossible); }
    }

    private static String hex(byte[] value) {
        StringBuilder out = new StringBuilder(value.length * 2);
        for (byte b : value) out.append(String.format(Locale.ROOT, "%02x", b & 255));
        return out.toString();
    }

    private InputStream openFile(String name) throws IOException, JSONException {
        JSONObject entry = files.getJSONObject(name);
        String hash = entry.getString("sha256");
        int size = entry.getInt("size");
        File dest = new File(cache, hash);
        if (!dest.isFile() || dest.length() != size) {
            File temp = File.createTempFile("asset-", ".part", cache);
            try {
                MessageDigest digest = sha256();
                try (OutputStream out = new java.security.DigestOutputStream(Files.newOutputStream(temp.toPath()), digest)) {
                    download(name.startsWith("assets/") ? name : name + "?build=" + commit, out, size);
                }
                if (temp.length() != size || !hash.equals(hex(digest.digest()))) throw new IOException("Web version changed");
                Files.move(temp.toPath(), dest.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } finally { Files.deleteIfExists(temp.toPath()); }
        }
        return new FileInputStream(dest);
    }

    WebResourceResponse response(String name) throws IOException, JSONException {
        if (!validName(name) || !files.has(name)) {
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not found", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
        }
        String ext = name.substring(name.lastIndexOf('.') + 1);
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        if ("js".equals(ext) || "mjs".equals(ext)) mime = "text/javascript";
        if ("woff2".equals(ext)) mime = "font/woff2";
        if ("json".equals(ext)) mime = "application/json";
        if (mime == null) mime = "application/octet-stream";
        return new WebResourceResponse(mime, mime.startsWith("text/") ? "UTF-8" : null, 200, "OK",
            Collections.singletonMap("Cache-Control", "no-store"), openFile(name));
    }
}
