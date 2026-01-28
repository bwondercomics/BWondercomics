# Builder Plan (Unified Modules)

Goal: move the reader UI to builder‑controlled modules with **one unified codepath per module** (no layered fallbacks).

## Global rule
- **One source of truth per module.** If a module exists, we modify or replace it in place. No parallel logic.
- Builder config becomes the canonical description of the UI.
- **No fallback UI in dev.** The reader should either work or visibly break so changes are obvious. Fallbacks hide failures and slow iteration.

Related docs:

## Dev workflow (expected behavior)
1) Edit in page builder (edit-only canvas).
2) Save → dev server reflects the saved builder page (root reader).
3) Verify on dev server (no fallback masking).
4) Build → deploy live.

## Draft vs publish UX
- Publish toggle **removed from UI** (builder is edit-only).
- Next step: replace with explicit actions:
  - **Save Draft** (keeps `isPublished=false`)
  - **Publish Changes** (sets `isPublished=true`)
This removes ambiguity and matches the intended workflow.

## Complications + solutions (least → most complex)
1) Page ID/series mismatch
   - Show active reader page ID in builder UI.
   - Add "Open reader for this page" link.
2) Published flag off
   - Display publish status in list + header.
   - Warn on save if unpublished for active reader page.
3) Module type mismatch
   - Constrain module types per slot.
   - Warn when a module won't render in reader.
4) No‑fallback dev mode (enforced)
   - Render a clear empty state instead of silent failure.
5) Panel clearing logic
   - Clear panel DOM when module list is empty.
   - Add "Reset panel" action.
6) Dev server auth limits
   - Proxy dev server over HTTPS for auth.
   - Or test via published reader only.
7) Mixed legacy + builder state
   - Remove legacy page-config fallback from reader.
   - Checklist each UI surface moved to builder.
8) Module schema drift
   - Version module configs.
   - Migrate configs on load.
9) Global refactor risk
   - Convert one surface at a time.
   - Add dev-only logs for missing config.

## Module mapping (current UI → builder)

### 1) Header module (single module)
Configurable parts:
- Brand: logo + title + subtitle
- Patron welcome banner
- Status panel (typewriter/statusMessage)
- Entry selector + patron badge
- Cover gallery button
- No fallback UI (remove native select fallback)
- Nav links (Comics, Admin)
- Header buttons[] (shared button model)

### 2) Reader module (single module)
Controls and overlays included:
- Viewport + pages
- Edge zones
- Controls bar (prev/next, zoom, fit, fullscreen, help)
- Progress bar
- Fullscreen behavior & tap‑to‑toggle UI (mobile)
- Comments panel + toggle
- Shortcuts overlay (on/off + custom list)
- Entry‑end overlay (custom text/buttons OR disabled)

### Main page rules
- **Any page can be marked as the main page** for its series (`isHomepage=true`).
- **Any page can contain the reader module**, not just a fixed `reader` page ID.
- Root `/` should load the **default series’ main page**.

### Series isolation rule
- Pages are **scoped to the selected series**. Editing a page only affects that series.
- Reader content (entries/pages) must always come from the active series.
- The only cross‑series interactions allowed:
  - Copy module configurations as templates.
  - Choose which series is the landing/default series.

### Series navigation
- Users switch series via the **Comics** button in the header (opens the comics library).

### Layout/placement architecture
- Modules need a **placement model** (grid/slots) so configurable parts can render in defined regions.
- Panels already behave like stacks; formalize this as `panelLayout` + `panelSlots`.
- Header should expose slots (brand, status, entry controls, nav, actions) with a grid layout.
- Reader controls should expose slots (left controls, center status, right controls) so buttons can be reordered or hidden without custom CSS.

#### Slot map (concrete proposal)

**Header slots (CSS grid areas)**
- `brand` (logo + title + subtitle)
- `status` (status panel)
- `patron` (patron welcome)
- `entry` (entry selector + cover button)
- `nav` (Comics + Admin links)
- `actions` (header buttons[])

**Header layout (default)**
```
| brand | status | entry | nav | actions |
| brand | patron | entry | nav | actions |
```

**Panels (stack slots)**
- `panel.left` and `panel.right` are vertical stacks.
- Each module can declare optional `slot` (top/middle/bottom), otherwise flow order.

**Reader controls slots**
- `controls.left` (prev/next)
- `controls.center` (page indicator)
- `controls.right` (help/comments/zoom/fit/fullscreen)
- `controls.progress` (progress bar)

**Reader overlays**
- `comments`, `shortcuts`, `entryEnd` are toggled overlays controlled by reader module config.

### Visual layout editor (builder)
- Provide drag‑and‑drop controls to **reorder header parts** (brand/status/patron/entry/nav/actions).
- Provide drag‑and‑drop controls to **reorder panel modules** (left/right stacks).
- Provide drag‑and‑drop controls to **reorder reader control groups** (left/center/right/progress).
- Allow moving parts between slots where valid (e.g., header parts between grid areas).

### 3) Panel modules (swappable L/R)
Modules can be placed in either panel and ordered:
- Feed
- Social Buttons
- Email Signup
- Promo (modify existing promo module; do not add a new one)
- Gallery (optional future)

### Recent builder changes (current state)
- **Preview toggle removed** (edit-only canvas).
- **Disable fallback** toggle removed (no dev fallbacks in UI).
- **Published** toggle removed (publish actions pending).
- **Promo image picker simplified**: no crop/focus/zoom editor.
- **Promo per-slide Image Fit** added (Fill/cover vs Fit/contain).

### Promo module status (current)
- **Unstable layout**: border/fit/fill/text spacing still inconsistent across slides.
- Treat promo as **needs rebuild** once builder foundations are stable.
- Keep decisions: **no crop editor**, **per-slide Fit/Fill**, **simple picker** only.

Panel container config:
- panelEnabled.left/right
- panelOrder.left/right

### 4) Shared Button Model (Header + Panels)
```
{ label, icon, action: "link"|"overlay"|"toggle", href, target, overlayId, toggleId }
```
Supports:
- overlay: user-settings, cover-gallery
- toggle: right-panel-feed, comments
- link: any URL/page

## Implementation phases
### Phase A — Schema foundations
1) Builder schema updates (header/reader/panels + shared button model)

#### Draft schema (per-page, no global fallbacks)
**Page (API shape)**
```json
{
  "page": {
    "id": "uuid",
    "seriesId": "battle-bros",
    "pageId": "reader-home",
    "title": "Battle Bros",
    "isPublished": true,
    "isHomepage": true,
    "meta": {
      "layout": {
        "header": {
          "gridTemplateAreas": [
            "brand status entry nav actions",
            "brand patron entry nav actions"
          ],
          "slotOrder": ["brand", "status", "patron", "entry", "nav", "actions"]
        },
        "panels": {
          "left": { "order": ["moduleIdA", "moduleIdB"] },
          "right": { "order": ["moduleIdC", "moduleIdD"] }
        },
        "readerControls": {
          "left": ["prev", "next"],
          "center": ["pageIndicator"],
          "right": ["help", "comments", "zoomOut", "fit", "zoomIn", "fullscreen"],
          "progress": ["progressBar"]
        }
      }
    },
    "sections": [ /* BuilderSection[] */ ]
  }
}
```
Notes:
- `pageId` is the UI label for the page identifier (internally stored as slug).
- Layout is **per-page** only.

**Header module config**
```json
{
  "moduleType": "header",
  "config": {
    "brand": { "show": true, "logoText": "BWC", "logoImage": "", "title": "BATTLE BROS", "subtitleMode": "rotating", "subtitles": [] },
    "patron": { "show": true, "text": "Welcome, Patron!", "durationMs": 20000 },
    "status": { "show": true, "source": "statusMessage", "typing": true },
    "entryControls": { "show": true, "showPatronBadge": true, "showCoverButton": true, "coverButtonLabel": "COVERS" },
    "nav": { "show": true, "links": [{ "label": "Comics", "href": "comics.html" }, { "label": "Admin", "href": "admin/", "requiresAdmin": true }] },
    "buttons": [ /* shared button model */ ]
  }
}
```

**Reader module config**
```json
{
  "moduleType": "reader",
  "config": {
    "viewport": { "twoPageMode": "auto", "edgeZones": true, "edgeZoneSize": "default" },
    "controls": { "show": true, "showPrevNext": true, "showHelp": true, "showComments": true, "showZoom": true, "showFit": true, "showFullscreen": true, "showProgress": true },
    "behavior": { "keyboardShortcuts": true, "swipeNavigation": true, "tapToToggleUi": true, "mobileUiHideDelayMs": 0 },
    "overlays": { "comments": true, "shortcuts": true, "entryEnd": { "enabled": true, "title": "ENTRY COMPLETE", "body": "You've reached the end...", "buttons": ["next", "restart", "close"] } }
  }
}
```

**Panel module configs (swappable left/right)**
```json
{ "moduleType": "feed", "config": { "title": "BWC FEED", "limit": 6, "showAuthor": true, "showLinks": true } }
{ "moduleType": "social", "config": { "buttons": [ /* shared button model */ ], "style": "grid" } }
{ "moduleType": "email-signup", "config": { "heading": "JOIN THE EMAIL LIST!", "subtext": "Occasional dispatches...", "placeholder": "your@email.com", "buttonText": "SUBMIT" } }
{ "moduleType": "promo", "config": { "items": [ /* existing promo schema (modified in place) */ ] } }
```

**Shared button model**
```json
{ "label": "Open Feed", "icon": "🔗", "action": "link", "href": "feed.html", "target": "_self" }
```

### Phase B — Reader renderer alignment
2) Reader renderer updates (apply builder config cleanly)

### Phase C — Builder UI controls
3) Builder UI updates (configure new parts)

### Phase D — Validation and cleanup
4) Validation/feedback warnings (missing required pieces, etc.)
5) Remove any obsolete/legacy paths that conflict with the unified modules

## Non‑goals for this pass
- Re‑designing visual styles
- New features outside the mapped UI
