const POST_DRAFT_KEY = "battlebros_post_draft";
const DEFAULT_SERIES_ID = "battle-bros";
const ACTIVE_SERIES_KEY = "battlebros_admin_active_series";
const ANALYTICS_ENDPOINT = "/api/admin/analytics/summary";
const ANALYTICS_PAGES_ENDPOINT = "/api/admin/analytics/pages";
const ANALYTICS_READER_ENDPOINT = "/api/admin/analytics/reader";
const ANALYTICS_READER_SERIES_ENDPOINT = "/api/admin/analytics/reader-series";
const ANALYTICS_LIVE_ENDPOINT = "/api/admin/analytics/live";
const NAV_LAYOUT_KEY = "battlebros_admin_nav_layout";
const NAV_COLLAPSED_KEY = "battlebros_admin_nav_collapsed";
const SCANLINES_KEY = "battlebros_admin_scanlines";
const HEADER_STICKY_KEY = "battlebros_admin_sticky_header";
const COUNT_VIEWS_KEY = "battlebros_count_views";

// Central admin UI state; primary data comes from DB-backed endpoints.
const state = {
  seriesIndex: { version: 1, defaultSeriesId: DEFAULT_SERIES_ID, series: [] },
  activeSeriesId: DEFAULT_SERIES_ID,
  entries: {},
  entryFolders: {},
  entryMeta: {},
  entryLabels: [],
  activeEntryLabelId: null,
  statusMessage: "",
  premiumOnly: false,
  currentEditingEntry: null,
  posts: [],
  mediaItems: [],
  editingPostId: null,
  previewState: { entry: "", pages: [], index: 0 },
  pendingMediaSelection: null,
  selectedFiles: [],
  uploadQueue: [],
  currentPages: [],
  hasUnsavedChanges: false,
  draggingIndex: null,
  isUploading: false,
  isDeletingPost: false,
  previewPayload: null,
};

export {
  ACTIVE_SERIES_KEY,
  ANALYTICS_ENDPOINT,
  ANALYTICS_PAGES_ENDPOINT,
  ANALYTICS_READER_ENDPOINT,
  ANALYTICS_READER_SERIES_ENDPOINT,
  ANALYTICS_LIVE_ENDPOINT,
  COUNT_VIEWS_KEY,
  DEFAULT_SERIES_ID,
  HEADER_STICKY_KEY,
  NAV_COLLAPSED_KEY,
  NAV_LAYOUT_KEY,
  SCANLINES_KEY,
  POST_DRAFT_KEY,
  state,
};
