import {refundPolicyVersion} from '../src/refund-policy.ts';
import {createHash, createPrivateKey, sign} from 'node:crypto';
import {playOrderEvidence} from './play-order.mjs';
import {readFileSync} from 'node:fs';
import {ApiFailure} from './generation-service.mjs';

const packageName = 'com.selluplabs.aiadcast.next';
const publisher = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + packageName + '/';
const oauth = 'https://oauth2.googleapis.com/token';
const packs = new Map([['credits_30', 30], ['credits_100', 100], ['credits_180', 180]]);
const digest = value => createHash('sha256').update(value).digest('hex');
const unavailable = () => new ApiFailure('PLAY_VERIFICATION_UNAVAILABLE', 503);
export const playAccountId = id => digest(packageName + '/' + id);

export const playPolicyAccountId=id=>digest(packageName+'/'+id+'/'+refundPolicyVersion);
export function googlePlayProvider(env, fetchImpl = fetch, now = Date.now) {
  if (env.AIADCAST_PLAY_BILLING_ENABLED !== 'true') return undefined;
  const credentials = JSON.parse(readFileSync(env.AIADCAST_PLAY_SERVICE_ACCOUNT_FILE, 'utf8'));
  if (credentials.type !== 'service_account' || !credentials.client_email) throw Error('Invalid Play service account');
  const key = createPrivateKey(credentials.private_key);
  let access, expires = 0, refreshing;

  async function authorize() {
    if (access && now() < expires) return access;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const iat = Math.floor(now() / 1000);
      const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
      const data = encode({alg:'RS256',typ:'JWT'}) + '.' + encode({iss:credentials.client_email,
        scope:'https://www.googleapis.com/auth/androidpublisher', aud:oauth, iat, exp:iat+3600});
      const assertion = data + '.' + sign('RSA-SHA256',Buffer.from(data),key).toString('base64url');
      const response = await fetchImpl(oauth,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
        body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
      if (!response.ok) throw unavailable();
      const result = await response.json();
      if (typeof result.access_token !== 'string' || !Number.isFinite(result.expires_in)) throw unavailable();
      access = result.access_token;
      expires = now() + Math.max(0,result.expires_in-60)*1000;
      return access;
    })();
    try { return await refreshing; } finally { refreshing = undefined; }
  }
  async function request(path, method) {
    try {
      const response = await fetchImpl(publisher+path,{method,redirect:'error',signal:AbortSignal.timeout(10000),
        headers:{Authorization:'Bearer '+await authorize()}});
      if (response.status === 401) expires = 0;
      if (method === 'GET' && response.status === 404) throw new ApiFailure('PLAY_PURCHASE_NOT_FOUND',404);
      if (!response.ok) throw unavailable();
      return method === 'GET' ? await response.json() : undefined;
    } catch (error) { if (error instanceof ApiFailure) throw error; throw unavailable(); }
  }
  return {
    order: id => request('orders/'+encodeURIComponent(id),'GET'),
    lookup: token => request('purchases/productsv2/tokens/'+encodeURIComponent(token),'GET'),
    consume: (product,token) => request('purchases/products/'+encodeURIComponent(product)+'/tokens/'+encodeURIComponent(token)+':consume','POST')
  };
}

export async function verifyPlayPurchase(provider, userId, token, service) {
  if (!provider) throw new ApiFailure('PLAY_BILLING_UNAVAILABLE',503);
  if (typeof token !== 'string' || !token.length || token.length > 4096 || /[\s\x00-\x1f]/.test(token))
    throw new ApiFailure('INVALID_PURCHASE_TOKEN',400);
  const purchase = await provider.lookup(token);
  const acceptedPolicy=purchase?.obfuscatedExternalAccountId===playPolicyAccountId(userId);
  if (!acceptedPolicy && purchase?.obfuscatedExternalAccountId !== playAccountId(userId))
    throw new ApiFailure('PLAY_ACCOUNT_MISMATCH',403);
  const state = purchase.purchaseStateContext?.purchaseState;
  if (state === 'PENDING') return {state:'pending'};
  if (state !== 'PURCHASED') throw new ApiFailure('PLAY_PURCHASE_NOT_PAID',409);
  const items = purchase.productLineItem;
  const item = Array.isArray(items) && items.length === 1 ? items[0] : undefined;
  const credits = packs.get(item?.productId), offer = item?.productOfferDetails;
  const quantity = offer?.quantity ?? 1;
  if (!credits || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000 ||
      (offer?.refundableQuantity !== undefined && offer.refundableQuantity !== quantity))
    throw new ApiFailure('PLAY_PURCHASE_NOT_ELIGIBLE',409);
  const receipt = {purchaseId:'play:'+digest(token),credits:credits*quantity,unit:'credit-v2'};
  if (purchase.testPurchaseContext && service.customerImagesEnabled && !service.adminTestUnlimited)
    throw new ApiFailure('PLAY_TEST_PURCHASE_NOT_ELIGIBLE',409);
  receipt.livePlayPurchase=!purchase.testPurchaseContext;
  if(receipt.livePlayPurchase){
    receipt.product=item.productId;
    if(acceptedPolicy)receipt.refundPolicy=refundPolicyVersion;
    receipt.orderNo=purchase.orderId;
    receipt.purchasedAt=purchase.purchaseCompletionTime;
    if(provider.order){
      if(typeof purchase.orderId!=='string'||!purchase.orderId.trim())throw unavailable();
      const order=await provider.order(purchase.orderId);
      if(['REFUNDED','PARTIALLY_REFUNDED','PENDING_REFUND'].includes(order?.state))throw new ApiFailure('PLAY_PURCHASE_NOT_ELIGIBLE',409);
      try{receipt.evidence=playOrderEvidence(order,purchase.orderId,item.productId,token);}
      catch{throw unavailable();}
    }
  }
  if (offer?.consumptionState === 'CONSUMPTION_STATE_YET_TO_BE_CONSUMED') {
    await service.recordVerifiedPurchase(receipt);
    // If Play is unavailable after the DB commit, the next delivery uses the same ledger key.
    try {
      await provider.consume(item.productId,token);
    } catch (error) {
      // A concurrent consumer or a lost success response can leave Play already settled.
      const latest = await provider.lookup(token);
      const settled = latest?.productLineItem?.[0];
      if (latest?.obfuscatedExternalAccountId !== purchase.obfuscatedExternalAccountId ||
          latest?.purchaseStateContext?.purchaseState !== 'PURCHASED' ||
          settled?.productId !== item.productId ||
          settled?.productOfferDetails?.consumptionState !== 'CONSUMPTION_STATE_CONSUMED') throw error;
    }
  } else if (offer?.consumptionState !== 'CONSUMPTION_STATE_CONSUMED') {
    throw new ApiFailure('PLAY_PURCHASE_NOT_ELIGIBLE',409);
  }
  // For an already-consumed token a pre-existing local receipt is mandatory.
  return {state:'paid',...await service.verifiedPurchaseReceipt(receipt),
    ...(receipt.refundPolicy&&receipt.orderNo&&receipt.evidence?{policyReceipt:{
      orderNo:receipt.orderNo,ads:receipt.credits/10,purchasedAt:receipt.evidence.purchasedAt,
      currency:receipt.evidence.currency,paid:receipt.evidence.paid
    }}:{})};
}
