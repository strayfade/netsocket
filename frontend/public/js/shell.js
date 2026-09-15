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

    function isSidebarOverlay() {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
        return window.matchMedia('(max-width: 768px)').matches;
    }

    function initSidebar(doc) {
        var scope = doc || (typeof document !== 'undefined' ? document : null);
        if (!scope) return null;
        var sidebar = scope.getElementById('shell-sidebar');
        var backdrop = scope.getElementById('shell-sidebar-backdrop');
        var toggle = scope.getElementById('shell-sidebar-toggle');
        if (!sidebar || !backdrop || !toggle) return null;
        if (sidebar.getAttribute('data-sidebar-bound') === 'true') return sidebar;
        sidebar.setAttribute('data-sidebar-bound', 'true');

        function setOpen(open) {
            if (open) {
                sidebar.classList.add('is-open');
                backdrop.hidden = false;
                backdrop.removeAttribute('hidden');
                toggle.setAttribute('aria-expanded', 'true');
                toggle.setAttribute('aria-label', 'Close navigation');
                try { scope.body.style.overflow = isSidebarOverlay() ? 'hidden' : ''; } catch (_) {}
            } else {
                sidebar.classList.remove('is-open');
                backdrop.hidden = true;
                toggle.setAttribute('aria-expanded', 'false');
                toggle.setAttribute('aria-label', 'Open navigation');
                try { scope.body.style.overflow = ''; } catch (_) {}
            }
        }

        toggle.addEventListener('click', function () {
            var open = !sidebar.classList.contains('is-open');
            setOpen(open);
        });
        backdrop.addEventListener('click', function () { setOpen(false); });
        scope.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' || e.keyCode === 27) setOpen(false);
        });
        // Close drawer when a nav link is activated on mobile
        var links = sidebar.querySelectorAll('a');
        for (var i = 0; i < links.length; i++) {
            links[i].addEventListener('click', function () {
                if (isSidebarOverlay()) setOpen(false);
            });
        }
        // Close on resize to desktop
        if (typeof window !== 'undefined' && window.addEventListener) {
            window.addEventListener('resize', function () {
                if (!isSidebarOverlay()) setOpen(false);
            });
        }
        return sidebar;
    }

    function initBackupModal(doc) {
        var scope = doc || (typeof document !== 'undefined' ? document : null);
        if (!scope) return null;
        var modal = scope.getElementById('backup-modal');
        if (!modal || modal.getAttribute('data-backup-bound') === 'true') return modal;
        var backdrop = scope.getElementById('backup-backdrop');
        var closeBtn = scope.getElementById('backup-close-btn');
        var openBackupBtns = scope.querySelectorAll('#open-backup');
        var exportBtn = scope.getElementById('backup-export-btn');
        var importBtn = scope.getElementById('backup-import-btn');
        var fileInput = scope.getElementById('backup-file-input');
        var status = scope.getElementById('backup-status');
        modal.setAttribute('data-backup-bound', 'true');

        var setStatus = function (text, isError) {
            if (!status) return;
            status.textContent = text || '';
            status.classList.toggle('backup-status-error', Boolean(isError && text));
        };
        var openModal = function () {
            if (!modal) return;
            modal.hidden = false;
            modal.removeAttribute('hidden');
            modal.setAttribute('aria-hidden', 'false');
            setStatus('');
        };
        var closeModal = function () {
            if (!modal) return;
            modal.hidden = true;
            modal.setAttribute('aria-hidden', 'true');
            setStatus('');
        };
        var parseFilename = function (header) {
            if (!header) return null;
            var m = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(header);
            return m ? decodeURIComponent(m[1].replace(/"/g, '')) : null;
        };
        for (var i = 0; i < openBackupBtns.length; i++) {
            (function (btn) {
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    openModal();
                    // Close mobile sidebar drawer when opening modal
                    var sb = scope.getElementById('shell-sidebar');
                    if (sb && sb.classList.contains('is-open') && isSidebarOverlay()) {
                        sb.classList.remove('is-open');
                        var bd = scope.getElementById('shell-sidebar-backdrop');
                        if (bd) bd.hidden = true;
                        var tg = scope.getElementById('shell-sidebar-toggle');
                        if (tg) tg.setAttribute('aria-expanded', 'false');
                        try { scope.body.style.overflow = ''; } catch (_) {}
                    }
                });
            })(openBackupBtns[i]);
        }
        if (backdrop) backdrop.addEventListener('click', closeModal);
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (exportBtn) {
            exportBtn.addEventListener('click', async function () {
                setStatus('');
                exportBtn.disabled = true;
                try {
                    var res = await fetch('/v1/export-full-state', { credentials: 'same-origin' });
                    if (!res.ok) {
                        setStatus(res.status === 401 ? 'Not signed in.' : 'Export failed (' + res.status + ').', true);
                        return;
                    }
                    var blob = await res.blob();
                    var url = URL.createObjectURL(blob);
                    var a = scope.createElement('a');
                    a.href = url;
                    a.download = parseFilename(res.headers.get('Content-Disposition')) || 'netsocket-backup.json';
                    a.rel = 'noopener';
                    scope.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                    setStatus('Download started.');
                } catch (err) {
                    setStatus('Export failed. Check your connection and try again.', true);
                } finally {
                    exportBtn.disabled = false;
                }
            });
        }
        if (importBtn && fileInput) {
            importBtn.addEventListener('click', function () {
                setStatus('');
                fileInput.click();
            });
            fileInput.addEventListener('change', async function () {
                var file = fileInput.files && fileInput.files[0];
                fileInput.value = '';
                if (!file) return;
                if (!window.confirm('Replace this machine\'s entire graph, variables, and integration settings with the contents of this file? This cannot be undone.')) return;
                importBtn.disabled = true;
                if (exportBtn) exportBtn.disabled = true;
                setStatus('Importing...');
                try {
                    var text = await file.text();
                    var body = JSON.parse(text);
                    var res = await fetch('/v1/import-full-state', {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    });
                    var data = await res.json().catch(function () { return {}; });
                    if (!res.ok) {
                        setStatus(data.error || 'Import failed (' + res.status + ').', true);
                        return;
                    }
                    setStatus(data.message || 'Import complete. Reloading...');
                    setTimeout(function () { window.location.reload(); }, 800);
                } catch (err) {
                    setStatus('Import failed. Check the file and try again.', true);
                } finally {
                    importBtn.disabled = false;
                    if (exportBtn) exportBtn.disabled = false;
                }
            });
        }
        // Close on Escape
        scope.addEventListener('keydown', function (e) {
            if ((e.key === 'Escape' || e.keyCode === 27) && !modal.hidden) closeModal();
        });
        return modal;
    }

    function initSettingsModal(doc) {
        var scope = doc || (typeof document !== 'undefined' ? document : null);
        if (!scope) return null;
        var modal = scope.getElementById('settings-modal');
        if (!modal || modal.getAttribute('data-settings-bound') === 'true') return modal;
        var backdrop = scope.getElementById('settings-backdrop');
        var closeBtn = scope.getElementById('close-settings');
        var openBtns = scope.querySelectorAll('#open-settings');
        if (!openBtns.length && !backdrop && !closeBtn) return modal;
        modal.setAttribute('data-settings-bound', 'true');
        var openModal = function () {
            modal.style.display = 'block';
            modal.removeAttribute('hidden');
            modal.setAttribute('aria-hidden', 'false');
            var sb = scope.getElementById('shell-sidebar');
            if (sb && sb.classList.contains('is-open') && isSidebarOverlay()) {
                sb.classList.remove('is-open');
                var bd = scope.getElementById('shell-sidebar-backdrop');
                if (bd) bd.hidden = true;
                var tg = scope.getElementById('shell-sidebar-toggle');
                if (tg) tg.setAttribute('aria-expanded', 'false');
                try { scope.body.style.overflow = ''; } catch (_) {}
            }
        };
        var closeModal = function () {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
        };
        for (var i = 0; i < openBtns.length; i++) {
            (function (btn) {
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    openModal();
                });
            })(openBtns[i]);
        }
        if (backdrop) backdrop.addEventListener('click', closeModal);
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        scope.addEventListener('keydown', function (e) {
            if ((e.key === 'Escape' || e.keyCode === 27) && modal.style.display !== 'none' && modal.getAttribute('aria-hidden') !== 'true') closeModal();
        });
        return modal;
    }

    function autoInit() {
        if (typeof document === 'undefined') return;
        try { initSidebar(document); } catch (_) {}
        try { initBackupModal(document); } catch (_) {}
        try { initSettingsModal(document); } catch (_) {}
    }
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', autoInit);
        } else {
            // Defer to next tick so inline scripts marking tabs run first
            setTimeout(autoInit, 0);
        }
    }

    return {
        TAB_PATHS: TAB_PATHS,
        getActiveTab: getActiveTab,
        getTabHref: getTabHref,
        buildLoginRedirect: buildLoginRedirect,
        ensureSession: ensureSession,
        showToast: showToast,
        markActiveTab: markActiveTab,
        initSidebar: initSidebar,
        isSidebarOverlay: isSidebarOverlay,
        initBackupModal: initBackupModal,
        initSettingsModal: initSettingsModal,
    };
}));
