package com.selluplabs.aiadcast.next;
import org.junit.Test;
import static org.junit.Assert.*;
public class CheckoutReturnPolicyTest {
 @Test public void fixedSignalOnly() {
  assertTrue(CheckoutReturnPolicy.valid("aiadcast-demo://checkout/return"));
  for(String value:new String[]{null,"https://evil.example", "aiadcast-demo://checkout/return?paymentKey=secret", "aiadcast-demo://checkout/return#token", "aiadcast-demo://evil/return", "aiadcast-demo://user@checkout/return", "aiadcast-demo://checkout:443/return", "aiadcast-demo://checkout/%72eturn", "aiadcast://checkout/return"})assertFalse(CheckoutReturnPolicy.valid(value));
 }
}
