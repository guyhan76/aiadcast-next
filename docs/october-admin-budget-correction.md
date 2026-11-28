# October administrator budget correction

Approved 2026-10-24 15:01 UTC: the existing supported owner receives an October effective allocation of USD 5 instead of USD 4. The existing approved member retains USD 10; the observed effective aggregate becomes USD 15 instead of USD 14. This is internal request admission, not a provider deposit or a guaranteed per-call spending cap.

The pure policy requires the existing October approval and support pair, both created before the approval time, the exact existing supported-member ID, the server's active administrator role and owner identity, the approved member exception, and the original USD 4 computed allowance. Arbitrary administrators, new approval/support records, client-supplied claims, or changed identities do not receive it. It expires at 2026-11-01 00:00 UTC and leaves November/default allocations unchanged.

No persisted users.budget, approval/support records, credits, spent amounts, uncertain attempts or held amounts are rewritten. No money is transferred or provider request executed. Existing provider reservations remain USD 0.50. Repeated reads and old support/approval replays do not stack the correction. Server generation and the read-only administrator overview share the correction helper.

The October panel now displays the effective total including approved exceptions, rather than the old fixed USD 5 wording. Server policy works with existing APK 0.2.63/code65; that APK's bundled explanatory text remains old until a separately prepared APK update. No APK is packaged in this release.

Validation covers October approval boundary, October 31/November 1, existing support replay, owner/member accounting preservation, other administrators, identity/role changes, forged HTTP roles, and Korean/English desktop/mobile display. No production records or provider were used. Deployment must select the exact released SHA; the configured Render branch differs and auto-deploy is disabled.
