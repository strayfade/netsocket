(function () {
    'use strict';

    const LoginLogic = (typeof require === 'function')
        ? require('./loginLogic')
        : globalThis.LoginLogic;

    function initLoginPage(document, options = {}) {
        const fetchFn = options.fetch;
        if (typeof fetchFn !== 'function') {
            throw new Error('initLoginPage requires a fetch implementation');
        }

        let needsRegistration = false;

        function setLoginTitle() {
            document.getElementById('loginTitle').textContent =
                LoginLogic.getLoginTitle(needsRegistration, new Date().getHours());
        }

        function showLoginNotice(message, variant) {
            const el = document.getElementById('loginNotice');
            const text = document.getElementById('loginNoticeText');
            text.textContent = message;
            el.classList.remove('login-notice--error', 'login-notice--info');
            el.classList.add(variant === 'info' ? 'login-notice--info' : 'login-notice--error');
            el.removeAttribute('hidden');
            const a11y = LoginLogic.getNoticeA11y(variant);
            el.setAttribute('role', a11y.role);
            el.setAttribute('aria-live', a11y.ariaLive);
        }

        function hideLoginNotice() {
            const el = document.getElementById('loginNotice');
            el.setAttribute('hidden', '');
            document.getElementById('loginNoticeText').textContent = '';
            el.classList.remove('login-notice--error', 'login-notice--info');
        }

        function applyRegistrationUi() {
            document.getElementById('passwordConfirmRow').classList.toggle(
                'hidden',
                !LoginLogic.shouldShowPasswordConfirm(needsRegistration)
            );
            document.getElementById('submitBtn').querySelector('.button-submit-label').textContent =
                LoginLogic.getSubmitLabel(needsRegistration);
            if (needsRegistration) {
                document.getElementById('loginTitle').textContent = 'Create your account';
            } else {
                setLoginTitle();
            }
        }

        function initRememberMeToggle() {
            const rememberEl = document.getElementById('rememberMe');
            if (!rememberEl) return;
            rememberEl.checked = LoginLogic.getDefaultRememberMe(options.storage);
            rememberEl.addEventListener('change', () => {
                LoginLogic.persistRememberMeChoice(options.storage, rememberEl.checked);
            });
        }

        async function applyAuthState() {
            const r = await fetchFn('/v1/auth-state', { credentials: 'same-origin' });
            if (!r.ok) return;
            const data = await r.json();
            needsRegistration = !!data.needsRegistration;
            applyRegistrationUi();
        }

        async function login(event) {
            event.preventDefault();
            hideLoginNotice();
            const rememberMe = document.getElementById('rememberMe')?.checked === true;
            const validation = LoginLogic.validateLoginForm({
                username: document.getElementById('username').value,
                password: document.getElementById('password').value,
                passwordConfirm: document.getElementById('passwordConfirm').value,
                needsRegistration,
                rememberMe,
            });
            if (!validation.ok) {
                showLoginNotice(validation.message);
                return;
            }
            LoginLogic.persistRememberMeChoice(options.storage, rememberMe);
            const response = await fetchFn('/login', {
                method: 'POST',
                body: JSON.stringify(validation.body),
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
            });
            if (response.status === 200) {
                const params = new URLSearchParams(options.locationSearch || '');
                const target = LoginLogic.resolveRedirectTarget(params.get('redirect'));
                if (typeof options.onLoginSuccess === 'function') {
                    options.onLoginSuccess(target);
                }
                return;
            }
            let errorBody = null;
            if (response.status === 400) {
                try {
                    errorBody = await response.json();
                } catch (_) { /* ignore */ }
            }
            const notice = LoginLogic.mapLoginResponseToNotice(
                response.status,
                errorBody,
                needsRegistration
            );
            if (notice) showLoginNotice(notice.message, notice.variant);
        }

        document.querySelector('form').addEventListener('submit', login);
        document.getElementById('loginNoticeDismiss').addEventListener('click', hideLoginNotice);
        initRememberMeToggle();
        setLoginTitle();
        applyAuthState();

        return {
            getNeedsRegistration: () => needsRegistration,
            setNeedsRegistration: (value) => {
                needsRegistration = !!value;
                applyRegistrationUi();
            },
            showLoginNotice,
            hideLoginNotice,
            setLoginTitle,
            applyAuthState,
            login,
        };
    }

    if (typeof module === 'object' && module.exports) {
        module.exports = { initLoginPage };
    }

    if (typeof document !== 'undefined' && globalThis.LoginLogic) {
        initLoginPage(document, {
            fetch: globalThis.fetch.bind(globalThis),
            locationSearch: globalThis.location.search,
            storage: globalThis.localStorage,
            onLoginSuccess(target) {
                globalThis.location.href = target;
            },
        });
    }
}());
