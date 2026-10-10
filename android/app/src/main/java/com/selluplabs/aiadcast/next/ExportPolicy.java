package com.selluplabs.aiadcast.next;

import java.nio.charset.StandardCharsets;

/** Pure validation logic. Only user-created PNG images and project JSON leave the app. */
public final class ExportPolicy {
    public static final int MAX_BYTES = 32 * 1024 * 1024;
    private ExportPolicy() {}

    public static boolean supportsMime(String mime) {
        return "image/png".equals(mime) || "application/json".equals(mime);
    }

    public static String safeFilename(String name, String mime) {
        if (!supportsMime(mime)) throw new IllegalArgumentException("Unsupported file type");
        String extension = "image/png".equals(mime) ? ".png" : ".json";
        String cleaned = name == null ? "aiadcast" : name.replaceAll("[\\\\/\\p{Cntrl}:*?\"<>|]", "_");
        cleaned = cleaned.replaceAll("^\\.+", "").trim();
        if (cleaned.isEmpty()) cleaned = "aiadcast";
        if (cleaned.length() > 100) cleaned = cleaned.substring(0, 100);
        if (!cleaned.toLowerCase(java.util.Locale.ROOT).endsWith(extension)) cleaned += extension;
        return cleaned;
    }

    public static boolean validContent(byte[] bytes, String mime) {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_BYTES || !supportsMime(mime)) return false;
        if ("image/png".equals(mime)) {
            byte[] signature = {(byte)137, 80, 78, 71, 13, 10, 26, 10};
            if (bytes.length < signature.length) return false;
            for (int i = 0; i < signature.length; i++) if (bytes[i] != signature[i]) return false;
            return true;
        }
        String text = new String(bytes, StandardCharsets.UTF_8).trim();
        return text.startsWith("{") && text.endsWith("}");
    }
}
