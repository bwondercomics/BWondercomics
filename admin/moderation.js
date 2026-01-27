import { el } from "./dom.js";

const COMMENTS_ENDPOINT = "/api/admin/comments";
const COMMENT_MOD_ENDPOINT = "/api/admin/comments";
const USERS_ENDPOINT = "/api/admin/users";
const POSTS_ENDPOINT = "/api/admin/posts";
const BANS_ENDPOINT = "/api/admin/moderation/bans";
const BAN_USER_ENDPOINT = "/api/admin/moderation/ban-user";
const UNBAN_USER_ENDPOINT = "/api/admin/moderation/unban-user";
const BAN_IP_ENDPOINT = "/api/admin/moderation/ban-ip";
const UNBAN_IP_ENDPOINT = "/api/admin/moderation/unban-ip";
const WORDS_ENDPOINT = "/api/admin/moderation/words";
const LIMITS_ENDPOINT = "/api/admin/moderation/comment-limits";

function normalizePhrase(phrase) {
  return phrase.trim().toLowerCase().replace(/\s+/g, " ");
}

function splitPhrases(raw) {
  return raw
    .split(/[,\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function setStatus(message, isError = false) {
  if (!el.moderationStatus) return;
  el.moderationStatus.textContent = message || "";
  el.moderationStatus.style.display = message ? "block" : "none";
  el.moderationStatus.style.background = isError ? "var(--danger)" : "var(--success)";
  el.moderationStatus.style.color = isError ? "var(--text)" : "var(--bg-dark)";
  if (message) {
    setTimeout(() => {
      if (el.moderationStatus) el.moderationStatus.style.display = "none";
    }, 3000);
  }
}

function setLimitsStatus(message, isError = false) {
  if (!el.moderationLimitsStatus) return;
  el.moderationLimitsStatus.textContent = message || "";
  el.moderationLimitsStatus.style.display = message ? "block" : "none";
  el.moderationLimitsStatus.style.background = isError ? "var(--danger)" : "var(--success)";
  el.moderationLimitsStatus.style.color = isError ? "var(--text)" : "var(--bg-dark)";
  if (message) {
    setTimeout(() => {
      if (el.moderationLimitsStatus) el.moderationLimitsStatus.style.display = "none";
    }, 3000);
  }
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function targetLabel(targetType) {
  switch (targetType) {
    case "chapter":
      return "Entry";
    case "post":
      return "Feed post";
    case "user":
      return "User";
    default:
      return "Target";
  }
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

async function postJson(url, body, method = "POST") {
  return fetchJson(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
}

function readLimitValue(inputEl) {
  const raw = inputEl?.value ?? "";
  const sanitized = String(raw).replace(/[,\s_]+/g, "");
  const parsed = Number.parseInt(sanitized, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function setLimitValue(inputEl, value) {
  if (!inputEl) return;
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  inputEl.value = String(safeValue);
}

function buildQueryParams() {
  const params = new URLSearchParams();
  const search = el.moderationSearch?.value?.trim();
  const targetType = el.moderationTargetType?.value || "";
  const targetId = el.moderationTargetId?.value?.trim();
  const userId = el.moderationUserFilter?.value || "";
  const status = el.moderationStatusFilter?.value || "all";
  const sort = el.moderationSort?.value || "newest";

  if (search) params.set("search", search);
  if (targetType) params.set("targetType", targetType);
  if (targetId) params.set("targetId", targetId);
  if (userId) params.set("userId", userId);
  if (status) params.set("status", status);
  if (sort) params.set("sort", sort);
  params.set("limit", "60");
  return params.toString();
}

function renderComments(comments = [], total = 0) {
  if (!el.moderationCommentsList) return;
  el.moderationCommentsList.innerHTML = "";
  if (el.moderationCommentsEmpty) {
    el.moderationCommentsEmpty.style.display = comments.length ? "none" : "block";
  }
  if (el.moderationResults) {
    el.moderationResults.textContent = comments.length
      ? `Showing ${comments.length} of ${total} comments.`
      : "No comments yet.";
  }

  comments.forEach((comment) => {
    const item = document.createElement("div");
    item.className = "entry-item moderation-comment";
    if (comment.hidden) item.style.opacity = "0.7";

    const info = document.createElement("div");
    info.className = "entry-info";

    const title = document.createElement("div");
    title.className = "entry-name";
    title.textContent = comment.displayName || comment.userEmail || "User";
    info.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "entry-meta moderation-meta";
    meta.textContent = `${targetLabel(comment.targetType)}: ${comment.targetId || "-"}`;
    info.appendChild(meta);

    const meta2 = document.createElement("div");
    meta2.className = "entry-meta moderation-meta";
    const ip = comment.ipAddress ? ` • IP ${comment.ipAddress}` : "";
    meta2.textContent = `${comment.userEmail || "Unknown"} • ${formatDateTime(comment.createdAt)}${ip}`;
    info.appendChild(meta2);

    const message = document.createElement("div");
    message.className = "moderation-message";
    message.textContent = comment.message || "";
    info.appendChild(message);

    const actions = document.createElement("div");
    actions.className = "entry-actions";

    const hideBtn = document.createElement("button");
    hideBtn.className = "btn-small btn-edit";
    hideBtn.type = "button";
    hideBtn.textContent = comment.hidden ? "Unhide" : "Hide";
    hideBtn.addEventListener("click", async () => {
      try {
        await postJson(COMMENT_MOD_ENDPOINT, {
          targetId: comment.targetId,
          commentId: comment.id,
          action: comment.hidden ? "unhide" : "hide",
        });
        setStatus("Comment updated.");
        await loadComments();
      } catch (err) {
        setStatus(err.message || "Failed to update comment.", true);
      }
    });
    actions.appendChild(hideBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-small btn-delete";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", async () => {
      if (!confirm("Delete this comment?")) return;
      try {
        await postJson(COMMENT_MOD_ENDPOINT, {
          targetId: comment.targetId,
          commentId: comment.id,
          action: "delete",
        });
        setStatus("Comment deleted.");
        await loadComments();
      } catch (err) {
        setStatus(err.message || "Failed to delete comment.", true);
      }
    });
    actions.appendChild(deleteBtn);

    const banUserBtn = document.createElement("button");
    banUserBtn.className = "btn-small btn-delete";
    banUserBtn.type = "button";
    banUserBtn.textContent = "Ban User";
    banUserBtn.addEventListener("click", async () => {
      if (!comment.userId) return;
      const reason = prompt("Ban reason (optional):") || "";
      try {
        await postJson(BAN_USER_ENDPOINT, { userId: comment.userId, reason });
        setStatus("User banned.");
        await loadBans();
        await loadComments();
      } catch (err) {
        setStatus(err.message || "Failed to ban user.", true);
      }
    });
    actions.appendChild(banUserBtn);

    if (comment.ipAddress) {
      const banIpBtn = document.createElement("button");
      banIpBtn.className = "btn-small btn-delete";
      banIpBtn.type = "button";
      banIpBtn.textContent = "Ban IP";
      banIpBtn.addEventListener("click", async () => {
        const reason = prompt("IP ban reason (optional):") || "";
        try {
          await postJson(BAN_IP_ENDPOINT, { ipAddress: comment.ipAddress, reason });
          setStatus("IP banned.");
          await loadBans();
          await loadComments();
        } catch (err) {
          setStatus(err.message || "Failed to ban IP.", true);
        }
      });
      actions.appendChild(banIpBtn);
    }

    item.appendChild(info);
    item.appendChild(actions);
    el.moderationCommentsList.appendChild(item);
  });
}

function renderBannedUsers(users = []) {
  if (!el.moderationBannedUsersList) return;
  el.moderationBannedUsersList.innerHTML = "";
  if (el.moderationBannedUsersEmpty) {
    el.moderationBannedUsersEmpty.style.display = users.length ? "none" : "block";
  }

  users.forEach((user) => {
    const item = document.createElement("div");
    item.className = "entry-item";

    const info = document.createElement("div");
    info.className = "entry-info";

    const title = document.createElement("div");
    title.className = "entry-name";
    title.textContent = user.displayName || user.email || "User";
    info.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "entry-meta";
    meta.textContent = user.email || "";
    info.appendChild(meta);

    const meta2 = document.createElement("div");
    meta2.className = "entry-meta";
    meta2.textContent = `Banned ${formatDateTime(user.bannedAt)}${user.banReason ? ` • ${user.banReason}` : ""}`;
    info.appendChild(meta2);

    const actions = document.createElement("div");
    actions.className = "entry-actions";
    const unbanBtn = document.createElement("button");
    unbanBtn.className = "btn-small btn-edit";
    unbanBtn.type = "button";
    unbanBtn.textContent = "Unban";
    unbanBtn.addEventListener("click", async () => {
      try {
        await postJson(UNBAN_USER_ENDPOINT, { userId: user.id });
        setStatus("User unbanned.");
        await loadBans();
        await loadComments();
      } catch (err) {
        setStatus(err.message || "Failed to unban user.", true);
      }
    });
    actions.appendChild(unbanBtn);

    item.appendChild(info);
    item.appendChild(actions);
    el.moderationBannedUsersList.appendChild(item);
  });
}

function renderBannedIps(ips = []) {
  if (!el.moderationBannedIpsList) return;
  el.moderationBannedIpsList.innerHTML = "";
  if (el.moderationBannedIpsEmpty) {
    el.moderationBannedIpsEmpty.style.display = ips.length ? "none" : "block";
  }

  ips.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "entry-item";

    const info = document.createElement("div");
    info.className = "entry-info";
    const title = document.createElement("div");
    title.className = "entry-name";
    title.textContent = entry.ipAddress || "IP";
    info.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "entry-meta";
    meta.textContent = `Banned ${formatDateTime(entry.bannedAt)}${entry.reason ? ` • ${entry.reason}` : ""}`;
    info.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "entry-actions";
    const unbanBtn = document.createElement("button");
    unbanBtn.className = "btn-small btn-edit";
    unbanBtn.type = "button";
    unbanBtn.textContent = "Unban";
    unbanBtn.addEventListener("click", async () => {
      try {
        await postJson(UNBAN_IP_ENDPOINT, { ipAddress: entry.ipAddress });
        setStatus("IP unbanned.");
        await loadBans();
      } catch (err) {
        setStatus(err.message || "Failed to unban IP.", true);
      }
    });
    actions.appendChild(unbanBtn);

    item.appendChild(info);
    item.appendChild(actions);
    el.moderationBannedIpsList.appendChild(item);
  });
}

function renderWords(words = []) {
  if (!el.moderationWordsList) return;
  el.moderationWordsList.innerHTML = "";
  if (el.moderationWordsEmpty) {
    el.moderationWordsEmpty.style.display = words.length ? "none" : "block";
  }

  words.forEach((word) => {
    const item = document.createElement("div");
    item.className = "entry-item";

    const info = document.createElement("div");
    info.className = "entry-info";
    const title = document.createElement("div");
    title.className = "entry-name";
    title.textContent = word.phrase || "";
    info.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "entry-meta";
    meta.textContent = `Added ${formatDateTime(word.createdAt)}`;
    info.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "entry-actions";
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-small btn-delete";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Remove";
    deleteBtn.addEventListener("click", async () => {
      try {
        await fetchJson(`${WORDS_ENDPOINT}/${encodeURIComponent(word.id)}`, { method: "DELETE" });
        setStatus("Phrase removed.");
        await loadWords();
      } catch (err) {
        setStatus(err.message || "Failed to remove phrase.", true);
      }
    });
    actions.appendChild(deleteBtn);

    item.appendChild(info);
    item.appendChild(actions);
    el.moderationWordsList.appendChild(item);
  });
}

async function loadUserFilter() {
  if (!el.moderationUserFilter) return;
  const current = el.moderationUserFilter.value || "";
  const data = await fetchJson(USERS_ENDPOINT);
  const users = Array.isArray(data.users) ? data.users : [];
  el.moderationUserFilter.innerHTML = '<option value="">All users</option>';
  users.forEach((user) => {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = `${user.displayName || user.email || "User"}${user.email ? ` (${user.email})` : ""}`;
    el.moderationUserFilter.appendChild(option);
  });
  if (current) el.moderationUserFilter.value = current;
}

async function loadPostTargets() {
  if (!el.moderationTargetList) return;
  const data = await fetchJson(POSTS_ENDPOINT);
  const posts = Array.isArray(data.posts) ? data.posts : [];
  el.moderationTargetList.innerHTML = "";
  posts.slice(0, 200).forEach((post) => {
    if (!post?.id) return;
    const option = document.createElement("option");
    option.value = `post:${post.id}`;
    if (post.title) option.label = post.title;
    el.moderationTargetList.appendChild(option);
  });
}

async function loadComments() {
  const query = buildQueryParams();
  const url = query ? `${COMMENTS_ENDPOINT}?${query}` : COMMENTS_ENDPOINT;
  const data = await fetchJson(url);
  renderComments(Array.isArray(data.comments) ? data.comments : [], data.total || 0);
}

async function loadBans() {
  const data = await fetchJson(BANS_ENDPOINT);
  renderBannedUsers(Array.isArray(data.users) ? data.users : []);
  renderBannedIps(Array.isArray(data.ips) ? data.ips : []);
}

async function loadWords() {
  const data = await fetchJson(WORDS_ENDPOINT);
  renderWords(Array.isArray(data.words) ? data.words : []);
}

async function loadLimits() {
  const data = await fetchJson(LIMITS_ENDPOINT);
  const limits = data.limits || {};
  setLimitValue(el.moderationLimitMinInterval, limits.minIntervalSeconds);
  setLimitValue(el.moderationLimitRateWindow, limits.rateWindowSeconds);
  setLimitValue(el.moderationLimitMaxUser, limits.maxPerWindowUser);
  setLimitValue(el.moderationLimitMaxIp, limits.maxPerWindowIp);
  setLimitValue(el.moderationLimitDuplicateWindow, limits.duplicateWindowSeconds);
}

async function refreshModeration() {
  try {
    await loadUserFilter();
    await loadPostTargets();
    await Promise.allSettled([loadComments(), loadBans(), loadWords(), loadLimits()]);
  } catch (err) {
    setStatus(err.message || "Failed to load moderation data.", true);
  }
}

function clearFilters() {
  if (el.moderationSearch) el.moderationSearch.value = "";
  if (el.moderationTargetType) el.moderationTargetType.value = "";
  if (el.moderationTargetId) el.moderationTargetId.value = "";
  if (el.moderationUserFilter) el.moderationUserFilter.value = "";
  if (el.moderationStatusFilter) el.moderationStatusFilter.value = "all";
  if (el.moderationSort) el.moderationSort.value = "newest";
}

function showModerationSection({ hideAllSections, setActiveNav } = {}) {
  if (hideAllSections) hideAllSections();
  if (el.moderationSection) {
    el.moderationSection.style.display = "block";
    el.moderationSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (setActiveNav) setActiveNav(el.btnModeration);
}

function createModerationManager({ hideAllSections, setActiveNav, liveVisitors } = {}) {
  function startLiveVisitors() {
    liveVisitors?.startLiveVisitors?.();
  }

  function refreshLiveVisitors(showLoading = true) {
    liveVisitors?.loadLiveVisitors?.({ showLoading });
  }

  function handleShow() {
    showModerationSection({ hideAllSections, setActiveNav });
  }

  function bindEvents() {
    if (el.moderationWordsToggle) {
      el.moderationWordsToggle.addEventListener("click", () => {
        if (!el.moderationWordsBody) return;
        const isHidden = el.moderationWordsBody.style.display === "none";
        el.moderationWordsBody.style.display = isHidden ? "block" : "none";
        el.moderationWordsToggle.textContent = isHidden ? "Hide" : "Show";
      });
    }
    if (el.btnModerationRefresh) {
      el.btnModerationRefresh.addEventListener("click", async () => {
        await refreshModeration();
        refreshLiveVisitors(true);
        startLiveVisitors();
      });
    }
    if (el.btnModerationApply) {
      el.btnModerationApply.addEventListener("click", () => loadComments());
    }
    if (el.btnModerationClear) {
      el.btnModerationClear.addEventListener("click", async () => {
        clearFilters();
        await loadComments();
      });
    }
    if (el.btnModerationBanIp) {
      el.btnModerationBanIp.addEventListener("click", async () => {
        const ip = (el.moderationIpInput?.value || "").trim();
        if (!ip) {
          setStatus("Enter an IP to ban.", true);
          return;
        }
        const reason = prompt("IP ban reason (optional):") || "";
        try {
          await postJson(BAN_IP_ENDPOINT, { ipAddress: ip, reason });
          if (el.moderationIpInput) el.moderationIpInput.value = "";
          setStatus("IP banned.");
          await loadBans();
        } catch (err) {
          setStatus(err.message || "Failed to ban IP.", true);
        }
      });
    }
    if (el.btnModerationAddWord) {
      el.btnModerationAddWord.addEventListener("click", async () => {
        const rawInput = el.moderationWordInput?.value || "";
        const phrases = splitPhrases(rawInput);
        const unique = [];
        const seen = new Set();
        phrases.forEach((entry) => {
          const normalized = normalizePhrase(entry);
          if (!normalized || seen.has(normalized)) return;
          seen.add(normalized);
          unique.push(normalized);
        });

        if (!unique.length) {
          setStatus("Enter one or more phrases to censor.", true);
          return;
        }
        try {
          const results = await Promise.allSettled(
            unique.map((phrase) => postJson(WORDS_ENDPOINT, { phrase })),
          );
          const failures = results.filter((result) => result.status === "rejected").length;
          if (el.moderationWordInput) el.moderationWordInput.value = "";
          if (failures) {
            setStatus(
              `Added ${unique.length - failures} phrases, ${failures} failed.`,
              true,
            );
          } else {
            setStatus(
              unique.length === 1
                ? "Censored phrase added."
                : `Added ${unique.length} censored phrases.`,
            );
          }
          await loadWords();
        } catch (err) {
          setStatus(err.message || "Failed to add phrase.", true);
        }
      });
    }
    if (el.btnModerationSaveLimits) {
      el.btnModerationSaveLimits.addEventListener("click", async () => {
        const payload = {
          minIntervalSeconds: readLimitValue(el.moderationLimitMinInterval),
          rateWindowSeconds: readLimitValue(el.moderationLimitRateWindow),
          maxPerWindowUser: readLimitValue(el.moderationLimitMaxUser),
          maxPerWindowIp: readLimitValue(el.moderationLimitMaxIp),
          duplicateWindowSeconds: readLimitValue(el.moderationLimitDuplicateWindow),
        };
        try {
          const data = await postJson(LIMITS_ENDPOINT, payload);
          const limits = data.limits || payload;
          setLimitValue(el.moderationLimitMinInterval, limits.minIntervalSeconds);
          setLimitValue(el.moderationLimitRateWindow, limits.rateWindowSeconds);
          setLimitValue(el.moderationLimitMaxUser, limits.maxPerWindowUser);
          setLimitValue(el.moderationLimitMaxIp, limits.maxPerWindowIp);
          setLimitValue(el.moderationLimitDuplicateWindow, limits.duplicateWindowSeconds);
          setLimitsStatus("Comment limits updated.");
        } catch (err) {
          setLimitsStatus(err.message || "Failed to update comment limits.", true);
        }
      });
    }

    if (el.btnModeration) {
      el.btnModeration.addEventListener("click", async () => {
        handleShow();
        await refreshModeration();
        startLiveVisitors();
      });
    }
  }

  return {
    bindEvents,
    refreshModeration,
    showModerationSection: () => showModerationSection({ hideAllSections, setActiveNav }),
  };
}

export { createModerationManager };
