(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.Widgets = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // Shared grid-widget rendering for the dashboard, kiosks, and layout
    // editors. Every widget is a GridStack item; content builders below only
    // fill the `.grid-stack-item-content` element. Live variable refresh
    // keeps working through [data-var-content] / [data-var-frame] hooks.
    //
    // widget: { id, type, x, y, w, h, automationId?, variable?, showName?, showDate? }
    // ctx: { automations: [{id,title,type,runnable}], variables: {name:value},
    //        onRun(item, button), renderMarkdown(text)->html }

    function getDoc(explicit) {
        if (explicit) return explicit;
        if (typeof document !== 'undefined') return document;
        return null;
    }

    function el(doc, tag, className, text) {
        var node = doc.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function automationFor(widget, automations) {
        var list = Array.isArray(automations) ? automations : [];
        var want = widget ? String(widget.automationId) : '';
        for (var i = 0; i < list.length; i++) {
            if (list[i] && String(list[i].id) === want) return list[i];
        }
        return null;
    }

    function renderButton(widget, ctx, doc) {
        var item = automationFor(widget, ctx.automations) || {};
        var btn = el(doc, 'button', 'widget-run-btn');
        btn.type = 'button';
        btn.setAttribute('data-widget-kind', 'button');
        var label = item.title || item.type || ('Automation ' + widget.automationId);
        btn.setAttribute('aria-label', 'Run ' + label);
        btn.title = label;
        var icon = el(doc, 'span', 'material-symbols-outlined', 'play_arrow');
        icon.setAttribute('aria-hidden', 'true');
        btn.appendChild(icon);
        if (widget && widget.showName) {
            btn.classList.add('widget-run-btn--with-label');
            var name = el(doc, 'span', 'widget-run-btn-label', label);
            btn.appendChild(name);
        }
        if (item.runnable && typeof ctx.onRun === 'function') {
            btn.addEventListener('click', function () {
                btn.disabled = true;
                ctx.onRun(item, btn);
            });
        } else {
            btn.disabled = true;
            btn.title = label + ' (unavailable)';
        }
        return btn;
    }

    function renderClock(widget, doc) {
        var compact = widget.w <= 2 && widget.h <= 1;
        var showDate = widget.showDate !== false;
        var card = el(doc, 'section', 'shell-card widget-clock' + (compact ? ' widget-clock-compact' : ''));
        card.setAttribute('aria-label', 'Clock');
        card.setAttribute('data-widget-kind', 'clock');
        var stack = el(doc, 'div', 'widget-clock-stack');
        if (showDate) {
            var date = el(doc, 'p', 'widget-clock-date', 'Loading date');
            date.setAttribute('data-clock-date', '');
            stack.appendChild(date);
        }
        var time = el(doc, 'p', 'shell-clock-value shell-skeleton', '--:--');
        time.setAttribute('data-clock-time', '');
        stack.appendChild(time);
        card.appendChild(stack);
        return card;
    }

    function renderMarkdown(widget, ctx, doc) {
        var card = el(doc, 'section', 'shell-card');
        card.setAttribute('aria-label', 'Markdown widget');
        card.setAttribute('data-widget-kind', 'markdown');
        card.setAttribute('data-widget-var', widget.variable);
        var body = el(doc, 'div', 'shell-prose widget-content-block');
        body.setAttribute('data-var-content', widget.variable);
        var variables = ctx.variables || {};
        body.innerHTML = typeof ctx.renderMarkdown === 'function'
            ? ctx.renderMarkdown(variables[widget.variable] || '')
            : '';
        card.appendChild(body);
        return card;
    }

    function renderHtml(widget, ctx, doc) {
        var card = el(doc, 'section', 'shell-card');
        card.setAttribute('aria-label', 'HTML widget');
        card.setAttribute('data-widget-kind', 'html');
        card.setAttribute('data-widget-var', widget.variable);
        var frame = doc.createElement('iframe');
        frame.setAttribute('sandbox', '');
        frame.setAttribute('title', 'Widget: ' + widget.variable);
        frame.setAttribute('data-var-frame', widget.variable);
        frame.className = 'shell-widget-frame widget-content-block';
        var variables = ctx.variables || {};
        frame.srcdoc = variables[widget.variable] || '';
        card.appendChild(frame);
        return card;
    }

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function formatTimer(totalSeconds) {
        var s = Math.max(0, Math.floor(totalSeconds));
        var h = Math.floor(s / 3600);
        var m = Math.floor((s % 3600) / 60);
        var sec = s % 60;
        if (h > 0) return h + ':' + pad2(m) + ':' + pad2(sec);
        return pad2(m) + ':' + pad2(sec);
    }

    function buildWheel(doc, unit, max, initial) {
        var col = el(doc, 'div', 'widget-timer-wheel');
        col.setAttribute('data-timer-unit', unit);
        col.setAttribute('role', 'listbox');
        col.setAttribute('aria-label', unit);
        col.tabIndex = 0;
        var track = el(doc, 'div', 'widget-timer-wheel-track');
        for (var i = 0; i <= max; i++) {
            var item = el(doc, 'div', 'widget-timer-wheel-item', pad2(i));
            item.setAttribute('data-value', String(i));
            item.setAttribute('role', 'option');
            track.appendChild(item);
        }
        col.appendChild(track);
        col.appendChild(el(doc, 'div', 'widget-timer-wheel-fade widget-timer-wheel-fade--top'));
        col.appendChild(el(doc, 'div', 'widget-timer-wheel-fade widget-timer-wheel-fade--bottom'));
        col._timerValue = typeof initial === 'number' ? initial : 0;
        col._timerMax = max;
        return col;
    }

    function syncWheel(col) {
        var itemH = 36;
        var track = col.querySelector('.widget-timer-wheel-track');
        if (!track) return;
        var value = col._timerValue || 0;
        track.style.transform = 'translateY(' + ((2 * itemH) - (value * itemH)) + 'px)';
        Array.prototype.forEach.call(track.children, function (item) {
            var v = parseInt(item.getAttribute('data-value'), 10);
            item.classList.toggle('is-selected', v === value);
            item.setAttribute('aria-selected', v === value ? 'true' : 'false');
        });
    }

    function bindWheel(col) {
        syncWheel(col);
        var dragging = false;
        var startY = 0;
        var startValue = 0;

        function setFromDelta(dy) {
            var itemH = 36;
            var next = Math.round(startValue - (dy / itemH));
            if (next < 0) next = 0;
            if (next > col._timerMax) next = col._timerMax;
            col._timerValue = next;
            syncWheel(col);
        }

        col.addEventListener('pointerdown', function (e) {
            dragging = true;
            startY = e.clientY;
            startValue = col._timerValue || 0;
            try { col.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
            e.preventDefault();
        });
        col.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            setFromDelta(e.clientY - startY);
        });
        col.addEventListener('pointerup', function () { dragging = false; });
        col.addEventListener('pointercancel', function () { dragging = false; });
        col.addEventListener('wheel', function (e) {
            e.preventDefault();
            var delta = e.deltaY > 0 ? 1 : -1;
            var next = (col._timerValue || 0) + delta;
            if (next < 0) next = 0;
            if (next > col._timerMax) next = col._timerMax;
            col._timerValue = next;
            syncWheel(col);
        }, { passive: false });
        col.addEventListener('keydown', function (e) {
            var next = col._timerValue || 0;
            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next -= 1;
            else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next += 1;
            else return;
            e.preventDefault();
            if (next < 0) next = 0;
            if (next > col._timerMax) next = col._timerMax;
            col._timerValue = next;
            syncWheel(col);
        });
    }

    function renderTimer(widget, doc) {
        var card = el(doc, 'section', 'shell-card widget-timer');
        card.setAttribute('aria-label', 'Timer');
        card.setAttribute('data-widget-kind', 'timer');
        if (widget && widget.id) card.setAttribute('data-timer-id', String(widget.id));

        var body = el(doc, 'div', 'widget-timer-body widget-content-block');
        var picker = el(doc, 'div', 'widget-timer-picker');
        var hours = buildWheel(doc, 'hours', 23, 0);
        var minutes = buildWheel(doc, 'minutes', 59, 0);
        var seconds = buildWheel(doc, 'seconds', 59, 0);
        picker.appendChild(hours);
        picker.appendChild(el(doc, 'div', 'widget-timer-sep', ':'));
        picker.appendChild(minutes);
        picker.appendChild(el(doc, 'div', 'widget-timer-sep', ':'));
        picker.appendChild(seconds);

        var display = el(doc, 'div', 'widget-timer-display', '00:00');
        display.hidden = true;

        var controls = el(doc, 'div', 'widget-timer-controls');
        var cancelBtn = el(doc, 'button', 'widget-timer-btn widget-timer-btn--cancel', 'Cancel');
        cancelBtn.type = 'button';
        cancelBtn.disabled = true;
        var toggleBtn = el(doc, 'button', 'widget-timer-btn widget-timer-btn--toggle', 'Start');
        toggleBtn.type = 'button';
        controls.appendChild(cancelBtn);
        controls.appendChild(toggleBtn);

        body.appendChild(picker);
        body.appendChild(display);
        body.appendChild(controls);
        card.appendChild(body);

        bindWheel(hours);
        bindWheel(minutes);
        bindWheel(seconds);

        // Instance-local state: not shared with other timer widgets / panels.
        var state = {
            status: 'idle', // idle | running | paused
            remainingMs: 0,
            endsAt: 0,
            raf: null,
            interval: null,
        };

        function selectedSeconds() {
            return (hours._timerValue || 0) * 3600
                + (minutes._timerValue || 0) * 60
                + (seconds._timerValue || 0);
        }

        function stopTicker() {
            if (state.interval) {
                clearInterval(state.interval);
                state.interval = null;
            }
        }

        function paint() {
            var remaining = state.remainingMs;
            if (state.status === 'running') {
                remaining = Math.max(0, state.endsAt - Date.now());
                state.remainingMs = remaining;
            }
            display.textContent = formatTimer(remaining / 1000);
            var active = state.status === 'running' || state.status === 'paused';
            picker.hidden = active;
            display.hidden = !active;
            cancelBtn.disabled = !active;
            toggleBtn.textContent = state.status === 'running' ? 'Pause' : (state.status === 'paused' ? 'Resume' : 'Start');
            toggleBtn.classList.toggle('is-running', state.status === 'running');
            card.classList.toggle('widget-timer--running', state.status === 'running');
            card.classList.toggle('widget-timer--paused', state.status === 'paused');
            if (state.status === 'running' && remaining <= 0) {
                finish();
            }
        }

        function finish() {
            stopTicker();
            state.status = 'idle';
            state.remainingMs = 0;
            state.endsAt = 0;
            display.textContent = '00:00';
            paint();
            try {
                if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([200, 100, 200]);
            } catch (_) { /* ignore */ }
            card.classList.add('widget-timer--done');
            setTimeout(function () { card.classList.remove('widget-timer--done'); }, 1200);
        }

        function startTicker() {
            stopTicker();
            state.interval = setInterval(paint, 200);
        }

        toggleBtn.addEventListener('click', function () {
            if (state.status === 'idle') {
                var secs = selectedSeconds();
                if (secs <= 0) return;
                state.remainingMs = secs * 1000;
                state.endsAt = Date.now() + state.remainingMs;
                state.status = 'running';
                startTicker();
                paint();
                return;
            }
            if (state.status === 'running') {
                state.remainingMs = Math.max(0, state.endsAt - Date.now());
                state.status = 'paused';
                stopTicker();
                paint();
                return;
            }
            if (state.status === 'paused') {
                if (state.remainingMs <= 0) {
                    finish();
                    return;
                }
                state.endsAt = Date.now() + state.remainingMs;
                state.status = 'running';
                startTicker();
                paint();
            }
        });

        cancelBtn.addEventListener('click', function () {
            stopTicker();
            state.status = 'idle';
            state.remainingMs = 0;
            state.endsAt = 0;
            paint();
        });

        paint();
        return card;
    }

    function renderContent(widget, ctx, explicitDoc) {
        var doc = getDoc(explicitDoc);
        if (!doc || !widget) return null;
        var context = ctx || {};
        switch (widget.type) {
            case 'button': return renderButton(widget, context, doc);
            case 'clock': return renderClock(widget, doc);
            case 'markdown': return renderMarkdown(widget, context, doc);
            case 'html': return renderHtml(widget, context, doc);
            case 'timer': return renderTimer(widget, doc);
            default: return null;
        }
    }

    /**
     * Build a full GridStack item element for a widget. The caller appends
     * it to the grid container and lets GridStack position it from the
     * gs-x/gs-y/gs-w/gs-h/gs-id attributes.
     */
    function createItem(widget, ctx, explicitDoc) {
        var doc = getDoc(explicitDoc);
        if (!doc || !widget) return null;
        var content = renderContent(widget, ctx || {}, doc);
        if (!content) return null;
        var item = el(doc, 'div', 'grid-stack-item');
        item.setAttribute('gs-x', String(widget.x || 0));
        item.setAttribute('gs-y', String(widget.y || 0));
        item.setAttribute('gs-w', String(widget.w || 1));
        item.setAttribute('gs-h', String(widget.h || 1));
        if (widget.id) item.setAttribute('gs-id', String(widget.id));
        var inner = el(doc, 'div', 'grid-stack-item-content');
        var handle = el(doc, 'span', 'widget-drag-handle material-symbols-outlined', 'drag_indicator');
        handle.setAttribute('aria-hidden', 'true');
        inner.appendChild(handle);
        inner.appendChild(content);
        if (ctx && typeof ctx.onRemove === 'function') {
            var del = el(doc, 'button', 'widget-delete-btn');
            del.type = 'button';
            del.setAttribute('aria-label', 'Remove widget');
            del.title = 'Remove widget';
            var delIcon = el(doc, 'span', 'material-symbols-outlined', 'delete');
            delIcon.setAttribute('aria-hidden', 'true');
            del.appendChild(delIcon);
            (function (w) {
                del.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    ctx.onRemove(w);
                });
            })(widget);
            inner.appendChild(del);
        }
        item.appendChild(inner);
        return item;
    }

    return {
        automationFor: automationFor,
        renderContent: renderContent,
        createItem: createItem,
        formatTimer: formatTimer,
    };
}));
