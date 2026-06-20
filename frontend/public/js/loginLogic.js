(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LoginLogic = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const LOGIN_GREETINGS = {
        earlyMorning: [
            'Good morning',
            'Rise and shine',
            'Morning already',
            'Fresh start today',
            'Still waking up?',
        ],
        morning: [
            'Good morning',
            'Morning',
            'Top of the morning',
            'Start your day',
            'New day ahead',
        ],
        afternoon: [
            'Good afternoon',
            'Afternoon',
            'Hello again',
            'Nice to see you',
            'Hope your day is going well',
        ],
        evening: [
            'Good evening',
            'Evening',
            'Hello again',
            'Nice to see you',
            'Welcome back',
        ],
        night: [
            'Good evening',
            'Hello',
            'Nice to see you',
            'Welcome back',
            'Still up late?',
        ],
    };

    const MIN_PASSWORD_LENGTH = 8;

    function getGreetingPeriod(hour) {
        if (hour >= 5 && hour < 7) return 'earlyMorning';
        if (hour >= 7 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 17) return 'afternoon';
        if (hour >= 17 && hour < 21) return 'evening';
        return 'night';
    }

    function pickLoginGreeting(hour, randomFn = Math.random) {
        const period = getGreetingPeriod(hour);
        const options = LOGIN_GREETINGS[period];
        const index = Math.floor(randomFn() * options.length);
        return options[index].toLowerCase();
    }

    function getLoginTitle(needsRegistration, hour, randomFn) {
        if (needsRegistration) return 'Create your account';
        return pickLoginGreeting(hour, randomFn);
    }

    function getSubmitLabel(needsRegistration) {
        return needsRegistration ? 'Create account' : 'Sign In';
    }

    function shouldShowPasswordConfirm(needsRegistration) {
        return !!needsRegistration;
    }

    const REMEMBER_ME_STORAGE_KEY = 'netsocket.rememberMe';

    function getDefaultRememberMe(storage) {
        if (!storage) return true;
        try {
            const stored = storage.getItem(REMEMBER_ME_STORAGE_KEY);
            if (stored === '0') return false;
            if (stored === '1') return true;
        } catch (_) { /* ignore */ }
        return true;
    }

    function persistRememberMeChoice(storage, rememberMe) {
        if (!storage) return;
        try {
            storage.setItem(REMEMBER_ME_STORAGE_KEY, rememberMe ? '1' : '0');
        } catch (_) { /* ignore */ }
    }

    function validateLoginForm({ username, password, passwordConfirm, needsRegistration, rememberMe }) {
        const trimmedUsername = typeof username === 'string' ? username.trim() : '';
        const pwd = typeof password === 'string' ? password : '';
        const confirm = typeof passwordConfirm === 'string' ? passwordConfirm : '';

        if (!trimmedUsername || !pwd) {
            return { ok: false, message: 'Enter a username and password.' };
        }
        if (needsRegistration) {
            if (pwd !== confirm) {
                return { ok: false, message: 'Passwords do not match.' };
            }
            if (pwd.length < MIN_PASSWORD_LENGTH) {
                return { ok: false, message: 'Password must be at least 8 characters.' };
            }
        }
        const body = {
            username: trimmedUsername,
            password: pwd,
            rememberMe: rememberMe === true,
        };
        if (needsRegistration) {
            body.passwordConfirm = confirm;
        }
        return { ok: true, body };
    }

    function resolveRedirectTarget(redirectParam) {
        if (typeof redirectParam === 'string'
            && redirectParam.startsWith('/')
            && !redirectParam.startsWith('//')) {
            return redirectParam;
        }
        return '/dashboard';
    }

    function getNoticeVariantForError(status, errorCode) {
        if (status === 429) return { message: 'Too many login attempts. Wait a few minutes and try again.', variant: 'error' };
        if (status === 400 && errorCode === 'password_mismatch') {
            return { message: 'Passwords do not match.', variant: 'error' };
        }
        if (status === 400 && errorCode === 'password_too_short') {
            return { message: 'Password must be at least 8 characters.', variant: 'error' };
        }
        return null;
    }

    function getFallbackLoginError(needsRegistration) {
        return needsRegistration
            ? 'Could not create account. Check your input and try again.'
            : 'Invalid username or password.';
    }

    function mapLoginResponseToNotice(status, errorBody, needsRegistration) {
        const known = getNoticeVariantForError(status, errorBody?.error);
        if (known) return known;
        if (status === 200) return null;
        return { message: getFallbackLoginError(needsRegistration), variant: 'error' };
    }

    function getNoticeA11y(variant) {
        if (variant === 'info') {
            return { role: 'status', ariaLive: 'polite' };
        }
        return { role: 'alert', ariaLive: 'assertive' };
    }

    return {
        LOGIN_GREETINGS,
        MIN_PASSWORD_LENGTH,
        REMEMBER_ME_STORAGE_KEY,
        getDefaultRememberMe,
        persistRememberMeChoice,
        getGreetingPeriod,
        pickLoginGreeting,
        getLoginTitle,
        getSubmitLabel,
        shouldShowPasswordConfirm,
        validateLoginForm,
        resolveRedirectTarget,
        getNoticeVariantForError,
        getFallbackLoginError,
        mapLoginResponseToNotice,
        getNoticeA11y,
    };
}));
