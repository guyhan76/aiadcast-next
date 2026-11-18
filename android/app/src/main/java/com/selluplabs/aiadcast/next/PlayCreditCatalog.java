package com.selluplabs.aiadcast.next;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

final class PlayCreditCatalog {
    private PlayCreditCatalog() {}

    static final List<String> ON_SALE = Collections.unmodifiableList(Arrays.asList("credits_30", "credits_100"));

    static boolean canRestore(String productId) {
        // The 180-credit pack is retired, but outstanding purchases still need delivery.
        return ON_SALE.contains(productId) || "credits_180".equals(productId);
    }
}
