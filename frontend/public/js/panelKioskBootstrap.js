(function () {
    var clockInterval = null;
    var configInterval = null;
    var panelReconnectTimer = null;
    var panelSocket = null;
    var grid = null;
    var lastLayoutKey = null;
    var liveVariables = {};
    var liveAutomations = [];
    var currentPanelId = '';
    var onResize = null;
    var onOrientation = null;

    function updateLoginLink(panelId) {
        var link = document.getElementById('panel-login-link');
        if (!link) return;
        link.href =
            '/login?redirect=' + encodeURIComponent('/panel/' + encodeURIComponent(panelId));
    }

    function show(id) {
        ['panel-loading', 'panel-not-found', 'panel-login-required'].forEach(function (other) {
            document.getElementById(other).hidden = other !== id;
        });
        if (id) document.getElementById('panel-content').hidden = true;
        if (id === 'panel-login-required') updateLoginLink(currentPanelId);
    }

    function clockNowMs() {
        try {
            if (window.ShellLogic) {
                if (typeof window.ShellLogic.ntpNow === 'function') return window.ShellLogic.ntpNow();
                if (typeof window.ShellLogic.serverNow === 'function') return window.ShellLogic.serverNow();
            }
        } catch (_) { /* fall through */ }
        return Date.now();
    }

    function tickClock() {
        var parts = null;
        try {
            if (window.ShellLogic && typeof window.ShellLogic.formatEasternClock === 'function') {
                parts = window.ShellLogic.formatEasternClock(clockNowMs());
            }
        } catch (_) { parts = null; }
        if (!parts) {
            var now = new Date(clockNowMs());
            var h = now.getHours() % 12;
            if (h === 0) h = 12;
            parts = {
                time: h + ':' + String(now.getMinutes()).padStart(2, '0'),
                date: now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
            };
        }
        Array.prototype.forEach.call(document.querySelectorAll('[data-clock-time]'), function (el) {
            el.textContent = parts.time;
            el.classList.remove('shell-skeleton');
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-clock-date]'), function (el) {
            el.textContent = parts.date;
        });
    }

    async function syncServerTime() {
        try {
            if (window.ShellLogic && typeof window.ShellLogic.syncNtpTime === 'function') {
                await window.ShellLogic.syncNtpTime();
            } else {
                var timeRes = await fetch('/v1/time', { credentials: 'same-origin' });
                if (!timeRes.ok) return;
                var timeData = await timeRes.json();
                if (window.ShellLogic) {
                    window.ShellLogic.setNtpTime
                        ? window.ShellLogic.setNtpTime(timeData.now)
                        : window.ShellLogic.setServerTime(timeData.now);
                }
            }
            tickClock();
        } catch (_) { /* keep last anchor */ }
    }

    function widgetCtx() {
        return {
            automations: liveAutomations,
            variables: liveVariables,
            onRun: runAutomation,
            renderMarkdown: window.renderAgentMarkdown
                ? window.renderAgentMarkdown.bind(window)
                : null,
        };
    }

    function fitPanelContain() {
        var gridEl = document.getElementById('panel-grid');
        var contentEl = document.getElementById('panel-content');
        if (!gridEl || !contentEl || contentEl.hidden) return;
        gridEl.style.transform = '';
        gridEl.style.margin = '';
        var vw = contentEl.clientWidth || window.innerWidth;
        var vh = contentEl.clientHeight || window.innerHeight;
        var gw = gridEl.offsetWidth || gridEl.scrollWidth || vw;
        var gh = gridEl.scrollHeight || gridEl.offsetHeight || vh;
        if (!gw || !gh || !vw || !vh) return;
        var scale = Math.min(vw / gw, vh / gh);
        if (!isFinite(scale) || scale <= 0) return;
        if (scale > 8) scale = 8;
        if (scale === 1) return;
        gridEl.style.transform = 'scale(' + scale + ')';
        var mx = (gw * (1 - scale)) / 2;
        var my = (gh * (1 - scale)) / 2;
        gridEl.style.margin = (-my) + 'px ' + (-mx) + 'px';
    }

    function rebuildGrid(widgets) {
        var container = document.getElementById('panel-grid');
        if (grid) {
            try { grid.destroy(false); } catch (_) { /* ignore */ }
            grid = null;
        }
        container.innerHTML = '';
        var centered = widgets;
        if (widgets.length) {
            var minX = Infinity, maxX = -Infinity, minY = Infinity;
            widgets.forEach(function (w) {
                var x = w.x || 0;
                var ww = w.w || 1;
                var y = w.y || 0;
                if (x < minX) minX = x;
                if (x + ww > maxX) maxX = x + ww;
                if (y < minY) minY = y;
            });
            var boundsW = maxX - minX;
            var offsetX = Math.floor((12 - boundsW) / 2) - minX;
            var offsetY = -minY;
            if (offsetX !== 0 || offsetY !== 0) {
                centered = widgets.map(function (w) {
                    var copy = {};
                    for (var k in w) if (Object.prototype.hasOwnProperty.call(w, k)) copy[k] = w[k];
                    copy.x = (w.x || 0) + offsetX;
                    copy.y = (w.y || 0) + offsetY;
                    return copy;
                });
            }
        }
        centered.forEach(function (widget) {
            var item = Widgets.createItem(widget, widgetCtx());
            if (item) container.appendChild(item);
        });
        document.getElementById('panel-empty').hidden = widgets.length > 0;
        tickClock();
        if (window.GridStack) {
            grid = window.GridStack.init({
                column: 12,
                cellHeight: 'auto',
                margin: 0,
                staticGrid: true,
                animate: false,
                float: true,
                columnOpts: { breakpoints: [{ w: 640, c: 4 }] },
            }, container);
        }
        if (window.Widgets && typeof window.Widgets.syncGridSizes === 'function') {
            try { window.Widgets.syncGridSizes(container); } catch (_) { /* ignore */ }
        }
        requestAnimationFrame(function () {
            fitPanelContain();
            setTimeout(fitPanelContain, 100);
        });
    }

    function refreshVarContent(name, value) {
        liveVariables[name] = value;
        Array.prototype.forEach.call(document.querySelectorAll('[data-var-content="' + CSS.escape(name) + '"]'), function (node) {
            node.innerHTML = window.renderAgentMarkdown ? window.renderAgentMarkdown(value) : '';
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-var-frame="' + CSS.escape(name) + '"]'), function (frame) {
            frame.srcdoc = value;
        });
    }

    function renderConfig(data) {
        var panel = data.panel || {};
        document.getElementById('panel-loading').hidden = true;
        document.getElementById('panel-not-found').hidden = true;
        document.getElementById('panel-login-required').hidden = true;
        document.getElementById('panel-content').hidden = false;
        document.title = (panel.room || panel.name || 'Panel') + ' - netsocket';
        var gridEl = document.getElementById('panel-grid');
        gridEl.classList.toggle('no-borders', panel.showBorders === false);
        gridEl.setAttribute('data-widget-style', panel.widgetStyle || 'classic');

        var widgets = Array.isArray(panel.widgets) ? panel.widgets : [];
        liveVariables = data.variables && typeof data.variables === 'object' ? data.variables : {};
        liveAutomations = Array.isArray(data.automations) ? data.automations : [];
        var key = JSON.stringify(widgets);
        if (key !== lastLayoutKey) {
            lastLayoutKey = key;
            rebuildGrid(widgets);
        } else {
            Object.keys(liveVariables).forEach(function (name) {
                refreshVarContent(name, liveVariables[name]);
            });
        }
    }

    async function loadConfig() {
        var ok = await ShellLogic.ensureSession();
        if (!ok) return;
        var res;
        try {
            res = await fetch('/v1/panels/' + encodeURIComponent(currentPanelId) + '/config', {
                credentials: 'same-origin',
            });
        } catch (e) {
            ShellLogic.showToast('Network error loading panel');
            return;
        }
        if (res.status === 404) {
            show('panel-not-found');
            return;
        }
        if (res.status === 401) {
            show('panel-login-required');
            return;
        }
        if (!res.ok) {
            ShellLogic.showToast('Could not load panel');
            return;
        }
        var data = await res.json();
        if (window.ShellLogic && data.now != null) {
            if (typeof window.ShellLogic.setNtpTime === 'function') window.ShellLogic.setNtpTime(data.now);
            else window.ShellLogic.setServerTime(data.now);
        }
        renderConfig(data);
        connectPanelSocket();
    }

    async function runAutomation(item, btn) {
        try {
            var res = await fetch('/v1/panels/' + encodeURIComponent(currentPanelId) + '/execute', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nodeId: item.id }),
            });
            if (res.ok) {
                // Silent success — no toast
            } else if (res.status === 401) {
                show('panel-login-required');
            } else if (res.status === 403) {
                ShellLogic.showToast('Not allowed on this panel');
            } else {
                ShellLogic.showToast('Run failed (' + res.status + ')');
            }
        } catch (e) {
            ShellLogic.showToast('Run failed: network error');
        } finally {
            btn.disabled = false;
        }
    }

    function connectPanelSocket() {
        if (!currentPanelId) return;
        if (panelSocket) {
            try { panelSocket.close(); } catch (_) { /* ignore */ }
            panelSocket = null;
        }
        var protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        var socket;
        try {
            socket = new WebSocket(protocol + window.location.host + '/');
        } catch (e) {
            return;
        }
        panelSocket = socket;
        socket.onopen = function () {
            try {
                socket.send(JSON.stringify({ broadcastPurpose: 'ping' }));
            } catch (_) { /* ignore */ }
        };
        socket.onmessage = function (event) {
            var message;
            try {
                message = JSON.parse(event.data);
            } catch (_) {
                return;
            }
            if (message.broadcastPurpose === 'varsChanged' && message.broadcastData) {
                refreshVarContent(message.broadcastData.name, message.broadcastData.value);
            }
        };
        socket.onclose = function () {
            if (panelSocket === socket) panelSocket = null;
            if (panelReconnectTimer) clearTimeout(panelReconnectTimer);
            panelReconnectTimer = setTimeout(connectPanelSocket, 2000);
        };
    }

    function stopNetsocketPanelKiosk() {
        if (clockInterval) {
            clearInterval(clockInterval);
            clockInterval = null;
        }
        if (configInterval) {
            clearInterval(configInterval);
            configInterval = null;
        }
        if (panelReconnectTimer) {
            clearTimeout(panelReconnectTimer);
            panelReconnectTimer = null;
        }
        if (panelSocket) {
            try { panelSocket.close(); } catch (_) { /* ignore */ }
            panelSocket = null;
        }
        if (onResize) {
            window.removeEventListener('resize', onResize);
            onResize = null;
        }
        if (onOrientation) {
            window.removeEventListener('orientationchange', onOrientation);
            onOrientation = null;
        }
        if (grid) {
            try { grid.destroy(false); } catch (_) { /* ignore */ }
            grid = null;
        }
        var gridEl = document.getElementById('panel-grid');
        if (gridEl) {
            gridEl.innerHTML = '';
            gridEl.style.transform = '';
            gridEl.style.margin = '';
        }
        if (window.ShellLogic && typeof window.ShellLogic.stopNtpResync === 'function') {
            try { window.ShellLogic.stopNtpResync(); } catch (_) { /* ignore */ }
        }
        lastLayoutKey = null;
        liveVariables = {};
        liveAutomations = [];
        currentPanelId = '';
    }

    function startNetsocketPanelKiosk(panelId) {
        stopNetsocketPanelKiosk();

        currentPanelId = panelId != null ? String(panelId) : '';
        updateLoginLink(currentPanelId);

        document.getElementById('panel-not-found').hidden = true;
        document.getElementById('panel-login-required').hidden = true;
        document.getElementById('panel-content').hidden = true;
        document.getElementById('panel-loading').hidden = false;

        tickClock();
        clockInterval = setInterval(tickClock, 15000);

        onResize = fitPanelContain;
        window.addEventListener('resize', onResize);
        onOrientation = function () {
            setTimeout(fitPanelContain, 100);
        };
        window.addEventListener('orientationchange', onOrientation);

        if (!currentPanelId) {
            show('panel-not-found');
            return;
        }

        loadConfig();
        syncServerTime();
        if (window.ShellLogic && typeof window.ShellLogic.startNtpResync === 'function') {
            window.ShellLogic.startNtpResync();
        }
        configInterval = setInterval(loadConfig, 60000);
    }

    window.startNetsocketPanelKiosk = startNetsocketPanelKiosk;
    window.stopNetsocketPanelKiosk = stopNetsocketPanelKiosk;
})();
