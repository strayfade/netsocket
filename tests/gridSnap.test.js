'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

const litegraph = require('../frontend/public/litegraph.js');
const { LiteGraph, LGraphCanvas } = litegraph;

const fakeCanvasCtx = Object.create(LGraphCanvas.prototype);

describe('grid snap (litegraph)', () => {
    it('snap pitch matches the drawn background tile (lines every 15 graph units)', () => {
        assert.equal(LiteGraph.GRID_SNAP_SIZE, 15);
    });

    it('_gridSnap rounds to the nearest 15-unit line', () => {
        const snap = fakeCanvasCtx._gridSnap;
        assert.equal(snap.call(fakeCanvasCtx, 0), 0);
        assert.equal(snap.call(fakeCanvasCtx, 7), 0);
        assert.equal(snap.call(fakeCanvasCtx, 8), 15);
        assert.equal(snap.call(fakeCanvasCtx, 22), 15);
        assert.equal(snap.call(fakeCanvasCtx, 23), 30);
        assert.equal(snap.call(fakeCanvasCtx, 120.4), 120);
        assert.equal(snap.call(fakeCanvasCtx, -8), -15);
    });

    it('ctrl held during a drag suspends the snap, setting off disables it outright', () => {
        const gate = fakeCanvasCtx._snapActiveForDrag;
        assert.equal(gate.call({ snap_to_grid: true }, { ctrlKey: false }), true);
        assert.equal(gate.call({ snap_to_grid: true }, { ctrlKey: true }), false);
        assert.equal(gate.call({ snap_to_grid: false }, { ctrlKey: false }), false);
        assert.equal(gate.call({ snap_to_grid: false }, { ctrlKey: true }), false);
    });

    it('snapping is enabled by default on new canvases', () => {
        const source = read('frontend', 'public', 'litegraph.js');
        assert.match(source, /this\.snap_to_grid = true;/);
    });

    it('node drags recompute from the drag-start base plus accumulated offset (no rounding drift)', () => {
        const source = read('frontend', 'public', 'litegraph.js');
        assert.match(source, /_snap_drag = \{ mode: "nodes", dx: 0, dy: 0, base: \{\} \}/);
        assert.match(source, /n\.pos\[0\] = do_snap \? this\._gridSnap\(rx\) : rx;/);
        assert.match(source, /n\.pos\[1\] = do_snap \? this\._gridSnap\(ry\) : ry;/);
    });

    it('group drags snap the frame and carry member nodes rigidly via move(step)', () => {
        const source = read('frontend', 'public', 'litegraph.js');
        assert.match(source, /mode: "group",[\s\S]*?base: \[this\.selected_group\.pos\[0\], this\.selected_group\.pos\[1\]\],/);
        assert.match(source, /offx = this\._gridSnap\(gsnap\.base\[0\] \+ gsnap\.dx\) - gsnap\.base\[0\];/);
        assert.match(source, /this\.selected_group\.move\(stepx, stepy, e\.ctrlKey\);/);
    });

    it('mouse-up lands dragged nodes and groups on the grid, guarded against still clicks', () => {
        const source = read('frontend', 'public', 'litegraph.js');
        assert.match(source, /this\._snap_drag &&\s*this\._snap_drag\.mode == "nodes"/);
        assert.match(source, /this\._snap_drag &&\s*this\._snap_drag\.mode == "group"/);
        assert.match(source, /this\.selected_group\.move\(snapdx, snapdy, e\.ctrlKey\);/);
    });

    it('snap drag accumulator resets on pointer down, pointer up and pointer-interaction cancel', () => {
        const source = read('frontend', 'public', 'litegraph.js');
        assert.match(source, /this\._snap_drag = null; \/\/each press starts a fresh snap-drag accumulator/);
        assert.match(source, /this\._snap_drag = null; \/\/drag over: drop the snap accumulator/);
        assert.match(source, /this\.node_dragged = null;\s*this\._snap_drag = null;/);
    });

    it('legacy align_to_grid (30-unit CANVAS_GRID_SIZE) behavior is untouched', () => {
        const source = read('frontend', 'public', 'litegraph.js');
        assert.match(source, /this\.align_to_grid = false; \/\/snap to grid/);
        assert.match(source, /if \(this\.graph\.config\.align_to_grid \|\| this\.align_to_grid\) \{\s*this\.node_dragged\.alignToGrid\(\);/);
    });
});

describe('grid snap (editor wiring + settings UI)', () => {
    const bootstrap = read('frontend', 'public', 'js', 'editorBootstrap.js');
    const netRender = read('frontend-app', 'src', 'features', 'settings', 'netRender.ts');
    const rendering = read('frontend-app', 'src', 'features', 'settings', 'sections', 'RenderingSection.tsx');

    it('editorBootstrap persists netsocket:gridSnap, enabled by default', () => {
        assert.match(bootstrap, /GRID_SNAP_STORAGE_KEY = "netsocket:gridSnap"/);
        assert.match(bootstrap, /if \(raw !== null\) return raw !== "false";/);
        assert.match(bootstrap, /window\.setNetsocketGridSnap[\s\S]*canvas\.snap_to_grid = !!enabled/);
        assert.match(bootstrap, /window\.getNetsocketGridSnap/);
        assert.match(bootstrap, /window\.setNetsocketGridSnap\(readStoredGridSnap\(\)\);/);
    });

    it('selection keybinds bar advertises the Ctrl-drag escape hatch', () => {
        assert.match(bootstrap, /appendKeybindItem\(\["Ctrl", "Drag"\], "Disable snap"\)/);
    });

    it('app settings bridge and Rendering section expose the toggle', () => {
        assert.match(netRender, /getNetsocketGridSnap\?: \(\) => boolean/);
        assert.match(netRender, /setNetsocketGridSnap\?: \(enabled: boolean\) => boolean/);
        assert.match(netRender, /export function getGridSnap\(\): boolean/);
        assert.match(netRender, /raw !== 'false'/);
        assert.match(netRender, /export function setGridSnap\(enabled: boolean\): boolean/);
        assert.match(rendering, /label="Grid snap"/);
        assert.match(rendering, /getGridSnap\(\)/);
        assert.match(rendering, /setGridSnap\(v\)/);
    });
});

// ---------------------------------------------------------------------------
// Behavioral: drive the real processMouseMove/processMouseUp handlers against a
// DOM-free mock canvas so the snap math (drag-start base + accumulated mouse
// offset, never per-event rounding of the live position) is actually exercised.
// ---------------------------------------------------------------------------

if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis; // getCanvasWindow() fallback inside processMouseUp
}

function makeMockCanvas() {
    const canvas = Object.create(LGraphCanvas.prototype);
    canvas.graph = new litegraph.LGraph();
    canvas.options = { skip_events: true };
    canvas.canvas = null; // clientToCanvas/adjustMouseEvent fall back to client coords
    canvas.getRenderScale = function () { return 1; };
    canvas.ds = { scale: 1, offset: [0, 0] }; // the pointer handlers only touch .scale/.offset
    canvas.render_resolution = 100;
    canvas.last_mouse = [0, 0];
    canvas.last_mouse_position = [0, 0];
    canvas.last_mouseclick = 0;
    canvas.last_mouse_dragging = true;
    canvas.mouse = [0, 0];
    canvas.graph_mouse = [0, 0];
    canvas.snap_to_grid = true;
    canvas.align_to_grid = false;
    canvas._snap_drag = null;
    canvas.selected_nodes = {};
    canvas.visible_nodes = [];
    canvas.visible_links = [];
    canvas.node_dragged = null;
    canvas.selected_group = null;
    canvas.selected_group_resizing = false;
    canvas.resizing_node = null;
    canvas.connecting_node = null;
    canvas.dragging_canvas = false;
    canvas.dragging_rectangle = null;
    canvas.node_widget = null;
    canvas.node_capturing_input = null;
    canvas.node_over = null;
    canvas.over_link_center = null;
    canvas.block_click = false;
    canvas._long_press_fired = false;
    canvas.read_only = false;
    canvas.live_mode = false;
    canvas.allow_interaction = true;
    canvas.allow_dragnodes = true;
    return canvas;
}

function makeNode(id, x, y) {
    return {
        id,
        pos: [x, y],
        size: [100, 60],
        flags: {},
        is_selected: true,
        graph: null,
        selected: true,
        mouseOver: false,
        isPointInside() { return false; },
    };
}

function makeGroup(title, x, y, nodes) {
    const group = new litegraph.LGraphGroup(title);
    group._bounding[0] = x;
    group._bounding[1] = y;
    group._nodes = nodes;
    return group;
}

function moveMouse(canvas, x, y, ctrl) {
    canvas.processMouseMove({
        clientX: x, clientY: y, button: 0, which: 1, ctrlKey: !!ctrl,
        shiftKey: false, altKey: false, preventDefault() {}, stopPropagation() {},
    });
}

function releaseMouse(canvas, x, y, ctrl) {
    canvas.processMouseUp({
        clientX: x, clientY: y, button: 0, which: 1, ctrlKey: !!ctrl,
        shiftKey: false, altKey: false, preventDefault() {}, stopPropagation() {},
    });
}

describe('grid snap drag behavior (simulated pointer events)', () => {
    it('slow sub-pitch mouse moves accumulate and land on 15-unit lines without drift', () => {
        const canvas = makeMockCanvas();
        const node = makeNode(1, 3, 3);
        canvas.node_dragged = node;
        canvas.selected_nodes[node.id] = node;

        moveMouse(canvas, 12, 12); // +12 -> raw 15 -> grid 15
        assert.deepEqual(node.pos, [15, 15]);
        moveMouse(canvas, 15, 15); // +3 (raw 18) -> stays 15, delta NOT lost
        assert.deepEqual(node.pos, [15, 15]);
        moveMouse(canvas, 18, 18); // raw 21 -> still 15
        assert.deepEqual(node.pos, [15, 15]);
        moveMouse(canvas, 21, 21); // raw 24 -> jumps to 30 (cumulative preserved)
        assert.deepEqual(node.pos, [30, 30]);

        releaseMouse(canvas, 21, 21);
        assert.deepEqual(node.pos, [30, 30]);
        assert.equal(canvas._snap_drag, null, 'accumulator dropped after the drag');
    });

    it('ctrl frees the node mid-drag; releasing re-snaps; ctrl at mouse-up keeps it off-grid', () => {
        const canvas = makeMockCanvas();
        const node = makeNode(2, 2, 2);
        canvas.node_dragged = node;
        canvas.selected_nodes[node.id] = node;

        moveMouse(canvas, 12, 12, true); // ctrl: raw 14, free placement
        assert.deepEqual(node.pos, [14, 14]);
        moveMouse(canvas, 16, 16); // ctrl released: raw 18 -> re-snap to 15
        assert.deepEqual(node.pos, [15, 15]);
        moveMouse(canvas, 24, 24, true); // ctrl again: raw 26
        assert.deepEqual(node.pos, [26, 26]);
        releaseMouse(canvas, 24, 24); // ctrl released exactly at mouse-up: 26 -> snap 30
        assert.deepEqual(node.pos, [30, 30]);
    });

    it('a still click on an off-grid node never teleports it to the grid', () => {
        const canvas = makeMockCanvas();
        const node = makeNode(3, 2, 2);
        canvas.node_dragged = node;
        canvas.selected_nodes[node.id] = node;

        releaseMouse(canvas, 0, 0);
        assert.deepEqual(node.pos, [2, 2]);
    });

    it('multi-node drags snap each node independently', () => {
        const canvas = makeMockCanvas();
        const a = makeNode(11, 3, 3);
        const b = makeNode(12, 18, 19);
        canvas.node_dragged = a;
        canvas.selected_nodes[a.id] = a;
        canvas.selected_nodes[b.id] = b;

        moveMouse(canvas, 12, 12);
        assert.deepEqual(a.pos, [15, 15]);
        assert.deepEqual(b.pos, [30, 30]); // raw 30/31 -> both snap 30
    });

    it('group drags snap the frame onto grid lines and carry member nodes rigidly', () => {
        const canvas = makeMockCanvas();
        const n1 = makeNode(21, 20, 25);
        const n2 = makeNode(22, 40, 50);
        const group = makeGroup('G', 3, 7, [n1, n2]);
        canvas.selected_group = group;

        moveMouse(canvas, 12, 12); // x: grid(15)-3=12, y: grid(19)-7=8
        assert.deepEqual(Array.from(group.pos), [15, 15]);
        assert.deepEqual(n1.pos, [32, 33]);
        assert.deepEqual(n2.pos, [52, 58]);

        moveMouse(canvas, 24, 24); // offsets 27/23 -> frame 30/30, nodes follow rigidly
        assert.deepEqual(Array.from(group.pos), [30, 30]);
        assert.deepEqual(n1.pos, [47, 48]);
        assert.deepEqual(n2.pos, [67, 73]);
        assert.deepEqual([n1.pos[0] - group.pos[0], n1.pos[1] - group.pos[1]], [17, 18]);

        releaseMouse(canvas, 24, 24);
        assert.deepEqual(Array.from(group.pos), [30, 30]);
        assert.equal(canvas._snap_drag, null);
    });

    it('ctrl group drag keeps the upstream frame-only move and suspends the snap', () => {
        const canvas = makeMockCanvas();
        const n1 = makeNode(21, 20, 25);
        const group = makeGroup('G', 3, 7, [n1]);
        canvas.selected_group = group;

        moveMouse(canvas, 12, 12, true);
        assert.deepEqual(Array.from(group.pos), [15, 19]); // raw offset, un-snapped
        assert.deepEqual(n1.pos, [20, 25]); // nodes stay behind (upstream ctrl semantics)

        releaseMouse(canvas, 12, 12, true);
        assert.deepEqual(Array.from(group.pos), [15, 19]);
        assert.deepEqual(n1.pos, [20, 25]);
    });

    it('a still click on an off-grid group keeps the legacy integer round-up, never a grid jump', () => {
        const canvas = makeMockCanvas();
        const n1 = makeNode(21, 20, 25);
        const group = makeGroup('G', 3.5, 7.25, [n1]);
        canvas.selected_group = group;

        releaseMouse(canvas, 0, 0);
        // upstream round-to-integer bookkeeping (move-diff then Math.round), NOT a snap to 0/15
        assert.deepEqual(Array.from(group.pos), [3, 8]);
    });
});
