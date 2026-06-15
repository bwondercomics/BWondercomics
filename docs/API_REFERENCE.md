# BWonderComics - API Documentation

This document provides an overview of all public APIs available in the BWonderComics reader modules.

---

## Table of Contents

1. [Logger](#logger)
2. [Constants](#constants)
3. [Authentication](#authentication)
4. [API Utilities](#api-utilities)
5. [Builder Page APIs](#builder-page-apis)
6. [State Management](#state-management)

---

## Logger

**Module**: `reader/logger.js`

Environment-aware logging utility that suppresses debug logs in production.

### Functions

#### `logger.log(...args)`

Log informational messages (development only).

- **Parameters**: `...args` - Any values to log
- **Example**: `logger.log('User clicked button', buttonId);`

#### `logger.info(...args)`

Alias for `log()`. Informational messages (development only).

- **Parameters**: `...args` - Any values to log

#### `logger.warn(...args)`

Log warning messages (always shown).

- **Parameters**: `...args` - Any values to log
- **Example**: `logger.warn('API response slow', responseTime);`

#### `logger.error(...args)`

Log error messages (always shown).

- **Parameters**: `...args` - Any values to log
- **Example**: `logger.error('Failed to load', error);`

#### `logger.isDev()`

Check if running in development mode.

- **Returns**: `boolean` - True if development, false if production

---

## Constants

**Module**: `reader/constants.js`

Centralized constants for the entire application.

### Categories

#### TOUCH

Touch and gesture constants.

- `DOUBLE_TAP_DELAY` - Max time between taps (300ms)
- `PINCH_THRESHOLD` - Min distance for pinch (10px)
- `SWIPE_THRESHOLD` - Min distance for swipe (50px)

#### ZOOM

Zoom and scale constants.

- `MIN_SCALE` - Minimum zoom (0.5)
- `MAX_SCALE` - Maximum zoom (4.0)
- `ZOOM_STEP` - Zoom increment (0.2)

#### ANIMATION

Animation timing constants.

- `TRANSITION_DURATION` - Standard transition (300ms)
- `DEBOUNCE_DELAY` - Debounce delay (150ms)

#### STORAGE

LocalStorage keys.

- `PROGRESS_KEY` - Reading progress key
- `CONFIG_KEY_PREFIX` - Page config prefix

#### API

API endpoint URLs.

- `ENDPOINTS.SESSION` - Session endpoint
- `ENDPOINTS.LOGIN` - Login endpoint
- `ENDPOINTS.COMMENTS` - Comments endpoint

---

## Authentication

**Module**: `reader/auth.js`

Complete authentication management system.

### Class: AuthManager

#### Methods

##### `checkSession()`

Check current session status.

- **Returns**: `Promise<Object|null>` - User object or null
- **Example**: `const user = await auth.checkSession();`

##### `login(email, password)`

Login with credentials.

- **Parameters**:
  - `email` (string) - User email
  - `password` (string) - User password
- **Returns**: `Promise<Object>` - User object
- **Throws**: `Error` on login failure
- **Example**: `await auth.login('user@example.com', 'password');`

##### `logout()`

Logout current user.

- **Returns**: `Promise<void>`
- **Example**: `await auth.logout();`

##### `register(email, password, displayName, inviteCode)`

Register a new user.

- **Parameters**:
  - `email` (string) - User email
  - `password` (string) - User password
  - `displayName` (string) - Display name
  - `inviteCode` (string, optional) - Invite code
- **Returns**: `Promise<Object>` - User object
- **Throws**: `Error` on registration failure

##### `onChange(callback)`

Register callback for auth state changes.

- **Parameters**: `callback` (Function) - Called with user object
- **Returns**: `Function` - Unsubscribe function
- **Example**:
  ```javascript
  const unsubscribe = auth.onChange((user) => {
    console.log('Auth changed:', user);
  });
  // Later: unsubscribe();
  ```

##### `isAdmin()`

Check if current user is admin.

- **Returns**: `boolean`

##### `isPremium()`

Check if current user has premium access.

- **Returns**: `boolean`

##### `getUser()`

Get current user object.

- **Returns**: `Object|null`

##### `isAuthenticated()`

Check if user is authenticated.

- **Returns**: `boolean`

### Global Instance

```javascript
import { auth } from './reader/auth.js';
```

Use the global `auth` instance throughout your app.

---

## API Utilities

**Module**: `reader/api.js`

Centralized API request handling with error management.

### Core Functions

#### `apiGet(url, options)`

Make a GET request.

- **Parameters**:
  - `url` (string) - API endpoint
  - `options` (Object, optional) - Fetch options
- **Returns**: `Promise<any>` - Parsed JSON response
- **Throws**: `Error` on failure

#### `apiPost(url, data, options)`

Make a POST request.

- **Parameters**:
  - `url` (string) - API endpoint
  - `data` (Object) - Request body
  - `options` (Object, optional) - Fetch options
- **Returns**: `Promise<any>` - Parsed JSON response

#### `apiPut(url, data, options)`

Make a PUT request.

#### `apiDelete(url, options)`

Make a DELETE request.

### Convenience Functions

#### `fetchComments(targetId)`

Fetch comments for a target.

- **Parameters**: `targetId` (string) - Target identifier
- **Returns**: `Promise<Array>` - Array of comments
- **Example**: `const comments = await fetchComments('battle-bros:entry-1');`

#### `postComment(targetId, message)`

Post a new comment.

- **Parameters**:
  - `targetId` (string) - Target identifier
  - `message` (string) - Comment message
- **Returns**: `Promise<Object>` - Created comment

**Target IDs**

- Entries: `series-id:entry-<display_number>` (example: `battle-bros:entry-1`)
- Posts: `post:<uuid>`

#### `fetchLatestPost()`

Fetch the latest post.

- **Returns**: `Promise<Object|null>` - Latest post or null

#### `fetchPosts(params)`

Fetch all posts.

- **Parameters**: `params` (Object, optional) - Query parameters
- **Returns**: `Promise<Array>` - Array of posts

#### `saveData(filename, content)`

Save data to server.

- **Parameters**:
  - `filename` (string) - File path
  - `content` (Object|string) - Content to save
- **Returns**: `Promise<Object>` - Save response

---

## Builder Page APIs

Reader startup resolves structured builder pages through scoped page routes. Series routes and
global routes are intentionally separate so global pages never shadow series pages.

### Public Reader Routes

#### `GET /api/pages/home/{seriesId}`

Resolve the effective published page for a series root. The resolver prefers the series homepage
page and falls back to the same-series `reader` binding when needed.

#### `GET /api/pages/{seriesId}/{slug}`

Fetch a published series-scoped builder page.

#### `GET /api/pages/global/by-slug/{slug}`

Fetch a published global builder page requested with `?pageScope=global&page=<slug>`.

### Admin Page Builder Routes

- `GET/POST /api/admin/pages/series/{seriesId}` - list or create series pages.
- `GET/POST /api/admin/pages/global` - list or create global pages.
- `GET/PUT/DELETE /api/admin/pages/{pageId}` - read, update, or delete a page record.
- `POST /api/admin/pages/series/{seriesId}/reorder` and
  `POST /api/admin/pages/global/reorder` - reorder pages within one scope.
- `GET/PUT /api/admin/page-bindings/{seriesId}` - read/update series route-role bindings. Reader
  bindings must target a same-series page with exactly one Comic Reader module visible on the
  default Desktop device and using the active page series source. Invalid reader-module state is
  reported with stable warning codes such as `reader_module_missing`,
  `reader_module_duplicate`, `reader_module_hidden_default_device`, and
  `reader_module_wrong_source`; rejected binding/publish requests keep the `error` field and may
  include `code` plus `warnings`.
- `POST /api/admin/pages/{pageId}/sections`, `POST /api/admin/pages/{pageId}/sections/reorder`,
  `POST /api/admin/sections/{sectionId}/modules`, and related `/api/admin/sections/*` /
  `/api/admin/modules/*` routes - mutate builder sections and modules.

Reader module configs accepted through these page-builder routes include sanitized paged-reader
customization fields: `displayMode`, `controls`, `stage`, `panels`, `showPanels`, and
`showComments`. `vertical-scroll` is accepted in `displayMode` for forward compatibility, but the
current reader runtime still renders paged mode.

---

## State Management

**Module**: `reader/state.js`

Application state and progress persistence.

### State Object

Global state object containing all runtime state:

```javascript
import { state } from './reader/state.js';

// Access state
console.log(state.currentEntry);
console.log(state.pageIndex);
console.log(state.scale);
```

### Functions

#### `saveProgress(stateObj)`

Save reading progress to localStorage.

- **Parameters**: `stateObj` (Object, optional) - State to save (defaults to global state)
- **Example**: `saveProgress();`

#### `loadProgress()`

Load saved reading progress.

- **Returns**: `Object|null` - Saved progress or null
- **Example**: `const progress = loadProgress();`

---

## System Endpoints (Admin + Server)

These are backend endpoints used by admin tooling and server-side flows. They are not part of the reader API, but are included here for reference.

### Protected Assets

#### `GET /api/protected/{path}`

Serve a premium/private file (entry pages or media) with auth checks.

- **Auth**: required for premium; admin-only for private.
- **Example**: `/api/protected/media/banner.png`

### File Ops (Admin only)

#### `POST /api/move-path`

Move a file or folder on disk (public ↔ protected).

- **Body**:
  - `from` (string) - source path (web-relative)
  - `to` (string) - destination path (web-relative)

#### `POST /api/copy-path`

Copy a file on disk (used for post asset copies).

- **Body**:
  - `from` (string) - source path (web-relative)
  - `to` (string) - destination path (web-relative)
  - `cleanupStem` (boolean, optional) - delete sibling files with same stem before copy

---

## Usage Examples

### Complete Authentication Flow

```javascript
import { auth } from './reader/auth.js';
import { logger } from './reader/logger.js';

// Initialize
await auth.checkSession();

// Listen for changes
auth.onChange((user) => {
  if (user) {
    logger.log('User logged in:', user.email);
    updateUI(user);
  } else {
    logger.log('User logged out');
    showLoginForm();
  }
});

// Login
try {
  await auth.login(email, password);
  logger.log('Login successful!');
} catch (err) {
  logger.error('Login failed:', err.message);
  showError(err.message);
}
```

### API Requests

```javascript
import { fetchComments, postComment } from './reader/api.js';
import { logger } from './reader/logger.js';

// Fetch comments
const comments = await fetchComments('battle-bros:entry-1');
logger.log('Loaded comments:', comments.length);

// Post comment
try {
  const newComment = await postComment('battle-bros:entry-1', 'Great entry!');
  logger.log('Comment posted:', newComment);
} catch (err) {
  logger.error('Failed to post comment:', err);
}
```

### Using Constants

```javascript
import { ZOOM, ANIMATION, STORAGE } from './reader/constants.js';

// Zoom
const newScale = Math.min(currentScale + ZOOM.ZOOM_STEP, ZOOM.MAX_SCALE);

// Animation
setTimeout(callback, ANIMATION.TRANSITION_DURATION);

// Storage
const progress = localStorage.getItem(STORAGE.PROGRESS_KEY);
```

---

## Type Checking

The project includes `jsconfig.json` for better IDE support. VSCode will provide:

- Autocomplete for all functions
- Parameter hints
- Type checking based on JSDoc comments
- Go-to-definition support

---

**Last Updated**: June 6, 2026
