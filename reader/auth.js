/**
 * Authentication Manager for BWonderComics
 * Centralized authentication logic to eliminate duplication
 */

import { API } from './constants.js';
import { logger } from './logger.js';

/**
 * Authentication state and methods
 */
export class AuthManager {
    constructor() {
        this.user = null;
        this.listeners = new Set();
    }

    /**
     * Check current session status
     * @returns {Promise<Object|null>} User object if authenticated, null otherwise
     */
    async checkSession() {
        try {
            const response = await fetch(API.ENDPOINTS.SESSION, {
                credentials: 'include'
            });

            if (response.ok) {
                this.user = await response.json();
                this.notify();
                logger.log('Session check: authenticated', this.user);
                return this.user;
            }

            this.user = null;
            this.notify();
            return null;
        } catch (err) {
            logger.error('Session check failed:', err);
            this.user = null;
            this.notify();
            return null;
        }
    }

    /**
     * Login with email and password
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<Object>} User object on success
     * @throws {Error} On login failure
     */
    async login(email, password) {
        try {
            const response = await fetch(API.ENDPOINTS.LOGIN, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error || 'Login failed');
            }

            await this.checkSession();
            logger.log('Login successful');
            return this.user;
        } catch (err) {
            logger.error('Login error:', err);
            throw err;
        }
    }

    /**
     * Register a new user
     * @param {string} email - User email
     * @param {string} password - User password
     * @param {string} displayName - Display name
     * @param {string} inviteCode - Optional invite code
     * @param {boolean} emailOptIn - Email list opt-in
     * @returns {Promise<Object>} User object on success
     * @throws {Error} On registration failure
     */
    async register(email, password, displayName, inviteCode = '', emailOptIn = false) {
        try {
            const response = await fetch(API.ENDPOINTS.REGISTER, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    email,
                    password,
                    display_name: displayName,
                    invite_code: inviteCode,
                    email_opt_in: Boolean(emailOptIn)
                })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error || 'Registration failed');
            }

            await this.checkSession();
            logger.log('Registration successful');
            return this.user;
        } catch (err) {
            logger.error('Registration error:', err);
            throw err;
        }
    }

    /**
     * Logout current user
     * @returns {Promise<void>}
     */
    async logout() {
        try {
            await fetch(API.ENDPOINTS.LOGOUT, {
                method: 'POST',
                credentials: 'include'
            });

            this.user = null;
            this.notify();
            logger.log('Logout successful');
        } catch (err) {
            logger.error('Logout error:', err);
            // Still clear user on error
            this.user = null;
            this.notify();
        }
    }

    /**
     * Register a callback for auth state changes
     * @param {Function} callback - Function to call when auth state changes
     * @returns {Function} Unsubscribe function
     */
    onChange(callback) {
        this.listeners.add(callback);
        // Return unsubscribe function
        return () => this.listeners.delete(callback);
    }

    /**
     * Notify all listeners of auth state change
     * @private
     */
    notify() {
        this.listeners.forEach(cb => {
            try {
                cb(this.user);
            } catch (err) {
                logger.error('Auth listener error:', err);
            }
        });

        // Dispatch custom event for backward compatibility
        window.dispatchEvent(new CustomEvent('bbSessionChanged', {
            detail: { user: this.user }
        }));
    }

    /**
     * Check if current user is admin
     * @returns {boolean}
     */
    isAdmin() {
        return this.user?.role === 'admin';
    }

    /**
     * Check if current user has premium access
     * @returns {boolean}
     */
    isPremium() {
        return ['admin', 'premium'].includes(this.user?.role) || !!this.user?.premiumActive;
    }

    /**
     * Get current user
     * @returns {Object|null}
     */
    getUser() {
        return this.user;
    }

    /**
     * Check if user is authenticated
     * @returns {boolean}
     */
    isAuthenticated() {
        return this.user !== null;
    }
}

/**
 * Global auth instance
 * Import this to use authentication throughout the app
 */
export const auth = new AuthManager();

/**
 * Initialize auth on page load
 * Automatically checks session
 */
export async function initAuth() {
    await auth.checkSession();
    return auth;
}
