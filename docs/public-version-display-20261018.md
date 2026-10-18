# Public app version display — 2026-10-18

Base: PR38 `7c8b60a933c836a36a17018b6796b7d6a2e39371`. Branch: `fix/public-version-badge-20261018`.

The previous badge lived inside AccountBar, which returns nothing without a session. Neither the logged-out global header nor the login form included a version. Thus the earlier instruction to find it above the prelogin screen was incorrect, including in the delivered 0.2.39 APK. The delivered version does not prove which version the user installed.

The existing badge now appears exactly once beneath the common header, independent of login, with a 44px touch target and keyboard focus styling. Editor views without the common header still show it; standalone account/payment return screens show it beneath their brand heading. The account bar no longer duplicates it. Its existing public detail destination remains #credits; unauthenticated users can read build metadata, while CreditsPage continues to skip private balance requests without a session. Explicit Back and Android back return to the originating workspace screen; a direct detail entry returns home. No authentication rule changed.

Native version/code/package come from Android BuildConfig via the existing bridge, not the backend. Bundled web version/commit and server version/commit remain separate. Server errors never erase the native version or become an invented server value. Without native metadata the badge honestly shows the web version, including late bridge updates.

Demo APK candidate: 0.2.40-demo, versionCode 42, same package and signer. This client UI fix works without a server deployment. PR38's server-side industry prompts still require a future authorized deployment. The approved beauty source transfer remains unresolved; existing gallery assets are unchanged. No paid generation, credentials, DB, auth policy, production deployment or contractor-service changes.

Regression coverage includes 320/390px logged-out home/create/projects/guide/login, standalone account return screens, a single badge across session changes, public detail with server failure and no account reads, UI/native/browser Back, authenticated detail, web fallback and late native bridge. Local mocks do not establish the version installed on the user's phone.
