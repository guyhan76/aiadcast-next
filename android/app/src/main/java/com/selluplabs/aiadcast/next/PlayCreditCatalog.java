package com.selluplabs.aiadcast.next;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

final class PlayCreditCatalog {
    private PlayCreditCatalog() {}

    static final List<String> ON_SALE = Collections.unmodifiableList(Arrays.asList("topup_50", "topup_100", "topup_250", "topup_500"));

    static boolean canRestore(String productId) {
        // The 180-credit pack is retired, but outstanding purchases still need delivery.
        return ON_SALE.contains(productId) || "credits_100".equals(productId) || "credits_30".equals(productId) || "credits_180".equals(productId);
    }
}
