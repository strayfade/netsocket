'use strict';

const TRIGGER_PREFIX = 'Triggers/';
const RUNNABLE_TRIGGER_TYPES = new Set([
    'Triggers/Button',
    'Triggers/Command Palette',
]);

const getGraphNodes = (graphRoot) => {
    if (!graphRoot || typeof graphRoot !== 'object') return [];
    if (Array.isArray(graphRoot.nodes)) return graphRoot.nodes;
    if (Array.isArray(graphRoot)) return graphRoot;
    return [];
};

const getNodeLabel = (node, fallback) => {
    if (node && typeof node.title === 'string' && node.title.trim()) return node.title.trim();
    if (node && node.properties && typeof node.properties.label === 'string' && node.properties.label.trim()) {
        return node.properties.label.trim();
    }
    return fallback;
};

const summarizeAutomations = (nodes) => {
    const list = Array.isArray(nodes) ? nodes : [];
    return list
        .filter((node) => node && typeof node.type === 'string' && node.type.indexOf(TRIGGER_PREFIX) === 0)
        .map((node) => {
            const type = node.type;
            return {
                id: node.id != null ? node.id : null,
                type: type,
                title: getNodeLabel(node, type.slice(TRIGGER_PREFIX.length)),
                runnable: RUNNABLE_TRIGGER_TYPES.has(type),
            };
        });
};

const buildDashboardSummary = (deps) => {
    const input = deps && typeof deps === 'object' ? deps : {};
    const nodes = getGraphNodes(input.graphRoot);
    const automations = summarizeAutomations(nodes);
    const vars = Array.isArray(input.vars) ? input.vars : [];
    const subgraphs = Array.isArray(input.subgraphs) ? input.subgraphs : [];
    const devices = Array.isArray(input.devices) ? input.devices : [];
    return {
        counts: {
            nodes: nodes.length,
            automations: automations.length,
            runnable: automations.filter((a) => a.runnable).length,
            variables: vars.length,
            subgraphs: subgraphs.length,
            devices: devices.length,
        },
        automations: automations,
    };
};

module.exports = {
    TRIGGER_PREFIX: TRIGGER_PREFIX,
    RUNNABLE_TRIGGER_TYPES: RUNNABLE_TRIGGER_TYPES,
    getGraphNodes: getGraphNodes,
    summarizeAutomations: summarizeAutomations,
    buildDashboardSummary: buildDashboardSummary,
};
