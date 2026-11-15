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

    public static String batchMime(String name) {
        if (name == null || !name.matches("aiadcast-[0-9a-f]{8}-[0-9]{2}\\.(png|jpg|webp)")) return null;
        if (name.endsWith(".png")) return "image/png";
        return name.endsWith(".jpg") ? "image/jpeg" : "image/webp";
    }

    public static boolean validBatchImage(String name, byte[] bytes) {
        String mime = batchMime(name);
        if (mime == null || bytes == null || bytes.length > MAX_BYTES) return false;
        if ("image/png".equals(mime)) return validContent(bytes, mime);
        if ("image/jpeg".equals(mime)) return bytes.length >= 3 &&
            (bytes[0] & 255) == 255 && (bytes[1] & 255) == 216 && (bytes[2] & 255) == 255;
        return bytes.length >= 12 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F' &&
            bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P';
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
