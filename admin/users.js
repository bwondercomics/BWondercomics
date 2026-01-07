import { el } from "./dom.js";
import { escapeHtml } from "./utils.js";

const EMAIL_SUBSCRIBERS_ENDPOINT = "/api/admin/email-subscribers";
const USER_DELETE_ENDPOINT = "/api/admin/users";
const PREMIUM_CODES_ENDPOINT = "/api/admin/premium-codes";
const PREMIUM_CODES_GENERATE_ENDPOINT = "/api/admin/premium-codes/generate";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function createUsersManager({ hideAllSections, setActiveNav } = {}) {
  function setUsersStatus(message, isError = false) {
    if (!el.usersStatus) return;
    el.usersStatus.textContent = message;
    el.usersStatus.style.display = "block";
    el.usersStatus.style.background = isError ? "var(--danger)" : "var(--success)";
    el.usersStatus.style.color = isError ? "var(--text)" : "var(--bg-dark)";
    setTimeout(() => {
      el.usersStatus.style.display = "none";
    }, 3000);
  }

  function setUsersCount(count) {
    if (el.usersCount) el.usersCount.textContent = String(count);
  }

  function setEmailListCount(count) {
    if (el.emailListCount) el.emailListCount.textContent = String(count);
  }

  function setEmailListEmpty(isEmpty) {
    if (!el.emailListEmpty) return;
    el.emailListEmpty.style.display = isEmpty ? "block" : "none";
  }

  function setEmailListStatus(message, isError = false) {
    if (!el.emailListStatus) return;
    el.emailListStatus.textContent = message || "";
    el.emailListStatus.style.display = message ? "block" : "none";
    el.emailListStatus.style.background = isError
      ? "var(--danger)"
      : "var(--success)";
    el.emailListStatus.style.color = isError
      ? "var(--text)"
      : "var(--bg-dark)";
  }

  function setPremiumCodesCount(count) {
    if (el.premiumCodesCount) el.premiumCodesCount.textContent = String(count);
  }

  function setPremiumCodesStatus(message, isError = false) {
    if (!el.premiumCodesStatus) return;
    el.premiumCodesStatus.textContent = message;
    el.premiumCodesStatus.style.display = message ? "block" : "none";
    el.premiumCodesStatus.style.background = isError
      ? "var(--danger)"
      : "var(--success)";
    el.premiumCodesStatus.style.color = isError
      ? "var(--text)"
      : "var(--bg-dark)";
  }

  function setPremiumCodesEmpty(isEmpty) {
    if (!el.premiumCodesEmpty) return;
    el.premiumCodesEmpty.style.display = isEmpty ? "block" : "none";
  }

  function showUsersSection() {
    if (hideAllSections) hideAllSections();
    if (el.usersSection) {
      el.usersSection.style.display = "block";
      el.usersSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (setActiveNav) setActiveNav(el.btnUsers);
  }

  function renderUsers(users = []) {
    if (!el.usersList) return;
    el.usersList.innerHTML = "";
    setUsersCount(users.length);

    if (!users.length) {
      const empty = document.createElement("div");
      empty.className = "chapter-item";
      empty.textContent = "No users found yet.";
      el.usersList.appendChild(empty);
      return;
    }

    users.forEach((u) => {
      const emailStatus = u.emailOptIn
        ? `Email list: opted in ${formatDateTime(u.emailOptInAt)}`
        : "Email list: not subscribed";
      const role = (u.role || "user").toLowerCase();
      const premiumStatus =
        role === "admin" || role === "premium"
          ? "Premium access: role"
          : u.premiumActive
            ? "Premium access: code"
            : "Premium access: inactive";
      const item = document.createElement("div");
      item.className = "chapter-item";
      item.innerHTML = `
        <div class="chapter-info">
          <div class="chapter-name">${escapeHtml(
            u.displayName || u.email || "User",
          )}</div>
          <div class="chapter-meta" style="opacity:0.9;">${escapeHtml(
            u.email || "",
          )}</div>
          <div class="chapter-meta" style="opacity:0.8;">Role: ${escapeHtml(
            role,
          )}</div>
          <div class="chapter-meta" style="opacity:0.75;">${escapeHtml(
            emailStatus,
          )}</div>
          <div class="chapter-meta" style="opacity:0.7;">${escapeHtml(
            premiumStatus,
          )}</div>
        </div>
        <div class="chapter-actions" style="gap: 8px; flex-wrap: wrap;">
          <select class="form-input" style="max-width: 150px; padding: 8px 10px;" data-role="${escapeHtml(
            u.id,
          )}">
            <option value="user">user</option>
            <option value="premium">premium</option>
            <option value="admin">admin</option>
          </select>
          <button class="btn-small btn-edit" type="button" data-save-role="${escapeHtml(
            u.id,
          )}">Save</button>
          <button class="btn-danger" type="button" data-delete-user="${escapeHtml(
            u.id,
          )}">Delete</button>
        </div>
      `;
      el.usersList.appendChild(item);
      const select = /** @type {HTMLSelectElement | null} */ (
        item.querySelector(`[data-role="${CSS.escape(u.id)}"]`)
      );
      if (select) select.value = (u.role || "user").toLowerCase();
    });

    el.usersList.querySelectorAll("[data-save-role]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const userId = btn.getAttribute("data-save-role");
        const select = /** @type {HTMLSelectElement | null} */ (
          el.usersList.querySelector(`[data-role="${CSS.escape(userId)}"]`)
        );
        const role = select ? select.value : "user";
        try {
          const res = await fetch("/api/admin/users/role", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, role }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Failed to update role");
          setUsersStatus("Role updated.");
        } catch (err) {
          setUsersStatus(err.message || "Failed to update role.", true);
        }
      });
    });

    el.usersList.querySelectorAll("[data-delete-user]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const userId = btn.getAttribute("data-delete-user");
        if (!userId) return;
        const ok = confirm("Delete this account? This cannot be undone.");
        if (!ok) return;
        try {
          const res = await fetch(`${USER_DELETE_ENDPOINT}/${userId}`, {
            method: "DELETE",
            credentials: "same-origin",
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Failed to delete user.");
          setUsersStatus("User deleted.");
          await loadUsersList();
          await loadEmailSubscribers();
        } catch (err) {
          setUsersStatus(err.message || "Failed to delete user.", true);
        }
      });
    });
  }

  function renderEmailSubscribers(subscribers = []) {
    if (!el.emailList) return;
    el.emailList.innerHTML = "";
    setEmailListCount(subscribers.length);

    if (!subscribers.length) {
      setEmailListEmpty(true);
      return;
    }
    setEmailListEmpty(false);

    subscribers.forEach((sub) => {
      const metaParts = [];
      if (sub.source) metaParts.push(`Source: ${sub.source}`);
      if (sub.optedInAt) metaParts.push(`Opted in ${formatDateTime(sub.optedInAt)}`);
      if (sub.ipAddress) metaParts.push(`IP: ${sub.ipAddress}`);
      const metaText = metaParts.length ? metaParts.join(" • ") : "No details yet.";

      const item = document.createElement("div");
      item.className = "chapter-item";
      item.innerHTML = `
        <div class="chapter-info">
          <div class="chapter-name">${escapeHtml(sub.email || "Subscriber")}</div>
          <div class="chapter-meta" style="opacity:0.75;">${escapeHtml(metaText)}</div>
        </div>
        <div class="chapter-actions" style="gap: 8px; flex-wrap: wrap;">
          <button class="btn-danger" type="button" data-delete-subscriber="${escapeHtml(
            sub.id,
          )}">Remove</button>
        </div>
      `;
      el.emailList.appendChild(item);
    });

    el.emailList.querySelectorAll("[data-delete-subscriber]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const subId = btn.getAttribute("data-delete-subscriber");
        if (!subId) return;
        const ok = confirm("Remove this email subscriber?");
        if (!ok) return;
        try {
          const res = await fetch(`${EMAIL_SUBSCRIBERS_ENDPOINT}/${subId}`, {
            method: "DELETE",
            credentials: "same-origin",
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Failed to remove subscriber.");
          setEmailListStatus("Subscriber removed.");
          await loadEmailSubscribers();
          await loadUsersList();
        } catch (err) {
          setEmailListStatus(err.message || "Failed to remove subscriber.", true);
        }
      });
    });
  }

  function renderPremiumCodes(codes = []) {
    if (!el.premiumCodesList) return;
    el.premiumCodesList.innerHTML = "";
    setPremiumCodesCount(codes.length);

    if (!codes.length) {
      setPremiumCodesEmpty(true);
      return;
    }
    setPremiumCodesEmpty(false);

    codes.forEach((code) => {
      const redeemedCount = Number(code.redeemedCount) || 0;
      const status = code.active
        ? redeemedCount > 0
          ? "Active"
          : "Unused"
        : "Inactive";
      const metaParts = [status];
      if (code.createdAt) metaParts.push(`Created ${formatDateTime(code.createdAt)}`);
      if (code.note) metaParts.push(`Note: ${code.note}`);
      metaParts.push(
        `Redeemed ${redeemedCount} time${redeemedCount === 1 ? "" : "s"}`,
      );
      if (code.lastRedeemedBy) {
        const redeemedLabel =
          code.lastRedeemedBy.displayName || code.lastRedeemedBy.email || "user";
        metaParts.push(`Last by ${redeemedLabel}`);
      }
      if (code.lastRedeemedAt) {
        metaParts.push(`Last ${formatDateTime(code.lastRedeemedAt)}`);
      }
      const metaText = metaParts.join(" • ");

      const item = document.createElement("div");
      item.className = "chapter-item";
      item.innerHTML = `
        <div class="chapter-info">
          <div class="premium-code-value">${escapeHtml(code.code || "")}</div>
          <div class="premium-code-meta">${escapeHtml(metaText)}</div>
        </div>
        <div class="chapter-actions premium-code-actions">
          <button class="btn-small btn-edit" type="button" data-copy-code="${escapeHtml(
            code.code || "",
          )}">Copy</button>
          ${
            code.active
              ? `<button class="btn-small btn-delete" type="button" data-deactivate-code="${escapeHtml(
                  code.id || "",
                )}">Deactivate</button>`
              : ""
          }
        </div>
      `;
      el.premiumCodesList.appendChild(item);
    });

    el.premiumCodesList.querySelectorAll("[data-copy-code]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const code = btn.getAttribute("data-copy-code") || "";
        if (!code) return;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(code);
            setPremiumCodesStatus("Code copied to clipboard.");
          } else {
            window.prompt("Copy premium code:", code);
          }
        } catch (err) {
          window.prompt("Copy premium code:", code);
        }
      });
    });

    el.premiumCodesList.querySelectorAll("[data-deactivate-code]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const codeId = btn.getAttribute("data-deactivate-code") || "";
        if (!codeId) return;
        const ok = confirm("Deactivate this code? It cannot be redeemed after this.");
        if (!ok) return;
        try {
          const res = await fetch(`${PREMIUM_CODES_ENDPOINT}/${codeId}/deactivate`, {
            method: "POST",
            credentials: "same-origin",
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Failed to deactivate code");
          setPremiumCodesStatus("Code deactivated.");
          await loadPremiumCodes();
        } catch (err) {
          setPremiumCodesStatus(err.message || "Failed to deactivate code.", true);
        }
      });
    });
  }

  async function loadUsersList() {
    if (!el.usersList) return;
    el.usersList.innerHTML = "";
    setUsersCount(0);
    const loading = document.createElement("div");
    loading.className = "chapter-item";
    loading.textContent = "Loading users...";
    el.usersList.appendChild(loading);

    try {
      const res = await fetch("/api/admin/users", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error ||
            "Unable to load users. Make sure you are signed in as an admin (via comments login).",
        );
      }
      const users = Array.isArray(data.users) ? data.users : [];
      renderUsers(users);
    } catch (err) {
      el.usersList.innerHTML = "";
      setUsersCount(0);
      const error = document.createElement("div");
      error.className = "chapter-item";
      error.textContent = err.message || "Failed to load users.";
      el.usersList.appendChild(error);
    }
  }

  async function loadEmailSubscribers() {
    if (!el.emailList) return;
    el.emailList.innerHTML = "";
    setEmailListEmpty(false);
    setEmailListCount(0);
    const loading = document.createElement("div");
    loading.className = "chapter-item";
    loading.textContent = "Loading email subscribers...";
    el.emailList.appendChild(loading);

    try {
      const res = await fetch(EMAIL_SUBSCRIBERS_ENDPOINT, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Unable to load email list.");
      }
      const subscribers = Array.isArray(data.subscribers) ? data.subscribers : [];
      renderEmailSubscribers(subscribers);
    } catch (err) {
      el.emailList.innerHTML = "";
      setEmailListCount(0);
      const error = document.createElement("div");
      error.className = "chapter-item";
      error.textContent = err.message || "Failed to load email list.";
      el.emailList.appendChild(error);
    }
  }

  async function addEmailSubscriber() {
    if (!el.emailListInput) return;
    const email = (el.emailListInput.value || "").trim();
    const source = (el.emailListSource?.value || "").trim();
    if (!email) {
      setEmailListStatus("Email is required.", true);
      return;
    }
    try {
      const res = await fetch(EMAIL_SUBSCRIBERS_ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to add subscriber.");
      setEmailListStatus("Subscriber added.");
      el.emailListInput.value = "";
      if (el.emailListSource) el.emailListSource.value = "";
      await loadEmailSubscribers();
      await loadUsersList();
    } catch (err) {
      setEmailListStatus(err.message || "Failed to add subscriber.", true);
    }
  }

  async function loadPremiumCodes() {
    if (!el.premiumCodesList) return;
    el.premiumCodesList.innerHTML = "";
    setPremiumCodesEmpty(false);
    setPremiumCodesCount(0);
    const loading = document.createElement("div");
    loading.className = "chapter-item";
    loading.textContent = "Loading premium codes...";
    el.premiumCodesList.appendChild(loading);

    try {
      const res = await fetch(`${PREMIUM_CODES_ENDPOINT}?status=all&limit=200`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Unable to load premium codes.");
      }
      const codes = Array.isArray(data.codes) ? data.codes : [];
      renderPremiumCodes(codes);
    } catch (err) {
      el.premiumCodesList.innerHTML = "";
      setPremiumCodesCount(0);
      const error = document.createElement("div");
      error.className = "chapter-item";
      error.textContent = err.message || "Failed to load premium codes.";
      el.premiumCodesList.appendChild(error);
    }
  }

  async function generatePremiumCodes() {
    if (!el.premiumCodesCountInput || !el.btnGeneratePremiumCodes) return;
    const count = Number.parseInt(el.premiumCodesCountInput.value, 10);
    const safeCount = Number.isFinite(count) ? Math.min(Math.max(count, 1), 50) : 1;
    const note = el.premiumCodesNote ? el.premiumCodesNote.value.trim() : "";

    try {
      const res = await fetch(PREMIUM_CODES_GENERATE_ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: safeCount, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to generate codes");
      const codes = Array.isArray(data.codes) ? data.codes : [];
      setPremiumCodesStatus(`Generated ${codes.length} code${codes.length === 1 ? "" : "s"}.`);
      if (el.premiumCodesCountInput) el.premiumCodesCountInput.value = "1";
      if (el.premiumCodesNote) el.premiumCodesNote.value = "";
      if (codes.length) {
        await loadPremiumCodes();
      }
    } catch (err) {
      setPremiumCodesStatus(err.message || "Failed to generate codes.", true);
    }
  }

  async function loadUsers() {
    await Promise.all([loadUsersList(), loadEmailSubscribers(), loadPremiumCodes()]);
  }

  if (el.btnEmailListAdd) {
    el.btnEmailListAdd.addEventListener("click", addEmailSubscriber);
  }
  if (el.emailListInput) {
    el.emailListInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addEmailSubscriber();
      }
    });
  }

  return {
    loadUsers,
    renderUsers,
    setUsersStatus,
    showUsersSection,
    generatePremiumCodes,
  };
}

export { createUsersManager };
