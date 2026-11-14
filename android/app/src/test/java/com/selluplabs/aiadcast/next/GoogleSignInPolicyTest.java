package com.selluplabs.aiadcast.next;
import org.junit.Test;
import static org.junit.Assert.*;
public class GoogleSignInPolicyTest {
 private final String state="s".repeat(43),proof="p".repeat(43),origin="https://aiadcast-next.onrender.com",pkg="com.selluplabs.aiadcast.next.demo";
 private String url(){return "https://accounts.google.com/o/oauth2/v2/auth?state="+state+"&response_type=code&scope=openid%20email&prompt=select_account&code_challenge_method=S256&code_challenge="+proof+"&nonce="+proof+"&client_id=fixture&redirect_uri=https%3A%2F%2Faiadcast-next.onrender.com%2Fapi%2Fauth%2Fgoogle%2Fnative-callback";}
 @Test public void externalGoogleOnly(){assertTrue(GoogleSignInPolicy.start(url(),state,proof,2000,1000,origin,pkg));for(String bad:new String[]{url().replace("accounts.google.com","evil.example.com"),url().replace("https:","http:"),url()+"&state=other",url()+"#token",url().replace("S256","plain"),url().replace("native-callback","evil"),url().replace("openid%20email","drive"),"javascript:alert(1)"})assertFalse(GoogleSignInPolicy.start(bad,state,proof,2000,1000,origin,pkg));assertFalse(GoogleSignInPolicy.start(url(),state,proof,900,1000,origin,pkg));}
 @Test public void returnIsOnlyAFixedSignal(){assertTrue(GoogleSignInPolicy.returnUrl(pkg+"://google/return",pkg));for(String bad:new String[]{null,pkg+"://google/return?token=secret",pkg+"://google/return#code",pkg+"://google:443/return",pkg+"://evil/return",pkg+"://google/%72eturn","com.other://google/return"})assertFalse(GoogleSignInPolicy.returnUrl(bad,pkg));}
}
