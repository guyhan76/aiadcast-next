package com.selluplabs.aiadcast.next;

import org.junit.Test;
import static org.junit.Assert.*;

public class TestServerOriginTest {
    @Test public void acceptsOnlyPublicOriginsAndNormalizesDefaultPort() {
        assertEquals("https://beta.example.com", TestServerOrigin.normalize(" https://BETA.example.com:443/ "));
        assertEquals("https://beta.example.com:8443", TestServerOrigin.normalize("https://beta.example.com:8443"));
        assertEquals("", TestServerOrigin.normalize(""));
    }
    @Test public void rejectsCredentialsPathsQueriesAndPrivateHosts() {
        for (String value : new String[]{"http://beta.example.com", "https://u:p@beta.example.com", "https://beta.example.com/path", "https://beta.example.com/?key=x", "https://beta.example.com/#x", "https://127.0.0.1", "https://[::1]", "https://10.0.0.1", "https://localhost", "https://x.local", "https://x.internal", "https://x..com", "https://beta.example.com:0", "https://beta.example.com:65536"}) {
            try { TestServerOrigin.normalize(value); fail(value); } catch (IllegalArgumentException expected) { }
        }
    }
}
