package com.selluplabs.aiadcast.next;
/** Only the demo checkout wake-up signal. Never accepts parameters or navigation targets. */
public final class CheckoutReturnPolicy {
    private CheckoutReturnPolicy() {}
    public static boolean valid(String value) { return "aiadcast-demo://checkout/return".equals(value); }
}
