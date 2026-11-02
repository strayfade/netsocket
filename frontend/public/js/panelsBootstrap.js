(function () {
    'use strict';

    var __netsocketPanelsStop = null;

    window.startNetsocketPanels = function startNetsocketPanels() {
        if (__netsocketPanelsStop) {
            window.stopNetsocketPanels();
        }

        var abortController = new AbortController();
        var signal = abortController.signal;

        var allAutomations = [];
        var allDevices = [];
        var allPanels = [];
        var editingPanelId = null;
        var devicePicker = PanelDevicePicker.attach(document.getElementById('edit-panel-devices'), {
            getDevices: function () { return allDevices; },
            getPanels: function () { return allPanels; },
            getPanelId: function () { return editingPanelId; },
        });
        var editingWidgets = [];
        var panelVariables = {};
        var panelWeather = {};

        function panelUrl(panelId) {
            return window.location.origin + '/panel/' + encodeURIComponent(panelId);
        }

        async function copyPanelUrl(panelId, btn) {
            try {
                await navigator.clipboard.writeText(panelUrl(panelId));
                ShellLogic.showToast('Panel URL copied');
            } catch (e) {
                ShellLogic.showToast('Copy failed, copy the URL manually');
            }
        }

        async function api(path, options) {
            var res = await fetch(path, Object.assign({ credentials: 'same-origin' }, options || {}));
            if (res.status === 401) {
                throw new Error('unauthorized');
            }
            return res;
        }

        async function patchPanelWidgets(nextWidgets) {
            if (!editingPanelId) return;
            try {
                var res = await api('/v1/panels/' + encodeURIComponent(editingPanelId), {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ widgets: nextWidgets }),
                });
                if (res.ok) {
                    ShellLogic.showToast('Layout saved');
                    loadPanels();
                } else {
                    var err = await res.json().catch(function () { return {}; });
                    ShellLogic.showToast('Save failed: ' + (err.error || res.status));
                }
            } catch (e) {
                if (e.message !== 'unauthorized') ShellLogic.showToast('Save failed: network error');
            }
        }

        WidgetEditor.tickClock();
        var clockTickIntervalId = setInterval(WidgetEditor.tickClock, 15000);

        async function syncServerTime() {
            try {
                if (typeof ShellLogic.syncNtpTime === 'function') {
                    await ShellLogic.syncNtpTime(api);
                } else {
                    var timeRes = await api('/v1/time');
                    if (!timeRes.ok) return;
                    var timeData = await timeRes.json();
                    ShellLogic.setServerTime(timeData.now);
                }
                WidgetEditor.tickClock();
            } catch (e) { /* keep last anchor */ }
        }

        document.getElementById('edit-panel-borders').addEventListener('change', function () {
            document.getElementById('panel-edit-grid').classList.toggle('no-borders', !this.checked);
        }, { signal: signal });
        document.getElementById('edit-panel-widget-style').addEventListener('change', function () {
            document.getElementById('panel-edit-grid').setAttribute('data-widget-style', this.value || 'classic');
        }, { signal: signal });

        var editor = WidgetEditor.attach({
            gridId: 'panel-edit-grid',
            editToggleId: 'panel-layout-edit-toggle',
            addOpenId: 'panel-add-widget-open',
            dialogId: 'panel-add-widget-dialog',
            kindId: 'panel-dialog-kind',
            trackId: 'panel-dialog-preset-track',
            variableId: 'panel-dialog-variable',
            variableFieldId: 'panel-dialog-variable-field',
            automationId: 'panel-dialog-automation',
            automationFieldId: 'panel-dialog-automation-field',
            showNameId: 'panel-dialog-show-name',
            showNameFieldId: 'panel-dialog-show-name-field',
            showDateId: 'panel-dialog-show-date',
            showDateFieldId: 'panel-dialog-show-date-field',
            locationId: 'panel-dialog-location',
            locationFieldId: 'panel-dialog-location-field',
            unitId: 'panel-dialog-unit',
            unitFieldId: 'panel-dialog-unit-field',
            gradientId: 'panel-dialog-gradient',
            gradientFieldId: 'panel-dialog-gradient-field',
            cancelId: 'panel-dialog-cancel',
            cancelTopId: 'panel-dialog-cancel-top',
            addBtnId: 'panel-dialog-add',
            getWidgets: function () { return editingWidgets; },
            setWidgets: function (next) { editingWidgets = next; },
            getLiveContext: function () { return { variables: panelVariables, automations: allAutomations, weather: panelWeather }; },
            onSave: patchPanelWidgets,
            fetchAutomations: async function () {
                try {
                    var res = await api('/v1/dashboard/summary');
                    if (!res.ok) return;
                    var data = await res.json();
                    ShellLogic.setServerTime(data.now);
                    allAutomations = Array.isArray(data.automations) ? data.automations : allAutomations;
                } catch (_) { /* ignore */ }
            }
        });

        async function loadAutomations() {
            try {
                var res = await api('/v1/dashboard/summary');
                if (!res.ok) return;
                var data = await res.json();
                ShellLogic.setServerTime(data.now);
                allAutomations = Array.isArray(data.automations) ? data.automations : [];
                editor.fillAutomationPicker();
            } catch (e) { /* ignore */ }
        }

        async function loadDevices() {
            try {
                var res = await api('/v1/devices');
                if (!res.ok) return;
                var data = await res.json();
                allDevices = Array.isArray(data.devices) ? data.devices : [];
            } catch (e) { /* ignore */ }
        }

        var previewCards = {};
        var previewConfigs = {};
        var previewRefreshTimer = null;
        var PREVIEW_DESIGN_WIDTH = 800;
        var PREVIEW_REFRESH_MS = 60000;

        function widgetPreviewCtx(panelId) {
            var cfg = previewConfigs[panelId] || {};
            return {
                automations: cfg.automations || allAutomations,
                variables: cfg.variables || {},
                weatherMap: cfg.weather || {},
                onRun: function (item, btn) { runPreviewAutomation(panelId, item, btn); },
                renderMarkdown: window.renderAgentMarkdown
                    ? window.renderAgentMarkdown.bind(window)
                    : null,
            };
        }

        async function runPreviewAutomation(panelId, item, btn) {
            try {
                var res = await api('/v1/panels/' + encodeURIComponent(panelId) + '/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nodeId: item.id }),
                });
                if (res.ok) {
                    // Silent success — no toast (matches kiosk)
                } else if (res.status === 403) {
                    ShellLogic.showToast('Not allowed on this panel');
                } else {
                    ShellLogic.showToast('Run failed (' + res.status + ')');
                }
            } catch (e) {
                if (e.message !== 'unauthorized') ShellLogic.showToast('Run failed: network error');
            } finally {
                btn.disabled = false;
            }
        }

        function destroyPreviewGrids() {
            Object.keys(previewCards).forEach(function (id) {
                var entry = previewCards[id];
                if (entry && entry.grid) {
                    try { entry.grid.destroy(false); } catch (_) { /* ignore */ }
                }
            });
            previewCards = {};
        }

        function fitPreview(entry) {
            if (!entry || !entry.viewport || !entry.scaleEl || !entry.gridEl) return;
            var vw = entry.viewport.clientWidth;
            if (!vw) return;
            var s = vw / PREVIEW_DESIGN_WIDTH;
            if (!isFinite(s) || s <= 0) return;
            if (s > 1) s = 1;
            entry.scaleEl.style.transform = 'scale(' + s + ')';
        }

        function fitAllPreviews() {
            Object.keys(previewCards).forEach(function (id) { fitPreview(previewCards[id]); });
        }

        function onResizeFitPreviews() {
            fitAllPreviews();
        }
        window.addEventListener('resize', onResizeFitPreviews, { signal: signal });

        async function loadPanels() {
            var list = document.getElementById('panels-list');
            var empty = document.getElementById('panels-empty');
            try {
                var res = await api('/v1/panels');
                if (!res.ok) {
                    ShellLogic.showToast('Could not load panels');
                    return;
                }
                var data = await res.json();
                var panels = Array.isArray(data.panels) ? data.panels : [];
                allPanels = panels;
                destroyPreviewGrids();
                list.innerHTML = '';
                empty.hidden = panels.length > 0;
                panels.forEach(function (panel, index) { renderPanelCard(panel, index); });
                panels.forEach(function (panel) { loadPreviewConfig(panel.id); });
                schedulePreviewRefresh();
            } catch (e) {
                if (e.message !== 'unauthorized') ShellLogic.showToast('Could not load panels');
            }
        }

        function renderPanelCard(panel, index) {
            var list = document.getElementById('panels-list');
            var card = document.createElement('section');
            card.className = 'shell-card panel-preview-card';
            card.setAttribute('role', 'listitem');

            var head = document.createElement('div');
            head.className = 'panel-preview-head';
            var titleWrap = document.createElement('div');
            titleWrap.className = 'shell-list-item-main';
            var title = document.createElement('p');
            title.className = 'shell-list-item-title';
            title.textContent = panel.room
                ? panel.name + ' (' + panel.room + ')'
                : panel.name;
            titleWrap.appendChild(title);
            head.appendChild(titleWrap);
            card.appendChild(head);

            var viewport = document.createElement('div');
            viewport.className = 'panel-preview-viewport';
            viewport.setAttribute('inert', '');
            var scaleEl = document.createElement('div');
            scaleEl.className = 'panel-preview-scale';
            var gridEl = document.createElement('div');
            gridEl.className = 'grid-stack panel-preview-grid';
            gridEl.id = 'panel-preview-grid-' + index;
            gridEl.style.width = PREVIEW_DESIGN_WIDTH + 'px';
            gridEl.setAttribute('data-widget-style', panel.widgetStyle || 'classic');
            if (panel.showBorders === false) gridEl.classList.add('no-borders');
            scaleEl.appendChild(gridEl);
            viewport.appendChild(scaleEl);
            card.appendChild(viewport);

            var loading = document.createElement('p');
            loading.className = 'shell-stat-sub shell-skeleton panel-preview-loading';
            loading.textContent = 'Loading preview';
            card.appendChild(loading);

            var emptyNote = document.createElement('p');
            emptyNote.className = 'shell-empty panel-preview-empty';
            emptyNote.hidden = true;
            emptyNote.textContent = 'No widgets yet. Edit to add some.';
            card.appendChild(emptyNote);

            var actions = document.createElement('div');
            actions.className = 'panel-preview-actions';

            var open = document.createElement('a');
            open.className = 'shell-btn shell-btn-secondary';
            open.href = '/panel/' + encodeURIComponent(panel.id);
            open.textContent = 'Open';
            actions.appendChild(open);

            var edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'shell-btn shell-btn-secondary';
            edit.textContent = 'Edit';
            edit.addEventListener('click', function () { openEditor(panel); });
            actions.appendChild(edit);

            var copy = document.createElement('button');
            copy.type = 'button';
            copy.className = 'shell-btn shell-btn-secondary';
            copy.textContent = 'Copy URL';
            copy.addEventListener('click', function () { copyPanelUrl(panel.id, copy); });
            actions.appendChild(copy);

            var del = document.createElement('button');
            del.type = 'button';
            del.className = 'shell-btn shell-btn-secondary';
            del.textContent = 'Delete';
            del.addEventListener('click', function () { deletePanel(panel); });
            actions.appendChild(del);

            card.appendChild(actions);
            list.appendChild(card);
            previewCards[panel.id] = { card: card, viewport: viewport, scaleEl: scaleEl, gridEl: gridEl, grid: null, panel: panel };
            fitPreview(previewCards[panel.id]);
        }

        async function loadPreviewConfig(panelId) {
            var entry = previewCards[panelId];
            if (!entry) return;
            try {
                var res = await api('/v1/panels/' + encodeURIComponent(panelId) + '/config');
                if (!res.ok) {
                    hidePreviewLoading(entry, true);
                    return;
                }
                var data = await res.json();
                ShellLogic.setServerTime(data.now);
                var widgets = Array.isArray(data.panel.widgets) ? data.panel.widgets : [];
                previewConfigs[panelId] = {
                    variables: (data.variables && typeof data.variables === 'object') ? data.variables : {},
                    weather: (data.weather && typeof data.weather === 'object') ? data.weather : {},
                    automations: Array.isArray(data.automations) ? data.automations : [],
                    layoutKey: JSON.stringify(widgets),
                };
                paintPreview(entry, panelId, widgets);
                if (editingPanelId === panelId) {
                    panelWeather = previewConfigs[panelId].weather;
                    if (window.Widgets && typeof window.Widgets.refreshWeatherCards === 'function') {
                        var editGrid = document.getElementById('panel-edit-grid');
                        if (editGrid) window.Widgets.refreshWeatherCards(editGrid, panelWeather);
                    }
                }
            } catch (e) {
                hidePreviewLoading(entry, true);
            }
        }

        function hidePreviewLoading(entry, failed) {
            if (!entry) return;
            var loading = entry.card.querySelector('.panel-preview-loading');
            if (loading) loading.hidden = true;
            if (failed) {
                var emptyNote = entry.card.querySelector('.panel-preview-empty');
                if (emptyNote && !entry.gridEl.hasChildNodes()) {
                    emptyNote.hidden = false;
                    emptyNote.textContent = 'Preview unavailable.';
                }
            }
        }

        function paintPreview(entry, panelId, widgets) {
            hidePreviewLoading(entry, false);
            var emptyNote = entry.card.querySelector('.panel-preview-empty');
            if (emptyNote) emptyNote.hidden = widgets.length > 0;
            entry.viewport.hidden = widgets.length === 0;
            if (entry.grid) {
                try { entry.grid.destroy(false); } catch (_) { /* ignore */ }
                entry.grid = null;
            }
            entry.gridEl.innerHTML = '';
            var centered = centerWidgets(widgets);
            var ctx = widgetPreviewCtx(panelId);
            centered.forEach(function (widget) {
                var item = window.Widgets ? window.Widgets.createItem(widget, ctx) : null;
                if (item) entry.gridEl.appendChild(item);
            });
            WidgetEditor.tickClock();
            if (window.GridStack && centered.length) {
                entry.grid = window.GridStack.init({
                    column: 12,
                    cellHeight: 'auto',
                    margin: 0,
                    staticGrid: true,
                    animate: false,
                    float: true,
                    columnOpts: { breakpoints: [{ w: 640, c: 4 }] },
                }, entry.gridEl);
            }
            if (window.Widgets && typeof window.Widgets.syncGridSizes === 'function') {
                try { window.Widgets.syncGridSizes(entry.gridEl); } catch (_) { /* ignore */ }
            }
            fitPreview(entry);
        }

        function centerWidgets(widgets) {
            if (!widgets.length) return widgets;
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
            if (offsetX === 0 && offsetY === 0) return widgets;
            return widgets.map(function (w) {
                var copy = {};
                for (var k in w) if (Object.prototype.hasOwnProperty.call(w, k)) copy[k] = w[k];
                copy.x = (w.x || 0) + offsetX;
                copy.y = (w.y || 0) + offsetY;
                return copy;
            });
        }

        function refreshPreviewVars(panelId) {
            var entry = previewCards[panelId];
            var cfg = previewConfigs[panelId];
            if (!entry || !cfg) return;
            Object.keys(cfg.variables).forEach(function (name) {
                var value = cfg.variables[name];
                Array.prototype.forEach.call(entry.card.querySelectorAll('[data-var-content="' + CSS.escape(name) + '"]'), function (node) {
                    node.innerHTML = window.renderAgentMarkdown ? window.renderAgentMarkdown(value) : '';
                });
                Array.prototype.forEach.call(entry.card.querySelectorAll('[data-var-frame="' + CSS.escape(name) + '"]'), function (frame) {
                    frame.srcdoc = value;
                });
            });
            if (window.Widgets && typeof window.Widgets.refreshWeatherCards === 'function') {
                window.Widgets.refreshWeatherCards(entry.card, cfg.weather || {});
            }
        }

        async function refreshPreviewConfig(panelId) {
            try {
                var res = await api('/v1/panels/' + encodeURIComponent(panelId) + '/config');
                if (!res.ok) return;
                var data = await res.json();
                ShellLogic.setServerTime(data.now);
                var widgets = Array.isArray(data.panel.widgets) ? data.panel.widgets : [];
                var key = JSON.stringify(widgets);
                var prev = previewConfigs[panelId];
                previewConfigs[panelId] = {
                    variables: (data.variables && typeof data.variables === 'object') ? data.variables : {},
                    weather: (data.weather && typeof data.weather === 'object') ? data.weather : {},
                    automations: Array.isArray(data.automations) ? data.automations : [],
                    layoutKey: key,
                };
                if (!prev || prev.layoutKey !== key) {
                    var entry = previewCards[panelId];
                    if (entry) paintPreview(entry, panelId, widgets);
                } else {
                    refreshPreviewVars(panelId);
                }
                if (editingPanelId === panelId) {
                    panelWeather = previewConfigs[panelId].weather;
                    if (window.Widgets && typeof window.Widgets.refreshWeatherCards === 'function') {
                        var editGrid = document.getElementById('panel-edit-grid');
                        if (editGrid) window.Widgets.refreshWeatherCards(editGrid, panelWeather);
                    }
                }
            } catch (e) { /* ignore, keep stale preview */ }
        }

        function schedulePreviewRefresh() {
            if (previewRefreshTimer) clearInterval(previewRefreshTimer);
            previewRefreshTimer = setInterval(function () {
                Object.keys(previewCards).forEach(refreshPreviewConfig);
            }, PREVIEW_REFRESH_MS);
        }

        function closeCreateDialog() {
            var d = document.getElementById('panel-create-dialog');
            if (typeof d.close === 'function') { try { d.close(); } catch (_) { d.removeAttribute('open'); } } else d.removeAttribute('open');
        }

        document.getElementById('new-panel-open').addEventListener('click', function () {
            var dialog = document.getElementById('panel-create-dialog');
            if (typeof dialog.showModal === 'function') {
                try { dialog.showModal(); } catch (_) { dialog.setAttribute('open', ''); }
            } else {
                dialog.setAttribute('open', '');
            }
            var nameInput = document.getElementById('new-panel-name');
            if (nameInput) try { nameInput.focus(); } catch (_) {}
        }, { signal: signal });
        document.getElementById('panel-create-cancel').addEventListener('click', closeCreateDialog, { signal: signal });
        document.getElementById('panel-create-close-top').addEventListener('click', closeCreateDialog, { signal: signal });
        document.getElementById('panel-create-dialog').addEventListener('click', function (e) {
            if (e.target === this) closeCreateDialog();
        }, { signal: signal });

        document.getElementById('create-panel-btn').addEventListener('click', async function () {
            var btn = this;
            var name = document.getElementById('new-panel-name').value.trim();
            var room = document.getElementById('new-panel-room').value.trim();
            if (!name) {
                ShellLogic.showToast('Enter a panel name');
                return;
            }
            btn.disabled = true;
            try {
                var res = await api('/v1/panels', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name, room: room, widgets: [] }),
                });
                if (res.status === 201) {
                    var data = await res.json();
                    document.getElementById('new-panel-name').value = '';
                    document.getElementById('new-panel-room').value = '';
                    closeCreateDialog();
                    ShellLogic.showToast('Created ' + data.panel.name);
                    loadPanels();
                } else {
                    var err = await res.json().catch(function () { return {}; });
                    ShellLogic.showToast('Create failed: ' + (err.error || res.status));
                }
            } catch (e) {
                if (e.message !== 'unauthorized') ShellLogic.showToast('Create failed: network error');
            } finally {
                btn.disabled = false;
            }
        }, { signal: signal });

        function openEditor(panel) {
            editingPanelId = panel.id;
            document.getElementById('panel-edit-id').textContent = '/panel/' + panel.id;
            document.getElementById('edit-panel-name').value = panel.name || '';
            document.getElementById('edit-panel-room').value = panel.room || '';
            var bordersBox = document.getElementById('edit-panel-borders');
            bordersBox.checked = panel.showBorders !== false;
            document.getElementById('panel-edit-grid').classList.toggle('no-borders', !bordersBox.checked);
            var stylePicker = document.getElementById('edit-panel-widget-style');
            stylePicker.value = panel.widgetStyle || 'classic';
            document.getElementById('panel-edit-grid').setAttribute('data-widget-style', stylePicker.value);
            editingWidgets = (panel.widgets || []).map(function (w) {
                var out = {
                    id: w.id,
                    type: w.type,
                    x: w.x || 0,
                    y: w.y || 0,
                    w: w.w || 1,
                    h: w.h || 1,
                    automationId: w.automationId,
                    variable: w.variable,
                    showName: w.showName === true,
                    showDate: w.showDate === false ? false : undefined,
                };
                if (w.location != null) out.location = w.location;
                if (w.unit === 'c') out.unit = 'c';
                if (w.gradient === false) out.gradient = false;
                return out;
            });
            var cached = previewConfigs[panel.id];
            panelVariables = cached && cached.variables
                ? Object.assign({}, cached.variables)
                : {};
            panelWeather = cached && cached.weather
                ? Object.assign({}, cached.weather)
                : {};
            devicePicker.setSelected(panel.deviceIds || []);

            var dialog = document.getElementById('panel-edit-dialog');
            if (typeof dialog.showModal === 'function') {
                try { dialog.showModal(); } catch (_) { dialog.setAttribute('open', ''); }
            } else {
                dialog.setAttribute('open', '');
            }
            requestAnimationFrame(function () {
                editor.rebuild();
                if (editor.isEditing()) editor.setEditing(false);
            });
        }

        document.getElementById('edit-panel-close').addEventListener('click', function () {
            var d = document.getElementById('panel-edit-dialog');
            if (typeof d.close === 'function') { try { d.close(); } catch (_) { d.removeAttribute('open'); } } else d.removeAttribute('open');
        }, { signal: signal });
        document.getElementById('edit-panel-close-top').addEventListener('click', function () {
            var d = document.getElementById('panel-edit-dialog');
            if (typeof d.close === 'function') { try { d.close(); } catch (_) { d.removeAttribute('open'); } } else d.removeAttribute('open');
        }, { signal: signal });
        document.getElementById('panel-edit-dialog').addEventListener('cancel', function (e) {
            if (!devicePicker.isOpen()) return;
            e.preventDefault();
            devicePicker.close();
        }, { signal: signal });
        document.getElementById('panel-edit-dialog').addEventListener('click', function (e) {
            if (e.target === this) {
                if (typeof this.close === 'function') { try { this.close(); } catch (_) { this.removeAttribute('open'); } } else this.removeAttribute('open');
            }
        }, { signal: signal });

        document.getElementById('edit-panel-save').addEventListener('click', async function () {
            if (!editingPanelId) return;
            var btn = this;
            btn.disabled = true;
            var deviceIds = devicePicker.getDeviceIds();
            if (editor.isEditing()) editor.setEditing(false);
            try {
                var res = await api('/v1/panels/' + encodeURIComponent(editingPanelId), {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: document.getElementById('edit-panel-name').value,
                        room: document.getElementById('edit-panel-room').value,
                        showBorders: document.getElementById('edit-panel-borders').checked,
                        widgetStyle: document.getElementById('edit-panel-widget-style').value || 'classic',
                        deviceIds: deviceIds,
                    }),
                });
                if (res.ok) {
                    document.getElementById('panel-edit-dialog').close();
                    ShellLogic.showToast('Panel saved');
                    loadPanels();
                } else {
                    var err = await res.json().catch(function () { return {}; });
                    ShellLogic.showToast('Save failed: ' + (err.error || res.status));
                }
            } catch (e) {
                if (e.message !== 'unauthorized') ShellLogic.showToast('Save failed: network error');
            } finally {
                btn.disabled = false;
            }
        }, { signal: signal });

        async function deletePanel(panel) {
            if (!window.confirm('Delete panel "' + panel.name + '"? Wall surfaces using it stop working.')) return;
            try {
                var res = await api('/v1/panels/' + encodeURIComponent(panel.id), { method: 'DELETE' });
                if (res.status === 204) {
                    ShellLogic.showToast('Deleted ' + panel.name);
                    loadPanels();
                } else {
                    ShellLogic.showToast('Delete failed (' + res.status + ')');
                }
            } catch (e) {
                if (e.message !== 'unauthorized') ShellLogic.showToast('Delete failed: network error');
            }
        }

        (async function init() {
            await loadAutomations();
            await loadDevices();
            await loadPanels();
            syncServerTime();
            if (typeof ShellLogic.startNtpResync === 'function') {
                // No fetcher argument: the SPA bridge takes (intervalMs) only,
                // and a function here once became setInterval's NaN -> 4ms flood.
                ShellLogic.startNtpResync();
            }
        })();

        __netsocketPanelsStop = function stopNetsocketPanelsInternal() {
            if (clockTickIntervalId != null) {
                clearInterval(clockTickIntervalId);
                clockTickIntervalId = null;
            }
            if (previewRefreshTimer) {
                clearInterval(previewRefreshTimer);
                previewRefreshTimer = null;
            }
            destroyPreviewGrids();
            previewConfigs = {};
            if (typeof ShellLogic.stopNtpResync === 'function') {
                ShellLogic.stopNtpResync();
            }
            abortController.abort();
            __netsocketPanelsStop = null;
        };
    };

    window.stopNetsocketPanels = function stopNetsocketPanels() {
        if (typeof __netsocketPanelsStop === 'function') {
            __netsocketPanelsStop();
        }
    };
}());
