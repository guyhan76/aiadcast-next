# Image contract foundation

This is an image-only internal boundary, not video support. No project-v1 JSON,
request fields, fingerprints, prices, wallet policies, account rules, or database
schemas are migrated. Legacy missing `mediaType` means image. Explicit `image`
is accepted but removed by normalization; unsupported values fail before job
reservation, idempotency writes or provider dispatch. Both local and generated
PostgreSQL service paths use this guard. A provider returning another media type
is uncertain, never delivered/captured as an image; its cost hold is retained.

`readAdInput` reads a detached snapshot: user-supplied product facts and photo
roles, requested copy and ad locale, and creative/conversation direction. Facts
are user assertions, not automatically verified truth. Original photo bytes stay
in the existing project. The image request builder consumes the snapshot without
changing serialized request bytes or key order. Historical image/creative-mode
semantics remain unchanged.

`readImageResultBoundary` separates requested text from generated visual identity
and human acceptance. Neither matching composition keys nor an accepted timestamp
proves pixel-perfect text or real-world product accuracy. AI-copy mode may produce
new copy; the input snapshot is not labelled final approval. Existing rendering,
text editing and human review remain responsible for the deliverable.

Compatibility evidence: four pre-change raw/normalized request SHA-256 fixtures
(original/creative, English/Korean), detached-read checks, v1 language/copy round
trip, unsupported-media no-write/no-dispatch and same-image replay checks, plus
existing account, ledger, failure/restart and cloud-isolation suites.

Future video work requires its own versioned artifact and execution contract,
durable provider status/cancellation reconciliation, private video storage and
playback, timed text/audio rendering and separately approved pricing. None is
exposed or enabled here. The current 20-project limit is unchanged.
