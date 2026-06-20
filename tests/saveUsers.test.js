'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

function loadSaveUsersFresh(dataDir) {
    process.env.DATA_DIR = dataDir;
    delete require.cache[require.resolve('../server/config')];
    delete require.cache[require.resolve('../server/manager/saveUsers')];
    return require('../server/manager/saveUsers');
}

describe('saveUsers persistence', () => {
    let tmpDir;

    before(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'netsocket-users-'));
    });

    after(async () => {
        delete process.env.DATA_DIR;
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('loads sessions from disk on populateUsers', async () => {
        const usersPath = path.join(tmpDir, 'users.json');
        const stored = [{ ts: 1_700_000_000_000, tk: 'persisted-token' }];
        await fs.writeFile(usersPath, JSON.stringify(stored), 'utf-8');

        const mod = loadSaveUsersFresh(tmpDir);
        await mod.populateUsers();
        assert.deepEqual(mod.getUsers(), stored);
    });

    it('does not wipe on-disk sessions on shutdown flush with empty memory', async () => {
        const usersPath = path.join(tmpDir, 'users.json');
        const stored = [{ ts: 1_700_000_000_000, tk: 'keep-me' }];
        await fs.writeFile(usersPath, JSON.stringify(stored), 'utf-8');

        const mod = loadSaveUsersFresh(tmpDir);
        await mod.populateUsers();
        mod.setUsers([]);
        mod.flushUsersSync();

        const onDisk = JSON.parse(await fs.readFile(usersPath, 'utf-8'));
        assert.deepEqual(onDisk, stored);
    });

    it('persists sessions across a simulated server restart', async () => {
        const mod = loadSaveUsersFresh(tmpDir);
        await mod.populateUsers();
        const session = { ts: Date.now(), tk: 'restart-survivor' };
        mod.setUsers([session]);
        mod.flushUsersSync({ allowEmpty: true });

        const restarted = loadSaveUsersFresh(tmpDir);
        await restarted.populateUsers();
        assert.equal(restarted.getUsers().length, 1);
        assert.equal(restarted.getUsers()[0].tk, session.tk);
    });

    it('does not overwrite disk before populateUsers completes', async () => {
        const usersPath = path.join(tmpDir, 'users.json');
        const stored = [{ ts: 1_700_000_000_000, tk: 'must-not-be-wiped' }];
        await fs.writeFile(usersPath, JSON.stringify(stored), 'utf-8');

        const mod = loadSaveUsersFresh(tmpDir);
        mod.setUsers([]);
        await new Promise((r) => setTimeout(r, 150));

        const onDiskBeforeLoad = JSON.parse(await fs.readFile(usersPath, 'utf-8'));
        assert.deepEqual(onDiskBeforeLoad, stored);

        await mod.populateUsers();
        assert.deepEqual(mod.getUsers(), stored);
    });

    it('does not overwrite disk when the sessions file is corrupt', async () => {
        const usersPath = path.join(tmpDir, 'users.json');
        await fs.writeFile(usersPath, '{not-json', 'utf-8');

        const mod = loadSaveUsersFresh(tmpDir);
        await mod.populateUsers();

        const onDisk = await fs.readFile(usersPath, 'utf-8');
        assert.equal(onDisk, '{not-json');
        assert.deepEqual(mod.getUsers(), []);
    });
});
