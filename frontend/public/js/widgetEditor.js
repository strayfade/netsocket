(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.WidgetEditor = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var WIDGET_PRESETS = {
        button: [{ w: 1, h: 1 }, { w: 1, h: 2 }, { w: 2, h: 1 }, { w: 2, h: 2 }, { w: 3, h: 2 }, { w: 3, h: 3 }],
        clock: [{ w: 4, h: 2 }, { w: 2, h: 1 }],
        markdown: [{ w: 2, h: 2 }, { w: 4, h: 2 }, { w: 4, h: 3 }, { w: 6, h: 4 }],
        html: [{ w: 2, h: 2 }, { w: 4, h: 2 }, { w: 4, h: 3 }, { w: 6, h: 4 }],
    };

    function sortedPresets(type) {
        var presets = WIDGET_PRESETS[type] || WIDGET_PRESETS.markdown;
        var copy = presets.slice();
        copy.sort(function (a, b) {
            var sa = a.w * a.h;
            var sb = b.w * b.h;
            if (sa !== sb) return sa - sb;
            if (a.w !== b.w) return a.w - b.w;
            return a.h - b.h;
        });
        return copy;
    }

    function tickClock() {
        var now = new Date();
        var h = now.getHours();
        h = h % 12;
        if (h === 0) h = 12;
        var mm = String(now.getMinutes()).padStart(2, '0');
        var time = h + ':' + mm;
        var date = now.toLocaleDateString(undefined, {
            year: 'numeric', month: 'long', day: 'numeric'
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-clock-time]'), function (el) {
            el.textContent = time;
            el.classList.remove('shell-skeleton');
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-clock-date]'), function (el) {
            el.textContent = date;
        });
    }

    function attach(opts) {
        opts = opts || {};
        var gridId = opts.gridId;
        var editToggleId = opts.editToggleId;
        var addOpenId = opts.addOpenId;
        var dialogId = opts.dialogId;
        var kindId = opts.kindId;
        var trackId = opts.trackId;
        var sizeLabelId = opts.sizeLabelId;
        var prevId = opts.prevId;
        var nextId = opts.nextId;
        var variableId = opts.variableId;
        var variableFieldId = opts.variableFieldId;
        var automationId = opts.automationId;
        var automationFieldId = opts.automationFieldId;
        var showNameId = opts.showNameId;
        var showNameFieldId = opts.showNameFieldId;
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
        var dialogPresetIndex = 0;
        var lastDialogFocus = null;

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
                var obj = {
                    id: prior.id,
                    type: prior.type,
                    x: node.x || 0,
                    y: node.y || 0,
                    w: node.w || prior.w,
                    h: node.h || prior.h,
                    automationId: prior.automationId,
                    variable: prior.variable,
                };
                if (prior.showName === true) obj.showName = true;
                next.push(obj);
            });
            current.forEach(function (w) {
                if (!next.some(function (n) { return n.id === w.id; })) next.push(w);
            });
            setWidgets(next);
            onSave(next);
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
            // Rebuild immediately for responsiveness; onSave may reload
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
            // Empty state handling: show placeholder if container has empty attr
            var emptyEl = document.getElementById(gridId + '-empty');
            if (emptyEl) emptyEl.hidden = widgets.length > 0;
            if (!widgets.length && !editing) {
                // Leave container empty; emptyEl shows
            }
            widgets.forEach(function (widget) {
                var item = window.Widgets ? window.Widgets.createItem(widget, widgetCtx()) : null;
                if (item) container.appendChild(item);
            });
            try { tickClock(); } catch (_) {}
            if (window.GridStack) {
                grid = window.GridStack.init({
                    column: 12,
                    cellHeight: 80,
                    margin: 0,
                    staticGrid: !editing,
                    animate: false,
                    float: false,
                    draggable: { handle: '.widget-drag-handle' },
                    disableResize: true,
                    columnOpts: { breakpoints: [{ w: 640, c: 4 }] },
                }, container);
                if (editing) container.classList.add('editing');
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
            if (varField) varField.hidden = !(type === 'markdown' || type === 'html');
            if (autoField) autoField.hidden = type !== 'button';
            if (showNameField) showNameField.hidden = type !== 'button';
        }

        function renderPresetCarousel() {
            var kindEl = kindId ? document.getElementById(kindId) : null;
            var track = trackId ? document.getElementById(trackId) : null;
            var sizeLabel = sizeLabelId ? document.getElementById(sizeLabelId) : null;
            var prevBtn = prevId ? document.getElementById(prevId) : null;
            var nextBtn = nextId ? document.getElementById(nextId) : null;
            if (!kindEl || !track || !sizeLabel) return;
            var type = kindEl.value;
            var presets = sortedPresets(type);
            track.innerHTML = '';
            if (!presets.length) {
                sizeLabel.textContent = '';
                if (prevBtn) prevBtn.hidden = true;
                if (nextBtn) nextBtn.hidden = true;
                return;
            }
            if (dialogPresetIndex >= presets.length) dialogPresetIndex = 0;
            if (dialogPresetIndex < 0) dialogPresetIndex = presets.length - 1;
            var preset = presets[dialogPresetIndex];
            if (prevBtn) prevBtn.hidden = presets.length <= 1;
            if (nextBtn) nextBtn.hidden = presets.length <= 1;
            sizeLabel.textContent = preset.w + 'x' + preset.h;

            var slide = document.createElement('div');
            slide.className = 'carousel-slide is-selected single';
            slide.setAttribute('role', 'option');
            slide.setAttribute('aria-selected', 'true');
            slide.setAttribute('aria-label', preset.w + 'x' + preset.h);

            var previewWrap = document.createElement('div');
            previewWrap.className = 'carousel-preview';
            var unit = 42;
            var pw = preset.w * unit;
            var ph = preset.h * unit;
            if (pw > 320) {
                var scale = 320 / pw;
                pw = 320;
                ph = Math.round(ph * scale);
            }
            previewWrap.style.width = pw + 'px';
            previewWrap.style.height = ph + 'px';
            previewWrap.style.maxWidth = '100%';

            var ctx = getLiveContext();
            var previewWidget = { id: 'preview', type: type, x: 0, y: 0, w: preset.w, h: preset.h };
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
                        previewCtx.variables[varName] = '# Preview\nThis is **' + varName + '** markdown content for ' + preset.w + 'x' + preset.h + ' widget.';
                    } else {
                        previewCtx.variables[varName] = '<div style="padding:12px;font-family:system-ui">HTML preview for <b>' + varName + '</b> (' + preset.w + 'x' + preset.h + ')</div>';
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
                fallback.textContent = type + ' ' + preset.w + 'x' + preset.h;
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

        function selectPreset(index) {
            var kindEl = kindId ? document.getElementById(kindId) : null;
            if (!kindEl) return;
            var presets = sortedPresets(kindEl.value);
            if (!presets.length) return;
            dialogPresetIndex = ((index % presets.length) + presets.length) % presets.length;
            renderPresetCarousel();
        }

        async function openAddDialog() {
            var dialog = dialogId ? document.getElementById(dialogId) : null;
            if (!dialog) return;
            // Refresh automations from server so newly created Button nodes appear immediately.
            if (typeof opts.fetchAutomations === 'function') {
                try { await opts.fetchAutomations(); } catch (_) { /* ignore, show cached */ }
            }
            lastDialogFocus = document.activeElement;
            dialogPresetIndex = 0;
            var kindEl = kindId ? document.getElementById(kindId) : null;
            if (kindEl && !kindEl.value) kindEl.value = 'button';
            fillAutomationPicker();
            var showNameInit = showNameId ? document.getElementById(showNameId) : null;
            if (showNameInit) showNameInit.checked = false;
            renderPresetCarousel();
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
            var presets = sortedPresets(type);
            var preset = presets[dialogPresetIndex] || presets[0];
            if (!preset) {
                if (window.ShellLogic) ShellLogic.showToast('Select a size');
                return;
            }
            var widget = { type: type, x: 0, y: 0, w: preset.w, h: preset.h };
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
            var current = getWidgets();
            // Generate next id
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
            var prevBtn = prevId ? document.getElementById(prevId) : null;
            var nextBtn = nextId ? document.getElementById(nextId) : null;
            var editToggle = editToggleId ? document.getElementById(editToggleId) : null;
            if (kindEl) {
                kindEl.addEventListener('change', function () {
                    dialogPresetIndex = 0;
                    renderPresetCarousel();
                    renderDialogFields();
                });
            }
            var varInputBind = variableId ? document.getElementById(variableId) : null;
            if (varInputBind) {
                varInputBind.addEventListener('input', function () { renderPresetCarousel(); });
                varInputBind.addEventListener('change', function () { renderPresetCarousel(); });
            }
            var autoInputBind = automationId ? document.getElementById(automationId) : null;
            if (autoInputBind) {
                autoInputBind.addEventListener('change', function () { renderPresetCarousel(); });
            }
            var showNameBind = showNameId ? document.getElementById(showNameId) : null;
            if (showNameBind) {
                showNameBind.addEventListener('change', function () { renderPresetCarousel(); });
            }
            if (openBtn) openBtn.addEventListener('click', openAddDialog);
            if (cancelBtn) cancelBtn.addEventListener('click', closeAddDialog);
            if (cancelTop) cancelTop.addEventListener('click', closeAddDialog);
            if (addBtn) addBtn.addEventListener('click', handleDialogAdd);
            if (prevBtn) prevBtn.addEventListener('click', function () { selectPreset(dialogPresetIndex - 1); });
            if (nextBtn) nextBtn.addEventListener('click', function () { selectPreset(dialogPresetIndex + 1); });
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
            sortedPresets: sortedPresets,
            tickClock: tickClock,
            setEditing: setEditing,
            isEditing: isEditing,
            rebuild: rebuild,
            openAddDialog: openAddDialog,
            closeAddDialog: closeAddDialog,
            renderPresetCarousel: renderPresetCarousel,
            fillAutomationPicker: fillAutomationPicker,
            renderDialogFields: renderDialogFields,
            saveGridPositions: saveGridPositions,
            removeWidget: removeWidget,
            getGrid: function () { return grid; },
        };
    }

    return {
        WIDGET_PRESETS: WIDGET_PRESETS,
        sortedPresets: sortedPresets,
        tickClock: tickClock,
        attach: attach,
        create: attach,
    };
}));

