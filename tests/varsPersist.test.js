'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('vars persistence and change hooks', () => {
    let tmpDir;
    let vars;
    let originalDataDir;

    beforeEach(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netsocket-vars-'));
        originalDataDir = process.env.DATA_DIR;
        process.env.DATA_DIR = tmpDir;
        delete require.cache[require.resolve('../server/config')];
        delete require.cache[require.resolve('../server/utils/vars')];
        vars = require('../server/utils/vars');
        vars.resetForTests();
        await vars.reloadVars();
    });

    afterEach(() => {
        vars.resetForTests();
        if (originalDataDir === undefined) delete process.env.DATA_DIR;
        else process.env.DATA_DIR = originalDataDir;
        delete require.cache[require.resolve('../server/config')];
        delete require.cache[require.resolve('../server/utils/vars')];
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch { /* ignore */ }
    });

    it('persists setVar values across a simulated restart', async () => {
        vars.setVar('porch_note', '# Hello');
        await vars.persistVars();
        const stored = JSON.parse(fs.readFileSync(path.join(tmpDir, 'vars.json'), 'utf8'));
        assert.ok(stored.some((e) => e.name === 'porch_note' && e.value === '# Hello'));

        delete require.cache[require.resolve('../server/utils/vars')];
        const reloaded = require('../server/utils/vars');
        await reloaded.reloadVars();
        assert.equal(reloaded.getVar('porch_note'), '# Hello');
        reloaded.resetForTests();
    });

    it('notifies listeners on every set and supports unsubscribe', () => {
        const seen = [];
        const off = vars.onVarsChanged((change) => seen.push(change));
        vars.setVar('a', '1');
        vars.setVar('a', '2');
        off();
        vars.setVar('a', '3');
        assert.deepEqual(seen, [{ name: 'a', value: '1' }, { name: 'a', value: '2' }]);
    });

    it('survives a throwing listener without dropping the write', () => {
        vars.onVarsChanged(() => { throw new Error('boom'); });
        vars.setVar('b', 'kept');
        assert.equal(vars.getVar('b'), 'kept');
    });

    it('coerces names and values to strings', () => {
        vars.setVar('n', 42);
        assert.equal(vars.getVar('n'), '42');
        assert.equal(vars.getVar('missing'), '');
    });
});
