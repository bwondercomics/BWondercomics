# Builder Stripe Store Plan

Status: Planned; reader/layout prerequisite completed
Created: 2026-06-08

## Purpose

Create a builder-authored store page for one-time BWonderComics purchases using
Stripe-hosted Checkout Sessions. Authors should be able to compose a global or series page with
store grid and product card modules, choose which local products appear, preview the page safely in
the live builder, and let public visitors buy without the client ever supplying prices or handling
card data.

This plan is intentionally sequenced after the reader block and layout customization work because
store pages need normal builder pages without forced reader chrome, reliable blocks above and below
special modules, responsive column styling, preview redirect suppression, and shared public/admin
rendering parity.

Out of scope for v1:

- subscriptions, memberships, and premium entitlement grants
- Stripe Connect, marketplace, or split-payment flows
- custom Payment Element or card-entry UI
- a persistent cart or multi-page cart state
- storing or processing card data in BWonderComics

## Trusted References

Local source of truth:

- `docs/READER_BLOCK_AND_LAYOUT_CUSTOMIZATION_PLAN.md` - completed prerequisite for builder/reader
  decoupling, reader module lifecycle, layout expansion, and preview side-effect rules.
- `docs/functions/admin-page-builder.md` - builder records, live iframe authoring, module draft
  workflow, preview target markers, and data API ownership.
- `docs/functions/reader-core.md` - public builder page loading, preview bridge, side-effect
  suppression, and current store-entry redirect behavior.
- `docs/BUILDER_PLAN.md` - structured builder model and security principle: sanitize on save, store
  cleaned data, sanitize again on read, and reject invalid structural payloads.
- `backend/app/builder_security.py` and `backend/app/page_store.py` - allowed module types, module
  config sanitization, source normalization, and section/module mutation paths.
- `backend/requirements.txt` - current backend dependencies; no Stripe SDK is present today.

Stripe references to re-check at implementation time:

- Stripe Checkout: https://docs.stripe.com/payments/checkout
- Checkout Sessions create API: https://docs.stripe.com/api/checkout/sessions/create
- Checkout fulfillment and webhooks:
  https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted
- Go-live checklist: https://docs.stripe.com/get-started/checklist/go-live

As of this plan, the Stripe best-practices reference used for planning identifies
`2026-02-25.clover` as the latest Stripe API version. Implementation must verify the current
Stripe API version and SDK before pinning dependencies or setting account/API-version policy.

## Current State

- The builder stores pages as structured `BuilderPage`, `BuilderSection`, and `BuilderModule`
  records, with module config sanitized by module type.
- Public reader output and admin preview share builder renderers, and live builder preview runs in a
  same-origin reader iframe with validated snapshot messages.
- Existing "store" behavior is not Stripe-backed. Entry metadata can mark an entry as
  `releaseType: "store"` with `storeUrl`; selecting it opens the external URL in public mode and is
  suppressed in builder preview.
- The admin default page config still contains hard-coded BigCartel support links.
- There are no local product, variant, order, payment event, Stripe settings, or Stripe SDK contracts
  in the backend.

## Product Model

- BWonderComics owns a local product catalog. Stripe owns payment collection.
- A local product can have one or more variants. Each active purchasable variant stores a
  Stripe Price ID for the current environment.
- Store modules reference local product IDs and variant IDs only. The public client may send
  `variantId` and `quantity`; it must never send a price amount, currency, Stripe Price ID, or
  fulfillment state.
- The backend validates product visibility, variant availability, quantity limits, fulfillment
  requirements, and Stripe environment before creating a Checkout Session in `mode=payment`.
- Checkout is hosted by Stripe. The public page redirects to `session.url` returned by the backend.
- The v1 fulfillment model is order capture plus manual fulfillment. Physical shipping, digital
  delivery, signed downloads, premium unlocks, and inventory decrementing can be added later, but v1
  must record enough line-item and customer/shipping data for a human to fulfill the order.
- The success URL should route to a global builder page at
  `/index.html?pageScope=global&page=store-success&session_id={CHECKOUT_SESSION_ID}`. The cancel URL
  should return to the source builder page when that page URL is safe; otherwise it falls back to the
  global store page.

## Proposed Data Contracts

### Store Product

Local product records should be DB-backed and admin-managed:

```json
{
  "id": "uuid",
  "slug": "battle-bros-volume-1",
  "title": "Battle Bros Volume 1",
  "description": "Short public product description.",
  "status": "active",
  "productType": "physical",
  "image": "media/store/battle-bros-volume-1.jpg",
  "sortIndex": 10,
  "tags": ["print"],
  "metadata": {}
}
```

Rules:

- `status` is `draft`, `active`, or `archived`.
- `productType` is `physical`, `digital`, or `other`; v1 fulfillment remains manual for all types.
- Product image paths use the existing safe asset/media URL policy.
- Public product responses omit internal notes, raw Stripe errors, and any archived variants.

### Store Variant

Each product has one or more variants:

```json
{
  "id": "uuid",
  "productId": "uuid",
  "label": "Paperback",
  "status": "active",
  "stripePriceId": "price_...",
  "currency": "usd",
  "unitAmount": 2499,
  "requiresShipping": true,
  "minQuantity": 1,
  "maxQuantity": 5,
  "sortIndex": 0
}
```

Rules:

- `stripePriceId` is admin-only in normal API responses and is never accepted from the public
  checkout request.
- `currency` and `unitAmount` are copied locally for display and reconciliation, but Stripe Price ID
  remains the payment authority when creating Checkout Sessions.
- Active physical variants must either use Stripe shipping configuration or be blocked from checkout
  with a clear public error.
- Test-mode and live-mode Stripe IDs must not be mixed. Store the active environment explicitly or
  validate IDs through Stripe during admin save.

### Store Order

Create a local order when a Checkout Session is created, then update it from webhooks and success
page fulfillment checks:

```json
{
  "id": "uuid",
  "stripeCheckoutSessionId": "cs_...",
  "stripePaymentIntentId": "pi_...",
  "status": "checkout_open",
  "paymentStatus": "unpaid",
  "currency": "usd",
  "amountSubtotal": 2499,
  "amountTotal": 2499,
  "customerEmail": "customer@example.com",
  "fulfillmentStatus": "unfulfilled",
  "lineItems": [
    {
      "productId": "uuid",
      "variantId": "uuid",
      "quantity": 1,
      "stripePriceId": "price_...",
      "unitAmount": 2499
    }
  ]
}
```

Rules:

- `stripeCheckoutSessionId` must be unique.
- Fulfillment must be idempotent per Checkout Session and safe under repeated webhooks or success
  page retries.
- Store only the customer and shipping fields needed for order fulfillment and support. Do not log
  full webhook payloads if they contain unnecessary PII.

### Store Modules

Add two structured builder module types.

`store-grid`:

```json
{
  "source": {
    "mode": "manual-products",
    "productIds": ["uuid"]
  },
  "columns": 3,
  "showPrice": true,
  "showDescription": true,
  "buttonText": "Buy now",
  "imageRatio": "4:5",
  "style": {
    "cardAppearance": null,
    "buttonAppearance": null
  },
  "responsive": {}
}
```

`product-card`:

```json
{
  "productId": "uuid",
  "variantId": "",
  "layout": "featured",
  "showDescription": true,
  "showVariantPicker": true,
  "buttonText": "Buy now",
  "style": {
    "cardAppearance": null,
    "buttonAppearance": null
  },
  "responsive": {}
}
```

Rules:

- Store module configs save product and variant IDs, not prices.
- `source.mode` is `manual-products` for v1. Automatic collections by tag can wait until a later
  phase.
- Responsive overrides may control visibility, columns, image ratio, description visibility, and
  layout only.
- Module styles reuse existing appearance sanitizers. Do not introduce arbitrary CSS, raw HTML,
  embedded scripts, or payment forms.
- Preview mode renders buttons as disabled preview actions and must not call checkout endpoints or
  navigate to Stripe.

## Proposed API Interfaces

Admin routes, all requiring admin access:

- `GET /api/admin/store/products`
- `POST /api/admin/store/products`
- `GET /api/admin/store/products/{product_id}`
- `PUT /api/admin/store/products/{product_id}`
- `DELETE /api/admin/store/products/{product_id}` as archive, not hard delete
- `POST /api/admin/store/products/{product_id}/variants`
- `PUT /api/admin/store/variants/{variant_id}`
- `DELETE /api/admin/store/variants/{variant_id}` as archive
- `GET /api/admin/store/orders`
- `GET /api/admin/store/orders/{order_id}`
- `PUT /api/admin/store/orders/{order_id}/fulfillment`

Public routes:

- `GET /api/store/products` returns active products and active variants safe for display.
- `GET /api/store/products/{slug}` returns one active product by slug.
- `POST /api/store/checkout-sessions` accepts a public checkout request with `variantId`,
  `quantity`, `sourcePageId`, and `sourceModuleId`; returns `{ "checkoutUrl": "..." }`.
- `GET /api/store/checkout-sessions/{session_id}` returns sanitized order/session status for the
  success page.
- `POST /api/store/webhooks/stripe` receives Stripe webhook events and is exempt from JSON body
  parsing that would break signature verification.

Checkout Session creation:

- Use `mode=payment`.
- Use server-selected `line_items[0][price]` and validated quantity.
- Set `client_reference_id` to the local order ID.
- Set metadata with local order ID, product ID, variant ID, source page ID, and source module ID.
- Set `success_url` with `{CHECKOUT_SESSION_ID}`.
- Set `cancel_url` to the safe source page URL.
- Enable shipping address collection only for variants that require shipping, with a blocked
  checkout error if shipping is not configured.

Webhook handling:

- Verify `Stripe-Signature` using `STRIPE_WEBHOOK_SECRET`.
- Handle at minimum `checkout.session.completed`,
  `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed`.
- Retrieve/expand line items server-side before fulfillment reconciliation when needed.
- Record Stripe event IDs to ignore duplicate delivery.
- Return quickly after durable local state is updated.

## Phase 1 - Audit, Dependencies, And Settings

Goal: prepare the repo for a Stripe-backed store without changing public behavior.

Implementation:

- Re-audit the reader block/layout completion state and only begin store implementation after the
  prerequisite is complete or explicitly blocked.
- Add the Stripe Python SDK to `backend/requirements.txt`, pinning the latest compatible version at
  implementation time.
- Extend `backend/app/settings.py` with `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PUBLISHABLE_KEY` if needed later, `STRIPE_API_VERSION`, `STORE_SUCCESS_PAGE_SLUG`, and
  shipping configuration flags.
- Add a `backend/app/routes/store.py` route module and include it from `backend/app/main.py`.
- Add a Stripe client wrapper that centralizes API-version selection, key presence checks, error
  mapping, and test/live mode detection.
- Keep existing BigCartel links and store-entry redirects working during this phase.

Acceptance criteria:

- The app boots when Stripe env vars are absent, with checkout creation disabled by a clear server
  error.
- No public reader or builder behavior changes before store modules are introduced.
- Dependency and settings docs describe sandbox setup without committing secrets.

## Phase 2 - Store Catalog And Orders

Goal: create the local source of truth for products, variants, orders, and webhook idempotency.

Implementation:

- Add an Alembic migration for `store_products`, `store_variants`, `store_orders`,
  `store_order_items`, and `store_stripe_events`.
- Add store model classes and store service helpers for product CRUD, public product serialization,
  checkout validation, order creation, order status updates, and fulfillment status updates.
- Add admin CRUD routes and basic order list/detail routes.
- Validate product slugs, safe image paths, variant quantity limits, local display amounts, and
  Stripe Price ID shape.
- Add optional Stripe validation on admin save when Stripe keys are configured.

Acceptance criteria:

- Admins can create an active product with an active variant.
- Public product endpoints expose only active safe data.
- Archived products and variants cannot be purchased.
- Orders and Stripe event IDs are unique and safe for retry/idempotency logic.

## Phase 3 - Builder Store Modules

Goal: let authors place store content on builder pages using structured modules.

Implementation:

- Add `store-grid` and `product-card` to the descriptor registry and backend allowed module types.
- Add config sanitizers and responsive override sanitizers for both module types.
- Add module editors that fetch admin product summaries, select products/variants, configure display
  options, and follow the existing explicit Save/Discard draft path.
- Extend shared renderers so public reader output and admin preview render the same product cards,
  using caller-provided product lookup data or safe placeholders when products are missing.
- Add live target markers and layer labels consistent with existing module behavior.

Acceptance criteria:

- Authors can add, edit, save, discard, delete, and reorder store modules like other builder blocks.
- Missing or archived product references render as admin-visible warnings and safe public fallbacks.
- Store modules do not write price, currency, or Stripe IDs into builder module config.

## Phase 4 - Public Checkout Flow

Goal: connect product cards to server-created Stripe-hosted Checkout Sessions.

Implementation:

- Add frontend store helpers that bind buy buttons after page render.
- On click, submit `{ variantId, quantity, sourcePageId, sourceModuleId }` to
  `/api/store/checkout-sessions`.
- Disable the clicked button while the request is in flight, show a local error on failure, and
  redirect only to the returned `checkoutUrl`.
- In builder preview mode, keep buttons inert and display preview-only status text.
- Preserve existing external store-entry redirects until a later migration replaces those entries
  with builder store modules or local products.

Acceptance criteria:

- Public store pages redirect to Stripe Checkout only after a successful server session creation.
- Client-side tampering with price, currency, product status, or Stripe Price ID has no effect.
- Preview mode never creates Checkout Sessions and never navigates away from the builder iframe.

## Phase 5 - Webhooks, Fulfillment, And Success Page

Goal: make payment completion reliable even when users do not return to the site.

Implementation:

- Verify Stripe webhook signatures against the raw request body.
- Implement an idempotent `fulfill_checkout(session_id)` service used by both the webhook route and
  the success/status route.
- On successful payment, update local order status, payment status, totals, customer/shipping
  summary, line items, and fulfillment state.
- Render the global builder success page using `session_id` from the URL and fetch sanitized status
  from `/api/store/checkout-sessions/{session_id}`.
- Track async payment failure as a non-fulfilled order state with safe public copy.

Acceptance criteria:

- Duplicate webhook deliveries do not duplicate fulfillment.
- Delayed payment methods can transition from pending to paid or failed.
- The success page can show paid, pending, failed, and unknown-session states without exposing PII.

## Phase 6 - Admin Operations And Migration From External Store Links

Goal: make the store manageable and reduce reliance on hard-coded external links.

Implementation:

- Add admin order filtering by payment status, fulfillment status, product, and date.
- Add fulfillment notes/status updates for manual fulfillment.
- Add optional import guidance for existing BigCartel products, but do not automate a destructive
  migration.
- Replace hard-coded admin support links only after a local product and builder store page exist.
- Add warnings for `releaseType: "store"` entries that still point at external URLs when a matching
  local product is available.

Acceptance criteria:

- Admin can inspect and mark orders fulfilled without touching Stripe Dashboard for normal manual
  fulfillment.
- Existing store-entry redirects keep working until explicitly migrated.
- No existing content loses its outbound purchase path during rollout.

## Phase 7 - Regression And Launch Gates

Goal: prove the store works across backend, builder, reader runtime, preview, and Stripe webhook
retries.

Required tests:

- Backend tests:
  - product and variant CRUD validation
  - public product serialization excludes inactive/internal data
  - checkout session creation uses server-side Stripe Price IDs and `mode=payment`
  - invalid, inactive, archived, over-quantity, and shipping-misconfigured variants are rejected
  - Stripe webhook signature failures are rejected
  - `checkout.session.completed` and async success/failure events update orders correctly
  - duplicate webhook events and repeated success-page fulfillment are idempotent

- Frontend builder tests:
  - store modules render in the Blocks panel and layer tree
  - module editor product/variant selection saves through normal draft flow
  - config sanitization strips invalid product IDs, arbitrary styles, and unsupported responsive
    fields
  - missing product references show admin warnings without crashing

- Reader/runtime tests:
  - public product cards render active products and variants
  - buy buttons call only the checkout session endpoint and redirect only to server-returned URLs
  - preview mode suppresses checkout requests and redirects
  - store success page renders paid, pending, failed, and unknown states

- Visual coverage:
  - global store page with `store-grid`
  - featured `product-card`
  - success page states
  - desktop `1920x1080`, tablet `768x1024`, and phone `375x812` admin preview parity

Final gate:

- `git diff --check`
- `npm run format:check`
- `npm run lint`
- `npm test`
- `npm run test:backend`
- `npm run build`
- `npm run test:visual`
- Stripe CLI local webhook verification with sandbox Checkout
- Production preflight against Stripe's go-live checklist before enabling live keys

## Security And Compliance Requirements

- Never accept price, currency, Stripe Price ID, payment status, or fulfillment state from public
  clients.
- Never log card data, raw full webhook payloads, or unnecessary customer PII.
- Verify webhook signatures using the raw request body before parsing event contents.
- Keep secret keys and webhook secrets in environment variables only.
- Treat Checkout redirects as external navigation and suppress them in builder preview.
- Use Stripe-hosted Checkout so PCI scope stays low and BWonderComics never handles card entry.
- Make checkout and fulfillment idempotent because redirects, webhook retries, and duplicate events
  are normal payment-system behavior.
- Review error messages so declined cards and backend/Stripe integration failures do not expose
  sensitive internals.

## Migration And Compatibility Notes

- Existing pages and entry metadata keep working until store modules are intentionally added.
- The first shipping implementation should be conservative: if a physical product cannot collect
  shipping correctly through Checkout, block checkout rather than accepting payment.
- Local display amount/currency should be treated as a cached display and reconciliation aid, not as
  the payment authority.
- Live and sandbox Stripe objects are separate. Do not reuse test Price IDs in production settings.
- A later migration can replace `releaseType: "store"` entry links with local product references,
  but that is not part of v1.

## Open Product Decisions Before Implementation

- Which products ship first and whether they require shipping address collection.
- Whether v1 allows multiple variants per product in the public picker or only a default variant.
- Whether automatic tax, promotion codes, and Stripe-managed shipping rates are enabled for launch.
- Whether order confirmation emails rely on Stripe receipts only or add a BWonderComics email later.
- Whether digital goods remain manual fulfillment in v1 or get a follow-up signed-download plan.
