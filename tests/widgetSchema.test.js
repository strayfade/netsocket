'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const schema = require('../server/manager/widgetSchema');

describe('widgetSchema', () => {
    it('validates grid widgets into canonical shape', () => {
        const widget = schema.validateWidget(
            { id: 'a1', type: 'button', x: 2, y: 3, w: 1, h: 1, automationId: ' 7 ' },
            0
        );
        assert.deepEqual(widget, {
            id: 'a1', type: 'button', x: 2, y: 3, w: 1, h: 1, automationId: '7',
        });
        const content = schema.validateWidget(
            { type: 'Markdown', x: 0, y: 0, w: 4, h: 2, variable: ' notes ' },
            4
        );
        assert.deepEqual(content, {
            id: 'w5', type: 'markdown', x: 0, y: 0, w: 4, h: 2, variable: 'notes',
        });
    });

    it('rejects bad types, bindings, and positions', () => {
        assert.throws(() => schema.validateWidget(null, 0), /invalid_widget/);
        assert.throws(() => schema.validateWidget({ type: 'stats', x: 0, y: 0, w: 1, h: 1 }, 0), /invalid_type/);
        assert.throws(() => schema.validateWidget({ type: 'weather', x: 0, y: 0, w: 1, h: 1 }, 0), /invalid_type/);
        assert.throws(() => schema.validateWidget({ type: 'button', x: 0, y: 0, w: 1, h: 1 }, 0), /automation_required/);
        assert.throws(() => schema.validateWidget({ type: 'markdown', x: 0, y: 0, w: 1, h: 1 }, 0), /variable_required/);
        assert.throws(() => schema.validateWidget({ type: 'clock', x: -1, y: 0, w: 1, h: 1 }, 0), /invalid_widget/);
        assert.throws(() => schema.validateWidget({ type: 'clock', x: 11, y: 0, w: 2, h: 1 }, 0), /invalid_widget/);
        assert.throws(() => schema.validateWidget({ type: 'clock', x: 0, y: 0, w: 0, h: 1 }, 0), /invalid_widget/);
        assert.throws(() => schema.validateWidget({ type: 'clock', x: 0, y: 0, w: 13, h: 1 }, 0), /invalid_widget/);
    });

    it('caps list length and exposes fixed presets', () => {
        assert.throws(
            () => schema.validateWidgetList(
                Array.from({ length: 101 }, () => ({ type: 'clock', x: 0, y: 0, w: 4, h: 2 }))
            ),
            /too_many_widgets/
        );
        assert.deepEqual(schema.presetFor('button'), { w: 1, h: 1 });
        assert.deepEqual(schema.TYPE_PRESETS.clock, [{ w: 4, h: 2 }, { w: 2, h: 1 }]);
        assert.equal(schema.TYPE_PRESETS.markdown.length, 4);
        assert.equal(schema.TYPE_PRESETS.html.length, 4);
    });

    it('packs positions without overlap', () => {
        const placed = schema.flowLayout([
            { type: 'clock', w: 4, h: 2 },
            { type: 'markdown', w: 4, h: 2 },
            { type: 'button', w: 1, h: 1 },
        ]);
        assert.deepEqual(placed.map((w) => [w.x, w.y]), [[0, 0], [4, 0], [8, 0]]);
    });
});
