# Stoat (Revolt) Chat + SSO Plan

## Goal
Add a self-hosted Stoat/Revolt instance at `chat.<your-domain>` and integrate SSO using this repo's FastAPI auth system as an OpenID Connect provider.

Current target domains:
- Main site/OIDC issuer: `https://bwondercomics.com`
- Chat subdomain: `https://chat.bwondercomics.com`
- OIDC callback: `https://chat.bwondercomics.com/login/callback`

## Current Status (2026-02-10)
- `chat.bwondercomics.com` is online and serving the Stoat web client.
- Main-site OIDC discovery/JWKS endpoints are online at `https://bwondercomics.com/.well-known/openid-configuration` and `https://bwondercomics.com/.well-known/jwks.json`.
- The deployed client build (`ghcr.io/revoltchat/client:master`, label revision `41f47a1a3f6b750b6665609b76f6ff0f70e6c8f5`) only exposes native login routes (`/login`, create/reset/verify) and does not include an OIDC callback/provider login route in the login bundle source map.
- Result: main-site "Go to Chat" currently opens chat, but chat-side sign-in is still native email/password.
- Next deployment step is pinning the currently working client by digest (`ghcr.io/revoltchat/client@sha256:5cc05853c215a02ee3d1f71390ad00af06c7ef53602b4b21f419f8702607d8c8`) so behavior is deterministic.
- Bridge mode now uses `/api/chat/sso/start` -> `/sso/bootstrap` to auto-provision/login Stoat accounts and hydrate the chat client auth store on the chat domain.
- Single-community hardening is active in Caddy: public server creation and public invite create/join routes are blocked.
- Backend SSO supports optional `CHAT_OFFICIAL_INVITE_CODE` auto-join into one official server.

Immediate unblock:
1. Pin a Stoat/Revolt web build that explicitly supports external OIDC provider login and callback handling.
2. Re-test end-to-end OIDC handoff before further backend SSO changes.

## Scope
- Frontend: add a lightweight "Go to Chat" entry point on existing pages.
- Backend: implement OIDC provider endpoints in FastAPI using existing users/sessions.
- Infra: extend Docker Compose with Stoat services and route subdomain traffic through Caddy.
- Security: keep secrets in env vars, use short-lived auth artifacts, and strict OIDC validation.

## Non-Goals
- Replacing existing session auth for the main site.
- Rewriting frontend stack or admin architecture.
- Exposing internal chat data stores publicly.

## Phase 0: Compatibility Gate
1. Pin a specific Stoat/Revolt release and image tags (no `latest`).
2. Confirm the pinned release supports OIDC login as an external provider.
3. Record required OIDC callback URLs and required claims.
4. Capture exact Stoat env keys from that release before coding.

Exit criteria:
- A locked Stoat version is chosen.
- OIDC callback and claim requirements are documented.

## Phase 1: OIDC Provider Foundation (FastAPI)
Files to update:
- `backend/requirements.txt`
- `backend/app/settings.py`
- `backend/app/models.py`
- `deploy/bwondercomics.env.example`
- `backend/alembic/versions/0016_oidc_provider.py` (new)

Tasks:
1. Add OIDC dependency support (`Authlib`, and crypto dependency if required).
2. Add settings for issuer URL, client metadata, signing keys, and TTLs.
3. Add SQLAlchemy models:
   - `oidc_clients`
   - `oidc_authorization_codes`
   - `oidc_refresh_tokens` (recommended)
4. Add Alembic migration for OIDC tables and indexes.

Suggested env vars:
- `OIDC_ISSUER=https://bwondercomics.com`
- `OIDC_SIGNING_KEY_PEM=...`
- `OIDC_SIGNING_KID=...`
- `OIDC_AUTH_CODE_TTL_SECONDS=300`
- `OIDC_ID_TOKEN_TTL_SECONDS=600`
- `OIDC_CLIENT_STOAT_ID=...`
- `OIDC_CLIENT_STOAT_SECRET=...`
- `OIDC_CLIENT_STOAT_REDIRECT_URIS=https://chat.<your-domain>/...`

Exit criteria:
- DB schema supports OIDC clients and auth-code flow.
- App config can fully drive OIDC via environment variables.

## Phase 2: OIDC Endpoints + Token Issuance
Files to add/update:
- `backend/app/routes/oidc.py` (new)
- `backend/app/main.py`

Required endpoints:
- `GET /.well-known/openid-configuration`
- `GET /.well-known/jwks.json`
- `GET /oidc/authorize`
- `POST /oidc/token`
- `GET /oidc/userinfo` (if required by Stoat release)

Behavior requirements:
1. Authorization Code flow only.
2. Enforce PKCE with `S256`.
3. Validate `state`, `nonce`, exact `redirect_uri`, and allowed `client_id`.
4. Issue one-time auth codes with short TTL and single-use invalidation.
5. Issue RS256 ID tokens with `kid` and publish public keys via JWKS.
6. Claims mapping:
   - `sub`: internal user UUID
   - `email`: user email
   - `preferred_username`: `display_name`

Exit criteria:
- OIDC discovery/JWKS/token endpoints pass happy-path and rejection tests.

## Phase 3: Main Site Chat SSO Start Route
Files to add/update:
- `backend/app/routes/chat_sso.py` (new) or `backend/app/routes/auth.py`
- `backend/app/main.py`

Route:
- `GET /api/chat/sso/start`

Behavior:
1. Read existing `bb_session` auth state.
2. If authenticated, create OIDC `state` + `nonce`, then redirect to `/oidc/authorize`.
3. If unauthenticated, redirect to login-capable UI with return target set to chat SSO start.

Exit criteria:
- Logged-in users can initiate chat SSO with one redirect.
- Logged-out users are redirected to authenticate before SSO.

## Phase 4: Frontend "Go to Chat" Integration
Files to add/update:
- `reader/chat-sso.js` (new)
- `index.html`
- `feed.html`
- `media.html`
- `comics.html`

Tasks:
1. Create a small module that checks `/api/session`.
2. Render a "Go to Chat" button only when user is authenticated.
3. Button target: `/api/chat/sso/start`.
4. Keep implementation framework-free and non-invasive to existing header layout.

Exit criteria:
- Authenticated users see and can launch chat SSO from site navigation.

## Phase 5: Docker Compose Integration
File to update:
- `deploy/bwondercomics-compose.yml`

Add Stoat stack services (exact list may vary by pinned release):
- `stoat-api`
- `stoat-web`
- `stoat-delta`
- `stoat-events`
- `stoat-redis`
- `stoat-mongodb`

Guidelines:
1. Put chat services behind a `chat` profile.
2. Keep Redis/Mongo internal only (no external host port publishing).
3. Add persistent volumes for MongoDB and Redis.
4. Ensure services share the same compose network as Caddy.
5. Add healthchecks where image/runtime supports them.

Exit criteria:
- `docker compose --profile chat up -d` starts stable chat services.

## Phase 6: Caddy Subdomain Routing
File to update:
- `deploy/Caddyfile`

Tasks:
1. Keep main domain routes for site + API.
2. Add a new site block for `chat.<your-domain>`.
3. Route:
   - Web UI traffic to `stoat-web`
   - API traffic to `stoat-api`
   - Events/websocket traffic to `stoat-events` (or per pinned release docs)
4. Preserve forwarded headers and websocket upgrade headers as needed.

Exit criteria:
- `chat.<your-domain>` serves web UI.
- API + realtime traffic proxies successfully.

## Phase 7: Security Hardening
1. Keep all secrets in `deploy/bwondercomics.env` (never committed).
2. Use dedicated OIDC signing keys for this provider.
3. Keep auth codes short-lived and one-time use.
4. Use strict redirect URI allowlist (exact match).
5. Add rate-limiting where practical on OIDC endpoints.
6. Add key rotation procedure (new `kid`, overlap window, retire old key).

Exit criteria:
- OIDC implementation passes basic abuse and replay resistance checks.

## Phase 8: Testing + Validation
Backend tests (new):
- OIDC discovery metadata shape and issuer correctness.
- JWKS includes expected `kid`.
- Authorize endpoint validation failures (missing PKCE, bad redirect URI, bad client).
- Token endpoint code exchange success + one-time code invalidation.
- ID token claims (`iss`, `aud`, `exp`, `nonce`, `sub`).

Frontend tests:
- Chat button appears only for authenticated users.
- Button points to `/api/chat/sso/start`.

Integration checks:
1. Start stack with chat profile.
2. Login on main site.
3. Click "Go to Chat".
4. Verify chat login completes without manual credential re-entry.
5. Verify logout behavior and new-login prompt behavior.

Exit criteria:
- End-to-end login from main site to chat works in a fresh browser profile.

## Phase 9: Rollout
1. Deploy to staging domain first.
2. Validate OIDC endpoints and chat flow against staging.
3. Cut DNS for `chat.<your-domain>`.
4. Monitor auth errors and websocket/event connectivity after launch.

Rollback:
- Disable `chat` compose profile and remove `chat.<your-domain>` Caddy block.
- Leave main site/auth unaffected.

## Open Decisions Before Implementation
1. Exact Stoat release/tag and compose template source.
2. Whether `userinfo` endpoint is required by that release.
3. Whether refresh tokens should be enabled initially.
4. Final claim mapping requirements beyond `sub/email/preferred_username`.

## Deliverables Checklist
- [ ] `docs/STOAT_SSO_PLAN.md` approved.
- [ ] OIDC DB schema + migration merged.
- [ ] OIDC endpoints implemented and tested.
- [ ] Chat SSO start route implemented.
- [ ] Frontend "Go to Chat" module added on target pages.
- [ ] Compose chat profile integrated.
- [ ] Caddy subdomain routing integrated.
- [ ] Staging validation complete.
- [ ] Production rollout complete.
