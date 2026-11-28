package com.selluplabs.aiadcast.next;

import java.net.URI;
import java.util.Locale;

/** Preview-only public server configuration; no secrets, paths or private network hosts. */
public final class TestServerOrigin {
    private TestServerOrigin() {}
    public static String normalize(String value) {
        if (value == null) throw new IllegalArgumentException("HTTPS_ORIGIN_REQUIRED");
        String input = value.trim();
        if (input.isEmpty()) return "";
        if (input.length() > 300) throw new IllegalArgumentException("HTTPS_ORIGIN_REQUIRED");
        try {
            URI uri = new URI(input);
            String host = uri.getHost();
            int port = uri.getPort();
            if (!"https".equals(uri.getScheme()) || host == null || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null
                || (!uri.getPath().isEmpty() && !"/".equals(uri.getPath()))
                || port == 0 || port > 65535) throw new IllegalArgumentException();
            host = host.toLowerCase(Locale.ROOT);
            if (!host.matches("[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?") || !host.contains(".")
                || host.contains("..") || host.matches("[0-9.]+")
                || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new IllegalArgumentException();
            return "https://" + host + (port == -1 || port == 443 ? "" : ":" + port);
        } catch (Exception error) { throw new IllegalArgumentException("HTTPS_ORIGIN_REQUIRED"); }
    }
}
