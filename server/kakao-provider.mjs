export function kakaoProvider(env, fetchImpl = fetch) {
  if (env.AIADCAST_KAKAO_ENABLED !== 'true') return;
  const {AIADCAST_KAKAO_APP_ID: appId, AIADCAST_KAKAO_JS_KEY: javascriptKey,
    AIADCAST_KAKAO_REST_KEY: restKey, AIADCAST_KAKAO_CLIENT_SECRET: clientSecret} = env;
  if (!/^[1-9]\d*$/.test(appId ?? '') || !javascriptKey || !restKey || !clientSecret) return;
  if (!URL.canParse(env.AIADCAST_BETA_PUBLIC_ORIGIN)) return;
  const origin = new URL(env.AIADCAST_BETA_PUBLIC_ORIGIN);
  if (origin.protocol !== 'https:' || origin.href !== origin.origin + '/') return;
  const redirectUri = origin.origin + '/?kakao=1';
  const callbackUri = new URL('/api/auth/kakao/callback', origin).href;
  return {
    javascriptKey, redirectUri, callbackUri,
    authorizationUrl(state) {
      const url = new URL('https://kauth.kakao.com/oauth/authorize');
      url.search = new URLSearchParams({
        client_id:restKey, redirect_uri:callbackUri, response_type:'code', prompt:'login', state
      }).toString();
      return url.href;
    },
    async subjectForCode(code, handoff = false) {
      if (typeof code !== 'string' || !code.length || code.length > 4096) throw Error('KAKAO_CODE_INVALID');
      const options = {redirect:'error', signal:AbortSignal.timeout(12000)};
      const exchange = await fetchImpl('https://kauth.kakao.com/oauth/token', {...options, method:'POST',
        body:new URLSearchParams({grant_type:'authorization_code', client_id:restKey, client_secret:clientSecret,
          redirect_uri:handoff ? callbackUri : redirectUri, code})});
      if (!exchange.ok) throw Error('KAKAO_CODE_INVALID');
      const {access_token:token} = await exchange.json();
      if (typeof token !== 'string' || !token || token.length > 4096 || /\s/.test(token)) throw Error('KAKAO_TOKEN_INVALID');
      const response = await fetchImpl('https://kapi.kakao.com/v1/user/access_token_info', {...options,
        headers:{Authorization:'Bearer ' + token}});
      if (!response.ok) throw Error('KAKAO_TOKEN_INVALID');
      // Kakao represents the service user ID as a JSON Long. Preserve its decimal spelling.
      const info = JSON.parse(await response.text(), (key, value, context) =>
        key === 'id' && typeof value === 'number' ? context.source : value);
      if (!Number.isSafeInteger(info.app_id) || String(info.app_id) !== appId ||
          !Number.isSafeInteger(info.expires_in) || info.expires_in <= 0 ||
          typeof info.id !== 'string' || !/^[1-9]\d{0,18}$/.test(info.id) ||
          BigInt(info.id) > 9223372036854775807n) throw Error('KAKAO_TOKEN_INVALID');
      return info.id;
    }
  };
}
