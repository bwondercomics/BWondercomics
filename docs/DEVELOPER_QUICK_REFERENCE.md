# Developer Quick Reference - Code Quality Checklist

## 🚀 Pre-Commit Checklist

Before every commit, run through this quick checklist:

### **Code Quality**
```bash
# 1. Check for debugging code
grep -r "console.log" reader/ admin/
grep -r "debugger" reader/ admin/

# 2. Check for TODO comments
grep -r "TODO" reader/ admin/ backend/

# 3. Run tests
npm test

# 3b. Run backend tests
npm run test:backend

# 3c. Generate frontend coverage report (informational, not a gate)
npm run test:coverage

# 4. Lint + format (JS)
npm run lint
npm run format:check

# 5. Lint + format (backend)
python -m ruff check backend/app
python -m ruff format backend/app
```

### **Contract Fixtures**
- Treat `tests/fixtures/contract-fixtures.json` and `backend/tests/helpers.py` as the canonical reader/admin/backend contract layer.
- If a backend payload shape changes, update that shared contract layer and at least one frontend test plus one backend test.

### **Security**
- [ ] No hardcoded credentials or API keys
- [ ] All user inputs sanitized
- [ ] Auth checks in place for protected routes
- [ ] HTTPS enforced in production

### **Performance**
- [ ] No N+1 database queries
- [ ] Images optimized (WebP, responsive sizes)
- [ ] Lazy loading for off-screen content
- [ ] No render-blocking resources

### **Accessibility**
- [ ] All images have alt text
- [ ] Interactive elements keyboard accessible
- [ ] Proper heading hierarchy (h1 → h2 → h3)
- [ ] Focus indicators visible

---

## 🔍 Common Code Smells to Watch For

### **JavaScript**

#### ❌ **Magic Numbers**
```javascript
// BAD
if (distance > 10) {
    zoom();
}

// GOOD
const ZOOM_THRESHOLD = 10; // pixels
if (distance > ZOOM_THRESHOLD) {
    zoom();
}
```

#### ❌ **Callback Hell**
```javascript
// BAD
getData((data) => {
    processData(data, (result) => {
        saveResult(result, (saved) => {
            showMessage('Done');
        });
    });
});

// GOOD
async function handleData() {
    const data = await getData();
    const result = await processData(data);
    await saveResult(result);
    showMessage('Done');
}
```

#### ❌ **God Functions**
```javascript
// BAD - function doing too much
function handlePageChange(direction) {
    // 200 lines of code doing:
    // - validation
    // - state updates
    // - rendering
    // - analytics
    // - local storage
}

// GOOD - split into focused functions
function validatePageChange(direction) { /* ... */ }
function updatePageState(newPage) { /* ... */ }
function renderPage(page) { /* ... */ }
function trackPageView(page) { /* ... */ }
function saveProgress(page) { /* ... */ }

function handlePageChange(direction) {
    if (!validatePageChange(direction)) return;
    const newPage = calculateNewPage(direction);
    updatePageState(newPage);
    renderPage(newPage);
    trackPageView(newPage);
    saveProgress(newPage);
}
```

#### ❌ **Duplicate Code**
```javascript
// BAD - repeated logic
function loadSeries1() {
    showLoading();
    fetch('/series/battle-bros/data.json')
        .then(r => r.json())
        .then(data => {
            hideLoading();
            renderSeries(data);
        })
        .catch(err => {
            hideLoading();
            showError(err);
        });
}

function loadSeries2() {
    showLoading();
    fetch('/series/another-series/data.json')
        .then(r => r.json())
        .then(data => {
            hideLoading();
            renderSeries(data);
        })
        .catch(err => {
            hideLoading();
            showError(err);
        });
}

// GOOD - extracted common pattern
async function loadSeries(seriesId) {
    showLoading();
    try {
        const response = await fetch(`/series/${seriesId}/data.json`);
        const data = await response.json();
        renderSeries(data);
    } catch (err) {
        showError(err);
    } finally {
        hideLoading();
    }
}
```

### **Python**

#### ❌ **N+1 Query Problem**
```python
# BAD
comments = db.query(Comment).all()
for comment in comments:
    user = db.query(User).get(comment.user_id)  # N queries!
    print(f"{user.name}: {comment.text}")

# GOOD
from sqlalchemy.orm import joinedload

comments = db.query(Comment).options(joinedload(Comment.user)).all()
for comment in comments:
    print(f"{comment.user.name}: {comment.text}")  # 1 query total
```

#### ❌ **Missing Error Handling**
```python
# BAD
def get_user(user_id):
    return db.query(User).filter(User.id == user_id).first()

# GOOD
def get_user(user_id):
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError(f"User {user_id} not found")
        return user
    except SQLAlchemyError as e:
        logger.error(f"Database error fetching user {user_id}: {e}")
        raise
```

---

## 📊 Performance Optimization Patterns

### **1. Debouncing**
Use for: resize, scroll, search input

```javascript
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Usage
const debouncedSearch = debounce((query) => {
    fetchSearchResults(query);
}, 300);

searchInput.addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
});
```

### **2. Throttling**
Use for: scroll events, mousemove

```javascript
function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Usage
const throttledScroll = throttle(() => {
    console.log('Scroll position:', window.scrollY);
}, 100);

window.addEventListener('scroll', throttledScroll);
```

### **3. Memoization**
Use for: expensive calculations

```javascript
function memoize(fn) {
    const cache = new Map();
    return function(...args) {
        const key = JSON.stringify(args);
        if (cache.has(key)) {
            return cache.get(key);
        }
        const result = fn(...args);
        cache.set(key, result);
        return result;
    };
}

// Usage
const expensiveCalculation = memoize((n) => {
    // Some expensive operation
    return fibonacci(n);
});
```

### **4. Lazy Loading**

```javascript
// Intersection Observer for images
const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            img.classList.remove('lazy');
            imageObserver.unobserve(img);
        }
    });
});

document.querySelectorAll('img[data-src]').forEach(img => {
    imageObserver.observe(img);
});
```

### **5. Virtual Scrolling**

```javascript
// For long lists (100+ items)
class VirtualList {
    constructor(container, items, itemHeight) {
        this.container = container;
        this.items = items;
        this.itemHeight = itemHeight;
        this.visibleCount = Math.ceil(container.clientHeight / itemHeight);
        this.renderItems();
    }
    
    renderItems() {
        const scrollTop = this.container.scrollTop;
        const startIndex = Math.floor(scrollTop / this.itemHeight);
        const endIndex = startIndex + this.visibleCount;
        
        const visibleItems = this.items.slice(startIndex, endIndex);
        // Render only visible items + small buffer
    }
}
```

---

## 🛡️ Security Best Practices

### **Input Validation**

```javascript
// Frontend validation (UX)
function validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

// Backend validation (Security) - ALWAYS validate on backend too
from pydantic import BaseModel, EmailStr, constr

class UserCreate(BaseModel):
    email: EmailStr  # Validates email format
    password: constr(min_length=8, max_length=100)  # Length constraints
    display_name: constr(min_length=1, max_length=50)
```

### **XSS Prevention**

```javascript
// NEVER use innerHTML with user content
// BAD
element.innerHTML = userComment;

// GOOD
element.textContent = userComment;

// Or sanitize first
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize(userComment);
```

### **SQL Injection Prevention**

```python
# BAD - vulnerable to SQL injection
query = f"SELECT * FROM users WHERE email = '{email}'"
db.execute(query)

# GOOD - parameterized query
query = "SELECT * FROM users WHERE email = :email"
db.execute(query, {"email": email})

# BETTER - use ORM
user = db.query(User).filter(User.email == email).first()
```

### **Authentication**

```python
# Use secure password hashing
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)
```

---

## 🧪 Testing Patterns

### **Test Structure (AAA Pattern)**

```javascript
test('should save progress to localStorage', () => {
    // ARRANGE - set up test data
    const testState = {
        currentEntry: 'Issue 1',
        pageIndex: 5
    };
    
    // ACT - perform the action
    saveProgress(testState);
    
    // ASSERT - verify the result
    const saved = localStorage.getItem('battleBros_progress');
    expect(saved).toBeTruthy();
    
    const parsed = JSON.parse(saved);
    expect(parsed.chapter).toBe('Issue 1');
    expect(parsed.page).toBe(5);
});
```

### **Test Coverage Goals**

- **Critical paths**: 95%+ coverage
  - Authentication
  - Payment processing
  - Data persistence

- **Business logic**: 85%+ coverage
  - Chapter navigation
  - State management
  - User preferences

- **UI components**: 70%+ coverage
  - Interactions
  - Visual states

- **Utility functions**: 90%+ coverage
  - Pure functions
  - Helpers

---

## 📈 Monitoring & Metrics

### **Core Web Vitals to Track**

1. **LCP (Largest Contentful Paint)**: < 2.5s
   - Measures loading performance
   - Track: First comic page render time

2. **FID (First Input Delay)**: < 100ms
   - Measures interactivity
   - Track: Time to first click/tap response

3. **CLS (Cumulative Layout Shift)**: < 0.1
   - Measures visual stability
   - Track: Layout shifts during page load

### **Custom Metrics**

```javascript
// Track custom performance metrics
function trackMetric(name, value) {
    // Send to analytics
    if (window.umami) {
        umami.track(name, { value });
    }
    
    // Log to console in dev
    if (process.env.NODE_ENV === 'development') {
        console.log(`[Metric] ${name}: ${value}ms`);
    }
}

// Example usage
const start = performance.now();
await loadChapter(chapterId);
const duration = performance.now() - start;
trackMetric('chapter_load_time', duration);
```

---

## 🎨 CSS Best Practices

### **BEM Naming Convention**

```css
/* Block */
.card {}

/* Element */
.card__title {}
.card__image {}

/* Modifier */
.card--featured {}
.card__title--large {}
```

### **CSS Custom Properties**

```css
/* Define in :root */
:root {
    --color-primary: #00d9ff;
    --color-secondary: #ff00ea;
    --spacing-sm: 8px;
    --spacing-md: 16px;
    --spacing-lg: 24px;
}

/* Use throughout */
.button {
    background: var(--color-primary);
    padding: var(--spacing-md);
}

/* Override in dark mode */
@media (prefers-color-scheme: dark) {
    :root {
        --color-primary: #00b3d9;
    }
}
```

### **Mobile-First Responsive Design**

```css
/* Base styles (mobile) */
.container {
    padding: 1rem;
}

/* Tablet and up */
@media (min-width: 768px) {
    .container {
        padding: 2rem;
    }
}

/* Desktop and up */
@media (min-width: 1024px) {
    .container {
        padding: 3rem;
        max-width: 1200px;
        margin: 0 auto;
    }
}
```

---

## 🚨 Common Bugs & How to Avoid Them

### **1. Race Conditions**

```javascript
// BAD - race condition
let currentRequest;
async function search(query) {
    const result = await fetch(`/api/search?q=${query}`);
    displayResults(result);  // Might display old results!
}

// GOOD - abort previous requests
let currentController;
async function search(query) {
    // Cancel previous request
    if (currentController) {
        currentController.abort();
    }
    
    currentController = new AbortController();
    
    try {
        const result = await fetch(`/api/search?q=${query}`, {
            signal: currentController.signal
        });
        displayResults(result);
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Search failed:', err);
        }
    }
}
```

### **2. Memory Leaks**

```javascript
// BAD - event listener not removed
function setupPage() {
    window.addEventListener('resize', handleResize);
}

// GOOD - cleanup
function setupPage() {
    const cleanup = () => {
        window.removeEventListener('resize', handleResize);
    };
    
    window.addEventListener('resize', handleResize);
    
    return cleanup;
}

// Usage
const cleanup = setupPage();
// Later...
cleanup();
```

### **3. State Mutations**

```javascript
// BAD - mutating state directly
function updateUser(state, newName) {
    state.user.name = newName;  // Direct mutation!
    return state;
}

// GOOD - immutable update
function updateUser(state, newName) {
    return {
        ...state,
        user: {
            ...state.user,
            name: newName
        }
    };
}
```

---

## 📚 Useful Commands

### **Git**

```bash
# Check what changed
git status
git diff

# Commit with meaningful message
git commit -m "feat: add image lazy loading for chapter pages"

# Push to branch
git push origin feature/lazy-loading

# Create and switch to new branch
git checkout -b feature/new-feature
```

### **NPM**

```bash
# Install dependencies
npm install

# Run tests
npm test
npm run test:watch
npm run test:coverage

# Check for outdated packages
npm outdated

# Update packages
npm update

# Audit for vulnerabilities
npm audit
npm audit fix
```

### **Docker (for backend)**

```bash
# Start services
docker compose up -d

# View logs
docker compose logs -f backend

# Run migrations
docker compose exec backend alembic upgrade head

# Stop services
docker compose down
```

---

## ✅ Definition of Done

Before marking a task as complete, ensure:

- [ ] **Code works** - Feature functions as expected
- [ ] **Tests pass** - All existing + new tests green
- [ ] **Tests added** - New code has test coverage
- [ ] **Code reviewed** - Self-review or peer review done
- [ ] **Documentation updated** - README, JSDoc, comments
- [ ] **No console warnings** - Clean browser console
- [ ] **Accessible** - Keyboard nav, screen reader tested
- [ ] **Responsive** - Mobile, tablet, desktop tested
- [ ] **Performance** - No regressions in load time
- [ ] **Security** - No new vulnerabilities introduced

---

**Last Updated**: December 17, 2025  
**Maintainer**: Battle Bros Dev Team

For historical optimization notes, see: `docs/archive/CODE_REVIEW_AND_OPTIMIZATION.md` (legacy).
