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
    // widget: { id, type, x, y, w, h, automationId?, variable? }
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
        var label = item.title || item.type || ('Automation ' + widget.automationId);
        btn.setAttribute('aria-label', 'Run ' + label);
        btn.title = label;
        var icon = el(doc, 'span', 'material-symbols-outlined', 'play_arrow');
        icon.setAttribute('aria-hidden', 'true');
        btn.appendChild(icon);
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
        var card = el(doc, 'section', 'shell-card widget-clock' + (compact ? ' widget-clock-compact' : ''));
        card.setAttribute('aria-label', 'Clock');
        var time = el(doc, 'p', 'shell-clock-value shell-mono shell-skeleton', '--:--');
        time.setAttribute('data-clock-time', '');
        card.appendChild(time);
        var date = el(doc, 'p', 'shell-stat-sub', 'Loading date');
        date.setAttribute('data-clock-date', '');
        card.appendChild(date);
        return card;
    }

    function renderMarkdown(widget, ctx, doc) {
        var card = el(doc, 'section', 'shell-card');
        card.setAttribute('aria-label', 'Markdown widget');
        card.setAttribute('data-widget-kind', 'markdown');
        card.setAttribute('data-widget-var', widget.variable);
        var body = el(doc, 'div', 'shell-prose');
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
        frame.className = 'shell-widget-frame';
        var variables = ctx.variables || {};
        frame.srcdoc = variables[widget.variable] || '';
        card.appendChild(frame);
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
        item.appendChild(inner);
        return item;
    }

    return {
        automationFor: automationFor,
        renderContent: renderContent,
        createItem: createItem,
    };
}));
