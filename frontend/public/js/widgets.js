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
    // widget: { id, type, x, y, w, h, automationId?, variable?, showName?, showDate?,
    //           location?, unit?, gradient? }
    // ctx: { automations: [{id,title,type,runnable}], variables: {name:value},
    //        weatherMap: {"<location>|<unit>": weatherEntry},
    //        onRun(item, button), renderMarkdown(text)->html }

    var WHEEL_ITEM_H = 56;
    var timerAudioCtx = null;
    var timerAlarmStop = null;

    function getTimerAudioCtx() {
        var root = typeof globalThis !== 'undefined' ? globalThis : null;
        if (!root) return null;
        var AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        if (!timerAudioCtx) timerAudioCtx = new AC();
        if (timerAudioCtx.state === 'suspended' && typeof timerAudioCtx.resume === 'function') {
            try { timerAudioCtx.resume(); } catch (_) { /* ignore */ }
        }
        return timerAudioCtx;
    }

    function stopTimerDoneSound() {
        if (typeof timerAlarmStop === 'function') {
            try { timerAlarmStop(); } catch (_) { /* ignore */ }
        }
        timerAlarmStop = null;
    }

    /**
     * Friendly soft chime that swells louder over a few seconds.
     * Uses Web Audio (no asset). No-ops when AudioContext is unavailable.
     */
    function playTimerDoneSound() {
        stopTimerDoneSound();
        var ctx = getTimerAudioCtx();
        if (!ctx) return null;
        var now = ctx.currentTime;
        var master = ctx.createGain();
        // Audible from the first hit, then swell louder, then release.
        master.gain.setValueAtTime(0.28, now);
        master.gain.linearRampToValueAtTime(1, now + 2.4);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 4.5);
        master.connect(ctx.destination);

        // Warm C-major bell notes; each hit is a little stronger than the last.
        var notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
        var nodes = [];
        for (var i = 0; i < notes.length; i++) {
            var freq = notes[i];
            var t0 = now + i * 0.58;
            var osc = ctx.createOscillator();
            var harmonic = ctx.createOscillator();
            var noteGain = ctx.createGain();
            var harmGain = ctx.createGain();
            osc.type = 'sine';
            harmonic.type = 'triangle';
            osc.frequency.value = freq;
            harmonic.frequency.value = freq * 2;
            harmGain.gain.value = 0.35;
            var peak = 0.55 + i * 0.12;
            noteGain.gain.setValueAtTime(0.0001, t0);
            noteGain.gain.exponentialRampToValueAtTime(peak, t0 + 0.04);
            noteGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.15);
            osc.connect(noteGain);
            harmonic.connect(harmGain);
            harmGain.connect(noteGain);
            noteGain.connect(master);
            osc.start(t0);
            osc.stop(t0 + 1.25);
            harmonic.start(t0);
            harmonic.stop(t0 + 1.25);
            nodes.push(osc, harmonic, noteGain, harmGain);
        }
        nodes.push(master);

        timerAlarmStop = function () {
            var t = ctx.currentTime;
            try {
                master.gain.cancelScheduledValues(t);
                master.gain.setTargetAtTime(0.0001, t, 0.04);
            } catch (_) { /* ignore */ }
            for (var n = 0; n < nodes.length; n++) {
                try {
                    if (typeof nodes[n].stop === 'function') nodes[n].stop(t + 0.05);
                } catch (_) { /* already stopped */ }
            }
        };
        setTimeout(function () {
            if (timerAlarmStop) timerAlarmStop = null;
        }, 5000);
        return timerAlarmStop;
    }

    function wheelItemHeight(col) {
        var item = col && col.querySelector ? col.querySelector('.widget-timer-wheel-item') : null;
        if (item) {
            var h = item.offsetHeight;
            if (h > 0) return h;
        }
        return WHEEL_ITEM_H;
    }

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

    function sizeAttrs(node, widget) {
        var w = widget && widget.w != null ? widget.w : 1;
        var h = widget && widget.h != null ? widget.h : 1;
        node.setAttribute('data-widget-w', String(w));
        node.setAttribute('data-widget-h', String(h));
        return node;
    }

    /**
     * Scale a content block up/down so it fills the card without overflowing.
     * Keeps intrinsic text layout, then applies a uniform transform.
     */
    function bindFitScale(card, content) {
        if (!card || !content) return;
        content.classList.add('widget-fit-scale');
        function update() {
            content.style.transform = 'none';
            // Keep readable inset so clocks/markdown don't edge-bleed the card.
            var styles = (typeof getComputedStyle === 'function') ? getComputedStyle(card) : null;
            var padX = styles
                ? (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0)
                : 0;
            var padY = styles
                ? (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0)
                : 0;
            var minPad = 28;
            padX = Math.max(padX, minPad * 2);
            padY = Math.max(padY, minPad * 2);
            var cw = Math.max(0, card.clientWidth - padX);
            var ch = Math.max(0, card.clientHeight - padY);
            var bw = content.scrollWidth || content.offsetWidth || 1;
            var bh = content.scrollHeight || content.offsetHeight || 1;
            if (!cw || !ch) return;
            var scale = Math.min(cw / bw, ch / bh);
            if (!isFinite(scale) || scale <= 0) scale = 1;
            // Cap extreme blow-ups for tiny strings in huge cells.
            if (scale > 3.25) scale = 3.25;
            content.style.transformOrigin = 'center center';
            content.style.transform = 'scale(' + scale + ')';
        }
        content._fitScale = update;
        if (typeof ResizeObserver !== 'undefined') {
            var ro = new ResizeObserver(function () { update(); });
            ro.observe(card);
            try { ro.observe(content); } catch (_) { /* ignore */ }
        }
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(function () {
                update();
                requestAnimationFrame(update);
            });
        } else {
            setTimeout(update, 0);
        }
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
        sizeAttrs(btn, widget);
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
        var w = widget.w || 1;
        var h = widget.h || 1;
        var compact = w <= 2 && h <= 1;
        var showDate = widget.showDate !== false;
        var card = el(doc, 'section', 'shell-card widget-clock' + (compact ? ' widget-clock-compact' : ''));
        card.setAttribute('aria-label', 'Clock');
        card.setAttribute('data-widget-kind', 'clock');
        sizeAttrs(card, widget);
        var stack = el(doc, 'div', 'widget-clock-stack widget-content-block');
        if (showDate) {
            var date = el(doc, 'p', 'widget-clock-date', 'Loading date');
            date.setAttribute('data-clock-date', '');
            stack.appendChild(date);
        }
        var time = el(doc, 'p', 'shell-clock-value shell-skeleton', '--:--');
        time.setAttribute('data-clock-time', '');
        stack.appendChild(time);
        card.appendChild(stack);
        bindFitScale(card, stack);
        return card;
    }

    function renderMarkdown(widget, ctx, doc) {
        var card = el(doc, 'section', 'shell-card');
        card.setAttribute('aria-label', 'Markdown widget');
        card.setAttribute('data-widget-kind', 'markdown');
        card.setAttribute('data-widget-var', widget.variable);
        sizeAttrs(card, widget);
        var body = el(doc, 'div', 'shell-prose widget-content-block');
        body.setAttribute('data-var-content', widget.variable);
        var variables = ctx.variables || {};
        body.innerHTML = typeof ctx.renderMarkdown === 'function'
            ? ctx.renderMarkdown(variables[widget.variable] || '')
            : '';
        card.appendChild(body);
        bindFitScale(card, body);
        // Re-fit when live variable updates rewrite innerHTML.
        if (typeof MutationObserver !== 'undefined') {
            var mo = new MutationObserver(function () {
                if (typeof body._fitScale === 'function') body._fitScale();
            });
            mo.observe(body, { childList: true, characterData: true, subtree: true });
        }
        return card;
    }

    function renderHtml(widget, ctx, doc) {
        var card = el(doc, 'section', 'shell-card');
        card.setAttribute('aria-label', 'HTML widget');
        card.setAttribute('data-widget-kind', 'html');
        card.setAttribute('data-widget-var', widget.variable);
        sizeAttrs(card, widget);
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

    /** Visible timer columns from grid width: 1=mm, 2=mm/ss, 3=hh/mm/ss */
    function timerColsForWidth(w) {
        var width = w == null ? 4 : Number(w);
        if (width >= 6) return 3;
        if (width >= 4) return 2;
        return 1;
    }

    function buildWheel(doc, unit, max, initial) {
        var col = el(doc, 'div', 'widget-timer-wheel widget-timer-unit--' + unit);
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
        var track = col.querySelector('.widget-timer-wheel-track');
        if (!track) return;
        var value = col._timerValue || 0;
        var itemH = wheelItemHeight(col);
        var wheelH = col.clientHeight || (5 * itemH);
        var centerOffset = (wheelH / 2) - (itemH / 2);
        track.style.transform = 'translateY(' + (centerOffset - (value * itemH)) + 'px)';
        Array.prototype.forEach.call(track.children, function (item) {
            var v = parseInt(item.getAttribute('data-value'), 10);
            var dist = Math.abs(v - value);
            item.classList.toggle('is-selected', dist === 0);
            item.setAttribute('aria-selected', dist === 0 ? 'true' : 'false');
            item.style.setProperty('--wheel-dist', String(dist));
            // Selected: full opacity, no blur. Farther numbers fade + blur.
            var opacity = dist === 0 ? 1 : Math.max(0.12, 0.7 - dist * 0.22);
            var blur = dist === 0 ? 0 : Math.min(6, dist * 1.6);
            item.style.opacity = String(opacity);
            item.style.filter = blur > 0 ? ('blur(' + blur + 'px)') : 'none';
        });
    }

    function bindWheel(col) {
        syncWheel(col);
        var dragging = false;
        var startY = 0;
        var startValue = 0;

        function setFromDelta(dy) {
            var itemH = wheelItemHeight(col);
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
        if (typeof ResizeObserver !== 'undefined') {
            var ro = new ResizeObserver(function () { syncWheel(col); });
            ro.observe(col);
        }
    }

    function applyTimerCols(card, w) {
        var cols = timerColsForWidth(w);
        card.setAttribute('data-timer-cols', String(cols));
        return cols;
    }

    function renderTimer(widget, doc) {
        var card = el(doc, 'section', 'shell-card widget-timer');
        card.setAttribute('aria-label', 'Timer');
        card.setAttribute('data-widget-kind', 'timer');
        sizeAttrs(card, widget);
        applyTimerCols(card, widget.w);
        if (widget && widget.id) card.setAttribute('data-timer-id', String(widget.id));

        var body = el(doc, 'div', 'widget-timer-body');
        var stage = el(doc, 'div', 'widget-timer-stage');
        var picker = el(doc, 'div', 'widget-timer-picker');
        var hours = buildWheel(doc, 'hours', 23, 0);
        var minutes = buildWheel(doc, 'minutes', 59, 0);
        var seconds = buildWheel(doc, 'seconds', 59, 0);
        var sepHours = el(doc, 'div', 'widget-timer-sep widget-timer-sep--hours', ':');
        var sepMins = el(doc, 'div', 'widget-timer-sep widget-timer-sep--mins', ':');
        picker.appendChild(hours);
        picker.appendChild(sepHours);
        picker.appendChild(minutes);
        picker.appendChild(sepMins);
        picker.appendChild(seconds);

        var display = el(doc, 'div', 'widget-timer-display', '00:00');
        display.setAttribute('aria-live', 'polite');

        var controls = el(doc, 'div', 'widget-timer-controls');
        var cancelBtn = el(doc, 'button', 'widget-timer-btn widget-timer-btn--cancel', 'Cancel');
        cancelBtn.type = 'button';
        cancelBtn.disabled = true;
        var toggleBtn = el(doc, 'button', 'widget-timer-btn widget-timer-btn--toggle', 'Start');
        toggleBtn.type = 'button';
        controls.appendChild(cancelBtn);
        controls.appendChild(toggleBtn);

        stage.appendChild(picker);
        stage.appendChild(display);
        // Picker fills remaining space; controls stay pinned to the bottom.
        body.appendChild(stage);
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
            interval: null,
        };

        function visibleCols() {
            return timerColsForWidth(card.getAttribute('data-widget-w'));
        }

        function selectedSeconds() {
            var cols = visibleCols();
            var h = cols >= 3 ? (hours._timerValue || 0) : 0;
            var m = minutes._timerValue || 0;
            var s = cols >= 2 ? (seconds._timerValue || 0) : 0;
            return h * 3600 + m * 60 + s;
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
            card.classList.toggle('is-active', active);
            card.classList.toggle('widget-timer--running', state.status === 'running');
            card.classList.toggle('widget-timer--paused', state.status === 'paused');
            cancelBtn.disabled = !active;
            toggleBtn.textContent = state.status === 'running' ? 'Pause' : (state.status === 'paused' ? 'Resume' : 'Start');
            toggleBtn.classList.toggle('is-running', state.status === 'running');
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
            try { playTimerDoneSound(); } catch (_) { /* ignore */ }
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
            stopTimerDoneSound();
            state.status = 'idle';
            state.remainingMs = 0;
            state.endsAt = 0;
            paint();
        });

        paint();
        return card;
    }

    // --- Weather widget -----------------------------------------------------

    /**
     * Map a widget box to one of four layouts: micro (icon + temp), bar
     * (single row), wide (icon / hero / details columns), stack (vertical).
     */
    function wxLayoutFor(w, h) {
        var width = w == null ? 4 : Number(w);
        var height = h == null ? 3 : Number(h);
        if (width <= 1) return 'micro';
        if (height <= 1) return 'bar';
        if (width <= 2 && height <= 2) return 'micro';
        if (width >= 6) return 'wide';
        return 'stack';
    }

    /** OWM condition id -> palette class. */
    function wxConditionFor(code) {
        var c = Number(code);
        if (!isFinite(c) || c < 0) return 'none';
        if (c >= 200 && c < 300) return 'storm';
        if (c >= 300 && c < 600) return 'rain';
        if (c >= 600 && c < 700) return 'snow';
        if (c >= 700 && c < 800) return 'mist';
        if (c === 800) return 'clear';
        if (c === 801 || c === 802) return 'few-clouds';
        if (c >= 803 && c <= 804) return 'clouds';
        return 'none';
    }

    /** OWM condition id + day flag -> Material Symbols Outlined ligature. */
    function wxIconFor(code, isDay) {
        var c = Number(code);
        if (!isFinite(c) || c < 0) return 'cloud_queue';
        if (c >= 200 && c < 300) return 'thunderstorm';
        if (c >= 300 && c < 500) return 'rainy';
        if (c === 511) return 'hail';
        if (c >= 500 && c < 600) return 'rainy';
        if (c >= 600 && c < 617) return 'cloudy_snowing';
        if (c >= 617 && c < 700) return 'weather_snowy';
        if (c === 781) return 'tornado';
        if (c === 751 || c === 761 || c === 762) return 'dust_storm';
        if (c >= 700 && c < 800) return 'foggy';
        if (c === 800) return isDay === false ? 'clear_night' : 'clear_day';
        if (c === 801 || c === 802) return isDay === false ? 'partly_cloudy_night' : 'partly_cloudy_day';
        if (c >= 803 && c <= 804) return 'cloud';
        return 'cloud_queue';
    }

    function weatherNowMs() {
        try {
            if (typeof window !== 'undefined' && window.ShellLogic) {
                if (typeof window.ShellLogic.ntpNow === 'function') return window.ShellLogic.ntpNow();
                if (typeof window.ShellLogic.serverNow === 'function') return window.ShellLogic.serverNow();
            }
        } catch (_) { /* fall through */ }
        return Date.now();
    }

    function easternHourNow(nowMs) {
        try {
            if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
                var parts = new Intl.DateTimeFormat('en-US', {
                    timeZone: 'America/New_York', hour: '2-digit', hour12: false,
                }).formatToParts(new Date(nowMs));
                for (var i = 0; i < parts.length; i++) {
                    if (parts[i].type === 'hour') {
                        var h = parseInt(parts[i].value, 10);
                        if (isFinite(h)) return h % 24;
                    }
                }
            }
        } catch (_) { /* fall through */ }
        var d = new Date(nowMs);
        return d.getHours();
    }

    /**
     * Dawn/day/dusk/night bucket for gradient selection. sunrise/sunset are
     * absolute unix seconds from OWM, so this stays correct for any location;
     * without them it falls back to hour-of-day in America/New_York (the same
     * clock the Clock widget paints).
     */
    function wxTimeOfDay(entry, nowMs) {
        var now = nowMs == null ? weatherNowMs() : nowMs;
        var sunrise = entry && typeof entry.sunrise === 'number' ? entry.sunrise : null;
        var sunset = entry && typeof entry.sunset === 'number' ? entry.sunset : null;
        if (sunrise != null && sunset != null && sunset > sunrise) {
            var nowSec = now / 1000;
            var window45 = 45 * 60;
            if (nowSec >= sunrise - window45 && nowSec <= sunrise + window45) return 'dawn';
            if (nowSec >= sunset - window45 && nowSec <= sunset + window45) return 'dusk';
            return (nowSec > sunrise && nowSec < sunset) ? 'day' : 'night';
        }
        var hour = easternHourNow(now);
        if (hour >= 5 && hour < 8) return 'dawn';
        if (hour >= 17 && hour < 20) return 'dusk';
        if (hour >= 8 && hour < 17) return 'day';
        return 'night';
    }

    function weatherEntryKey(location, unit) {
        return String(location == null ? '' : location) + '|' + (unit === 'c' ? 'c' : 'f');
    }

    function wxCompass(deg) {
        if (typeof deg !== 'number' || !isFinite(deg)) return '';
        var points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        return points[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
    }

    function capitalize(s) {
        return typeof s === 'string' && s.length ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    }

    function applyWeatherLayout(card, w, h) {
        card.setAttribute('data-wx-layout', wxLayoutFor(w, h));
    }

    /**
     * Paint one weather card from a snapshot entry (weather object,
     * {error}, or undefined for still-loading). Updates the tod bucket too,
     * so gradients follow the clock.
     */
    function applyWeatherState(card, entry) {
        var unitChar = (card.getAttribute('data-wx-unit') || 'f') === 'c' ? 'C' : 'F';
        var icon = card.querySelector('[data-wx-icon]');
        var temp = card.querySelector('[data-wx-temp]');
        var unitEl = card.querySelector('[data-wx-unit-char]');
        var label = card.querySelector('[data-wx-label]');
        var name = card.querySelector('[data-wx-name]');
        var high = card.querySelector('[data-wx-high]');
        var low = card.querySelector('[data-wx-low]');
        var feels = card.querySelector('[data-wx-feels]');
        var wind = card.querySelector('[data-wx-wind]');
        var humidity = card.querySelector('[data-wx-humidity]');
        if (unitEl) unitEl.textContent = '°' + unitChar;

        if (!entry || entry.error) {
            var loading = !entry;
            card.classList.remove('shell-skeleton');
            card.setAttribute('data-wx-state', entry ? 'error' : 'loading');
            card.setAttribute('data-wx-condition', 'none');
            card.setAttribute('data-wx-tod', 'night');
            if (icon) {
                icon.textContent = 'cloud_queue';
                icon.classList.remove('shell-skeleton');
            }
            if (temp) {
                temp.textContent = '--';
                temp.classList.toggle('shell-skeleton', loading);
            }
            if (name) {
                name.textContent = '';
                name.classList.toggle('shell-skeleton', loading);
            }
            if (label) {
                var msg = 'Loading weather';
                if (entry && entry.error === 'no_key') msg = 'Add API key in Preferences';
                else if (entry && entry.error === 'not_found') msg = 'Location not found';
                else if (entry && entry.error) msg = 'Weather unavailable';
                label.textContent = msg;
            }
            if (high) high.textContent = '';
            if (low) low.textContent = '';
            if (feels) feels.textContent = '';
            if (wind) wind.textContent = '';
            if (humidity) humidity.textContent = '';
            return card;
        }

        card.classList.remove('shell-skeleton');
        card.setAttribute('data-wx-state', 'ok');
        card.setAttribute('data-wx-condition', wxConditionFor(entry.code));
        card.setAttribute('data-wx-tod', wxTimeOfDay(entry));
        if (temp) temp.classList.remove('shell-skeleton');
        if (icon) icon.textContent = wxIconFor(entry.code, entry.isDay);
        if (temp) temp.textContent = entry.temp == null ? '--' : String(entry.temp);
        if (name) {
            name.classList.remove('shell-skeleton');
            name.textContent = entry.country ? entry.name + ' · ' + entry.country : entry.name;
        }
        if (label) label.textContent = capitalize(entry.label || '');
        var deg = '°' + unitChar;
        if (high) high.textContent = entry.high == null ? '' : 'H ' + entry.high + deg;
        if (low) low.textContent = entry.low == null ? '' : 'L ' + entry.low + deg;
        if (feels) feels.textContent = entry.feels == null ? '' : 'Feels ' + entry.feels + deg;
        if (wind) {
            if (entry.windSpeed == null) wind.textContent = '';
            else {
                var dir = wxCompass(entry.windDeg);
                wind.textContent = 'Wind ' + entry.windSpeed + (unitChar === 'C' ? ' km/h' : ' mph')
                    + (dir ? ' ' + dir : '');
            }
        }
        if (humidity) humidity.textContent = entry.humidity == null ? '' : 'Humidity ' + entry.humidity + '%';
        return card;
    }

    function renderWeather(widget, ctx, doc) {
        var card = el(doc, 'section', 'shell-card widget-weather');
        if (widget.gradient !== false) card.classList.add('widget-weather--gradient');
        card.setAttribute('aria-label', 'Weather');
        card.setAttribute('data-widget-kind', 'weather');
        var unit = widget.unit === 'c' ? 'c' : 'f';
        card.setAttribute('data-wx-unit', unit);
        card.setAttribute('data-wx-state', 'loading');
        card.setAttribute('data-wx-condition', 'none');
        card.setAttribute('data-wx-tod', 'night');
        sizeAttrs(card, widget);
        if (widget.location) {
            card.setAttribute('data-weather-key', weatherEntryKey(widget.location, unit));
        }
        applyWeatherLayout(card, widget.w, widget.h);

        var body = el(doc, 'div', 'widget-weather-body widget-content-block');
        var head = el(doc, 'div', 'widget-weather-head');
        var name = el(doc, 'p', 'widget-weather-name shell-skeleton');
        name.setAttribute('data-wx-name', '');
        head.appendChild(name);
        var icon = el(doc, 'span', 'material-symbols-outlined widget-weather-icon', 'cloud_queue');
        icon.setAttribute('aria-hidden', 'true');
        icon.setAttribute('data-wx-icon', '');
        var tempWrap = el(doc, 'div', 'widget-weather-temp');
        var temp = el(doc, 'span', 'widget-weather-num shell-skeleton', '--');
        temp.setAttribute('data-wx-temp', '');
        tempWrap.appendChild(temp);
        var deg = el(doc, 'span', 'widget-weather-unitchar', '°' + (unit === 'c' ? 'C' : 'F'));
        deg.setAttribute('data-wx-unit-char', '');
        tempWrap.appendChild(deg);
        var label = el(doc, 'p', 'widget-weather-label', 'Loading weather');
        label.setAttribute('data-wx-label', '');
        var details = el(doc, 'div', 'widget-weather-details');
        var detailSpecs = [
            ['widget-weather-detail widget-weather-detail--hl', 'data-wx-high', ''],
            ['widget-weather-detail widget-weather-detail--ll', 'data-wx-low', ''],
            ['widget-weather-detail widget-weather-detail--feels', 'data-wx-feels', ''],
            ['widget-weather-detail widget-weather-detail--wind', 'data-wx-wind', ''],
            ['widget-weather-detail widget-weather-detail--humidity', 'data-wx-humidity', ''],
        ];
        for (var d = 0; d < detailSpecs.length; d++) {
            var spec = detailSpecs[d];
            var item = el(doc, 'span', spec[0]);
            item.setAttribute(spec[1], '');
            details.appendChild(item);
        }
        body.appendChild(head);
        body.appendChild(icon);
        body.appendChild(tempWrap);
        body.appendChild(label);
        body.appendChild(details);
        card.appendChild(body);
        bindFitScale(card, body);

        var map = (ctx && ctx.weatherMap) || {};
        var entry = card.hasAttribute('data-weather-key')
            ? map[card.getAttribute('data-weather-key')]
            : undefined;
        applyWeatherState(card, entry);
        return card;
    }

    /**
     * Repatch every weather card under root (document by default) from a
     * fresh snapshot map, without rebuilding the grid. Mirrors the
     * [data-var-content] refresh path used for markdown widgets.
     */
    function refreshWeatherCards(root, weatherMap) {
        var scope = root && root.querySelectorAll ? root : (typeof document !== 'undefined' ? document : null);
        if (!scope) return;
        var map = weatherMap || {};
        Array.prototype.forEach.call(scope.querySelectorAll('[data-weather-key]'), function (card) {
            var entry = map[card.getAttribute('data-weather-key')];
            applyWeatherState(card, entry);
        });
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
            case 'weather': return renderWeather(widget, context, doc);
            default: return null;
        }
    }

    /**
     * Sync data-widget-w/h (and timer column mode) from a GridStack item's
     * current gs-w/gs-h after drag-resize. Safe to call on any grid root.
     */
    function syncItemSize(itemEl) {
        if (!itemEl || !itemEl.getAttribute) return;
        var w = parseInt(itemEl.getAttribute('gs-w'), 10);
        var h = parseInt(itemEl.getAttribute('gs-h'), 10);
        if (!Number.isFinite(w) || w < 1) w = 1;
        if (!Number.isFinite(h) || h < 1) h = 1;
        var root = itemEl.querySelector('[data-widget-kind]');
        if (!root) return;
        root.setAttribute('data-widget-w', String(w));
        root.setAttribute('data-widget-h', String(h));
        if (root.getAttribute('data-widget-kind') === 'timer') {
            applyTimerCols(root, w);
        }
        if (root.getAttribute('data-widget-kind') === 'weather') {
            applyWeatherLayout(root, w, h);
        }
        var compact = w <= 2 && h <= 1;
        if (root.getAttribute('data-widget-kind') === 'clock') {
            root.classList.toggle('widget-clock-compact', compact);
        }
        var fitTarget = root.querySelector('.widget-fit-scale') || (
            root.classList.contains('widget-fit-scale') ? root : null
        );
        if (fitTarget && typeof fitTarget._fitScale === 'function') {
            try { fitTarget._fitScale(); } catch (_) { /* ignore */ }
        }
        // Clock stack is the scaled target.
        var clockStack = root.querySelector('.widget-clock-stack.widget-fit-scale');
        if (clockStack && typeof clockStack._fitScale === 'function') {
            try { clockStack._fitScale(); } catch (_) { /* ignore */ }
        }
    }

    function syncGridSizes(gridRoot) {
        if (!gridRoot) return;
        Array.prototype.forEach.call(gridRoot.querySelectorAll('.grid-stack-item'), syncItemSize);
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
        timerColsForWidth: timerColsForWidth,
        syncItemSize: syncItemSize,
        syncGridSizes: syncGridSizes,
        playTimerDoneSound: playTimerDoneSound,
        stopTimerDoneSound: stopTimerDoneSound,
        weatherEntryKey: weatherEntryKey,
        wxLayoutFor: wxLayoutFor,
        wxConditionFor: wxConditionFor,
        wxIconFor: wxIconFor,
        wxTimeOfDay: wxTimeOfDay,
        applyWeatherState: applyWeatherState,
        refreshWeatherCards: refreshWeatherCards,
    };
}));
