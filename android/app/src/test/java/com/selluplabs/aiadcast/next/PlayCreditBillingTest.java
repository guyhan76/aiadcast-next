package com.selluplabs.aiadcast.next;

import java.util.Arrays;
import org.junit.Test;
import static org.junit.Assert.*;

public class PlayCreditBillingTest {
    @Test public void retiredPackCanBeRestoredButOnlyCurrentPacksCanBeSold() {
        assertEquals(Arrays.asList("topup_50", "topup_100", "topup_250", "topup_500"), PlayCreditCatalog.ON_SALE);
        for (String product : PlayCreditCatalog.ON_SALE) {
            assertTrue(PlayCreditCatalog.canRestore(product));
        }
        assertTrue(PlayCreditCatalog.canRestore("credits_180"));
        assertFalse(PlayCreditCatalog.canRestore("unknown"));
    }
}
