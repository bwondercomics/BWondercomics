import { API } from "./constants.js";

(() => {
  "use strict";

  const overlay = document.getElementById("userSettingsOverlay");
  const openBtn = document.getElementById("userSettingsBtn");
  const closeBtn = document.getElementById("userSettingsClose");
  const statusEl = document.getElementById("userSettingsStatus");
  const authSection = document.getElementById("userSettingsAuth");
  const contentSection = document.getElementById("userSettingsContent");
  const loginForm = document.getElementById("userSettingsLoginForm");
  const loginEmail = document.getElementById("userSettingsLoginEmail");
  const loginPassword = document.getElementById("userSettingsLoginPassword");
  const identityEl = document.getElementById("userSettingsIdentity");
  const roleEl = document.getElementById("userSettingsRole");
  const emailToggle = document.getElementById("userSettingsEmailOptIn");
  const emailStatus = document.getElementById("userSettingsEmailStatus");
  const premiumInput = document.getElementById("userSettingsPremiumCode");
  const redeemBtn = document.getElementById("userSettingsRedeem");
  const premiumStatus = document.getElementById("userSettingsPremiumStatus");
  const supporterBadge = document.getElementById("userSettingsSupporterBadge");
  const supporterToast = document.getElementById("supporterToast");
  const commentCountEl = document.getElementById("userSettingsCommentCount");
  const commentsList = document.getElementById("userSettingsCommentsList");
  const commentsEmpty = document.getElementById("userSettingsCommentsEmpty");
  const loadMoreBtn = document.getElementById("userSettingsLoadMore");
  const deleteCommentsBtn = document.getElementById("userSettingsDeleteComments");
  const logoutBtn = document.getElementById("userSettingsLogout");
  const deleteAccountBtn = document.getElementById("userSettingsDeleteAccount");
  let currentCommentCount = 0;
  let commentsOffset = 0;
  const commentsLimit = 15;
  let currentUser = null;
  let supporterToastTimer = null;

  if (!overlay || !openBtn) return;

  function setStatus(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.style.display = message ? "block" : "none";
    statusEl.style.borderColor = isError
      ? "rgba(255, 56, 56, 0.6)"
      : "rgba(0, 217, 255, 0.4)";
    statusEl.style.background = isError
      ? "rgba(255, 56, 56, 0.15)"
      : "rgba(0, 217, 255, 0.12)";
  }

  function dispatchSession(user) {
    try {
      window.dispatchEvent(new CustomEvent("bbSessionChanged", { detail: { user } }));
    } catch (err) {
      // Ignore dispatch errors.
    }
  }

  function showAuth() {
    if (authSection) authSection.style.display = "block";
    if (contentSection) contentSection.style.display = "none";
  }

  function showContent() {
    if (authSection) authSection.style.display = "none";
    if (contentSection) contentSection.style.display = "block";
  }

  function showSupporterToast() {
    if (!supporterToast) return;
    supporterToast.classList.add("is-visible");
    supporterToast.setAttribute("aria-hidden", "false");
    if (supporterToastTimer) {
      clearTimeout(supporterToastTimer);
    }
    supporterToastTimer = setTimeout(() => {
      supporterToast.classList.remove("is-visible");
      supporterToast.setAttribute("aria-hidden", "true");
    }, 5000);
  }

  async function fetchJson(url, options = {}) {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  function updateUserView(user, commentCount) {
    if (user) {
      currentUser = user;
    }
    if (typeof commentCount === "number") {
      currentCommentCount = commentCount;
    }
    if (identityEl) {
      identityEl.textContent = currentUser?.displayName
        ? `${currentUser.displayName} (${currentUser.email})`
        : currentUser?.email || "-";
    }
    if (roleEl) roleEl.textContent = `Role: ${currentUser?.role || "user"}`;
    const role = (currentUser?.role || "").toLowerCase();
    const premiumActive = !!currentUser?.premiumActive;
    const hasPremium =
      role === "admin" || role === "premium" || premiumActive;
    if (premiumStatus) {
      if (hasPremium) {
        if (premiumActive) {
          premiumStatus.textContent = "Premium access: active (supporter code).";
        } else if (role === "admin") {
          premiumStatus.textContent = "Premium access: active (admin).";
        } else if (role === "premium") {
          premiumStatus.textContent = "Premium access: active (premium role).";
        } else {
          premiumStatus.textContent = "Premium access: active.";
        }
      } else {
        premiumStatus.textContent = "Premium access: inactive.";
      }
    }
    if (supporterBadge) {
      supporterBadge.style.display = premiumActive ? "inline-flex" : "none";
    }
    if (emailToggle) emailToggle.checked = !!currentUser?.emailOptIn;
    if (emailStatus) {
      emailStatus.textContent = currentUser?.emailOptIn
        ? `Subscribed ${formatDate(currentUser.emailOptInAt) || ""}`.trim()
        : "Not subscribed.";
    }
    if (commentCountEl) {
      commentCountEl.textContent = `You have ${currentCommentCount} comment${
        currentCommentCount === 1 ? "" : "s"
      }.`;
    }
  }

  function setCommentsEmpty(isEmpty) {
    if (!commentsEmpty) return;
    commentsEmpty.style.display = isEmpty ? "block" : "none";
  }

  function renderComments(comments = [], { append = false } = {}) {
    if (!commentsList) return;
    if (!append) commentsList.innerHTML = "";
    if (!comments.length && !append) {
      setCommentsEmpty(true);
      return;
    }
    setCommentsEmpty(false);

    comments.forEach((comment) => {
      const item = document.createElement("div");
      item.className = "user-comment-item";
      item.dataset.commentId = comment.id;

      const meta = document.createElement("div");
      meta.className = "user-comment-meta";
      const time = formatDate(comment.createdAt) || "Unknown time";
      meta.textContent = `Target: ${comment.targetId || "unknown"} • ${time}${
        comment.hidden ? " • Hidden" : ""
      }`;

      const message = document.createElement("div");
      message.className = "user-comment-message";
      message.textContent = comment.message || "";

      const actions = document.createElement("div");
      actions.className = "user-comment-actions";
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn user-settings-danger";
      deleteBtn.type = "button";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", async () => {
        const ok = confirm("Delete this comment?");
        if (!ok) return;
        try {
          await fetchJson(`${API.ENDPOINTS.USER_COMMENTS}/${comment.id}`, { method: "DELETE" });
          item.remove();
          currentCommentCount = Math.max(0, currentCommentCount - 1);
          updateUserView(currentUser, currentCommentCount);
          setStatus("Comment deleted.");
          if (commentsList && !commentsList.children.length) {
            setCommentsEmpty(true);
          }
        } catch (err) {
          setStatus(err.message || "Failed to delete comment.", true);
        }
      });
      actions.appendChild(deleteBtn);

      item.appendChild(meta);
      item.appendChild(message);
      item.appendChild(actions);
      commentsList.appendChild(item);
    });
  }

  async function loadSettings() {
    try {
      const data = await fetchJson(API.ENDPOINTS.USER_SETTINGS, { method: "GET" });
      const user = data.user || null;
      if (!user) throw new Error("Not authenticated");
      updateUserView(user, data.commentCount || 0);
      showContent();
      dispatchSession(user);
      await loadComments(true);
    } catch (err) {
      showAuth();
      currentUser = null;
      currentCommentCount = 0;
      if (commentCountEl) commentCountEl.textContent = "You have 0 comments.";
      if (commentsList) commentsList.innerHTML = "";
      setCommentsEmpty(true);
      if (loadMoreBtn) loadMoreBtn.style.display = "none";
    }
  }

  async function loadComments(reset = false) {
    if (reset) {
      commentsOffset = 0;
    }
    try {
      const url = `${API.ENDPOINTS.USER_COMMENTS}?limit=${commentsLimit}&offset=${commentsOffset}`;
      const data = await fetchJson(url, { method: "GET" });
      const comments = Array.isArray(data.comments) ? data.comments : [];
      renderComments(comments, { append: !reset });
      commentsOffset += comments.length;
      if (loadMoreBtn) {
        const total = typeof data.total === "number" ? data.total : commentsOffset;
        loadMoreBtn.style.display = commentsOffset < total ? "inline-flex" : "none";
      }
    } catch (err) {
      setStatus(err.message || "Failed to load comments.", true);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    if (!loginEmail || !loginPassword) return;
    const email = loginEmail.value.trim();
    const password = loginPassword.value;
    if (!email || !password) {
      setStatus("Email and password are required.", true);
      return;
    }
    try {
      setStatus("");
      await fetchJson(API.ENDPOINTS.LOGIN, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      loginEmail.value = "";
      loginPassword.value = "";
      await loadSettings();
      setStatus("Signed in.");
      if (currentUser?.premiumActive) {
        showSupporterToast();
      }
    } catch (err) {
      setStatus(err.message || "Sign in failed.", true);
    }
  }

  async function handleEmailToggle() {
    if (!emailToggle) return;
    try {
      const data = await fetchJson(API.ENDPOINTS.USER_EMAIL_OPT, {
        method: "POST",
        body: JSON.stringify({ emailOptIn: emailToggle.checked }),
      });
      updateUserView(data.user, undefined);
      setStatus(emailToggle.checked ? "Email list enabled." : "Email list disabled.");
    } catch (err) {
      emailToggle.checked = !emailToggle.checked;
      setStatus(err.message || "Failed to update email preference.", true);
    }
  }

  async function handleRedeem() {
    if (!premiumInput) return;
    const code = premiumInput.value.trim();
    if (!code) {
      setStatus("Enter a premium code.", true);
      return;
    }
    try {
      const data = await fetchJson(API.ENDPOINTS.USER_REDEEM_PREMIUM, {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      premiumInput.value = "";
      updateUserView(data.user, undefined);
      setStatus("Premium access activated.");
      dispatchSession(data.user);
      if (data.user?.premiumActive) {
        showSupporterToast();
      }
    } catch (err) {
      setStatus(err.message || "Failed to redeem code.", true);
    }
  }

  async function handleDeleteComments() {
    if (!confirm("Delete all of your comments? This cannot be undone.")) return;
    try {
      const data = await fetchJson(API.ENDPOINTS.USER_DELETE_COMMENTS, { method: "POST" });
      if (commentCountEl) {
        currentCommentCount = 0;
        commentCountEl.textContent = "You have 0 comments.";
      }
      if (commentsList) commentsList.innerHTML = "";
      setCommentsEmpty(true);
      if (loadMoreBtn) loadMoreBtn.style.display = "none";
      setStatus("Your comments were deleted.");
    } catch (err) {
      setStatus(err.message || "Failed to delete comments.", true);
    }
  }

  async function handleLogout() {
    try {
      await fetchJson(API.ENDPOINTS.LOGOUT, { method: "POST" });
    } catch (err) {
      // Ignore logout errors.
    }
    dispatchSession(null);
    showAuth();
    setStatus("Signed out.");
    currentUser = null;
    currentCommentCount = 0;
    if (supporterBadge) supporterBadge.style.display = "none";
    if (supporterToast) {
      supporterToast.classList.remove("is-visible");
      supporterToast.setAttribute("aria-hidden", "true");
    }
    if (commentCountEl) commentCountEl.textContent = "You have 0 comments.";
    if (commentsList) commentsList.innerHTML = "";
    setCommentsEmpty(true);
    if (loadMoreBtn) loadMoreBtn.style.display = "none";
  }

  async function handleDeleteAccount() {
    const confirmed = confirm(
      "Delete your account and all of your comments? This cannot be undone.",
    );
    if (!confirmed) return;
    try {
      await fetchJson(API.ENDPOINTS.USER_DELETE_ACCOUNT, { method: "DELETE" });
      dispatchSession(null);
      hideOverlay();
      setStatus("Account deleted.");
      window.location.reload();
    } catch (err) {
      setStatus(err.message || "Failed to delete account.", true);
    }
  }

  function showOverlay() {
    overlay.classList.add("active");
    overlay.setAttribute("aria-hidden", "false");
    setStatus("");
    loadSettings();
  }

  function hideOverlay() {
    overlay.classList.remove("active");
    overlay.setAttribute("aria-hidden", "true");
  }

  openBtn.addEventListener("click", showOverlay);
  if (closeBtn) closeBtn.addEventListener("click", hideOverlay);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) hideOverlay();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay.classList.contains("active")) {
      hideOverlay();
    }
  });

  if (loginForm) loginForm.addEventListener("submit", handleLogin);
  if (emailToggle) emailToggle.addEventListener("change", handleEmailToggle);
  if (redeemBtn) redeemBtn.addEventListener("click", handleRedeem);
  if (loadMoreBtn) loadMoreBtn.addEventListener("click", () => loadComments(false));
  if (deleteCommentsBtn) deleteCommentsBtn.addEventListener("click", handleDeleteComments);
  if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);
  if (deleteAccountBtn) deleteAccountBtn.addEventListener("click", handleDeleteAccount);
})();
