package com.selluplabs.aiadcast.next;
import org.junit.Test;
import static org.junit.Assert.*;
public class CheckoutReturnPolicyTest {
 private static final String DEMO = "com.selluplabs.aiadcast.next.demo";
 private static final String PREVIEW = "com.selluplabs.aiadcast.next.preview";
 @Test public void previewReturnsOnlyToThePurchasingApp() {
  String url = PREVIEW + "://checkout/return";
  assertTrue(CheckoutReturnPolicy.valid(url, PREVIEW));
  assertFalse(CheckoutReturnPolicy.valid(url, DEMO));
  assertFalse(CheckoutReturnPolicy.valid("aiadcast-demo://checkout/return", PREVIEW));
  assertFalse(CheckoutReturnPolicy.valid(url, "com.selluplabs.aiadcast.next"));
  assertFalse(CheckoutReturnPolicy.valid(url + "?orderId=other", PREVIEW));
 }
 @Test public void fixedSignalOnly() {
  assertTrue(CheckoutReturnPolicy.valid("aiadcast-demo://checkout/return", DEMO));
  for(String value:new String[]{null,"https://evil.example", "aiadcast-demo://checkout/return?paymentKey=secret", "aiadcast-demo://checkout/return#token", "aiadcast-demo://evil/return", "aiadcast-demo://user@checkout/return", "aiadcast-demo://checkout:443/return", "aiadcast-demo://checkout/%72eturn", "aiadcast://checkout/return"})assertFalse(CheckoutReturnPolicy.valid(value, DEMO));
 }
}
