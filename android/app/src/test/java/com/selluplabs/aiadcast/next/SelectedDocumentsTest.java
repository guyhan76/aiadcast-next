package com.selluplabs.aiadcast.next;

import org.junit.Test;
import java.util.List;
import java.util.ArrayList;
import static org.junit.Assert.*;

public class SelectedDocumentsTest {
    @Test public void clipOnlyPhotoResultsAreReturnedInFull() {
        assertEquals(List.of("content://photos/1", "content://photos/2", "content://photos/3"),
            SelectedDocuments.collect(null, List.of("content://photos/1", "content://photos/2", "content://photos/3"), true));
    }
    @Test public void mixedResultsDeduplicateAndSingleFileImportStaysSingle() {
        assertEquals(List.of("content://files/1", "content://files/2"),
            SelectedDocuments.collect("content://files/1", List.of("content://files/1", "content://files/2"), true));
        assertEquals(List.of("content://files/1"),
            SelectedDocuments.collect(null, List.of("content://files/1", "content://files/2"), false));
    }
    @Test public void rejectedSchemesAndOversizedSelectionsCannotReachWebView() {
        List<String> clips = new ArrayList<>(List.of("https://example.com/image", "file:///private/file", "content:bad", "bad uri"));
        for (int i = 0; i < 12; i++) clips.add("content://photos/" + i);
        List<String> result = SelectedDocuments.collect(null, clips, true);
        assertEquals(10, result.size());
        assertEquals("content://photos/0", result.get(0));
        assertEquals("content://photos/9", result.get(9));
        assertTrue(SelectedDocuments.collect(null, null, true).isEmpty());
    }
}
