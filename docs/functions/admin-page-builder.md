DO NOT USE AS REFERENCE, THE LOGIC IS FLAWED.
# Admin Page Builder Logic

This document describes the current builder runtime under `admin/page-builder/` and `admin/page-builder.js`. It replaces the older draft that was marked as flawed.

## Scope

The builder is the admin authoring surface for series-scoped pages backed by:

- `BuilderPage`
- `BuilderSection`
- `BuilderModule`

It is not a freeform visual editor. The builder works with explicit page, section, and module records plus page-level metadata in `page.meta`.

## Canonical Entry

The canonical builder route is the admin shell route:

- `admin/index.html?view=designer&series=<id>&page=<slug>&surface=header`

Current routing behavior:

- `admin/page-builder.js` owns the builder lifecycle inside the main admin shell.
- `admin/designer.html` remains only as a redirect bridge into the shell route.
- The builder can deep-link to a specific page slug and initial surface such as `header`.

## Current Data Model

### Page

Current page-level fields include:

- `slug`
- `title`
- `pageType`
- `isPublished`
- `isHomepage`
- `sortIndex`
- `meta`

Current page-level `meta` ownership:

- `meta.header`
- `meta.theme`
- `meta.panelBackgrounds`
- `meta.panelSpacing`

### Section

Sections currently own:

- `layout`
- `sortIndex`
- `settings`

### Module

Modules currently own:

- `moduleType`
- `columnIndex`
- `sortIndex`
- `config`

## Core Runtime

### `admin/page-builder.js`

This is the main coordinator. It owns mutable builder state and wires together the rail, canvas, and inspector.

Its responsibilities include:

- loading page lists and the active page
- keeping the current series and selected page in sync with the route
- tracking selected surface, selected module, active section, and insertion targets
- initializing and saving page settings, header drafts, and theme drafts
- `normalizeHeaderDraft` also tags a `source` field (`page-meta-v3`, `page-meta-stale`, `legacy-import`) for tracking header provenance in the UI
- applying module, section, and page mutations through `data.js`
- rerendering the rail, canvas, and inspector after state changes
- rendering status badges and reader-preview links

This file is the best source for actual builder flow.

### `admin/page-builder/data.js`

This is the backend API layer for builder records.

Current fetchers and mutators include:

- `fetchPages(seriesId)`
- `fetchPage(pageId)`
- `createPage(seriesId, data)`
- `deletePage(pageId)`
- `reorderPages(seriesId, pageIds)`
- `updatePage(pageId, data)`
- `addSection(pageId, sectionType, layout)`
- `updateSection(sectionId, data)`
- `deleteSection(sectionId)`
- `reorderSections(pageId, sectionIds)`
- `addModule(sectionId, moduleType, columnIndex, config, sortIndex)`
- `updateModule(moduleId, data)`
- `moveModule(moduleId, targetSectionId, columnIndex, sortIndex)`
- `reorderModules(sectionId, columnIndex, moduleIds)`
- `deleteModule(moduleId)`
- `fetchAssets()`
- `uploadAsset(file, readFileAsBase64)`

## Current Builder Flow

The implemented flow is:

1. `admin/page-builder.js` loads the page list for the active series with `fetchPages(...)`.
2. The selected page is resolved from the route or first available page.
3. The active page detail is loaded with `fetchPage(...)`.
4. The left rail is rendered by `sidebar-panel.js`.
5. The canvas is rendered by `canvas-renderer.js`.
6. The right inspector shell is rendered by `editor-panel.js`.
7. User actions call `data.js` mutators, update local state, then rerender affected surfaces.

There is no separate long-lived client-side draft store in `data.js`. The main mutable state lives in `admin/page-builder.js`, while persistence happens through explicit backend updates.

## Page-Scoped Header Architecture

This is the biggest area the older document got wrong.

The primary header authoring source is now:

- `page.meta.header`

Current rules:

- the header is edited as page-level metadata, not as a normal insertable module
- `header` still exists in the module catalog for compatibility, but it is excluded from the normal insertable palette
- legacy `page-config` header values and legacy `header` modules are fallback inputs only

### `header-config.js`

`header-config.js` resolves effective header state from current and legacy sources.

Important exports:

- `createEffectivePageHeader(page, pageConfig, normalizeNavItems?)`
- normalization helpers for header copy and layout
- fallback-audit helpers for migration cleanup

Resolution order is effectively:

1. `page.meta.header`
2. site-level or legacy page-config defaults
3. older override shapes and legacy fallback content

### `header-editor.js`

This renders and binds the page-header editor UI used by the inspector.

Current editor responsibilities include:

- showing an import/upgrade banner if the active header draft is from a non-canonical `source` (e.g., `legacy-import`)
- title and subtitle copy editing
- nav item editing
- block visibility toggles
- left/center/right region placement

Saving header changes writes back through `updatePage(..., { meta: nextMeta })` and clears any import/upgrade banners since the header is upgraded to canonical V3.

## Theme And Page Settings

### `theme-editor.js`

This handles page-scoped theme editing for `page.meta.theme` and related page presentation settings.

### `editor-panel.js`

This is the inspector shell. It chooses which editor to show based on selected surface and active tab.

Current inspector scopes include:

- page settings
- page header
- page theme
- selected module editor

Important behavior:

- it renders the shell layout and footer actions
- it delegates module-specific content to `module-editor.js`
- it invokes delete actions for the currently selected module when appropriate

## Rail And Canvas

### `sidebar-panel.js`

This file renders the left rail.

Current responsibilities:

- page list rendering
- page selection
- page drag/drop reorder
- module palette rendering
- page/library tab switching

The palette intentionally excludes `header`.

### `canvas-renderer.js`

This file renders the builder canvas markup.

Current responsibilities:

- page title area and status badges
- header surface preview using effective page-header data (including a chip for `Imported` or `Needs upgrade` sources)
- section stacks and layout controls
- module wrappers, insert bars, and inline module picker UI
- section insert controls

The canvas is an editing surface. It is not a full fidelity public reader render.

### `canvas-events.js`

This file binds canvas interactions, including:

- selecting modules and sections
- insert-bar interactions
- drag/drop and move operations
- canvas delete actions for modules and sections

## Module Editing

### `module-editor.js`

This is the shared module inspector renderer and binder.

Important exports:

- `renderModuleEditorContent(...)`
- `bindModuleEditorEvents(...)`

Current behavior:

- generic field rendering exists for modules that do not have a dedicated editor
- dedicated editors are used where specialized UX already exists
- a raw JSON config card still exists for advanced or not-yet-polished cases

### Dedicated module editors

Current dedicated editor modules include:

- `button-editor.js`
- `divider-editor.js`
- `gallery-editor.js`
- `video-editor.js`
- `entry-gallery-editor.js`
- `social-editor.js`
- `promo-editor.js`

Some module types still rely partly on generic or raw-config editing instead of polished structured controls.

## Rendering Contracts

### `shared-renderers.js`

This is the shared rendering core used by both admin preview output and the public reader.

Main export:

- `createRenderers(options)`

Factory output:

- `renderModule(mod)`
- `renderSection(section)`
- `renderPage(page)`

This is the main parity boundary between builder rendering and reader rendering.

### `preview-renderers.js`

This adapts `shared-renderers.js` for admin preview usage.

It exports:

- `renderPreviewModule`
- `renderPreviewSection`
- `renderPreviewPage`

### Reader parity

`reader/page-renderer.js` also consumes `createRenderers(...)`.

That means:

- module HTML structure is intentionally shared
- builder canvas chrome is not shared
- public-reader mounting and admin-canvas interaction layers stay separate

## Registries And Utilities

### `constants.js`

Current registries include:

- `MODULE_TYPES`
- `LAYOUT_OPTIONS`
- theme token registries such as `THEME_COLORS`

`MODULE_TYPES` is used by both the rail and the canvas picker, with `header` filtered out from insertable lists.

### `helpers.js`

Shared helper coverage includes:

- asset URL resolution
- image fit and focal-point helpers
- HTML and attribute escaping helpers

### `sanitize.js`

This is the builder sanitization and validation layer.

It includes helpers for:

- sanitizing builder HTML
- sanitizing asset URLs and video URLs
- normalizing colors, numbers, and constrained keywords

## Current Module Catalog

The builder currently recognizes these module types:

- `header`
- `text`
- `image`
- `gallery`
- `video`
- `social`
- `email-signup`
- `promo`
- `buttons`
- `spacer`
- `divider`
- `reader`
- `entry-gallery`
- `feed`
- `html`

Again: `header` is compatibility-only in the catalog and is not part of the normal insertable palette.

## Important Accuracy Notes

- The builder's mutable UI state is primarily coordinated in `admin/page-builder.js`, not in `data.js`.
- Header editing is page-scoped through `page.meta.header`, not primarily through a normal `header` module.
- The admin canvas is an editing surface with builder chrome, not a true public-reader preview.
- Shared renderer parity exists at the module/section/page HTML level through `shared-renderers.js`.
- Legacy `page-config` and legacy `header` module content still exist as fallback inputs in some flows, especially for reader compatibility.

## Related Docs

- [docs/BUILDER_PLAN.md](/srv/bw-quality/docs/BUILDER_PLAN.md)
- [docs/functions/admin-core.md](/srv/bw-quality/docs/functions/admin-core.md)
- [docs/functions/admin-page-builder-styles.md](/srv/bw-quality/docs/functions/admin-page-builder-styles.md)
- [docs/functions/reader-core.md](/srv/bw-quality/docs/functions/reader-core.md)
  - **Content**: `text` (HTML), `image`, `gallery`, `html` (bespoke).
  - **Media**: `video` (auto-detects YouTube/Vimeo IDs for iframe embedding).
  - **Interactive**: `buttons`, `social`, `email-signup`.
  - **Dynamic**: `reader`, `feed`, `entry-gallery` (supports "Mount Placeholders" for developer/author visibility).

### `promo-renderer.js`

The specialized renderer for the **Promo (Carousel)** module. It handles the translation of complex slide-based drafting into high-performance, CSS-driven markup.

- **Neon Styling Engine**:
  - **Color Math**: Automatically converts Hex colors to RGBA to apply user-defined `backgroundOpacity` for glassmorphism effects.
  - **Glow Calculation**: Dynamically generates `text-shadow` and `box-shadow` values based on accent colors and glow intensity.
- **Dynamic Layouts**: Supports per-slide layout positioning, dynamically altering the DOM structure for `overlay` vs. `outside` (text above/below) orientations.
- **Defensive Rendering**: Sanitizes and clamps all numeric values (Height, Interval) and keywords (Transition Style) to ensure a stable preview even with malformed draft state.
- **Context Awareness**: Utilizes environment-specific asset resolvers to ensure image paths are corrected during the draft preview.

### `preview-renderers.js`

A bridge that configures the shared rendering pipeline for the Admin environment and implements "Preview-only" interactive hooks.

- **Renderer Configuration**: Calls `createRenderers` (from `shared-renderers.js`) with admin-specific settings:
  - `resolveImageUrl`: Resolves assets relative to the admin root (`../assets/...`).
  - `showMountPlaceholders`: Ensures interactive regions (like comments or feeds) show a structural placeholder in the canvas.
- **`setPreviewSeriesId(id)`**: Sets the context for the current series, allowing button links to resolve to the correct reader URLs in the preview.
- **`initPreviewPromoCarousels(container)`**: Implements the carousel transition logic (auto-rotate, navigation buttons, and indicators) for the Admin Canvas, as the standard reader JS does not run within the builder environment.
- **`initPreviewEmailForms(container)`**: Stubs out SUBMIT actions for email modules. It prevents real POST requests while providing visual feedback that the form is "working."

### `canvas-renderer.js`

Responsible for the **Structural Wrapper** and the interactive "Admin-only" layers of the canvas.

- **`renderCanvasSnapshot({ state, helpers })`**: The main orchestration export that returns the full canvas and page title HTML.
- **Page Title Bar**: Renders the context header showing the current page slug, type, and status badges, along with the "Page Settings" access point.
- **Page Header Surface**: A specialized structural preview of the site-wide header. It visualizes the current Brand and Navigation configuration as a clickable block (delegated to `header-config.js`).
- **Section Controls**: Renders section reorder handles, layout selectors, and the **Section Settings** overlay for controlling Module Gap, Column Gap, and Section Gap values.
- **Insert Zones**: Manages the placement of `renderModuleInsertBar` and `renderSectionInsertBar` and the rendering of the inline **Module Picker** grid.

## 🖱️ Interaction Layer

### `canvas-events.js`

Coordinates all user interactions within the `#pbCanvas` through a factory pattern.

- **`createCanvasEventBinder({ el, getState, actions })`**: Returns a `bindCanvasEvents` function. This module detaches business logic from DOM events by delegating all operations to the passed `actions` object.
- **Section Management**: Handles `insert-section`, reordering (Native Drag & Drop), layout changes, and toggleable section spacing settings (Module GAP, Column GAP, Section GAP).
- **Module Management**: Handles selection clicks, deletion, and the module picker (both click-based and via dragging a module type into an insert bar).
- **Global Selection**: Hooks up buttons for selecting the Page Header and Page Settings from the canvas.

### `page-builder.js`

The top-level coordinator now owns the canonical designer-entry behavior in addition to the generic
builder shell.

- **`showPageBuilderSection(options)`**: Opens the builder in either normal builder mode or
  designer mode.
  - `entrypoint: 'designer'` activates route-aware header editing.
  - `pageSlug` requests a specific page by slug.
  - `surface: 'header'` opens the structured page-header editor immediately.
  - `historyMode` controls whether route updates use `pushState` or `replaceState`.
- **Default Page Resolution**: Designer mode resolves pages in this order: requested slug,
  `reader`, homepage, then first page in sort order.
- **`onSeriesChange()`**: Re-opens the visible builder shell after a series switch and preserves
  designer-mode routing when applicable.

## 🔗 link-utils.js

A shared utility library for manipulating and normalizing links across the builder and various modules.

### Public API (🔌)

#### `normalizeLinkTarget(rawTarget, legacyUrl)`

The central normalization engine for links. It converts raw inputs into a consistent object containing `kind`, `pageSlug`, `url`, `hash`, and `openInNewTab`.

#### `resolveLinkTargetHref(target, options)`

Converts a normalized link object into a final string URL (e.g., `index.html?series=...&page=...` for internal pages).

### Specialized Normalizers

- **`normalizeHeaderNavItems(items)`**: Normalizes the list of links for the site-wide header.
- **`normalizeButtonsConfig(config)`**: Ensures a "Buttons" module configuration has a valid array of styled link objects.
- **`normalizeHeaderNavItem` / `normalizeButtonItem`**: Internal item-level normalizers that generate unique IDs and default labels.

### URL Construction & Validation

- **`buildReaderPageHref(pageSlug, seriesId)`**: The shared logic for generating live reader URLs (e.g., `index.html?series=battle-bros&page=my-page`).
- **`shouldOpenLinkInNewTab(target)`**: Returns `true` only if the link is an external `url` (http/https) and the `openInNewTab` flag is set.
- **`isBuilderPageTargetMissing(target, pages)`**: Checks if a selected destination page exists in the current series.
- **`sanitizePageSlug(raw)`**: Strips invalid characters to ensure a lowercase, URL-safe slug.

## 🔘 button-editor.js

The `button-editor.js` module provides the UI and logic for managing lists of interactive buttons.

### Public API (🔌)

#### `renderButtonsEditor(config, pages)`

Generates the HTML string for the buttons configuration form.

- `config`: The current buttons module configuration.
- `pages`: The list of available builder pages (used for internal link selection).

#### `bindButtonsEditorEvents({ el, draftConfig, setDraftConfig, renderEditorPanel, markDirty })`

Attaches event listeners to the editor form.

- Handles adding, removing, and reordering buttons.
- Syncs input changes (labels, styles, links) back to the draft state.

#### `cloneButtonsConfig(config)`

Returns a deep-clone of a normalized buttons configuration.

### Internal Helpers (🔒)

#### `cloneValue(value)`

A deep-clone utility using `JSON.parse(JSON.stringify(...))`.

#### `renderLinkFields(button, index, pages)`

Generates specialized sub-fields for the "Link" configuration (Switching between Builder Page, URL, and Anchor).

#### `setLinkValue(button, key, input)`

Updates a button's link object based on user input, ensuring that switching the link "kind" resets irrelevant fields.

## 📏 divider-editor.js

A minimalist editor for horizontal ruling lines.

### Public API (🔌)

#### `renderDividerEditor(config)`

Renders a form with a style selector (Solid, Dashed, Dotted) and a color picker.

#### `bindDividerEditorEvents(...)`

Handles `change` events on the style select and color input.

### Internal Helpers (🔒)

#### `normalizeDividerConfig(config)`

Ensures the config has a valid `style` (defaults to `solid`) and `color` string.

## 🖼️ gallery-editor.js

Manages a grid of images with titles and alt text.

### Public API (🔌)

#### `renderGalleryEditor(config)`

Renders a list of current images and a "Columns" settings field.

#### `bindGalleryEditorEvents(...)`

Handles the complex interactions of a multi-item list:

- **Image Picking**: Integrates with the `openImagePicker` service.
- **Sorting**: Move-up and Move-down buttons.
- **Management**: Adding and removing image items.

#### `cloneGalleryConfig(config)`

Returns a deep-clone of a normalized gallery configuration.

### Internal Helpers (🔒)

#### `normalizeGalleryConfig(config)`

Ensures the config has a valid `images` array and a numeric `columns` value (defaults to 3).

#### `normalizeGalleryImage(image)`

Ensures each image item has a `src` and `alt` string. Gracefully handles legacy string-only paths by converting them to objects.

#### `cloneValue(value)`

Standard JSON-based deep clone utility.

## 📼 video-editor.js

A focused link-entry editor for validating and staging third-party video embeds.

- **`renderVideoEditor(config)`**: Renders a specialized section for video URL input, with instructions enforcing HTTPS YouTube or Vimeo links.
- **`bindVideoEditorEvents(...)`**: Orchestrates a real-time state synchronization lifecycle, triggering canvas re-renders as the user types.
- **`normalizeVideoConfig(config)`**: An internal infrastructure helper that ensures the video configuration remains stable and valid throughout the drafting process.

> [!NOTE]
> The renderer logic (shared) automatically handles the conversion of YouTube/Vimeo URLs into standard `<iframe>` embeds.

## 🗂️ entry-gallery-editor.js

Configures the automatic feed of comic entries within a custom page.

### Public API (🔌)

#### `renderEntryGalleryEditor(config)`

Renders settings for column count and label visibility.

> [!TIP]
> This module doesn't require an image picker because it pulls entry thumbnails dynamically from the database.

### Internal Helpers (🔒)

#### `normalizeEntryGalleryConfig(config)`

Ensures `columns` is an integer (defaults to 3, range 1-6) and `showLabels` is a boolean (defaults to `true`).

## 📱 social-editor.js

A specialized list editor for managing high-visibility social media buttons and community links.

- **`renderSocialEditor(config)`**: Renders a reorderable list of button items. Features include:
  - **Dual-Mode Icons**: Dynamic detection and rendering of either text/emoji icons or image assets.
  - **Style Accordion**: Per-item overrides for `bgColor`, `bgOpacity`, `textColor`, `borderColor`, `borderWidth`, and `borderRadius`.
- **`bindSocialEditorEvents(...)`**: Manages the index-based lifecycle (Add/Remove/Move) and coordinates icon asset selection via the image picker.
- **Infrastructure**:
  - **`getDefaultSocialButtonStyle()`**: Returns the canonical "Social Cyan" default settings for new button instances.
  - **`generateSocialButtonId()`**: Generates stable keys to prevent DOM thrashing during button reordering.

## ✨ promo-editor.js

The most complex module, handling carousels, focal points, and rich CTA text.

### Specialized editor for the "Promo" (Carousel) module. It manages recursive state for multiple slides, each with its own style configuration.

### Infrastructure

- **`getDefaultPromoItemStyle()`**: Returns the default "Glassmorphism" appearance for new slides, including glowing borders, typography presets, and background blur/opacity settings.
- **`generatePromoItemId()`**: Ensuring each slide has a unique, stable key to maintain state during re-ordering.

### Specialized UI

- **Sub-Item Lifecycle**: Manages index-based CRUD operations for slides (Add, Remove, Move).
- **Style Inspector**: An accordion-based sub-editor for each slide that provides fine-grained CSS overrides (glow intensity, font selection, etc.).
- **Asset Integration**: Hooks into the builder's image picker to resolve and assign slide media.

### Public API (🔌)

- **`renderPromoEditor(config)`**: Renders the slide list and global behavior controls (Autoplay, Nav Arrows, Height, and Transition Style).
- **`bindPromoEditorEvents(...)`**: Orchestrates complex event delegation for slide reordering and field synchronization.

### Internal Helpers (🔒)

#### `normalizePromoItem(item)`

Ensures slides have a consistent structure, including defaults for `imageFit` and `textPosition`.

## 🎨 theme-editor.js

The centralized controller for the visual identity of the page. It manages the global metadata used to theme the reader chrome and panel surfaces.

### Core Systems

- **Palette Management**: Synchronizes the `THEME_COLORS` token set with dual UI inputs (Color Picker + Hex Text).
- **Preset Engine**: Allows for one-click application of pre-defined color schemes (Presets) from the centralized registry.
- **Surface Engineering**: Manages per-panel background art.
  - **Advanced Focus**: Integrates with the image picker to utilize focal point coordinates and object-fit logic for panel backgrounds.
  - **Overlay Control**: Provides direct control over background asset opacity.
- **Structural Rhythm**: Manages `panelSpacing` (the vertical gap between modules) and toggles for empty-state placeholder visibility.

### Logic & State

- **`renderThemeEditorContent(...)`**: Constructs the four-section editor stack (Presets, Palette, Surfaces, Spacing).
- **`bindThemeEditorEvents(...)`**: Orchestrates a "Soft-Draft" lifecycle, staging changes to a `draftMeta` object to ensure smooth performance during color picking.

### Internal Helpers (🔒)

#### `cloneThemeDraft(draft)`

Ensures a deep copy of the theme state to prevent accidental mutations of the working metadata.
