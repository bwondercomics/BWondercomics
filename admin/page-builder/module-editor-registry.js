import { buttonsModuleEditor } from './button-editor.js';
import { dividerModuleEditor } from './divider-editor.js';
import { emailSignupModuleEditor } from './email-signup-editor.js';
import { entryGalleryModuleEditor } from './entry-gallery-editor.js';
import { feedModuleEditor } from './feed-editor.js';
import { galleryModuleEditor } from './gallery-editor.js';
import { headerModuleEditor } from './header-module-editor.js';
import { htmlModuleEditor } from './html-editor.js';
import { imageModuleEditor } from './image-editor.js';
import { mediaGalleryModuleEditor } from './media-gallery-editor.js';
import { promoModuleEditor } from './promo-editor.js';
import { readerModuleEditor } from './reader-editor.js';
import { accountModuleEditor, linksGridModuleEditor } from './shell-chrome-editor.js';
import { socialModuleEditor } from './social-editor.js';
import { spacerModuleEditor } from './spacer-editor.js';
import { textModuleEditor } from './text-editor.js';
import { videoModuleEditor } from './video-editor.js';

// Module editor registry, keyed by the descriptor's `editorKind`. Adding a module type
// means adding its descriptor (module-descriptors.js), its editor file exporting an
// entry, and the one registration line below — module-editor.js dispatches through
// this map and has no per-type branches.
//
// Entry contract (all fields optional unless noted):
//   renderContent({ config, currentPage, pages, moduleType, shared }) -> string[]
//       Required. Global-scope content sections for the inspector.
//   renderDeviceOverrides({ config, pages, moduleType, responsiveFields, shared }) -> string[]
//       Device-scope sections; omit for hidden-only responsive types.
//   bindEvents(ctx)
//       Global-scope binder; omitted -> the generic [data-key] draft binder.
//   bindDeviceEvents(ctx)
//       Device-scope binder; omitted -> nothing unless deviceBindsGeneric.
//   deviceBindsGeneric: true
//       Device scope uses the generic draft binder (text/spacer/feed).
//   usesLayoutBridge: true
//       Dedicated editors whose commits rebuild the config through type normalizers
//       that do not know the shared [data-layout-key] fields; the dispatcher wraps
//       setDraftConfig so every commit re-reads the Size & Alignment card.
//   retainsRawCard: true
//       Appends the raw-JSON escape hatch (only safe with the generic binder, which
//       parses and persists `_raw`).
//   omitsLayoutCard: true
//       Skips the shared Size & Alignment card (reader).
//   styleUsesDeviceScope: true
//       The style tab honors the device edit scope (buttons).
//   renderStyle({ config, pages, activeDeviceId, styleScope, shared }) -> string[]
//   bindStyle(ctx with styleScope)
//       Style-tab binder; omitted -> generic draft binder when the descriptor
//       declares appearance sectors.
//
// `shared` carries dispatcher-owned plumbing: renderCmsSourceCard(moduleType, config,
// currentPage, pages) and renderModuleLayoutCard(config). Bind ctx carries: el,
// currentPage, selectedModule, draftConfig, setDraftConfig, renderEditorPanel,
// markDirty, pages, openImagePicker, fetchAssets, uploadAssetFile, activeDeviceId,
// responsiveEditScope.
const MODULE_EDITORS = Object.freeze({
  header: headerModuleEditor,
  text: textModuleEditor,
  image: imageModuleEditor,
  gallery: galleryModuleEditor,
  video: videoModuleEditor,
  social: socialModuleEditor,
  'email-signup': emailSignupModuleEditor,
  promo: promoModuleEditor,
  buttons: buttonsModuleEditor,
  spacer: spacerModuleEditor,
  divider: dividerModuleEditor,
  reader: readerModuleEditor,
  'entry-gallery': entryGalleryModuleEditor,
  feed: feedModuleEditor,
  'media-gallery': mediaGalleryModuleEditor,
  html: htmlModuleEditor,
  account: accountModuleEditor,
  'links-grid': linksGridModuleEditor,
});

export function getModuleEditor(editorKind) {
  return MODULE_EDITORS[editorKind] || null;
}
