import { el } from "./dom.js";
import { state } from "./state.js";

const COMMENTS_ENDPOINT = "/api/admin/comments/recent";
const USERS_ENDPOINT = "/api/admin/users";
const ANALYTICS_ENDPOINT = "/api/admin/analytics/summary";
const READER_ANALYTICS_ENDPOINT = "/api/admin/analytics/reader";
const WEEKLY_DIGEST_ENDPOINT = "/api/admin/analytics/weekly-digest";
const BLUESKY_NOTIFICATIONS_ENDPOINT = "/api/admin/bluesky/notifications";
const BLUESKY_STATUS_ENDPOINT = "/api/admin/bluesky/status";
const TODOS_ENDPOINT = "/api/admin/todos";

const RECENT_DAYS = 7;
const NOTIFICATION_LIMIT = 8;
const SCHEDULE_LIMIT = 6;
const BLUESKY_LIMIT = 6;
const TODO_LIMIT = 20;

const CONNECTIONS = [
  {
    tag: "Sales",
    title: "Big Cartel",
    meta: "Connect to surface new orders.",
    tone: "warn",
  },
  {
    tag: "Social",
    title: "Bluesky + socials",
    meta: "Connect to track mentions and replies.",
    tone: "warn",
  },
  {
    tag: "Email",
    title: "Mailing list",
    meta: "Connect your list provider for new signup alerts.",
    tone: "warn",
  },
];

function formatStat(value) {
  if (value === null || value === undefined) return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("en-US");
}

function formatPercent(value) {
  if (value === null || value === undefined) return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `${Math.round(num * 100)}%`;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatDateTime(value) {
  const date = parseDate(value);
  if (!date) return "-";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatRelativeTime(value) {
  const date = parseDate(value);
  if (!date) return "-";
  const now = Date.now();
  const diff = date.getTime() - now;
  const isFuture = diff > 0;
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / (60 * 1000));
  const hours = Math.round(abs / (60 * 60 * 1000));
  const days = Math.round(abs / (24 * 60 * 60 * 1000));

  let label = "";
  if (minutes < 60) {
    label = `${minutes || 1}m`;
  } else if (hours < 24) {
    label = `${hours}h`;
  } else {
    label = `${days}d`;
  }
  return isFuture ? `in ${label}` : `${label} ago`;
}

function truncate(text, limit = 90) {
  const value = String(text || "").trim();
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trim()}...`;
}

function setDashboardStatus(message, isError = false) {
  if (!el.dashboardStatus) return;
  el.dashboardStatus.textContent = message || "";
  el.dashboardStatus.style.display = message ? "block" : "none";
  el.dashboardStatus.className = isError ? "error-message" : "success-message";
  if (message) {
    setTimeout(() => {
      if (el.dashboardStatus) el.dashboardStatus.style.display = "none";
    }, 3000);
  }
}

function setAnalyticsStatus(message, isError = false) {
  if (!el.dashAnalyticsStatus) return;
  el.dashAnalyticsStatus.textContent = message;
  el.dashAnalyticsStatus.style.color = isError ? "var(--danger)" : "inherit";
}

function setTodoStatus(message, isError = false) {
  if (!el.dashTodoStatus) return;
  el.dashTodoStatus.textContent = message || "";
  el.dashTodoStatus.style.display = message ? "block" : "none";
  el.dashTodoStatus.style.background = isError ? "var(--danger)" : "var(--success)";
  el.dashTodoStatus.style.color = isError ? "var(--text)" : "var(--bg-dark)";
  if (message) {
    setTimeout(() => {
      if (el.dashTodoStatus) el.dashTodoStatus.style.display = "none";
    }, 3000);
  }
}

function clearList(target, emptyEl) {
  if (target) target.innerHTML = "";
  if (emptyEl) emptyEl.style.display = "none";
}

function renderList(target, emptyEl, items, renderItem) {
  if (!target) return;
  target.innerHTML = "";
  if (!items.length) {
    if (emptyEl) emptyEl.style.display = "block";
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";
  items.forEach((item) => {
    target.appendChild(renderItem(item));
  });
}

function buildListItem(item) {
  const row = document.createElement("div");
  row.className = `dashboard-item${item.tone ? ` dashboard-item--${item.tone}` : ""}`;

  const main = document.createElement("div");
  main.className = "dashboard-item-main";

  const title = document.createElement("div");
  title.className = "dashboard-item-title";

  if (item.tag) {
    const tag = document.createElement("span");
    tag.className = "dashboard-tag";
    if (item.tagTone) tag.classList.add(`dashboard-tag--${item.tagTone}`);
    tag.textContent = item.tag;
    title.appendChild(tag);
  }
  title.appendChild(document.createTextNode(item.title || "Update"));
  main.appendChild(title);

  if (item.meta) {
    const meta = document.createElement("div");
    meta.className = "dashboard-item-meta";
    meta.textContent = item.meta;
    main.appendChild(meta);
  }

  row.appendChild(main);

  if (item.time) {
    const time = document.createElement("div");
    time.className = "dashboard-item-time";
    time.textContent = item.time;
    row.appendChild(time);
  }

  return row;
}

function getUpcomingPosts(posts) {
  const now = Date.now();
  return posts
    .filter((post) => post && post.status === "scheduled" && post.date)
    .filter((post) => {
      const date = parseDate(post.date);
      return date && date.getTime() > now;
    })
    .sort((a, b) => {
      const ad = parseDate(a.date);
      const bd = parseDate(b.date);
      return (ad?.getTime() || 0) - (bd?.getTime() || 0);
    });
}

function getRecentItems(items, dateKey) {
  const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
  return items
    .filter((item) => item && item[dateKey])
    .filter((item) => {
      const date = parseDate(item[dateKey]);
      return date && date.getTime() >= cutoff;
    })
    .sort((a, b) => {
      const ad = parseDate(a[dateKey]);
      const bd = parseDate(b[dateKey]);
      return (bd?.getTime() || 0) - (ad?.getTime() || 0);
    });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

function updateMetrics(posts, comments, users) {
  const scheduledPosts = getUpcomingPosts(posts);
  if (el.dashScheduledCount) {
    el.dashScheduledCount.textContent = formatStat(scheduledPosts.length);
  }
  if (el.dashScheduledNext) {
    const next = scheduledPosts[0];
    el.dashScheduledNext.textContent = next
      ? `Next: ${formatDateTime(next.date)}`
      : "Next: -";
  }
  if (el.dashDraftCount) {
    const drafts = posts.filter((post) => post?.status === "draft");
    el.dashDraftCount.textContent = formatStat(drafts.length);
  }

  const recentComments = getRecentItems(comments, "createdAt");
  if (el.dashCommentCount) {
    el.dashCommentCount.textContent = formatStat(recentComments.length);
  }
  if (el.dashCommentLatest) {
    const latest = recentComments[0];
    el.dashCommentLatest.textContent = latest
      ? `Latest: ${latest.displayName || "User"}`
      : "Latest: -";
  }

  const recentUsers = getRecentItems(users, "createdAt");
  if (el.dashUserCount) {
    el.dashUserCount.textContent = formatStat(recentUsers.length);
  }
  if (el.dashUserLatest) {
    const latest = recentUsers[0];
    const label = latest?.displayName || latest?.email || "User";
    el.dashUserLatest.textContent = latest ? `Latest: ${label}` : "Latest: -";
  }
}

function formatBlueskyReason(reason) {
  const value = String(reason || "").toLowerCase();
  if (value === "reply") return "Reply";
  if (value === "mention") return "Mention";
  if (value === "like") return "Like";
  if (value === "repost") return "Repost";
  if (value === "follow") return "Follow";
  return "Bluesky";
}

function renderNotifications({ posts, comments, users, bluesky, blueskyUnreadCount }) {
  const upcomingPosts = getUpcomingPosts(posts);
  const recentCommentsAll = getRecentItems(comments, "createdAt");
  const recentUsersAll = getRecentItems(users, "createdAt");
  const scheduledPosts = upcomingPosts.slice(0, 3);
  const recentComments = recentCommentsAll.slice(0, 4);
  const recentUsers = recentUsersAll.slice(0, 3);
  const blueskyNotes = Array.isArray(bluesky) ? bluesky.slice(0, 4) : [];

  const items = [];

  scheduledPosts.forEach((post) => {
    items.push({
      tag: "Schedule",
      tagTone: "success",
      tone: "success",
      title: post.title || "Scheduled post",
      meta: `Goes live ${formatDateTime(post.date)}`,
      time: formatRelativeTime(post.date),
    });
  });

  recentComments.forEach((comment) => {
    items.push({
      tag: "Comment",
      tagTone: comment.hidden ? "danger" : "accent",
      tone: comment.hidden ? "danger" : "warn",
      title: comment.displayName || "New comment",
      meta: truncate(comment.message || "New comment received."),
      time: formatRelativeTime(comment.createdAt),
    });
  });

  recentUsers.forEach((user) => {
    const label = user.displayName || user.email || "New account";
    items.push({
      tag: "Account",
      tagTone: "accent",
      title: label,
      meta: "New account created.",
      time: formatRelativeTime(user.createdAt),
    });
  });

  blueskyNotes.forEach((note) => {
    const author =
      note.authorName || note.authorHandle || "Bluesky notification";
    const reason = formatBlueskyReason(note.reason);
    const text = truncate(note.text || "");
    items.push({
      tag: reason,
      tagTone: "accent",
      tone: "warn",
      title: author,
      meta: text || "New activity on Bluesky.",
      time: formatRelativeTime(note.createdAt),
    });
  });

  const totalCount =
    upcomingPosts.length +
    recentCommentsAll.length +
    recentUsersAll.length +
    (Number.isFinite(Number(blueskyUnreadCount))
      ? Number(blueskyUnreadCount)
      : blueskyNotes.length);
  const limited = items.slice(0, NOTIFICATION_LIMIT);
  if (el.dashNotificationCount) {
    el.dashNotificationCount.textContent = String(totalCount);
  }
  renderList(el.dashNotifications, el.dashNotificationsEmpty, limited, buildListItem);
}

function renderSchedule(posts) {
  const scheduledPosts = getUpcomingPosts(posts);
  const items = scheduledPosts.slice(0, SCHEDULE_LIMIT).map((post) => {
    const metaParts = [formatDateTime(post.date)];
    if (post.share === false) metaParts.push("Not broadcasting");
    return {
      tag: "Post",
      tagTone: "success",
      title: post.title || "Scheduled post",
      meta: metaParts.join(" - "),
      time: formatRelativeTime(post.date),
    };
  });
  if (el.dashScheduleCount) {
    el.dashScheduleCount.textContent = String(scheduledPosts.length);
  }
  renderList(el.dashScheduleList, el.dashScheduleEmpty, items, buildListItem);
}

function renderAnalyticsSummary(summary) {
  const ranges = summary?.ranges || {};
  const last24h = ranges.last24h || {};
  const last7d = ranges.last7d || {};

  if (el.dashViews24h) el.dashViews24h.textContent = formatStat(last24h.pageviews);
  if (el.dashVisitors24h) {
    el.dashVisitors24h.textContent = formatStat(last24h.visitors);
  }
  if (el.dashViews7d) el.dashViews7d.textContent = formatStat(last7d.pageviews);
  if (el.dashVisitors7d) {
    el.dashVisitors7d.textContent = formatStat(last7d.visitors);
  }
}

function renderReaderSummary(payload) {
  const safe = payload || {};
  if (el.dashEntryReads) {
    el.dashEntryReads.textContent = formatStat(safe.entryReadsTotal);
  }
  if (el.dashEntryStarts) {
    el.dashEntryStarts.textContent = formatStat(safe.entryStartsTotal);
  }
  if (el.dashFinishRate) {
    el.dashFinishRate.textContent = formatPercent(safe.finishRate);
  }
  if (el.dashUniqueVisitors) {
    el.dashUniqueVisitors.textContent = formatStat(safe.uniqueVisitors);
  }
}

function renderConnections(status = {}) {
  const blueskyConnected = status.blueskyConnected === true;
  const blueskyHandle = status.blueskyHandle || "";
  const connections = CONNECTIONS.map((item) => {
    if (item.title !== "Bluesky + socials") return item;
    if (!blueskyConnected) return item;
    return {
      ...item,
      tag: "Connected",
      tagTone: "success",
      tone: "success",
      meta: blueskyHandle ? `Connected as @${blueskyHandle}.` : "Connected.",
    };
  });
  renderList(el.dashConnectionsList, null, connections, buildListItem);
}

function formatChangeIndicator(change) {
  const value = change?.value ?? 0;
  const percent = change?.percent ?? 0;
  const isPositive = value > 0;
  const isNeutral = value === 0;

  const arrow = isPositive ? "\u2191" : isNeutral ? "\u2013" : "\u2193";
  const colorClass = isPositive ? "change-positive" : isNeutral ? "change-neutral" : "change-negative";
  const percentText = Math.abs(Math.round(percent * 100));

  return `<span class="change-indicator ${colorClass}">${arrow} ${percentText}%</span>`;
}

function renderWeeklyDigest(payload) {
  if (!payload || !el.weeklyDigestCard) return;

  const tw = payload.thisWeek || {};
  const changes = payload.changes || {};

  if (el.weeklyDigestReads) {
    el.weeklyDigestReads.textContent = formatStat(tw.reads);
  }
  if (el.weeklyDigestStarts) {
    el.weeklyDigestStarts.textContent = formatStat(tw.starts);
  }
  if (el.weeklyDigestCompletionRate) {
    el.weeklyDigestCompletionRate.textContent = formatPercent(tw.completionRate);
  }
  if (el.weeklyDigestVisitors) {
    el.weeklyDigestVisitors.textContent = formatStat(tw.uniqueVisitors);
  }

  if (el.weeklyDigestReadsChange) {
    el.weeklyDigestReadsChange.innerHTML = formatChangeIndicator(changes.reads);
  }
  if (el.weeklyDigestStartsChange) {
    el.weeklyDigestStartsChange.innerHTML = formatChangeIndicator(changes.starts);
  }
  if (el.weeklyDigestCompletionRateChange) {
    el.weeklyDigestCompletionRateChange.innerHTML = formatChangeIndicator(changes.completionRate);
  }
  if (el.weeklyDigestVisitorsChange) {
    el.weeklyDigestVisitorsChange.innerHTML = formatChangeIndicator(changes.uniqueVisitors);
  }
}

async function deleteTodo(todoId) {
  if (!todoId) return;
  const ok = confirm("Remove this todo?");
  if (!ok) return;
  try {
    const res = await fetch(`${TODOS_ENDPOINT}/${todoId}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to remove todo.");
    setTodoStatus("Todo removed.");
    await loadTodos();
  } catch (err) {
    setTodoStatus(err.message || "Failed to remove todo.", true);
  }
}

function buildTodoItem(todo) {
  const row = document.createElement("div");
  row.className = "dashboard-item";

  const main = document.createElement("div");
  main.className = "dashboard-item-main";

  const title = document.createElement("div");
  title.className = "dashboard-item-title";
  title.textContent = todo.body || "Todo";
  main.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "dashboard-item-meta";
  const author = todo.createdByName || todo.createdByEmail;
  const metaParts = [];
  if (author) metaParts.push(`By ${author}`);
  if (todo.createdAt) metaParts.push(formatDateTime(todo.createdAt));
  meta.textContent = metaParts.length ? metaParts.join(" • ") : "Added.";
  main.appendChild(meta);

  row.appendChild(main);

  const actions = document.createElement("div");
  actions.className = "dashboard-item-actions";

  if (todo.createdAt) {
    const time = document.createElement("div");
    time.className = "dashboard-item-time";
    time.textContent = formatRelativeTime(todo.createdAt);
    actions.appendChild(time);
  }

  const removeBtn = document.createElement("button");
  removeBtn.className = "btn-small btn-delete";
  removeBtn.type = "button";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => deleteTodo(todo.id));
  actions.appendChild(removeBtn);

  row.appendChild(actions);
  return row;
}

function renderTodos(todos = []) {
  if (!el.dashTodoList) return;
  el.dashTodoList.innerHTML = "";
  if (el.dashTodoCount) el.dashTodoCount.textContent = String(todos.length);
  if (!todos.length) {
    if (el.dashTodoEmpty) el.dashTodoEmpty.style.display = "block";
    return;
  }
  if (el.dashTodoEmpty) el.dashTodoEmpty.style.display = "none";
  todos.forEach((todo) => {
    el.dashTodoList.appendChild(buildTodoItem(todo));
  });
}

async function loadTodos() {
  if (!el.dashTodoList) return;
  try {
    const data = await fetchJson(`${TODOS_ENDPOINT}?limit=${TODO_LIMIT}`);
    const todos = Array.isArray(data.todos) ? data.todos : [];
    renderTodos(todos);
  } catch (err) {
    renderTodos([]);
    setTodoStatus(err.message || "Todo feed unavailable.", true);
  }
}

async function addTodo() {
  if (!el.dashTodoInput) return;
  const body = (el.dashTodoInput.value || "").trim();
  if (!body) {
    setTodoStatus("Todo text is required.", true);
    return;
  }
  try {
    const res = await fetch(TODOS_ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to add todo.");
    setTodoStatus("Todo added.");
    el.dashTodoInput.value = "";
    await loadTodos();
  } catch (err) {
    setTodoStatus(err.message || "Failed to add todo.", true);
  }
}

function createDashboard({ hideAllSections, setActiveNav, loadPosts } = {}) {
  function showDashboardSection() {
    if (hideAllSections) hideAllSections();
    if (el.dashboardSection) {
      el.dashboardSection.style.display = "block";
      el.dashboardSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (setActiveNav) setActiveNav(el.btnDashboard);
  }

  async function refreshDashboard({ showLoading = false, skipPosts = false } = {}) {
    if (!el.dashboardSection) return;

    if (showLoading) setDashboardStatus("Refreshing dashboard...");

    try {
      if (loadPosts && !skipPosts) await loadPosts();
      const posts = Array.isArray(state.posts) ? state.posts : [];

      const [
        commentsResult,
        usersResult,
        analyticsResult,
        readerResult,
        weeklyDigestResult,
        blueskyResult,
        blueskyStatusResult,
        todosResult,
      ] =
        await Promise.allSettled([
          fetchJson(`${COMMENTS_ENDPOINT}?limit=${NOTIFICATION_LIMIT * 2}`),
          fetchJson(USERS_ENDPOINT),
          fetchJson(ANALYTICS_ENDPOINT),
          fetchJson(`${READER_ANALYTICS_ENDPOINT}?range=7d`),
          fetchJson(WEEKLY_DIGEST_ENDPOINT),
          fetchJson(`${BLUESKY_NOTIFICATIONS_ENDPOINT}?limit=${BLUESKY_LIMIT}`),
          fetchJson(BLUESKY_STATUS_ENDPOINT),
          fetchJson(`${TODOS_ENDPOINT}?limit=${TODO_LIMIT}`),
        ]);

      const comments =
        commentsResult.status === "fulfilled" &&
        Array.isArray(commentsResult.value?.comments)
          ? commentsResult.value.comments
          : [];
      const users =
        usersResult.status === "fulfilled" &&
        Array.isArray(usersResult.value?.users)
          ? usersResult.value.users
          : [];
      const blueskyNotifications =
        blueskyResult.status === "fulfilled" &&
        Array.isArray(blueskyResult.value?.notifications)
          ? blueskyResult.value.notifications
          : [];
      const blueskyUnreadCount =
        blueskyResult.status === "fulfilled" ? blueskyResult.value?.unreadCount : null;
      const blueskyStatus =
        blueskyStatusResult.status === "fulfilled" ? blueskyStatusResult.value || {} : {};
      let blueskyConnected = false;
      if (blueskyStatusResult.status === "fulfilled") {
        blueskyConnected = Boolean(blueskyStatus?.connected);
      } else if (blueskyResult.status === "fulfilled") {
        blueskyConnected = Boolean(blueskyResult.value?.connected);
      }
      const blueskyHandle = String(blueskyStatus?.handle || "");
      const todos =
        todosResult.status === "fulfilled" && Array.isArray(todosResult.value?.todos)
          ? todosResult.value.todos
          : [];

      updateMetrics(posts, comments, users);
      renderNotifications({
        posts,
        comments,
        users,
        bluesky: blueskyNotifications,
        blueskyUnreadCount,
      });
      renderSchedule(posts);
      renderConnections({ blueskyConnected, blueskyHandle });
      renderTodos(todos);

      const summaryOk = analyticsResult.status === "fulfilled";
      const readerOk = readerResult.status === "fulfilled";

      if (summaryOk) {
        renderAnalyticsSummary(analyticsResult.value);
      } else {
        renderAnalyticsSummary({});
      }
      if (readerOk) {
        renderReaderSummary(readerResult.value);
      } else {
        renderReaderSummary({});
      }

      // Weekly Digest
      if (weeklyDigestResult.status === "fulfilled") {
        renderWeeklyDigest(weeklyDigestResult.value);
      } else {
        renderWeeklyDigest({});
      }

      if (summaryOk && readerOk) {
        setAnalyticsStatus("Analytics synced.");
      } else if (summaryOk || readerOk) {
        setAnalyticsStatus("Analytics partially synced.");
      } else {
        setAnalyticsStatus("Analytics unavailable.", true);
      }

      if (showLoading) setDashboardStatus("Dashboard refreshed.");
    } catch (error) {
      console.error("Dashboard refresh failed:", error);
      setDashboardStatus("Failed to refresh dashboard.", true);
    }
  }

  function clearDashboard() {
    clearList(el.dashNotifications, el.dashNotificationsEmpty);
    clearList(el.dashScheduleList, el.dashScheduleEmpty);
    clearList(el.dashConnectionsList, null);
    clearList(el.dashTodoList, el.dashTodoEmpty);
  }

  if (el.btnDashTodoAdd) {
    el.btnDashTodoAdd.addEventListener("click", addTodo);
  }
  if (el.dashTodoInput) {
    el.dashTodoInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addTodo();
      }
    });
  }

  return {
    clearDashboard,
    refreshDashboard,
    showDashboardSection,
  };
}

export { createDashboard };
