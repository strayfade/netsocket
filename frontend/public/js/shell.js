(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ShellLogic = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var TAB_PATHS = {
        dashboard: '/dashboard',
        automate: '/automate',
        panels: '/panels',
    };

    function getActiveTab(pathname) {
        var path = typeof pathname === 'string' ? pathname.toLowerCase().split('?')[0] : '';
        if (path === '/automate' || path.indexOf('/automate') === 0) return 'automate';
        if (path === '/panels' || path.indexOf('/panels') === 0 || path.indexOf('/panel/') === 0) return 'panels';
        return 'dashboard';
    }

    function getTabHref(tab) {
        return TAB_PATHS[tab] || TAB_PATHS.dashboard;
    }

    function buildLoginRedirect(pathname) {
        var target = typeof pathname === 'string' && pathname.charAt(0) === '/' && pathname.indexOf('//') !== 0
            ? pathname
            : '/dashboard';
        return '/login?redirect=' + encodeURIComponent(target);
    }

    async function ensureSession(fetcher, redirectFn) {
        var runFetch = fetcher || (typeof fetch !== 'undefined' ? fetch : null);
        if (!runFetch) return false;
        try {
            var res = await runFetch('/v1/session', { credentials: 'same-origin' });
            if (res && res.ok) return true;
        } catch (_) {
            return false;
        }
        var go = redirectFn || (typeof window !== 'undefined' && window.location
            ? function (url) { window.location.replace(url); }
            : null);
        if (go) {
            var current = typeof window !== 'undefined' ? window.location.pathname : '/dashboard';
            go(buildLoginRedirect(current));
        }
        return false;
    }

    function showToast(message, opts) {
        if (typeof document === 'undefined') return null;
        var region = document.getElementById('shell-toast-region');
        if (!region) {
            region = document.createElement('div');
            region.id = 'shell-toast-region';
            region.className = 'shell-toast-region';
            region.setAttribute('role', 'status');
            region.setAttribute('aria-live', 'polite');
            document.body.appendChild(region);
        }
        var el = document.createElement('div');
        el.className = 'shell-toast';
        el.textContent = String(message == null ? '' : message);
        region.appendChild(el);
        var timeout = (opts && typeof opts.timeout === 'number') ? opts.timeout : 3200;
        if (timeout > 0) {
            setTimeout(function () {
                if (el.parentNode) el.parentNode.removeChild(el);
            }, timeout);
        }
        return el;
    }

    function markActiveTab(doc) {
        var scope = doc || (typeof document !== 'undefined' ? document : null);
        if (!scope) return null;
        var path = typeof window !== 'undefined' ? window.location.pathname : '/dashboard';
        var active = getActiveTab(path);
        var tabs = scope.querySelectorAll('[data-shell-tab]');
        for (var i = 0; i < tabs.length; i++) {
            if (tabs[i].getAttribute('data-shell-tab') === active) {
                tabs[i].setAttribute('aria-current', 'page');
            } else {
                tabs[i].removeAttribute('aria-current');
            }
        }
        return active;
    }

    return {
        TAB_PATHS: TAB_PATHS,
        getActiveTab: getActiveTab,
        getTabHref: getTabHref,
        buildLoginRedirect: buildLoginRedirect,
        ensureSession: ensureSession,
        showToast: showToast,
        markActiveTab: markActiveTab,
    };
}));
