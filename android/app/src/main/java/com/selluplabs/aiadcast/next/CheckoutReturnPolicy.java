package com.selluplabs.aiadcast.next;

public final class CheckoutReturnPolicy {
    private CheckoutReturnPolicy() {}

    public static boolean valid(String value, String packageName) {
        if ("com.selluplabs.aiadcast.next.preview".equals(packageName)) {
            return "com.selluplabs.aiadcast.next.preview://checkout/return".equals(value);
        }
        return "com.selluplabs.aiadcast.next.demo".equals(packageName)
            && "aiadcast-demo://checkout/return".equals(value);
    }
}
