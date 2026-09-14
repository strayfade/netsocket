'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    summarizeAutomations,
    buildDashboardSummary,
} = require('../server/manager/dashboardSummary');

describe('dashboardSummary', () => {
    it('summarizes trigger nodes and counts runnable ones', () => {
        const graphRoot = {
            nodes: [
                { id: 1, type: 'Triggers/Button', title: 'Porch Light' },
                { id: 2, type: 'Triggers/Cron' },
                { id: 3, type: 'Math/Add' },
            ],
        };
        const summary = buildDashboardSummary({
            graphRoot,
            vars: [{ name: 'temp', value: '21' }],
            subgraphs: [{ id: 'a', name: 'Evening' }],
            devices: [{ deviceId: 'd1' }],
        });
        assert.equal(summary.counts.nodes, 3);
        assert.equal(summary.counts.automations, 2);
        assert.equal(summary.counts.runnable, 1);
        assert.equal(summary.counts.variables, 1);
        assert.equal(summary.counts.subgraphs, 1);
        assert.equal(summary.counts.devices, 1);
        assert.equal(summary.automations.length, 2);
        assert.equal(summary.automations[0].title, 'Porch Light');
        assert.equal(summary.automations[0].runnable, true);
        assert.equal(summary.automations[1].runnable, false);
    });

    it('handles missing or malformed input without throwing', () => {
        const empty = buildDashboardSummary();
        assert.deepEqual(empty.counts, {
            nodes: 0,
            automations: 0,
            runnable: 0,
            variables: 0,
            subgraphs: 0,
            devices: 0,
        });
        assert.deepEqual(empty.automations, []);

        const badNodes = buildDashboardSummary({ graphRoot: { nodes: 'nope' }, vars: {} });
        assert.equal(badNodes.counts.nodes, 0);
        assert.deepEqual(badNodes.automations, []);

        const unlabeled = summarizeAutomations([{ id: 9, type: 'Triggers/Webhook' }]);
        assert.equal(unlabeled[0].title, 'Webhook');
        assert.equal(unlabeled[0].runnable, false);
    });
});
