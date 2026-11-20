package com.selluplabs.aiadcast.next;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

/** Handles photo/document pickers that return data, ClipData, or both. */
final class SelectedDocuments {
    enum FileKind { PHOTOS, BACKUP, PHOTOS_AND_BACKUP }
    static FileKind fileKind(String[] acceptTypes) {
        boolean images = false, json = false;
        for (String group : acceptTypes) {
            if (group == null) continue;
            for (String raw : group.split(",")) {
                String type = raw.trim().toLowerCase(java.util.Locale.ROOT);
                if (type.equals("application/json") || type.equals(".json")) json = true;
                if (type.startsWith("image/") || type.matches("\\.(png|jpe?g|webp)")) images = true;
            }
        }
        if (!json) return FileKind.PHOTOS;
        return images ? FileKind.PHOTOS_AND_BACKUP : FileKind.BACKUP;
    }

    static List<String> collect(String single, List<String> clips, boolean multiple) {
        LinkedHashSet<String> selected = new LinkedHashSet<>();
        if (single != null) add(selected, single);
        if (clips != null) for (String value : clips) add(selected, value);
        List<String> result = new ArrayList<>(selected);
        int limit = multiple ? 10 : 1;
        return new ArrayList<>(result.subList(0, Math.min(result.size(), limit)));
    }
    private static void add(LinkedHashSet<String> values, String value) {
        if (value == null) return;
        try {
            URI uri = URI.create(value);
            if ("content".equals(uri.getScheme()) && uri.getRawAuthority() != null && !uri.getRawAuthority().isEmpty()) values.add(value);
        } catch (IllegalArgumentException ignored) { }
    }
}
