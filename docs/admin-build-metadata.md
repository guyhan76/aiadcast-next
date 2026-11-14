# Admin build identity

The administrator page distinguishes the installed Android package, the web code
currently executing inside that package (or the browser), and the responding
server. Their version numbers are not interchangeable.

- Vite injects `__AIADCAST_WEB_BUILD__` and emits the same `web-build.json`.
- The package version comes from package.json. A validated RENDER_GIT_COMMIT
  identifies a Render build; otherwise a local Git HEAD is used with an explicit
  dirty-worktree flag. Without either source the commit remains unavailable.
- Dockerfile.beta accepts RENDER_GIT_COMMIT as a build argument because the
  Docker build context does not copy .git. Release verification must confirm
  that the build platform supplied it; a runtime server commit must never be
  substituted for missing frontend metadata.
- Android preparation copies the web metadata into native-build.json alongside
  the existing package timestamp and web-asset digest. Existing APK metadata
  remains readable, but old APKs cannot acquire new bundled code from a server
  deployment.
- The server's /api/version remains an independent read-only source. A matching
  version number does not prove matching code or compatibility.

The default admin view keeps operational budgets, spending, holds and generation
failures visible. Build details, test payments and audit history are collapsible.
Historical photo evaluation tools are mounted only after their advanced section
is first opened; reopening it does not issue another initial read. This does not
activate AI recommendations or alter provider authorization or stored records.

This change requires a later frontend deployment for web users and a separately
authorized APK rebuild for installed users. No production migration is needed.

## Release-path verification (2026-10-25)

Read-only service inspection confirmed Docker runtime, context `.`, and
`Dockerfile.beta`; automatic deployment is off. The configured service branch
is still `feat/patent-product-generation-20261011`, not the candidate branch.
Any later deployment must select the approved exact commit.

Render documents RENDER_GIT_COMMIT as available at build time and Docker
variables as build arguments. The explicit ARG makes it visible to Vite.
The Docker build now rejects missing source metadata rather than publishing
another frontend with an unknown commit. No environment setting is added.

Android Demo/Preview builds run the same release metadata check after Vite and
before copying assets. The existing preparation test verifies that web identity
is copied unchanged into native-build.json and that missing metadata cannot
replace existing assets. No APK was built for this verification.

References: https://render.com/docs/docker and
https://render.com/docs/environment-variables (read 2026-10-25).
