package com.selluplabs.aiadcast.next;

import android.app.Activity;
import com.android.billingclient.api.*;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.*;
import java.util.function.Consumer;

final class PlayCreditBilling implements PurchasesUpdatedListener {
    private final Activity activity;
    private final Consumer<JSONObject> sink;
    private final BillingClient client;
    private final Map<String, ProductDetails> products = new HashMap<>();
    private final Map<String, ProductDetails.OneTimePurchaseOfferDetails> offers = new HashMap<>();
    private final List<Consumer<BillingResult>> waiting = new ArrayList<>();
    private boolean connecting, closed;

    PlayCreditBilling(Activity activity, Consumer<JSONObject> sink) {
        this.activity = activity;
        this.sink = sink;
        client = BillingClient.newBuilder(activity).setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection().build();
    }

    private static JSONObject json(Object... pairs) {
        JSONObject data = new JSONObject();
        try {
            for (int i=0; i<pairs.length; i+=2) data.put((String)pairs[i], pairs[i+1]);
        } catch (JSONException invalid) { throw new IllegalStateException(invalid); }
        return data;
    }
    private void emit(JSONObject event) {
        activity.runOnUiThread(() -> { if (!closed && !activity.isDestroyed()) sink.accept(event); });
    }
    private void report(BillingResult result) {
        emit(json("type", result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED ? "cancelled" : "error"));
    }
    private void ready(Runnable action) {
        ready(action, this::report);
    }
    private void ready(Runnable action, Consumer<BillingResult> onFailure) {
        if (closed) return;
        if (client.isReady()) { action.run(); return; }
        waiting.add(result -> {
            if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) action.run();
            else onFailure.accept(result);
        });
        if (connecting) return;
        connecting = true;
        client.startConnection(new BillingClientStateListener() {
            public void onBillingSetupFinished(BillingResult result) {
                activity.runOnUiThread(() -> {
                    connecting = false;
                    List<Consumer<BillingResult>> actions = new ArrayList<>(waiting);
                    waiting.clear();
                    if (closed) return;
                    for (Consumer<BillingResult> next : actions) next.accept(result);
                });
            }
            public void onBillingServiceDisconnected() { /* Reconnect at the next request. */ }
        });
    }
    void handle(JSONObject request) {
        switch (request.optString("type")) {
            case "play-catalog": ready(this::catalog); break;
            case "play-restore": restore(request.optString("requestId")); break;
            case "play-buy":
                String id = request.optString("product"), account = request.optString("account");
                if (PlayCreditCatalog.ON_SALE.contains(id) && account.matches("[0-9a-f]{64}")) ready(() -> buy(id, account));
                break;
            default: break;
        }
    }
    private void catalog() {
        List<QueryProductDetailsParams.Product> query = new ArrayList<>();
        for (String id : PlayCreditCatalog.ON_SALE) query.add(QueryProductDetailsParams.Product.newBuilder()
            .setProductId(id).setProductType(BillingClient.ProductType.INAPP).build());
        client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(query).build(), (result, response) ->
            activity.runOnUiThread(() -> {
                if (closed) return;
                products.clear();
                offers.clear();
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { report(result); return; }
                JSONArray available = new JSONArray();
                for (ProductDetails item : response.getProductDetailsList()) {
                    List<ProductDetails.OneTimePurchaseOfferDetails> details = item.getOneTimePurchaseOfferDetailsList();
                    if (details == null) continue;
                    for (ProductDetails.OneTimePurchaseOfferDetails offer : details) {
                        if (!"KRW".equals(offer.getPriceCurrencyCode()) || offer.getOfferId() != null) continue;
                        offers.put(item.getProductId(), offer);
                        products.put(item.getProductId(), item);
                        available.put(json("id", item.getProductId(), "price", offer.getFormattedPrice()));
                        break;
                    }
                }
                emit(json("type", "catalog", "products", available));
            }));
    }
    private void buy(String id, String account) {
        ProductDetails item = products.get(id);
        ProductDetails.OneTimePurchaseOfferDetails offer = offers.get(id);
        if (item == null || offer == null) { emit(json("type","error")); return; }
        BillingFlowParams.ProductDetailsParams.Builder choice = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(item);
        if (offer.getOfferToken() != null) choice.setOfferToken(offer.getOfferToken());
        BillingResult result = client.launchBillingFlow(activity, BillingFlowParams.newBuilder()
            .setObfuscatedAccountId(account).setProductDetailsParamsList(Collections.singletonList(choice.build())).build());
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            report(result);
            if (result.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) restore();
        }
    }
    void restore() {
        restore("");
    }
    private void restore(String requestId) {
        ready(() -> client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
            (result, purchases) -> {
                boolean ok = result.getResponseCode() == BillingClient.BillingResponseCode.OK;
                if (ok) deliver(purchases);
                finishRestore(requestId, ok);
            }), failure -> finishRestore(requestId, false));
    }
    private void finishRestore(String requestId, boolean ok) {
        if (!requestId.isEmpty()) emit(json("type", "restore-result", "requestId", requestId, "ok", ok));
    }
    @Override public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { report(result); return; }
        if (purchases != null) deliver(purchases);
    }
    private void deliver(List<Purchase> purchases) {
        for (Purchase purchase : purchases) {
            if (purchase.getProducts().size() != 1 || !PlayCreditCatalog.canRestore(purchase.getProducts().get(0))) continue;
            AccountIdentifiers ids = purchase.getAccountIdentifiers();
            if (ids == null || ids.getObfuscatedAccountId() == null) continue;
            if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED)
                emit(json("type","purchase","token",purchase.getPurchaseToken(),"account",ids.getObfuscatedAccountId()));
            else if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING)
                emit(json("type","pending","account",ids.getObfuscatedAccountId()));
        }
    }
    void close() { closed = true; waiting.clear(); client.endConnection(); }
}
