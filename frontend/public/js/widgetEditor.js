(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.WidgetEditor = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var DEFAULT_SIZES = {
        button: { w: 1, h: 1 },
        clock: { w: 4, h: 2 },
        markdown: { w: 4, h: 2 },
        html: { w: 4, h: 2 },
        timer: { w: 4, h: 4 },
    };

    // Back-compat alias: one "preset" per type (the default size).
    var WIDGET_PRESETS = {
        button: [DEFAULT_SIZES.button],
        clock: [DEFAULT_SIZES.clock],
        markdown: [DEFAULT_SIZES.markdown],
        html: [DEFAULT_SIZES.html],
        timer: [DEFAULT_SIZES.timer],
    };

    function defaultSizeFor(type) {
        return DEFAULT_SIZES[type] || DEFAULT_SIZES.markdown;
    }

    function sortedPresets(type) {
        return (WIDGET_PRESETS[type] || WIDGET_PRESETS.markdown).slice();
    }

    // Clock widgets paint NTP-anchored Eastern time (EST/EDT).
    function clockNowMs() {
        try {
            if (typeof window !== 'undefined' && window.ShellLogic) {
                if (typeof window.ShellLogic.ntpNow === 'function') return window.ShellLogic.ntpNow();
                if (typeof window.ShellLogic.serverNow === 'function') return window.ShellLogic.serverNow();
            }
        } catch (_) { /* fall through */ }
        return Date.now();
    }

    function tickClock() {
        var parts;
        try {
            if (typeof window !== 'undefined' && window.ShellLogic &&
                typeof window.ShellLogic.formatEasternClock === 'function') {
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

    function copyWidgetFields(prior, node) {
        var obj = {
            id: prior.id,
            type: prior.type,
            x: node && node.x != null ? node.x : (prior.x || 0),
            y: node && node.y != null ? node.y : (prior.y || 0),
            w: node && node.w != null ? node.w : prior.w,
            h: node && node.h != null ? node.h : prior.h,
        };
        if (prior.automationId != null) obj.automationId = prior.automationId;
        if (prior.variable != null) obj.variable = prior.variable;
        if (prior.showName === true) obj.showName = true;
        if (prior.showDate === false) obj.showDate = false;
        return obj;
    }

    function attach(opts) {
        opts = opts || {};
        var gridId = opts.gridId;
        var editToggleId = opts.editToggleId;
        var addOpenId = opts.addOpenId;
        var dialogId = opts.dialogId;
        var kindId = opts.kindId;
        var previewId = opts.previewId || opts.trackId;
        var variableId = opts.variableId;
        var variableFieldId = opts.variableFieldId;
        var automationId = opts.automationId;
        var automationFieldId = opts.automationFieldId;
        var showNameId = opts.showNameId;
        var showNameFieldId = opts.showNameFieldId;
        var showDateId = opts.showDateId;
        var showDateFieldId = opts.showDateFieldId;
        var cancelId = opts.cancelId;
        var cancelTopId = opts.cancelTopId;
        var addBtnId = opts.addBtnId;
        var getWidgets = opts.getWidgets || function () { return []; };
        var setWidgets = opts.setWidgets || function () {};
        var getLiveContext = opts.getLiveContext || function () { return { variables: {}, automations: [] }; };
        var onSave = opts.onSave || function () {};
        var onRemoveOverride = opts.onRemove;

        var grid = null;
        var editing = false;
        var lastDialogFocus = null;
        var saveTimer = null;

        function isEditing() { return editing; }

        function setEditing(on) {
            editing = !!on;
            var container = document.getElementById(gridId);
            var toggle = editToggleId ? document.getElementById(editToggleId) : null;
            if (toggle) toggle.textContent = editing ? 'Done' : 'Edit layout';
            if (container) container.classList.toggle('editing', editing);
            if (grid && typeof grid.setStatic === 'function') {
                try { grid.setStatic(!editing); } catch (_) { /* ignore */ }
            }
            if (!editing && grid) saveGridPositions();
        }

        function saveGridPositions() {
            if (!grid || typeof grid.save !== 'function') return;
            var saved = [];
            try { saved = grid.save(false) || []; } catch (_) { return; }
            var current = getWidgets();
            var byId = {};
            current.forEach(function (w) { byId[w.id] = w; });
            var next = [];
            saved.forEach(function (node) {
                var prior = byId[node.id];
                if (!prior) return;
                next.push(copyWidgetFields(prior, node));
            });
            current.forEach(function (w) {
                if (!next.some(function (n) { return n.id === w.id; })) next.push(w);
            });
            setWidgets(next);
            onSave(next);
        }

        function scheduleSavePositions() {
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(function () {
                saveTimer = null;
                if (editing) saveGridPositions();
            }, 250);
        }

        function removeWidget(widget) {
            if (!widget || !widget.id) return;
            var id = String(widget.id);
            var current = getWidgets();
            var next = current.filter(function (w) { return String(w.id) !== id; });
            if (next.length === current.length) return;
            setWidgets(next);
            if (typeof onRemoveOverride === 'function') {
                onRemoveOverride(next, widget);
            } else {
                onSave(next);
            }
            rebuild();
        }

        function widgetCtx() {
            var ctx = getLiveContext();
            return {
                automations: ctx.automations || [],
                variables: ctx.variables || {},
                onRun: ctx.onRun || opts.onRun || function () {},
                onRemove: removeWidget,
                renderMarkdown: window.renderAgentMarkdown ? window.renderAgentMarkdown.bind(window) : null,
            };
        }

        function rebuild() {
            var container = document.getElementById(gridId);
            if (!container) return;
            var widgets = getWidgets();
            if (grid) {
                try { grid.destroy(false); } catch (_) { /* ignore */ }
                grid = null;
            }
            container.innerHTML = '';
            var emptyEl = document.getElementById(gridId + '-empty');
            if (emptyEl) emptyEl.hidden = widgets.length > 0;
            // Center collective bounds horizontally (like panel kiosk) while preserving relative layout.
            var displayWidgets = widgets;
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
                    displayWidgets = widgets.map(function (w) {
                        var copy = {};
                        for (var k in w) if (Object.prototype.hasOwnProperty.call(w, k)) copy[k] = w[k];
                        copy.x = (w.x || 0) + offsetX;
                        copy.y = (w.y || 0) + offsetY;
                        return copy;
                    });
                }
            }
            displayWidgets.forEach(function (widget) {
                var item = window.Widgets ? window.Widgets.createItem(widget, widgetCtx()) : null;
                if (item) container.appendChild(item);
            });
            try { tickClock(); } catch (_) {}
            if (window.GridStack) {
                grid = window.GridStack.init({
                    column: 12,
                    cellHeight: 'auto',
                    margin: 0,
                    staticGrid: !editing,
                    animate: false,
                    float: true,
                    draggable: { handle: '.widget-drag-handle' },
                    disableResize: false,
                    resizable: { handles: 'e,se,s,sw,w' },
                    columnOpts: { breakpoints: [{ w: 640, c: 4 }] },
                }, container);
                if (editing) container.classList.add('editing');
                try {
                    grid.on('change', function (_event, items) {
                        if (window.Widgets && typeof window.Widgets.syncItemSize === 'function' && Array.isArray(items)) {
                            items.forEach(function (node) {
                                if (node && node.el) window.Widgets.syncItemSize(node.el);
                            });
                        } else if (window.Widgets && typeof window.Widgets.syncGridSizes === 'function') {
                            window.Widgets.syncGridSizes(container);
                        }
                        scheduleSavePositions();
                    });
                    grid.on('resizestop', function (_event, el) {
                        if (window.Widgets && typeof window.Widgets.syncItemSize === 'function' && el) {
                            window.Widgets.syncItemSize(el);
                        }
                        scheduleSavePositions();
                    });
                    grid.on('dragstop', function () { scheduleSavePositions(); });
                } catch (_) { /* older GridStack */ }
                if (window.Widgets && typeof window.Widgets.syncGridSizes === 'function') {
                    try { window.Widgets.syncGridSizes(container); } catch (_) { /* ignore */ }
                }
            }
        }

        function fillAutomationPicker() {
            var picker = automationId ? document.getElementById(automationId) : null;
            if (!picker) return;
            var ctx = getLiveContext();
            var liveAutomations = ctx.automations || [];
            var current = picker.value;
            picker.innerHTML = '';
            var empty = document.createElement('option');
            empty.value = '';
            if (!liveAutomations.length) {
                empty.textContent = 'No Button triggers yet — create a Triggers/Button in Automate';
            } else {
                var runnable = liveAutomations.filter(function (a) { return a.runnable; });
                empty.textContent = runnable.length ? 'Select automation' : 'No runnable automations';
            }
            picker.appendChild(empty);
            liveAutomations.forEach(function (item) {
                var option = document.createElement('option');
                option.value = String(item.id);
                option.textContent = (item.title || item.type) + (item.runnable ? '' : ' (not runnable)');
                picker.appendChild(option);
            });
            picker.value = current;
        }

        function renderDialogFields() {
            var kindEl = kindId ? document.getElementById(kindId) : null;
            if (!kindEl) return;
            var type = kindEl.value;
            var varField = variableFieldId ? document.getElementById(variableFieldId) : null;
            var autoField = automationFieldId ? document.getElementById(automationFieldId) : null;
            var showNameField = showNameFieldId ? document.getElementById(showNameFieldId) : null;
            var showDateField = showDateFieldId ? document.getElementById(showDateFieldId) : null;
            if (varField) varField.hidden = !(type === 'markdown' || type === 'html');
            if (autoField) autoField.hidden = type !== 'button';
            if (showNameField) showNameField.hidden = type !== 'button';
            if (showDateField) showDateField.hidden = type !== 'clock';
        }

        function renderTypePreview() {
            var kindEl = kindId ? document.getElementById(kindId) : null;
            var track = previewId ? document.getElementById(previewId) : null;
            if (!kindEl || !track) return;
            var type = kindEl.value;
            var size = defaultSizeFor(type);
            track.innerHTML = '';

            var slide = document.createElement('div');
            slide.className = 'carousel-slide is-selected single';
            slide.setAttribute('role', 'option');
            slide.setAttribute('aria-selected', 'true');
            slide.setAttribute('aria-label', type + ' preview');

            var previewWrap = document.createElement('div');
            previewWrap.className = 'carousel-preview';
            var unit = 42;
            var pw = Math.min(size.w * unit, 320);
            var ph = Math.round((size.h * unit) * (pw / (size.w * unit)));
            previewWrap.style.width = pw + 'px';
            previewWrap.style.height = Math.max(ph, 96) + 'px';
            previewWrap.style.maxWidth = '100%';

            var ctx = getLiveContext();
            var previewWidget = { id: 'preview', type: type, x: 0, y: 0, w: size.w, h: size.h };
            var previewCtx = {
                variables: ctx.variables || {},
                automations: ctx.automations || [],
                onRun: function () {},
                renderMarkdown: window.renderAgentMarkdown ? window.renderAgentMarkdown.bind(window) : null
            };
            if (type === 'button') {
                var liveAutomations = ctx.automations || [];
                var firstAuto = liveAutomations.length ? liveAutomations[0] : null;
                previewWidget.automationId = firstAuto ? String(firstAuto.id) : 'preview';
                if (!firstAuto) {
                    previewCtx.automations = [{ id: 'preview', title: 'Example Action', type: 'Triggers/Button', runnable: true }];
                }
                var showNameEl = showNameId ? document.getElementById(showNameId) : null;
                previewWidget.showName = !!(showNameEl && showNameEl.checked);
            } else if (type === 'clock') {
                var showDateEl = showDateId ? document.getElementById(showDateId) : null;
                if (showDateEl && !showDateEl.checked) previewWidget.showDate = false;
            } else if (type === 'markdown' || type === 'html') {
                var varInput = variableId ? document.getElementById(variableId) : null;
                var varName = varInput && varInput.value.trim() ? varInput.value.trim() : null;
                if (!varName) {
                    var keys = Object.keys(previewCtx.variables || {});
                    varName = keys.length ? keys[0] : 'preview_var';
                }
                previewWidget.variable = varName;
                if (!previewCtx.variables[varName] && !(ctx.variables || {})[varName]) {
                    previewCtx.variables = Object.assign({}, previewCtx.variables);
                    if (type === 'markdown') {
                        previewCtx.variables[varName] = '# Preview\nThis is **' + varName + '** markdown.';
                    } else {
                        previewCtx.variables[varName] = '<div style="padding:12px;font-family:system-ui">HTML preview for <b>' + varName + '</b></div>';
                    }
                }
            }

            var content = null;
            try {
                if (window.Widgets && window.Widgets.renderContent) {
                    content = window.Widgets.renderContent(previewWidget, previewCtx, document);
                }
            } catch (_) { content = null; }
            if (!content) {
                var fallback = document.createElement('div');
                fallback.className = 'shell-card';
                fallback.textContent = type;
                content = fallback;
            }
            if (content) {
                content.style.width = '100%';
                content.style.height = '100%';
                content.style.margin = '0';
                content.style.boxSizing = 'border-box';
                content.style.display = 'flex';
                content.style.flexDirection = 'column';
            }
            previewWrap.appendChild(content);
            slide.appendChild(previewWrap);
            track.appendChild(slide);
            try { tickClock(); } catch (_) {}
        }

        // Back-compat name used by HTML contract tests / older callers.
        function renderPresetCarousel() { renderTypePreview(); }

        async function openAddDialog() {
            var dialog = dialogId ? document.getElementById(dialogId) : null;
            if (!dialog) return;
            if (typeof opts.fetchAutomations === 'function') {
                try { await opts.fetchAutomations(); } catch (_) { /* ignore, show cached */ }
            }
            lastDialogFocus = document.activeElement;
            var kindEl = kindId ? document.getElementById(kindId) : null;
            if (kindEl && !kindEl.value) kindEl.value = 'button';
            fillAutomationPicker();
            var showNameInit = showNameId ? document.getElementById(showNameId) : null;
            if (showNameInit) showNameInit.checked = false;
            var showDateInit = showDateId ? document.getElementById(showDateId) : null;
            if (showDateInit) showDateInit.checked = true;
            renderTypePreview();
            renderDialogFields();
            if (typeof dialog.showModal === 'function') {
                try { dialog.showModal(); } catch (_) { dialog.setAttribute('open', ''); }
            } else {
                dialog.setAttribute('open', '');
            }
            if (kindEl) try { kindEl.focus(); } catch (_) {}
        }

        function closeAddDialog() {
            var dialog = dialogId ? document.getElementById(dialogId) : null;
            if (!dialog) return;
            if (typeof dialog.close === 'function') {
                try { dialog.close(); } catch (_) { dialog.removeAttribute('open'); }
            } else {
                dialog.removeAttribute('open');
            }
        }

        function handleDialogAdd() {
            var kindEl = kindId ? document.getElementById(kindId) : null;
            if (!kindEl) return;
            var type = kindEl.value;
            var size = defaultSizeFor(type);
            var widget = { type: type, x: 0, y: 0, w: size.w, h: size.h };
            if (type === 'markdown' || type === 'html') {
                var varInput = variableId ? document.getElementById(variableId) : null;
                var varName = varInput ? varInput.value.trim() : '';
                if (!varName) {
                    if (window.ShellLogic) ShellLogic.showToast('Enter a variable name');
                    if (varInput) try { varInput.focus(); } catch (_) {}
                    return;
                }
                widget.variable = varName;
            }
            if (type === 'button') {
                var autoPicker = automationId ? document.getElementById(automationId) : null;
                var autoId = autoPicker ? autoPicker.value : '';
                if (!autoId) {
                    if (window.ShellLogic) ShellLogic.showToast('Select an automation');
                    if (autoPicker) try { autoPicker.focus(); } catch (_) {}
                    return;
                }
                widget.automationId = autoId;
                var showNameEl = showNameId ? document.getElementById(showNameId) : null;
                if (showNameEl && showNameEl.checked) widget.showName = true;
            }
            if (type === 'clock') {
                var showDateEl = showDateId ? document.getElementById(showDateId) : null;
                if (showDateEl && !showDateEl.checked) widget.showDate = false;
            }
            var current = getWidgets();
            var maxId = 0;
            current.forEach(function (w) {
                var m = /^w(\d+)$/.exec(String(w.id || ''));
                if (m) maxId = Math.max(maxId, parseInt(m[1], 10));
            });
            widget.id = 'w' + (maxId + 1);
            var next = current.slice();
            next.push(widget);
            setWidgets(next);
            var varInput2 = variableId ? document.getElementById(variableId) : null;
            if (varInput2) varInput2.value = '';
            var showNameEl2 = showNameId ? document.getElementById(showNameId) : null;
            if (showNameEl2) showNameEl2.checked = false;
            var showDateEl2 = showDateId ? document.getElementById(showDateId) : null;
            if (showDateEl2) showDateEl2.checked = true;
            closeAddDialog();
            rebuild();
            onSave(next);
        }

        function bindEvents() {
            var kindEl = kindId ? document.getElementById(kindId) : null;
            var openBtn = addOpenId ? document.getElementById(addOpenId) : null;
            var dialog = dialogId ? document.getElementById(dialogId) : null;
            var cancelBtn = cancelId ? document.getElementById(cancelId) : null;
            var cancelTop = cancelTopId ? document.getElementById(cancelTopId) : null;
            var addBtn = addBtnId ? document.getElementById(addBtnId) : null;
            var editToggle = editToggleId ? document.getElementById(editToggleId) : null;
            if (kindEl) {
                kindEl.addEventListener('change', function () {
                    renderTypePreview();
                    renderDialogFields();
                });
            }
            var varInputBind = variableId ? document.getElementById(variableId) : null;
            if (varInputBind) {
                varInputBind.addEventListener('input', function () { renderTypePreview(); });
                varInputBind.addEventListener('change', function () { renderTypePreview(); });
            }
            var autoInputBind = automationId ? document.getElementById(automationId) : null;
            if (autoInputBind) {
                autoInputBind.addEventListener('change', function () { renderTypePreview(); });
            }
            var showNameBind = showNameId ? document.getElementById(showNameId) : null;
            if (showNameBind) {
                showNameBind.addEventListener('change', function () { renderTypePreview(); });
            }
            var showDateBind = showDateId ? document.getElementById(showDateId) : null;
            if (showDateBind) {
                showDateBind.addEventListener('change', function () { renderTypePreview(); });
            }
            if (openBtn) openBtn.addEventListener('click', openAddDialog);
            if (cancelBtn) cancelBtn.addEventListener('click', closeAddDialog);
            if (cancelTop) cancelTop.addEventListener('click', closeAddDialog);
            if (addBtn) addBtn.addEventListener('click', handleDialogAdd);
            if (editToggle) editToggle.addEventListener('click', function () { setEditing(!editing); });
            if (dialog) {
                dialog.addEventListener('click', function (e) {
                    if (e.target === dialog) closeAddDialog();
                });
                dialog.addEventListener('close', function () {
                    if (lastDialogFocus && typeof lastDialogFocus.focus === 'function') {
                        try { lastDialogFocus.focus(); } catch (_) {}
                    }
                    lastDialogFocus = null;
                });
            }
        }

        bindEvents();

        return {
            WIDGET_PRESETS: WIDGET_PRESETS,
            DEFAULT_SIZES: DEFAULT_SIZES,
            defaultSizeFor: defaultSizeFor,
            sortedPresets: sortedPresets,
            tickClock: tickClock,
            setEditing: setEditing,
            isEditing: isEditing,
            rebuild: rebuild,
            openAddDialog: openAddDialog,
            closeAddDialog: closeAddDialog,
            renderPresetCarousel: renderPresetCarousel,
            renderTypePreview: renderTypePreview,
            fillAutomationPicker: fillAutomationPicker,
            renderDialogFields: renderDialogFields,
            saveGridPositions: saveGridPositions,
            removeWidget: removeWidget,
            getGrid: function () { return grid; },
        };
    }

    return {
        WIDGET_PRESETS: WIDGET_PRESETS,
        DEFAULT_SIZES: DEFAULT_SIZES,
        defaultSizeFor: defaultSizeFor,
        sortedPresets: sortedPresets,
        tickClock: tickClock,
        attach: attach,
        create: attach,
    };
}));
