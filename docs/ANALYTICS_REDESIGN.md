# Reader Analytics Redesign Plan

Status: partially implemented in admin as of April 2026.

## User Goals
- **Primary**: Quick answer to "Is my content performing well?"
- **Priority**: Visual/aesthetic cleanup first

## Current State
The analytics dashboard currently shows:
- Summary cards: `Pages Read`, `Entry Starts`, `Start-to-Finish Rate`, `Unique Visitors`
- Sitewide traffic panels: `Page Reads`, landing pages, referrers, countries, browsers, devices, top events
- `Pages Read Over Time`: line chart using raw `reader_page_view` totals
- Reader tabs:
  - `Pages Read`
  - `Start-to-Finish Rate`
- `Visitor History`: compact master-detail visitor list with search/sort and issue-level detail
- Weekly Digest: this week vs last week comparison using page reads, starts, completion rate, visitors

### Implemented changes
- Health header kept as dot + headline + summary only.
- Stop/drop-off UI removed from admin.
- Reader reads were redefined to page views where the UI says `Pages Read`.
- Raw finish lists were replaced by rate lists using unique starts vs unique finishes.
- Ratio drilldowns now use `/api/admin/analytics/reader-series?metric=completion_rate`.
- Historical visitor inspection is available without mixing it into the live visitor panel.
- Frontend analytics code is now split into focused modules under `admin/analytics/`, with `admin/analytics.js` kept as the facade used by `admin/app.js`.

### Still future work
- Retention/cohort analysis
- Funnel visualization
- Session summaries with clearer visit-level definitions
- Stronger recommendations/alerts beyond the current health summary

## Pain Points

### 1. Information Overload
- Five nearly identical cards showing ranked lists
- Hard to quickly answer "how is my content doing?"
- No clear hierarchy - everything feels equally important

### 2. Missing Context
- Raw numbers without benchmarks ("Is 14 reads good?")
- No comparison to typical/expected performance
- Completion rate still lacks deeper retention context

### 3. Not Actionable
- Data tells you what happened, not what to do
- No alerts or recommendations
- No way to track if improvements are working

### 4. Aesthetic Issues
- Dense, text-heavy layout
- Charts are functional but not engaging
- No visual storytelling

---

## Implementation Plan

### Phase 1: Visual Foundation (Aesthetic Cleanup)
Goal: Make analytics feel polished and easy to scan

#### Add Health Indicator at Top
Colored shape indicators:
- 🟢 Green circle = Doing Great
- 🟡 Yellow/amber circle = Steady
- 🔴 Red circle = Needs Attention

Based on: finish rate + week-over-week trend

One sentence summary: "Readers are engaging well this week"

#### Color-Code All Metrics
- Green: Above average / trending up
- Amber: Flat / neutral
- Red: Below average / trending down

Apply to: summary cards, list items, chart areas

#### Add Trend Arrows
- ↑ ↓ → next to every number
- Show % change from last period
- Example: "14 reads ↑ +23%"

#### Improve Whitespace & Hierarchy
- More padding between cards
- Larger, bolder hero numbers
- Dimmer secondary information
- Group related metrics visually

#### Chart Enhancements
- Fill area under line (more visual weight)
- Add subtle gradient
- Better hover tooltips
- "This week vs last week" overlay option

### Phase 2: Simplify Information
Goal: Answer "how am I doing?" without scrolling

#### Consolidate Performance Cards
- [x] Entry/series views moved into tabbed `Entry Performance` and `Series Performance`
- [x] Stop-page panel removed
- [x] Right-hand cards changed from raw finishes to `Start-to-Finish Rate`

#### Summary Sentence
- [x] Auto-generated summary now uses pages read + start-to-finish rate
- Highlight outliers (unusually good or bad)

#### Better Empty States
- Encouraging message when no data
- "Keep creating! Your first readers will show up here"

### Phase 3: Deeper Insights (Future)
- Reader funnel visualization
- Best publishing times heatmap
- Reader cohort analysis
- Goal tracking

---

## Improvement Concepts (Reference)

### A. "At a Glance" Health Score
A single, prominent number (0-100) showing overall content health

Components:
- Finish rate weight: 40%
- Week-over-week growth: 30%
- Avg stop page (as % of total): 30%

Visual: Large circular gauge with color (red/yellow/green)

### B. Smart Insights Cards
Replace static metric lists with dynamic insight cards:

| Instead of... | Show... |
|--------------|---------|
| "Entry Reads: 14" | "Entry 5 got 3x more reads than usual this week" |
| "Finish Rate: 42%" | "Readers are 15% more likely to finish Entry 3 than average" |
| "Avg Stop: Page 4" | "Most readers leave at the fight scene (page 4) in Entry 7" |

### C. Reader Journey Visualization
```
Started Entry  ████████████████████████  100%
Reached Middle ██████████████            58%
Finished       ██████████                42%
Started Next   ████████                  35%
```

### D. Entry Performance Matrix
| Entry | Reads | Finish % | Trend | Rating |
|-------|-------|----------|-------|--------|
| Entry 1 | 45 | 78% | ↑ | ★★★★★ |
| Entry 5 | 14 | 42% | ↓ | ★★★☆☆ |

### E. Reader Cohort Analysis
- New vs Returning readers
- Engagement Tiers: Casual (1 entry), Regular (2-5), Superfan (5+)

---

## Visual Specifications

### Color Palette
```
Good:    #22c55e (green-500)
Neutral: #f59e0b (amber-500)
Concern: #ef4444 (red-500)
```

### Health Indicator Thresholds
| Metric | Good | Neutral | Concern |
|--------|------|---------|---------|
| Finish Rate | >60% | 40-60% | <40% |
| Week Change | >+10% | -10% to +10% | <-10% |

### Card Layout (Before → After)

**Before:** 5 equal cards in grid
```
[Entry Reads] [Series Reads] [Entry Finishes] [Series Finishes] [Stop Page]
```

**After:** Hero summary + tabbed detail
```
┌─────────────────────────────────────────────────────────┐
│  ● Your content is performing well                      │  (green dot)
│  "Entry 5 led this week with 14 reads, 78% finished"    │
├─────────────────────────────────────────────────────────┤
│  14 Reads ↑23%  │  8 Finishes ↑12%  │  57% Rate ↑5%    │
│    (green)      │     (green)       │    (green)       │
└─────────────────────────────────────────────────────────┘

[ Entry Performance ]  [ Series Performance ]

┌────────────────────────────────────────────────────────┐
│ ● Entry 5  ████████████ 14 reads  78% finish  ↑ +23%  │ green
│ ● Entry 3  ███████      9 reads   65% finish  → +2%   │ amber
│ ● Entry 7  ████         5 reads   40% finish  ↓ -15%  │ red
└────────────────────────────────────────────────────────┘
```

---

## Frontend Architecture (Current)
- `admin/analytics.js` - Thin coordinator/facade exposing `createAnalytics()`
- `admin/analytics/traffic.js` - Summary, page reads, landing pages, referrers, countries, browsers, devices, top events
- `admin/analytics/reader.js` - Health indicator, reader summary, reader cards, filters, drilldowns, weekly digest fetch
- `admin/analytics/reads-over-time.js` - Pages-read chart and controls
- `admin/analytics/visitor-history.js` - Search/sort + master-detail visitor history
- `admin/analytics/live.js` - Live visitors polling, ticker, and chart
- `admin/analytics/shared.js` - Shared pure formatters/helpers

## Files to Modify for Future Analytics UI Work
- `admin/index.html` - Restructure analytics section HTML when layout changes are needed
- `admin/analytics/traffic.js` - Sitewide traffic panel behavior
- `admin/analytics/reader.js` - Reader cards, health, and drilldowns
- `admin/analytics/reads-over-time.js` - Chart behavior and controls
- `admin/analytics/visitor-history.js` - Historical visitor inspection UI
- `admin/analytics/live.js` - Live visitor surfaces
- `backend API` - Possibly add health score calculation endpoint

## Verification
1. Open admin panel → Analytics section
2. Verify health indicator shows and makes sense
3. Check all metrics have trend arrows and colors
4. Verify cards have better visual hierarchy
5. Test with different data scenarios (good/bad/neutral)
