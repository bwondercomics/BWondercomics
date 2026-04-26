import { el } from './dom.js';

const BLUESKY_NOTIFICATIONS_ENDPOINT = '/api/admin/bluesky/notifications';
const BLUESKY_PROFILE_BASE = 'https://bsky.app/profile';
const BLUESKY_LIMIT = 60;
const FOLLOWER_CACHE_KEY = 'battlebros_bluesky_followers';

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatRelativeTime(value) {
  const date = parseDate(value);
  if (!date) return '-';
  const now = Date.now();
  const diff = date.getTime() - now;
  const isFuture = diff > 0;
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / (60 * 1000));
  const hours = Math.round(abs / (60 * 60 * 1000));
  const days = Math.round(abs / (24 * 60 * 60 * 1000));

  let label = '';
  if (minutes < 60) {
    label = `${minutes || 1}m`;
  } else if (hours < 24) {
    label = `${hours}h`;
  } else {
    label = `${days}d`;
  }
  return isFuture ? `in ${label}` : `${label} ago`;
}

function formatReason(reason) {
  const value = String(reason || '').toLowerCase();
  if (value === 'reply') return 'Reply';
  if (value === 'mention') return 'Mention';
  if (value === 'like') return 'Like';
  if (value === 'repost') return 'Repost';
  if (value === 'follow') return 'Follow';
  return 'Bluesky';
}

function getReasonText(reason) {
  const value = String(reason || '').toLowerCase();
  if (value === 'reply') return 'Replied to your post.';
  if (value === 'mention') return 'Mentioned you.';
  if (value === 'like') return 'Liked your post.';
  if (value === 'repost') return 'Reposted your post.';
  if (value === 'follow') return 'Started following you.';
  return 'New activity on Bluesky.';
}

function setSocialStatus(message, isError = false) {
  if (!el.socialStatus) return;
  el.socialStatus.textContent = message || '';
  el.socialStatus.style.display = message ? 'block' : 'none';
  el.socialStatus.style.background = isError ? 'var(--danger)' : 'var(--success)';
  el.socialStatus.style.color = isError ? 'var(--text)' : 'var(--bg-dark)';
}

function updateAvatar(url, fallback = 'B') {
  if (!el.socialBlueskyAvatar) return;
  if (url) {
    el.socialBlueskyAvatar.style.backgroundImage = `url("${url}")`;
    el.socialBlueskyAvatar.classList.remove('is-empty');
    el.socialBlueskyAvatar.textContent = '';
  } else {
    el.socialBlueskyAvatar.style.backgroundImage = '';
    el.socialBlueskyAvatar.classList.add('is-empty');
    el.socialBlueskyAvatar.textContent = fallback;
  }
}

function updateStat(elm, value) {
  if (!elm) return;
  elm.textContent = Number.isFinite(Number(value)) ? String(value) : '-';
}

function getFollowerDelta(handle, count) {
  const key = `${FOLLOWER_CACHE_KEY}:${handle || 'bluesky'}`;
  let delta = 0;
  try {
    const previous = Number(localStorage.getItem(key));
    if (Number.isFinite(previous)) delta = count - previous;
    localStorage.setItem(key, String(count));
  } catch (err) {
    console.warn('Could not store follower delta', err);
  }
  return delta;
}

function renderBlueskyProfile(profile, connected) {
  const handle = (profile?.handle || '').trim();
  const displayName = (profile?.displayName || '').trim();
  const avatar = profile?.avatar || '';
  const followers = Number(profile?.followersCount || 0);
  const following = Number(profile?.followsCount || 0);

  if (el.socialBlueskyName) {
    el.socialBlueskyName.textContent = displayName || 'Bluesky';
  }
  if (el.socialBlueskyHandle) {
    el.socialBlueskyHandle.textContent = handle ? `@${handle}` : '@bluesky';
  }
  if (el.socialBlueskyProfileLink) {
    const href = handle
      ? `${BLUESKY_PROFILE_BASE}/${encodeURIComponent(handle)}`
      : 'https://bsky.app';
    el.socialBlueskyProfileLink.href = href;
    el.socialBlueskyProfileLink.textContent = handle ? 'Open profile' : 'Bluesky profile';
  }
  const fallback = (handle || displayName || 'B').slice(0, 1).toUpperCase();
  updateAvatar(connected ? avatar : '', fallback);

  const delta = connected ? getFollowerDelta(handle, followers) : 0;
  const newFollowers = delta > 0 ? delta : 0;
  const newUnfollowed = delta < 0 ? Math.abs(delta) : 0;

  updateStat(el.socialBlueskyNewFollowers, newFollowers);
  updateStat(el.socialBlueskyNewUnfollowed, newUnfollowed);
  updateStat(el.socialBlueskyFollowers, connected ? followers : '-');
  updateStat(el.socialBlueskyFollowing, connected ? following : '-');

  if (el.socialBlueskyStatusNote) {
    el.socialBlueskyStatusNote.textContent = connected
      ? `Connected as @${handle || 'bluesky'}.`
      : 'Bluesky not connected.';
    el.socialBlueskyStatusNote.style.color = connected ? '' : 'var(--danger)';
  }
}

function buildNotificationItem(note) {
  const row = document.createElement('div');
  row.className = 'social-note';
  if (!note.isRead) row.classList.add('is-unread');

  const avatar = document.createElement('div');
  avatar.className = 'social-note-avatar';
  if (note.authorAvatar) {
    avatar.style.backgroundImage = `url("${note.authorAvatar}")`;
    avatar.classList.remove('is-empty');
    avatar.textContent = '';
  } else {
    avatar.classList.add('is-empty');
    avatar.textContent = (note.authorHandle || 'B').slice(0, 1).toUpperCase();
  }

  const main = document.createElement('div');
  main.className = 'social-note-main';

  const title = document.createElement('div');
  title.className = 'social-note-title';

  const author = document.createElement('a');
  author.className = 'social-note-author';
  author.textContent =
    note.authorName || (note.authorHandle ? `@${note.authorHandle}` : 'Bluesky user');
  author.target = '_blank';
  author.rel = 'noopener';
  author.href = note.authorHandle
    ? `${BLUESKY_PROFILE_BASE}/${encodeURIComponent(note.authorHandle)}`
    : 'https://bsky.app';

  const reason = document.createElement('span');
  reason.className = 'social-note-reason';
  reason.textContent = formatReason(note.reason);

  title.appendChild(author);
  title.appendChild(reason);

  const text = document.createElement('div');
  text.className = 'social-note-text';
  text.textContent = note.text || getReasonText(note.reason);

  main.appendChild(title);
  main.appendChild(text);

  const time = document.createElement('div');
  time.className = 'social-note-time';
  time.textContent = formatRelativeTime(note.createdAt);

  row.appendChild(avatar);
  row.appendChild(main);
  row.appendChild(time);

  return row;
}

function renderNotifications(notifications, unreadCount) {
  if (!el.socialBlueskyNotifications || !el.socialBlueskyNotificationsEmpty) return;
  el.socialBlueskyNotifications.innerHTML = '';
  const list = Array.isArray(notifications) ? notifications : [];
  if (!list.length) {
    el.socialBlueskyNotificationsEmpty.style.display = 'block';
  } else {
    el.socialBlueskyNotificationsEmpty.style.display = 'none';
    list.forEach((note) => el.socialBlueskyNotifications.appendChild(buildNotificationItem(note)));
  }
  if (el.socialBlueskyNotificationCount) {
    const count = Number.isFinite(Number(unreadCount)) ? Number(unreadCount) : list.length;
    el.socialBlueskyNotificationCount.textContent = String(count);
  }
}

async function fetchBlueskyNotifications() {
  const response = await fetch(`${BLUESKY_NOTIFICATIONS_ENDPOINT}?limit=${BLUESKY_LIMIT}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Failed to load Bluesky notifications');
  }
  return data;
}

function createSocialManager({ hideAllSections, setActiveNav } = {}) {
  let activeTab = 'bluesky';
  let blueskyLoaded = false;

  function showSocialSection() {
    if (hideAllSections) hideAllSections();
    if (el.socialSection) {
      el.socialSection.style.display = 'block';
      el.socialSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (setActiveNav) setActiveNav(el.btnSocial);
    setActiveTab(activeTab);
  }

  function setActiveTab(tab) {
    activeTab = tab || 'bluesky';
    if (el.socialTabs) {
      el.socialTabs.querySelectorAll('[data-social-tab]').forEach((btn) => {
        const isActive = btn.getAttribute('data-social-tab') === activeTab;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
    }
    if (el.socialSection) {
      el.socialSection.querySelectorAll('[data-social-panel]').forEach((panel) => {
        const isActive = panel.getAttribute('data-social-panel') === activeTab;
        if (isActive) {
          panel.removeAttribute('hidden');
        } else {
          panel.setAttribute('hidden', '');
        }
      });
    }
    if (activeTab === 'bluesky' && !blueskyLoaded) {
      void refreshBluesky();
    }
  }

  async function refreshBluesky() {
    if (!el.socialBlueskyNotifications) return;
    setSocialStatus('Refreshing socials...');
    el.socialBlueskyNotifications.innerHTML = '<div class="dashboard-empty">Loading...</div>';
    try {
      const payload = await fetchBlueskyNotifications();
      const connected = payload.connected === true;
      const profile = payload.profile || {};
      const notifications = Array.isArray(payload.notifications) ? payload.notifications : [];
      renderBlueskyProfile(profile, connected);
      renderNotifications(notifications, payload.unreadCount);
      blueskyLoaded = true;
      if (connected) {
        setSocialStatus('Socials synced.');
      } else {
        setSocialStatus('Bluesky not connected.', true);
      }
    } catch (error) {
      console.error('Socials refresh failed:', error);
      setSocialStatus(error.message || 'Failed to refresh socials.', true);
      renderNotifications([], 0);
      renderBlueskyProfile({}, false);
    }
  }

  function bindEvents() {
    if (el.socialTabs) {
      el.socialTabs.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const btn = target.closest('[data-social-tab]');
        if (!(btn instanceof HTMLElement)) return;
        const tab = btn.getAttribute('data-social-tab') || 'bluesky';
        setActiveTab(tab);
      });
    }
    if (el.btnSocialRefresh) {
      el.btnSocialRefresh.addEventListener('click', () => {
        if (activeTab === 'bluesky') void refreshBluesky();
      });
    }
  }

  return {
    bindEvents,
    refreshBluesky,
    showSocialSection,
  };
}

export { createSocialManager };
