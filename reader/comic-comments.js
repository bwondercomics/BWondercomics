// Comic Reader Comments Integration (self-hosted)
// Lightweight auth + comment UI backed by local API

import { getActiveSeriesId } from './series.js';
import { h } from './dom.js';

(() => {
    'use strict';

    let commentCtx = null;

    const api = {
        async session() {
            const res = await fetch('/api/session', { cache: 'no-store', credentials: 'same-origin' });
            if (!res.ok) throw new Error('Session check failed');
            const data = await res.json();
            return data.user || null;
        },
        async login(email, password) {
            const res = await fetch('/api/login', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Login failed');
            return data.user;
        },
        async register(email, password, displayName, inviteCode, emailOptIn) {
            const res = await fetch('/api/register', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, displayName, inviteCode, emailOptIn })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Registration failed');
            return data.user;
        },
        async logout() {
            await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
        },
        async fetchComments(targetId) {
            const res = await fetch(`/api/comments?targetId=${encodeURIComponent(targetId)}`, {
                cache: 'no-store',
                credentials: 'same-origin'
            });
            if (!res.ok) throw new Error('Failed to load comments');
            const data = await res.json();
            return Array.isArray(data.comments) ? data.comments : [];
        },
        async postComment(targetId, message) {
            const res = await fetch('/api/comments', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetId, message })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to post comment');
            return data.comment;
        },
        async moderateComment(targetId, commentId, action) {
            const res = await fetch('/api/admin/comments', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetId, commentId, action })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Moderation failed');
            return data;
        }
    };

    const slugifyTarget = (raw = '') => {
        const base = (raw || 'chapter').toString().trim();
        const cleaned = base
            .toLowerCase()
            .replace(/[^a-z0-9._:-]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return (cleaned || 'chapter').slice(0, 120);
    };

    const parseEntryNumber = (raw) => {
        const parsed = Number.isFinite(raw) ? raw : parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : null;
    };

    function getEntryNumberFromSelect(select, entryName) {
        if (!select || !select.options || !select.options.length) return null;
        let option = select.options[select.selectedIndex];
        if (entryName && option && option.value !== entryName) {
            option =
                Array.from(select.options).find((opt) => opt.value === entryName) ||
                option;
        }
        return parseEntryNumber(option?.dataset?.displayNumber);
    }

    function getCurrentTargetId() {
        // Target ID combines series + chapter slug to keep threads scoped per entry.
        const seriesId = (typeof getActiveSeriesId === 'function' ? getActiveSeriesId() : 'battle-bros') || 'battle-bros';
        const select = document.getElementById('chapter');
        const rawValue = select
            ? (select.value || select.options[select.selectedIndex]?.value || 'chapter-1')
            : 'chapter-1';
        const entryNumber = getEntryNumberFromSelect(select, rawValue);
        const chapterSlug = entryNumber != null ? `entry-${entryNumber}` : slugifyTarget(rawValue || 'chapter');

        const maxLen = 120;
        const prefix = `${seriesId}:`;
        const remaining = Math.max(1, maxLen - prefix.length);
        const trimmedChapter = chapterSlug.slice(0, remaining).replace(/-+$/g, '') || 'chapter';
        return `${seriesId}:${trimmedChapter}`.slice(0, maxLen);
    }

    function init() {
        const section = document.getElementById('comicCommentsSection');
        if (!section) return;

        section.innerHTML = `
      <div class="comments-header">
        <h3 class="comments-title">Discuss This Entry</h3>
      </div>
      <div class="comments-body comic-comments-body">
        <div class="comments-header">
          <div class="auth-status"></div>
          <button type="button" class="signout-btn" style="display: none;">Sign out</button>
        </div>
        <form class="auth-form">
          <div class="auth-row">
            <input class="auth-input" type="email" name="email" placeholder="Email" autocomplete="email" required />
            <input class="auth-input" type="password" name="password" placeholder="Password (8+ chars)" autocomplete="current-password" required />
            <input class="auth-input auth-display hidden" type="text" name="displayName" placeholder="Display name (optional)" autocomplete="name" />
            <input class="auth-input auth-invite hidden" type="text" name="inviteCode" placeholder="Invite code (if required)" autocomplete="off" />
          </div>
          <label class="auth-check auth-email hidden">
            <input type="checkbox" class="auth-email-optin" name="emailOptIn" />
            <span>Join the email list.</span>
          </label>
          <div class="auth-actions-row">
            <button type="submit" class="auth-submit">Sign in</button>
            <button type="button" class="auth-toggle">Need an account? Register</button>
          </div>
          <div class="auth-error" aria-live="polite"></div>
        </form>
        <form class="comment-form disabled">
          <textarea class="comment-textarea" name="comment" placeholder="Share your thoughts..." disabled></textarea>
          <div class="comment-actions">
            <button type="submit" class="comment-submit" disabled>Post Comment</button>
            <span class="comment-hint">Login to post comments.</span>
          </div>
          <div class="comment-error" aria-live="polite"></div>
        </form>
        <div class="comments-list"></div>
      </div>
    `;

        const ctx = {
            section,
            body: section.querySelector('.comments-body'),
            authStatus: section.querySelector('.auth-status'),
            signoutBtn: section.querySelector('.signout-btn'),
            authForm: section.querySelector('.auth-form'),
            authToggle: section.querySelector('.auth-toggle'),
            authSubmit: section.querySelector('.auth-submit'),
            authError: section.querySelector('.auth-error'),
            emailInput: section.querySelector('input[type="email"]'),
            passwordInput: section.querySelector('input[type="password"]'),
            displayNameInput: section.querySelector('.auth-display'),
            inviteInput: section.querySelector('.auth-invite'),
            emailOptInRow: section.querySelector('.auth-email'),
            emailOptInInput: section.querySelector('.auth-email-optin'),
            commentForm: section.querySelector('.comment-form'),
            textarea: section.querySelector('.comment-textarea'),
            submitBtn: section.querySelector('.comment-submit'),
            commentHint: section.querySelector('.comment-hint'),
            commentError: section.querySelector('.comment-error'),
            listEl: section.querySelector('.comments-list'),
            mode: 'login',
            user: null,
            targetId: getCurrentTargetId(),
            collapsed: section.classList.contains('collapsed')
        };

        ctx.authForm.addEventListener('submit', (e) => handleAuthSubmit(e, ctx));
        ctx.authToggle.addEventListener('click', () => toggleAuthMode(ctx));
        ctx.signoutBtn.addEventListener('click', () => handleLogout(ctx));
        ctx.commentForm.addEventListener('submit', (e) => handleCommentSubmit(e, ctx));
        window.addEventListener('chapterChanged', () => handleChapterChange(ctx));
        const chapterSelect = document.getElementById('chapter');
        if (chapterSelect) {
            chapterSelect.addEventListener('change', () => handleChapterChange(ctx));
        }
        window.addEventListener('unitLabelChanged', (event) => {
            const singular = String(event?.detail?.singular || '').trim();
            const titleEl = section.querySelector('.comments-title');
            if (titleEl) titleEl.textContent = `Discuss This ${singular || 'Entry'}`;
        });

        applyAuthMode(ctx);
        refreshSession(ctx).finally(() => loadComments(ctx));
        commentCtx = ctx;
        syncCommentsToggleButton();
    }

    function applyAuthMode(ctx) {
        const isLogin = ctx.mode === 'login';
        if (ctx.authSubmit) ctx.authSubmit.textContent = isLogin ? 'Sign in' : 'Create account';
        if (ctx.authToggle) ctx.authToggle.textContent = isLogin ? 'Need an account? Register' : 'Have an account? Sign in';
        if (ctx.displayNameInput) ctx.displayNameInput.classList.toggle('hidden', isLogin);
        if (ctx.inviteInput) ctx.inviteInput.classList.toggle('hidden', isLogin);
        if (ctx.emailOptInRow) ctx.emailOptInRow.classList.toggle('hidden', isLogin);
    }

    function syncCommentsToggleButton() {
        const btn = document.getElementById('commentToggleBtn');
        const panel = document.getElementById('comicCommentsSection');
        if (!btn || !panel) return;
        const collapsed = panel.classList.contains('collapsed');
        btn.textContent = collapsed ? 'COMMENTS' : 'HIDE COMMENTS';
        btn.setAttribute('aria-pressed', String(!collapsed));
    }

    function toggleReaderComments() {
        const panel = document.getElementById('comicCommentsSection');
        const btn = document.getElementById('commentToggleBtn');
        if (!panel) return;

        // Clear any inline display styles so CSS + class toggles can work.
        panel.style.display = '';

        const willShow = panel.classList.contains('collapsed');
        panel.classList.toggle('collapsed', !willShow);

        if (commentCtx) {
            commentCtx.collapsed = !willShow;
        }

        if (btn) {
            btn.textContent = willShow ? 'HIDE COMMENTS' : 'COMMENTS';
            btn.setAttribute('aria-pressed', String(willShow));
        }

        if (willShow) {
            try {
                panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (err) { }
            if (commentCtx) {
                loadComments(commentCtx);
            }
        }
    }

    // Expose a global helper so the button can call it.
    window.toggleReaderComments = toggleReaderComments;

    function updateSectionForUser(ctx) {
        const user = ctx.user;
        if (user) {
            ctx.authStatus.textContent = `Signed in as ${user.displayName || user.email}`;
            ctx.authForm.style.display = 'none';
            ctx.signoutBtn.style.display = 'inline-flex';
            ctx.commentForm.classList.remove('disabled');
            ctx.textarea.disabled = false;
            ctx.submitBtn.disabled = false;
            ctx.commentHint.textContent = 'Be kind. No spoilers or spam.';
        } else {
            ctx.authStatus.textContent = 'Sign in to discuss this chapter';
            ctx.authForm.style.display = 'flex';
            ctx.signoutBtn.style.display = 'none';
            ctx.commentForm.classList.add('disabled');
            ctx.textarea.disabled = true;
            ctx.submitBtn.disabled = true;
            ctx.commentHint.textContent = 'Login to post comments.';
        }
        ctx.authError.textContent = '';
        ctx.commentError.textContent = '';
        applyAuthMode(ctx);
    }

    async function refreshSession(ctx) {
        try {
            ctx.user = await api.session();
        } catch {
            ctx.user = null;
        }
        updateSectionForUser(ctx);
    }

    window.addEventListener('bbSessionChanged', (event) => {
        if (!commentCtx) return;
        commentCtx.user = event?.detail?.user || null;
        updateSectionForUser(commentCtx);
    });

    async function handleAuthSubmit(event, ctx) {
        event.preventDefault();
        const email = ctx.emailInput.value.trim();
        const password = ctx.passwordInput.value;
        const displayName = ctx.displayNameInput.value.trim();
        const inviteCode = ctx.inviteInput ? ctx.inviteInput.value.trim() : '';
        const emailOptIn = ctx.emailOptInInput ? ctx.emailOptInInput.checked : false;
        ctx.authError.textContent = '';

        if (!email || !password) {
            ctx.authError.textContent = 'Email and password are required.';
            return;
        }

        ctx.authSubmit.disabled = true;
        try {
            ctx.user = ctx.mode === 'login'
                ? await api.login(email, password)
                : await api.register(email, password, displayName, inviteCode, emailOptIn);
            ctx.emailInput.value = '';
            ctx.passwordInput.value = '';
            ctx.displayNameInput.value = '';
            if (ctx.inviteInput) ctx.inviteInput.value = '';
            if (ctx.emailOptInInput) ctx.emailOptInInput.checked = false;
            updateSectionForUser(ctx);
            await loadComments(ctx);
            try {
                window.dispatchEvent(new CustomEvent('bbSessionChanged', { detail: { user: ctx.user || null } }));
            } catch (err) { }
        } catch (err) {
            ctx.authError.textContent = err.message || 'Authentication failed.';
        } finally {
            ctx.authSubmit.disabled = false;
        }
    }

    async function handleLogout(ctx) {
        try {
            await api.logout();
        } finally {
            ctx.user = null;
            updateSectionForUser(ctx);
            await loadComments(ctx);
            try {
                window.dispatchEvent(new CustomEvent('bbSessionChanged', { detail: { user: null } }));
            } catch (err) { }
        }
    }

    async function handleCommentSubmit(event, ctx) {
        event.preventDefault();
        ctx.commentError.textContent = '';

        if (!ctx.user) {
            ctx.commentError.textContent = 'Please sign in to post.';
            return;
        }

        const message = ctx.textarea.value.trim();
        if (!message || message.length > 2000) {
            ctx.commentError.textContent = 'Comment must be 1-2000 characters.';
            return;
        }

        ctx.submitBtn.disabled = true;
        try {
            await api.postComment(ctx.targetId, message);
            ctx.textarea.value = '';
            await loadComments(ctx);
        } catch (err) {
            ctx.commentError.textContent = err.message || 'Failed to post comment.';
        } finally {
            ctx.submitBtn.disabled = !ctx.user;
        }
    }

    function renderComments(ctx, comments) {
        const listEl = ctx.listEl;
        const isAdmin = !!(ctx.user && String(ctx.user.role || '').toLowerCase() === 'admin');
        listEl.innerHTML = '';
        if (!comments || comments.length === 0) {
            listEl.innerHTML = '<div class="comment-empty">No comments yet. Start the discussion!</div>';
            return;
        }

        comments.forEach(comment => {
            const commentId = comment?.id;
            const isHidden = !!comment?.hidden;
            const date = comment.createdAt ? new Date(comment.createdAt) : null;
            const dateStr = date && !Number.isNaN(date) ? date.toLocaleString() : '';

            let modActions = null;
            if (isAdmin && commentId) {
                modActions = h('div', { className: 'comment-mod-actions' }, [
                    h('button', {
                        type: 'button',
                        className: 'comment-mod-btn',
                        onClick: async (e) => {
                            e.preventDefault(); e.stopPropagation();
                            ctx.commentError.textContent = '';
                            try {
                                await api.moderateComment(ctx.targetId, commentId, isHidden ? 'unhide' : 'hide');
                                await loadComments(ctx);
                            } catch (err) {
                                ctx.commentError.textContent = err?.message || 'Moderation failed.';
                            }
                        }
                    }, isHidden ? 'UNHIDE' : 'HIDE'),
                    h('button', {
                        type: 'button',
                        className: 'comment-mod-btn danger',
                        onClick: async (e) => {
                            e.preventDefault(); e.stopPropagation();
                            if (!confirm('Delete this comment?')) return;
                            ctx.commentError.textContent = '';
                            try {
                                await api.moderateComment(ctx.targetId, commentId, 'delete');
                                await loadComments(ctx);
                            } catch (err) {
                                ctx.commentError.textContent = err?.message || 'Moderation failed.';
                            }
                        }
                    }, 'DELETE')
                ]);
            }

            const card = h('div', { className: `comment-card${isHidden ? ' is-hidden' : ''}` }, [
                h('div', { className: 'comment-meta' }, [
                    h('div', { className: 'comment-meta-left' },
                        h('span', { className: 'comment-author' }, comment.displayName || 'Reader')
                    ),
                    h('div', { className: 'comment-meta-right' }, [
                        h('span', { className: 'comment-time' }, dateStr),
                        modActions
                    ])
                ]),
                h('p', { className: 'comment-body' }, comment.message || '')
            ]);

            listEl.appendChild(card);
        });
    }

    async function loadComments(ctx) {
        // Fetch comments from the local API and render into the panel.
        ctx.listEl.innerHTML = '<div class="comment-empty">Loading comments...</div>';
        try {
            ctx.targetId = getCurrentTargetId();
            const comments = await api.fetchComments(ctx.targetId);
            renderComments(ctx, comments);
        } catch (err) {
            ctx.listEl.innerHTML = `<div class="comment-empty">${err.message}</div>`;
        }
    }

    function toggleAuthMode(ctx) {
        try {
            ctx.mode = ctx.mode === 'login' ? 'register' : 'login';
            applyAuthMode(ctx);
        } catch (err) {
            if (ctx?.authError) {
                ctx.authError.textContent = err?.message || 'Could not toggle auth mode.';
            }
        }
    }

    function handleChapterChange(ctx) {
        ctx.targetId = getCurrentTargetId();
        loadComments(ctx);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
