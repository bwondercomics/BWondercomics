# BWonderComics 0.8.5 → 1.0.0 — Audit & Roadmap

Status: Audit complete; roadmap active
Created: 2026-07-07 (repo-only + live-host audit at commit `cdc84f8`, branch `builder-incremental-improvement`)
Updated: 2026-08-01 for the shipped builder page history/recovery UI and the remaining
backup/restore-drill boundary. Original evidence anchors still point at the audit commit unless a
later note says otherwise.

Labels used throughout: **[C:code]** confirmed from code/docs · **[C:live]** confirmed on this host ·
**[I]** inferred · **[V]** needs live/admin verification.

Line numbers are anchors as of the audit date and will drift; re-verify before editing.

**Access note:** repo access plus host read access covered nearly everything (the audit ran
`npm test`, the backend suite, and the Playwright visual suite — all green — and inspected
systemd/docker/backup state directly). The only outstanding items marked **[V]** are: values in
`deploy/bwondercomics.env` (redacted _names/modes_ only, e.g. `REGISTRATION_MODE`, whether
`UMAMI_WEBSITE_ID` is set), and a handful of in-browser admin checks flagged below.

---

## 1. Executive summary

**Release readiness:** the 0.8.5 builder baseline and page-level recovery are complete, while the
store, disaster-recovery safety net, ops hardening, and broader 1.0 checks remain. The builder architecture is genuinely solid (shared
renderers, sanitize-on-save _and_ on-read, same-origin preview contract, published-only public
endpoints), and the completed builder closeout records 667 frontend tests, 131 backend tests, and 21
visual workflows across its final phase gates. Auth/comments/premium gating remain competently
hardened.

**Biggest blockers to 1.0.0, in order:**

1. **The store doesn't exist yet** — zero payment code in the repo (no Stripe SDK, no store
   models/routes) [C:code: `backend/requirements.txt`, `backend/app/models.py`]. The plan doc is
   excellent and security-correct; it's pure build work. This is the long pole.
2. **Operational trust was broken in three places at the audit snapshot** [C:live]: all backups
   lived on the same disk as the database, the diagnostics snapshot was stale because the refresh
   timer was never installed, and the ops worker was not running (queued commands would sit
   forever). A 2026-07-16 recheck found the 916G `/mnt/archive` drive mounted read-only with only
   three tiny legacy December 2025 archives, so the backup target is selected but not usable yet.
   None of these are feature work and together they remain roughly a day.
3. **Disaster recovery remains incomplete:** transactional page snapshots plus guarded current and
   deleted-page recovery are shipped, but validated off-primary-disk backup scheduling and isolated
   restore drills are still pending (details §2.1).

The former store scope fork is resolved: 1.0.0 ships one-time purchases with premium codes as the
subscription bridge. The first product is physical and uses simple server-controlled regional
flat-rate shipping. The completed 0.8.5 builder baseline is merged into `main`, which is now the
deployed branch.

**Biggest risks:** payment-flow mistakes (mitigated by the plan's hosted-Checkout approach — keep
it), single-disk data loss, and scope creep in the builder (Phases 5–7 are where "close to done"
can quietly become two more months).

**Shortest credible path:** implement
`docs/BUILDER_PAGE_SNAPSHOT_AND_BACKUP_HARDENING_PLAN.md` with the remaining one-day ops hardening
in parallel → build the Stripe-Checkout-only store per the existing plan → freeze everything else
at "verify + polish" level. Header glow and other small requests remain in the polish backlog.
Media redesign, PayPal, and social expansion all land post-1.0.

---

## 2. Audit by priority area

### 2.1 Page builder (priority 1)

**Current state.** Phases 0–7 of
`docs/completed-builder-plans/BUILDER_CUSTOMIZATION_ROADMAP.md` are implemented and
verified (panel/column consolidation closed, panel widths, module layout card, reader controls
bar + end-of-entry popup, header edit-in-place with the placement board retired, header/logo and
entry-picker customization, and account/links shell chrome as placeable blocks) [C:code+docs].
Deferred stragglers: universal module appearance (Phase 2), drag-resize gutters (Phase 1,
optional), and header-glow authoring (`docs/POLISH_BACKLOG_PLAN.md` Phase 13).

**0.8.5 corrective pass (implemented and manually closed 2026-07-16).** The builder's focused
responsive/public contract now covers reader-control default/primary/bar appearance and padding,
plus Feed wrapper size/alignment, with sparse Tablet/Phone branches rendered as public device CSS
from one ratio-banded media contract. Reader-panel `Hidden` collapses the real side shell;
the reader-owning column border targets the outer stage and takes precedence over the stock page
frame. Popup-arrow moves are draft-first and batch-save atomically. Save Page preserves publication
state; only explicit Publish/confirmed-Unpublish changes visibility. The builder verifies a
versioned authenticated API contract before module saves and keeps a draft dirty if the save
response drops an allowed responsive branch. Spacer height, Feed layout, and reader-control
appearance/padding have save/refetch plus preview/public coverage. Authoring uses one fixed preview
for each Desktop, Tablet, and Phone branch. Portrait Tablet/Phone readers stay on stable width
containment; rotating past the established `7/5` aspect-ratio boundary returns to Desktop layout
and its bounded-parent dynamic frame. This deliberately does **not** claim generic responsive
support for every future module field. Authenticated Pyre save/reload, panel hide/unhide, reader
border, arrow Save/Discard, Save Page, Publish/Unpublish, physical Phone/Tablet portrait, and
rotation checks all passed. Header glow remains a separate optional follow-up.

**0.8.5 structural closeout (implemented).** Refactor Phases A–G moved draft, section, selection,
inline-edit, and chrome state into focused owners; split module editors behind a registry; moved the
dual-use dependency closure into `shared/page-builder/`; split backend validation into the
`backend/app/builder_security/` package plus `reader_bindings.py`; added JS/Python schema parity and
shared-boundary tests; and divided the shell fixture into behavior-focused suites. The refactor is
behavior-preserving and has no remaining phase work.

**What works — and is worth trusting:**

- One shared render path for admin preview and public output
  (`shared/page-builder/shared-renderers.js`), consumed by both `reader/page-renderer.js` and the
  preview. Escaping is consistent; the audit found no XSS hole in any module renderer [C:code].
- Dual sanitization: allowlist DOM sanitizer client-side (`shared/page-builder/sanitize.js`)
  mirrored by the authoritative server sanitizer package (`backend/app/builder_security/`) — tags, URLs
  (scheme+host checks, `youtube`/`vimeo` only for video), colors, keywords, clamped numbers. The
  `html` module is properly fenced on both sides [C:code].
- Preview channel validates `origin` and `source` on both ends (`reader/preview-bridge.js:84`,
  `admin/page-builder/preview-manager.js:839`) [C:code].
- Public endpoints only serve published pages (`backend/app/routes/page_builder.py:641-671`);
  column-shrink that would orphan modules is rejected server-side
  (`backend/app/page_store.py:835-847`) [C:code].

**What is broken or risky:**

1. **The responsive module contract is intentionally allowlisted and deployment-sensitive.**
   Existing hidden/text/gallery/button rules plus Spacer height, Feed layout, and reader controls
   emit public ratio-banded CSS; preview resolves the selected branch in JavaScript. New responsive
   fields must be registered across the editor, client/backend normalizers, runtime capability
   contract, preview, public emitter, and round-trip tests. Because the admin source and public
   bundle can update without reloading the FastAPI process, backend changes require an API restart;
   the builder now blocks saves when `/api/admin/page-builder/runtime` is incompatible. **[C:code]**
2. **Page-level recovery is shipped; disaster recovery is still incomplete.** Transactional,
   versioned `BuilderPageSnapshot` pre-states cover committed mutations and deletion, the admin-only
   restore APIs validate and restore current/deleted pages, and the builder now exposes guarded
   History and Deleted pages workflows [C:code]. Untouched legacy pages can have empty history until
   their first covered mutation, and local undo still covers _unsaved drafts only_. The remaining
   safety gap is the Phase 4-5 backup artifact/scheduling and isolated restore-drill work in
   `docs/BUILDER_PAGE_SNAPSHOT_AND_BACKUP_HARDENING_PLAN.md`.
3. **Unknown `page.meta` keys persist unsanitized**
   (`backend/app/builder_security/header.py:sanitize_page_meta`) —
   tolerated by design, admin-only writes, and nothing renders them today, so it's not currently
   exploitable [C:code]. It's a standing footgun: any future reader code consuming a new meta key
   must add sanitization first. Worth a code comment and a line in the docs, not a rewrite.
4. **Broader manual regression debt:** the authenticated 0.8.5 corrective matrix is complete, but
   the unchecked optional flows in `docs/READER_BUILDER_QA.md` remain useful before 1.0.0. They are
   no longer blockers for merging this builder baseline.
   **What's missing** (verified against code): backup scheduling/restore-drill hardening and the
   optional polish backlog, including header glow. Page snapshots and admin recovery are complete;
   the authenticated 0.8.5 responsive/manual closeout is also complete.

**1.0.0 scope recommendation:**

- **In:** finish backup/restore hardening and the broader reader/builder worksheet before 1.0.0.
  Page snapshots/admin restore and the completed 0.8.5 baseline are already merged.
- **Defer/cut:** universal module appearance (needs the per-type audit; button/promo/email already
  have their own styling), drag-resize gutters, any new module types before the store's.
- **Blockers/dependencies:** finish the snapshot/restore and backup-hardening plan before starting
  store work. Header glow is not a store dependency.
- **Tests/QA:** keep backend update/refetch, builder save/reload, negative dropped-branch, and
  preview/public real-width coverage aligned with every newly allowed responsive field. Keep the
  visual suite mandatory for responsive and header work. The authenticated Pyre corrective pass is
  complete; run one broader authoring session per series on a phone before 1.0.0.
- **Definition of done:** every control visible in the inspector provably changes the _published_
  page (the Phase-0 matrix philosophy, extended to modules); the completed Phases 3/5/7 remain
  regression-free; no dead controls; snapshots restorable from the admin; all gates green.

### 2.2 Store (priority 2)

**Current state.** No payment code exists — no SDK (`backend/requirements.txt`), no store tables
(`backend/app/models.py`), no routes. "Store" today means `releaseType: "store"` entries opening
external BigCartel URLs (`reader/app.js:900-906`), correctly suppressed in preview [C:code]. The
prerequisite reader/layout work the plan gates on is **done** [C:code+docs].
`docs/BUILDER_STRIPE_STORE_PLAN.md` is current, and its security section is genuinely correct —
server-side price authority, raw-body webhook verification, idempotent fulfillment, event-ID
dedupe, PII minimization, and server-owned regional shipping rates are all already specified. The
remaining recovery prerequisite is `docs/BUILDER_PAGE_SNAPSHOT_AND_BACKUP_HARDENING_PLAN.md`.

**The Stripe vs. PayPal call: ship Stripe Checkout only. Defer PayPal past 1.0.0.** This is the
clear answer, not a coin flip:

- Stripe-hosted Checkout keeps PCI scope in the smallest bucket (SAQ-A: card data never touches
  the origin) and the plan is already written against it.
- PayPal doubles every hard part for a solo maintainer — a second webhook verifier, a second
  idempotency model, a second refund/dispute state machine, a second sandbox — while the plan's
  local-order abstraction (`store_orders` keyed by provider session) already leaves room to bolt
  PayPal on later without schema surgery. The tradeoff accepted: some buyers prefer PayPal and a
  few will bounce. That is a conversion cost, not a safety cost, and it's reversible post-1.0.
- One addition worth making _now_ for the PayPal-later door: name the order columns
  provider-neutrally (`provider`, `provider_session_id`) instead of
  `stripeCheckoutSessionId`-only.

**Subscriptions decision (settled):** **1.0.0 = one-time purchases**. Bridge subscriptions with
what already exists — the premium-code system (`backend/app/models.py:134-168`, redemption at
`backend/app/routes/user.py:235`) allows selling "premium access" as a product fulfilled by issuing
a code, manually or semi-automatically. Real recurring billing (Stripe Billing, customer portal,
entitlement sync, dunning) remains post-1.0.

**Initial physical-product decision (settled):** collect shipping addresses in hosted Checkout and
use server-owned flat shipping rates by supported country group. The client may choose only a safe
region ID before the Checkout Session is created; the backend selects the matching Shipping Rate
and allowed countries. This preserves simple approximately $5-6 US shipping without adding carrier
quotes or embedded Checkout.

**Security checklist for implementation** (the plan covers most; ⭐ = additions beyond the plan
doc):

_Architecture & PCI_

- [ ] Stripe-hosted Checkout only; no Payment Element, no card fields, no card data in any log
      (plan §Security)
- [ ] Client may send only `variantId`, `quantity`, `shippingRegionId`, `sourcePageId`, and
      `sourceModuleId`; server rejects product/shipping amounts, currency, Price/Shipping Rate IDs,
      and fulfillment fields if present ⭐ _(reject, don't ignore — catches tampering attempts
      loudly)_
- [ ] Stripe Price ID is the payment authority; local `unitAmount` is display/reconciliation only
- [ ] ⭐ Use a **restricted API key** (Checkout + Prices read + webhooks only), not the account
      secret key
- [ ] ⭐ Pin SDK version and `STRIPE_API_VERSION`; upgrade deliberately, never floating

_Webhooks & consistency_

- [ ] Verify `Stripe-Signature` against the **raw body** before parsing; route must bypass any
      JSON middleware
- [ ] Record processed Stripe event IDs (`store_stripe_events`); duplicates are no-ops
- [ ] One idempotent `fulfill_checkout(session_id)` shared by webhook and success page; safe under
      concurrent delivery ⭐ _(take a row lock or use an idempotent UPDATE … WHERE status, since
      webhook + success page race)_
- [ ] Handle `checkout.session.completed` + async payment succeeded/failed; expired sessions mark
      orders abandoned ⭐
- [ ] ⭐ Rate-limit `POST /api/store/checkout-sessions` (per-IP) — it's an unauthenticated
      endpoint that creates Stripe objects
- [ ] Webhook handler returns 2xx fast; heavy work after durable state write

_Secrets & environments_

- [ ] `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` env-only, never logged, never in error
      responses; app boots cleanly without them (checkout disabled with a clear error)
- [ ] Test and live keys never mixed; store the intended mode and refuse `price_`/`shr_` IDs from
      the wrong mode ⭐ _(validate on admin save via Stripe retrieve calls)_
- [ ] ⭐ 2FA on the Stripe dashboard account
- [ ] Local sandbox loop with Stripe CLI before any live key exists; live keys only after Stripe's
      go-live checklist

_Orders, fulfillment, admin_

- [ ] Order created at session creation; `provider_session_id` unique; status transitions are a
      small explicit set (checkout_open → paid/failed/abandoned; unfulfilled → fulfilled; +
      refunded)
- [ ] ⭐ Refunds: issue in Stripe dashboard for v1, but handle `charge.refunded`/`refund.updated`
      webhooks so local order status can't silently lie
- [ ] Store only fulfillment-necessary PII (email, shipping); no full webhook payload logging;
      orders included in DB backups (automatic — same Postgres)
- [ ] Admin order list/detail/fulfillment behind the existing `_require_admin`; fulfillment notes
      editable; filter by payment/fulfillment status
- [ ] Physical variants without an active server-owned shipping profile/region are blocked from
      checkout, not sold blind; selected regions map to one fixed rate and matching allowed countries

_Builder & reader integration_

- [ ] `store-grid` / `product-card` module configs store IDs only; registered in
      `backend/app/builder_security/modules.py` (the "silently dropped otherwise" rule is a feature
      here)
- [ ] Preview mode: buy buttons inert, no session creation, no external navigation (reuse the
      existing side-effect suppression contract)
- [ ] Success/cancel pages are builder pages (global scope) rendering sanitized session status;
      unknown session = neutral message, no PII
- [ ] Missing/archived product referenced by a module → admin warning + safe public fallback

_Conversion tracking (minimum viable)_

- [ ] Umami event on buy-click (`store_checkout_start` with product slug); revenue truth lives in
      the orders table, not analytics ⭐ — resist funnel tooling in v1

**Definition of done:** plan Phase 7's gate list, plus: a full sandbox purchase (card + a delayed
method), one physical purchase per launch shipping region, a duplicate-webhook replay test, a
tampered-payload test (client-sent product/shipping amount rejected and logged), refund reflected
locally, and one real live-mode purchase of a cheap product before announcing.

### 2.3 Analytics (priority 3)

**Current state.** Three layers [C:code]: (1) Umami via optional Docker profile, proxied
same-origin (`/umami/*`, `/analytics.js`), reader events `reader_page_view` /
`reader_entry_complete` / `reader_entry_exit` with a localStorage opt-out
(`reader/analytics.js`); (2) a custom first-party tracker `POST /api/track/visitor` maintaining
`VisitorSession` rows for live presence and reading history (`backend/app/routes/tracking.py`);
(3) eight admin endpoints (`backend/app/routes/admin_analytics.py`, 1,610 lines) feeding five UI
panels (live, traffic, reader, reads-over-time, visitor-history — 2,433 lines under
`admin/analytics/`).

**What works:** same-origin proxying (no third-party beacon domain), an honest opt-out,
preview-mode suppression, and a sensible split — Umami for aggregates, local sessions for "who's
on the site right now."

**Broken/risky:**

- **Raw SQL against Umami's internal schema** (`website_event` joins at
  `backend/app/routes/admin_analytics.py:185`, `:235`, `:474`, `:695`) while the Umami image
  floats on `postgresql-latest` (`deploy/bwondercomics-compose.yml:59`) [C:code]. Umami's tables
  are not a public API; any image pull can silently break four admin panels. **Pin the Umami image
  now** (one line), and treat the direct-SQL panels as frozen legacy.
- **`visitor_sessions` grows forever** — no retention job anywhere [C:code]; rows hold IP + user
  link + reading history. Add a monthly prune (e.g., keep 90 days; an ops-catalog command or a
  `DELETE` in the nightly backup service is fine). This is both a privacy posture and a
  table-bloat fix.
- `/api/track/visitor` is unauthenticated, unthrottled, client-chosen `visitor_id` [C:code] —
  junk-data vector, not a breach vector. A cheap per-IP rate limit is enough.
- Metric correctness (double-count of hits vs. Umami views, session merge behavior) **[V — needs a
  look at the live panels against known traffic; can't be proven from code alone]**.

**Too advanced or not useful enough?** The architecture is right-sized; the _panel count_ is
slightly past what a solo creator needs. Keep: live presence, reader completions per entry, weekly
digest. Freeze: visitor-history detail (it's the panel most coupled to Umami internals and the
most privacy-heavy). Do **not** build: cohorts, funnels, retention (already excluded by
`docs/ROADMAP.md`).

**1.0.0:** pin image, add retention, rate-limit tracking, verify each displayed number once
against Umami's own UI, add the one store event. **Defer:** everything else. **DoD:** every
visible metric either matches Umami or is documented as "local sessions, counts X"; no panel
errors with Umami disabled (graceful "analytics off" state).

### 2.4 Users & moderation (priority 4)

**Current state.** Single `role` string on `User` (`user`/`premium`/`admin` semantics via
`backend/app/validation.py`); HMAC-signed session cookie (`httponly`, `samesite=lax`, conditional
`secure`) [C:code: `backend/app/routes/auth.py:42-51`]; PBKDF2-SHA256/120k password hashing
(`backend/app/security.py:20-41`); registration modes open/invite/closed with
first-user-becomes-admin (`backend/app/routes/auth.py:107-128`); admin user list/role/delete
(`backend/app/routes/admin.py:42-160`); comments with the full moderation kit — auth-required
posting, user bans, IP bans, censored words, rate/duplicate limits
(`backend/app/routes/comments.py:108-190`), hide/unhide/delete from both the admin tab and inline
in the reader (`reader/comic-comments.js:449-489`); premium gating via path middleware with a TTL
cache (`backend/app/main.py:45-91`, `backend/app/premium.py:67-80`) and properly traversal-guarded
protected file serving (`backend/app/routes/files.py:36-54`) [C:code].

**What works:** most of it. Comments are the best-hardened public-write surface in the app.
Comment rendering is DOM-safe (no innerHTML for user content). Account deletion cleans up visitor
sessions (`backend/app/routes/user.py:294`). fail2ban is live with a login jail (5 tries/10m → 24h
ban) [C:live].

**Broken/missing — the real gaps:**

1. **There is no password change or reset anywhere** — not self-service, not admin-set [C:code —
   absent from `auth.py`, `user.py`, `admin.py`]. With paying customers (store!), "forgot
   password" currently ends in a dead account or hand-editing the DB. Minimum for 1.0.0: logged-in
   password change + an admin "set temporary password" action. Email-based reset can wait (there
   is no transactional email sender; don't build one for this).
2. **`/api/email/subscribe` is unauthenticated and unthrottled, and flips `email_opt_in` on any
   matching user account** (`backend/app/routes/user.py:80-114`) — third parties can subscribe
   (and effectively opt-in) any address. Add per-IP rate limiting and don't touch
   `User.email_opt_in` from the anonymous endpoint.
3. Stateless sessions mean no server-side revocation — a stolen cookie works until TTL expiry
   [C:code]. Acceptable at this scale; note it, don't fix it for 1.0.
4. No email verification at registration [C:code] — fine for a comics site; revisit only if the
   store needs verified receipts (Stripe emails receipts itself).
5. `REGISTRATION_MODE` in production **[V — env name check only]**: for 1.0.0 with a store, `open`
   is fine, but confirm it's a decision rather than a default.

**Tests:** backend auth/comments/premium/files routes all have suites (`backend/tests/`) [C:code].
Missing: tests for the two new items above once built.

**1.0.0:** password change + admin reset; subscribe hardening; one manual pass of the admin
Users/Moderation tabs against a throwaway account (ban → verify blocked, hide → verify
placeholder, premium code → verify gated file). **Defer:** OAuth logins, email verification,
session stores. **DoD:** a reader can recover from a forgotten password without SQL; moderation
actions verified end-to-end.

### 2.5 Media page (priority 5)

**Current state.** `media.html` is a self-contained 26KB page (inline CSS/JS): session-aware
premium handling with blur previews, filterable grid, lightbox with prev/next, fetching
`media.json` + `/api/session` [C:code]. It works but is stylistically its own island, and it
duplicates capability that now exists in the builder's `media-gallery` module
(`reader/media-gallery-module.js`) — which fetches the same `media.json` but has no
lightbox/filters.

**Three directions:**

|          | A. Polish in place                                                        | B. Builder-native rebuild                                                                                   | C. Hybrid: module grows a lightbox                                                                   |
| -------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| What     | Keep media.html; align tokens/typography with the reader, fix rough edges | Global builder page with `media-gallery` module replaces media.html; add lightbox+filters to the module     | Add lightbox/filter options to the module _and_ keep media.html until parity, then swap the nav link |
| Best for | Shipping 1.0.0 fastest; zero regression risk                              | Long-term coherence — media becomes authorable like everything else, per-series media pages become possible | Same endgame as B with a safe rollback at every step                                                 |
| Cost     | S                                                                         | M (module features + premium blur inside module + retire page)                                              | M, spread out                                                                                        |
| Risk     | Continued duplication                                                     | Premium/blur/lightbox edge cases regress in one big swap                                                    | Lowest risk per step                                                                                 |

**Recommendation:** **A for 1.0.0, C as the post-1.0 path.** A redesign is exactly the kind of
tempting scope the solo-creator constraints argue against while the store is unbuilt. Defer B/C
entirely until after 1.0.0 — but when the store's `store-grid` module work happens, keep the media
module's future lightbox in mind so shared card/lightbox patterns don't get built twice.

### 2.6 Social tab (priority 6)

**Current state.** Bluesky only: connect via handle + app password, status, notifications,
disconnect (`backend/app/routes/admin_social.py`); share-on-publish integrated into Posts,
including scheduled posts sharing when they go live, with per-post error capture
(`backend/app/routes/posts.py:290-308`); stdlib `http.client`, no SDK dependency
(`backend/app/bluesky.py`) [C:code].

**Verdict: keep, frozen.** This is the good kind of social feature: it pushes content outward on
an open protocol, has one provider, no OAuth dance, no timeline ingestion beyond a notifications
list, and ~1,000 lines total. Cutting it would delete working promotional value; expanding it
(more platforms, scheduling UI, reply management) is the trap. Concretely:

- **Keep for 1.0.0:** connect/status, share-on-publish, error surfacing on the post row.
- **De-emphasize:** the notifications panel — nice, but it's the only part that _reads_ from the
  platform and thus the most fragile; treat failures as cosmetic.
- **Flag, don't fix now:** tokens stored plaintext in Postgres
  (`backend/app/models.py:434-449`). App-password scope is limited and the DB is the crown jewels
  anyway; encrypt-at-rest is a post-1.0 nicety. Bluesky's eventual app-password deprecation in
  favor of OAuth is a _watch_ item, not work.
- **Do not add** other platforms before 1.0.0.

### 2.7 Diagnostics tab (priority 7)

**Current state.** Read-only snapshot-backed tab (health, DB stats/overview, deploy status,
config, backups, service status, logs stream, test status) with mutations routed through a
separately-gated ops path: admin auth + IP allowlist + `ADMIN_COMMANDS_ENABLED` + allowlisted
catalog + file queue + host worker + confirm flags (`backend/app/routes/admin_ops.py:210-233`,
`backend/app/routes/admin_utils.py:66-76`). Even "run tests" goes through that gate
(`backend/app/routes/admin_diagnostics.py:313`) [C:code]. The _design_ is right and unusually
disciplined.

**The problem is deployment, not code** [C:live]: `var/diagnostics/admin/latest.json` is dated
**June 4** (refresh timer never installed), and the ops worker isn't running (empty queue/logs
since March). So the tab currently shows month-old data and any queued command would hang —
precisely the "can I trust this?" failure the 0.9.0 milestone targets.

**Verdict: keep, simplify, and make it honest.**

- **1.0.0:** install the diagnostics-refresh timer and ops worker per `deploy/README.md` (or
  consciously decide the ops surface is out and disable it — either is fine; limbo is not); add a
  prominent **snapshot age** banner in the tab so staleness is visible **[V: check whether
  `generatedAt` is already displayed]**; verify the read-only boundary once by hand.
- **Health checks that matter for 1.0:** API up, DB reachable, disk space, last backup age + size,
  container status, cert expiry. Most already exist in `backend/app/diagnostics_snapshot.py`.
- **Defer/cut:** logs-stream and in-admin test-running (developer conveniences; a terminal
  exists), the Inner-Net panel (fold into a link), and — separately — the **Preview Changes tab is
  a cut candidate**: it predates the live builder canvas, which now does its job better
  (`admin/preview.js`). Hide the button for 1.0.0; delete post-1.0 after a month of not missing
  it.

---

## 3. Now / Next / Later

Feature tracks follow the priority order strictly. The **Ops track** is parallel because it's
hours of work protecting everything else — it must not wait behind the store, and it doesn't
compete with feature time meaningfully.

**Completed process gate**

- The completed `builder-incremental-improvement` 0.8.5 baseline is merged into `main`; use
  "main = deployed" from here on.

**NOW — finish before moving on**

1. _Recovery safety:_ implement `docs/BUILDER_PAGE_SNAPSHOT_AND_BACKUP_HARDENING_PLAN.md`: per-save
   page JSON snapshots, admin restore, validated nightly DB and weekly file backups on
   `/mnt/archive`, and an isolated restore drill. Resolve the current read-only archive mount before
   enabling production timers.
2. _Ops track (parallel, ~1 day):_ finish the non-recovery host items: install diagnostics-refresh
   timer + ops worker (or disable ops deliberately); pin `umami` image; add Caddy security headers
   (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`/`frame-ancestors` — hold off
   on strict CSP, the builder emits inline styles).

**NEXT — required for 1.0.0**

3. _Store:_ Stripe-Checkout-only build per the plan's Phases 1→7, with the checklist in §2.2
   (provider-neutral order columns; subscriptions bridged via premium codes). This is the
   schedule's center of mass.
4. _Users:_ password change + admin password set; `/api/email/subscribe` hardening.
5. _Analytics:_ visitor-session retention job; `/api/track/visitor` rate limit; one
   metrics-correctness pass; `store_checkout_start` event.
6. _Diagnostics:_ snapshot-age banner; hide Preview Changes tab.
7. _Polish backlog:_ prioritize release-relevant items from `docs/POLISH_BACKLOG_PLAN.md` without
   reopening the completed 0.8.5 builder roadmap; keep optional visual features behind hardening.
8. _Release:_ full DoD gate (§4), tag `1.0.0`.

**LATER — post-1.0.0**

- PayPal as a second provider; real subscriptions (Stripe Billing + entitlement sync);
  digital-download fulfillment.
- Media direction C (module lightbox → retire media.html); universal module appearance;
  drag-resize gutters.
- Social token encryption at rest; Bluesky OAuth migration when forced.
- Delete Preview Changes code; strict CSP with nonces; session revocation; email verification.
- Stoat/Revolt SSO work (already excluded from 1.0 by `docs/ROADMAP.md` — keep it that way).

---

## 4. 1.0.0 definition of done

**Automated gates** (all on `main`, from a clean checkout): `npm test` · `npm run test:backend` ·
`npm run test:visual` · `npm run lint` · `npm run format:check` · `npm run lint:py` ·
`npm run format:py:check` · `npm run build` — plus the new store suites (webhook signature reject,
duplicate-event idempotency, tamper rejection) and the inverted module-responsive parity tests.

**Manual reader QA** (per series — battle-bros, prisonplanet, PYRE; desktop + one real phone):
load homepage → read an entry paged _and_ vertical → saved progress survives reload → entry
switcher/gallery → premium entry gated then unlocked via code → comment post/edit-limits →
end-of-entry popup per its setting → media page → feed page → buy a product (sandbox) → store
success page.

**Manual admin QA:** create/edit/publish a builder page and verify published output matches
preview on all three devices → upload entry pages + covers → post with Bluesky share → moderate a
comment + ban/unban → issue a premium code → order appears after sandbox purchase → mark
fulfilled → analytics panels show the session → diagnostics snapshot is <2h old.

**Store/payment QA:** the §2.2 DoD list (sandbox card + delayed method + duplicate webhook
replay + tamper test + refund reflection + one live purchase).

**Analytics QA:** displayed counts match Umami UI for the same window; opt-out honored; preview
sessions produce zero events.

**Backup/restore:** nightly DB dump landing on `/mnt/archive` verified ≥3 consecutive days; one
timed restore drill documented in `docs/OPERATIONS.md`; file backup current within 7 days.

**Deploy/build:** `scripts/frontend-build.sh` produces the served `dist/` + tarball; API container
restarted on backend change; rollback rehearsed once (restore previous dist tarball).

**Known acceptable limitations (write them into the release notes):** no PayPal; subscriptions via
premium codes; no self-service email password reset (admin-assisted); module responsive =
visibility/config only per what ships; single-server deployment; Umami analytics are best-effort.

---

## 5. Security checklist (beyond the store list in §2.2)

**Auth/admin**

- [ ] `APP_SECRET` set (app currently boots with `"change-me"` fallback —
      `backend/app/settings.py:91`; consider making boot fail loudly without it) **[V: confirm
      prod env has it — file exists with 0600 perms [C:live]]**
- [ ] `REGISTRATION_MODE` is a conscious choice **[V]**
- [ ] fail2ban jails active after any host rebuild (they are today [C:live]); keep `caddy-login`
      maxretry ≤5
- [ ] Password change/reset shipped (§2.4); PBKDF2 iterations bumped (120k → ≥600k) at the same
      time — cheap while in the file
- [ ] Admin static HTML is public by design (`deploy/Caddyfile` serves `/admin/*` unauthenticated;
      APIs gated) — acceptable; confirm no secrets ever land in admin JS

**Transport/headers**

- [ ] HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
      `frame-ancestors 'self'` in Caddy (none exist today [C:code])
- [ ] `/ops/` IP allowlists in Caddy and backend kept in sync (`deploy/README.md:161-165`)

**Data/backups**

- [ ] Backups off the primary disk (`/mnt/archive` is mounted, 916G, but was read-only with only
      three tiny December 2025 legacy archives on the 2026-07-16 recheck [C:live]) — **the single
      highest-value hour of work in this entire document**
- [ ] Restore drill performed and documented
- [ ] `deploy/bwondercomics.env` stays 0600 + gitignored (verified [C:live]); never echoed into
      diagnostics config output **[V: skim `/api/admin/diagnostics/config` response once]**
- [ ] Visitor session retention (§2.3); orders PII minimal (§2.2)

**Builder/content**

- [ ] Any new module type or meta key registered in the appropriate
      `backend/app/builder_security/` module before it renders (standing rule — the unknown-meta
      passthrough in `header.py:sanitize_page_meta` makes this non-optional)
- [ ] Preview side-effect suppression re-verified when store modules land (checkout is the one
      side effect that costs money)

**Moderation/misc**

- [ ] `/api/email/subscribe` rate-limited, no longer mutates `User.email_opt_in` (§2.4)
- [ ] `/api/track/visitor` rate-limited (§2.3)
- [ ] Bluesky app password revocable from Bluesky settings if the DB is ever suspect (tokens are
      plaintext [C:code])

---

## 6. Do **not** do before 1.0.0

Each of these is tempting and each costs weeks:

1. **PayPal integration** — post-1.0 (§2.2).
2. **A real subscriptions engine** — premium codes bridge it.
3. **Media page rebuild** (directions B/C) — polish only.
4. **Universal module appearance** and drag-resize gutters.
5. **Any new social platform**, posting scheduler, or reply management.
6. **Advanced analytics** of any kind; no new panels.
7. **GrapesJS or any builder library** (standing rule — keep it).
8. **Header-as-real-section rebuild** (already rejected 2026-07-05 — stay rejected).
9. **Multi-site/multi-tenant abstractions**, setup wizards, self-host onboarding.
10. **Framework migration or admin SPA refactor** (`admin/index.html` at 2,479 lines is ugly and
    _fine_).
11. **Strict CSP** — the builder's inline styles make it a project, not a header.
12. **New reader display modes** beyond paged/vertical.
13. **Stoat/Revolt chat SSO work** — explicitly out of 1.0 scope already.
14. **Rewriting the analytics direct-SQL panels** — pin the image and freeze them instead.

---

## 7. Settled decisions and open questions

Settled on 2026-07-16:

- **Subscriptions:** 1.0.0 ships one-time purchases plus manually issued premium codes. Real
  recurring billing remains post-1.0.
- **First product:** physical. Collect shipping addresses in Stripe Checkout and use simple
  server-controlled flat shipping rates by supported region; dynamic carrier quoting is not needed
  for v1.
- **Backup destination:** `/mnt/archive`, after its current read-only mount state is corrected and
  verified by the backup-hardening plan.

Remaining questions that change the plan:

1. **Ops surface:** are queued host commands from the browser actually wanted, or is SSH the real
   workflow? (Install the worker vs. disable the tab — both are fine, pick one.)
2. **Env confirmations [V], names/modes only:** is `REGISTRATION_MODE` set (and to what), is
   `UMAMI_WEBSITE_ID` set (i.e., is Umami actually live in prod), and does `APP_SECRET` exist in
   the prod env file?
3. **Preview Changes tab:** confirm it has no workflow the builder doesn't cover, so it can be
   hidden in 1.0.0.
4. **Media page:** confirm direction A-now / C-later, or pick which direction 1.0.0 should
   reflect.

---

## Immediate next steps

Implement `docs/BUILDER_PAGE_SNAPSHOT_AND_BACKUP_HARDENING_PLAN.md` first. Correct the read-only
archive mount and complete the backup/restore phases in parallel with builder snapshot work. Then
begin Store Phase 1. Header glow and the remaining small requests stay prioritized through
`docs/POLISH_BACKLOG_PLAN.md`, not as recovery or store blockers.
