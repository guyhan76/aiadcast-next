# Administrator scrolling and generation evidence

Local-only follow-up on `98d5617090b5af56db3cfc79da994f557f86b643`. Its generation recovery and form changes are preserved.

## Reproduction and scope

The admin tables use `overflow:auto; overscroll-behavior:contain`, including vertical containment despite having no bounded vertical viewport. On the built baseline with 60 mock generation records at 390 and 768 CSS pixels, wheel input over a horizontal table moved the page **0 px**. Injecting only `overscroll-behavior-y:auto` into the same loaded page moved it **450 px** for the same wheel input. One overview read, zero writes. Evidence: `/tmp/admin-scroll-wheel-ab.log`.

This isolates a browser scroll-chain obstruction, not a demonstrated memory shortage, provider failure, image decode problem or React loop. Initial synthesized gesture checks also did not move, but the causality comparison uses wheel input. Final tests use individual CDP touch-start/move/end events and confirm page movement under 4x CPU throttling. Physical Android/WebView has not been tested.

## Minimal changes

- Horizontal table containment remains; vertical gestures can continue scrolling the page.
- Recent generation rows become labeled cards at <=900px. Timestamp, state, format, model, cost and error wrap within the screen. Desktop tables remain. Unknown cost is still `—`, not zero. Error/status values are not reinterpreted.
- React text escaping is unchanged. A literal `<script>` fixture is rendered as text; no injected script nodes appear.
- No upload processing, workspace persistence, authentication, provider, generation reconciliation, pricing, balance or DB code changed.

## Verification

- 20 focused browser cases passed, no skips: admin mobile scrolling and existing admin status/navigation specs, desktop/mobile projects, Korean/English and widths 390/768/1440. Covers touch movement, field bounds, repeated navigation, loading/timeout/error paths, coalesced reads, stale-response cancellation. Scrolling adds no overview requests, no writes and no child DOM mutations.
- Typecheck, build, generated cloud equivalence and isolation passed. No separate lint script is configured.
- Local rendered screenshots inspected. Logs: `/tmp/admin-scroll-final.log`, `/tmp/admin-cards-build.log`. This is not a full app suite or physical-device performance certification.

The production 11:17:25 uncertain job remains unresolved. This UI change makes evidence readable; it does not reset, retry or recover that job. No push, deployment, APK build, operational account/data changes or paid calls were performed.
