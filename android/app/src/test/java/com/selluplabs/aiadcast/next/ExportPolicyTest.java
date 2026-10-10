package com.selluplabs.aiadcast.next;

import static org.junit.Assert.*;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public class ExportPolicyTest {
    @Test public void exportNamesCannotTraverseOrBecomeExecutable() {
        String filename = ExportPolicy.safeFilename("../../bad\nfile.apk", "image/png");
        assertFalse(filename.contains("/"));
        assertFalse(filename.startsWith("."));
        assertFalse(filename.contains("\n"));
        assertTrue(filename.endsWith(".png"));
        assertEquals("광고 피드.png", ExportPolicy.safeFilename("광고 피드.png", "image/png"));
    }
    @Test public void onlyExpectedFormatsCanBeExported() {
        assertTrue(ExportPolicy.validContent(new byte[]{(byte)137,80,78,71,13,10,26,10}, "image/png"));
        assertFalse(ExportPolicy.validContent("<html>".getBytes(StandardCharsets.UTF_8), "image/png"));
        assertTrue(ExportPolicy.validContent("{\"project\":1}".getBytes(StandardCharsets.UTF_8), "application/json"));
        assertFalse(ExportPolicy.validContent("javascript:alert(1)".getBytes(StandardCharsets.UTF_8), "application/json"));
        assertFalse(ExportPolicy.supportsMime("text/html"));
        assertFalse(ExportPolicy.validContent(new byte[ExportPolicy.MAX_BYTES + 1], "image/png"));
    }
}
