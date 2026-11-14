package com.selluplabs.aiadcast.next;
import java.net.URI;
import java.net.URLDecoder;
import java.util.HashMap;
import java.util.Map;
/** Pure validation for a system-browser launch and a credential-free wake-up. */
public final class GoogleSignInPolicy {
 private GoogleSignInPolicy() {}
 public static boolean returnUrl(String value,String packageId) {
  return value!=null&&value.equals(packageId+"://google/return");
 }
 public static boolean start(String url,String state,String proof,long expires,long now,String apiOrigin,String packageId) {
  try {
   if(!state.matches("[A-Za-z0-9_-]{43}")||!proof.matches("[A-Za-z0-9_-]{43}")||expires<=now||expires-now>610000)return false;
   if(!packageId.matches("com\\.selluplabs\\.aiadcast\\.next(?:\\.(?:demo|dev|preview))?"))return false;
   URI origin=new URI(apiOrigin);if(!"https".equals(origin.getScheme())||origin.getHost()==null||origin.getUserInfo()!=null||origin.getRawQuery()!=null||origin.getRawFragment()!=null||!origin.getPath().isEmpty())return false;
   URI u=new URI(url);if(!"https".equals(u.getScheme())||!"accounts.google.com".equals(u.getHost())||u.getPort()!=-1||u.getUserInfo()!=null||u.getRawFragment()!=null||!"/o/oauth2/v2/auth".equals(u.getRawPath()))return false;
   Map<String,String> q=new HashMap<>();for(String part:u.getRawQuery().split("&")){String[] p=part.split("=",2);if(p.length!=2)return false;String k=URLDecoder.decode(p[0],"UTF-8"),v=URLDecoder.decode(p[1],"UTF-8");if(q.put(k,v)!=null)return false;}
   return state.equals(q.get("state"))&&"code".equals(q.get("response_type"))&&"openid email".equals(q.get("scope"))&&"select_account".equals(q.get("prompt"))&&"S256".equals(q.get("code_challenge_method"))&&q.getOrDefault("code_challenge","").matches("[A-Za-z0-9_-]{43}")&&q.getOrDefault("nonce","").matches("[A-Za-z0-9_-]{43}")&&!q.getOrDefault("client_id","").isEmpty()&&(apiOrigin+"/api/auth/google/native-callback").equals(q.get("redirect_uri"));
  }catch(Exception invalid){return false;}
 }
}
