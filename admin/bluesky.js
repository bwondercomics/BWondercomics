import { el } from "./dom.js";
import { showError, showSuccess } from "./core.js";

const STATUS_ENDPOINT = "/api/admin/bluesky/status";
const CONNECT_ENDPOINT = "/api/admin/bluesky/connect";
const NOTIFICATIONS_ENDPOINT = "/api/admin/bluesky/notifications";

let cachedStatus = { connected: false, handle: "", did: "" };

function setStatusNote(message, isError = false) {
  if (el.blueskyStatusNote) {
    el.blueskyStatusNote.textContent = message;
    el.blueskyStatusNote.style.color = isError ? "var(--danger)" : "";
  }
}

function updateConnectButton(connected) {
  if (el.btnBlueskyConnect) {
    el.btnBlueskyConnect.textContent = connected ? "Reconnect Bluesky" : "Connect Bluesky";
  }
}

function showCredentialsForm() {
  if (el.blueskyCredentialsForm) {
    el.blueskyCredentialsForm.style.display = "block";
  }
}

function hideCredentialsForm() {
  if (el.blueskyCredentialsForm) {
    el.blueskyCredentialsForm.style.display = "none";
  }
  if (el.blueskyHandle) el.blueskyHandle.value = "";
  if (el.blueskyAppPassword) el.blueskyAppPassword.value = "";
  if (el.blueskyConnectStatus) el.blueskyConnectStatus.style.display = "none";
}

async function loadStatus() {
  try {
    const res = await fetch(STATUS_ENDPOINT, {
      cache: "no-store",
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Failed to load Bluesky status");
    }
    cachedStatus = {
      connected: Boolean(data.connected),
      handle: data.handle || "",
      did: data.did || "",
    };
    if (cachedStatus.connected) {
      setStatusNote(`Connected as @${cachedStatus.handle || "bluesky"}.`);
    } else {
      setStatusNote("Bluesky not connected.");
    }
    updateConnectButton(cachedStatus.connected);
  } catch (error) {
    setStatusNote(error.message || "Unable to load Bluesky status.", true);
    updateConnectButton(false);
  }
  return cachedStatus;
}

async function submitCredentials() {
  const handle = (el.blueskyHandle?.value || "").trim();
  const appPassword = (el.blueskyAppPassword?.value || "").trim();

  if (!handle || !appPassword) {
    showError("Please enter both handle and app password");
    return;
  }

  if (el.btnBlueskySubmit) /** @type {HTMLButtonElement} */ (el.btnBlueskySubmit).disabled = true;

  try {
    const res = await fetch(CONNECT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ handle, app_password: appPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Failed to connect");
    }

    showSuccess("Successfully connected to Bluesky!");
    hideCredentialsForm();
    await loadStatus();
  } catch (error) {
    showError(error.message || "Connection failed");
  } finally {
    if (el.btnBlueskySubmit) /** @type {HTMLButtonElement} */ (el.btnBlueskySubmit).disabled = false;
  }
}

function bindEvents() {
  if (el.btnBlueskyConnect) {
    el.btnBlueskyConnect.addEventListener("click", showCredentialsForm);
  }
  if (el.btnBlueskyCancel) {
    el.btnBlueskyCancel.addEventListener("click", hideCredentialsForm);
  }
  if (el.btnBlueskySubmit) {
    el.btnBlueskySubmit.addEventListener("click", submitCredentials);
  }
}

function getStatus() {
  return cachedStatus;
}

async function loadNotifications(limit = 20) {
  const response = await fetch(
    `${NOTIFICATIONS_ENDPOINT}?limit=${encodeURIComponent(limit)}`,
    {
      cache: "no-store",
      credentials: "same-origin",
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to load Bluesky notifications");
  }
  return data;
}

export { bindEvents, getStatus, loadNotifications, loadStatus };
