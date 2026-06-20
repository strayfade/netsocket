'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

function loadSaveStateFresh(dataDir) {
    process.env.DATA_DIR = dataDir;
    delete require.cache[require.resolve('../server/config')];
    delete require.cache[require.resolve('../server/manager/saveState')];
    return require('../server/manager/saveState');
}

describe('saveState backup restore', () => {
    let tmpDir;

    before(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'netsocket-restore-'));
        const backupDir = path.join(tmpDir, '_backups', 'snapshot-test');
        await fs.mkdir(backupDir, { recursive: true });
        await fs.writeFile(
            path.join(backupDir, 'state.json'),
            JSON.stringify({
                nodes: {
                    last_node_id: 1,
                    last_link_id: 0,
                    nodes: [{ id: 1, type: 'test/node', pos: [0, 0] }],
                    links: [],
                    groups: [],
                    config: {},
                    extra: {},
                    version: 0.4,
                },
                currentValues: [],
            }),
            'utf-8'
        );
        await fs.writeFile(path.join(backupDir, 'users.json'), '[]', 'utf-8');
        await fs.writeFile(path.join(backupDir, 'credentials.json'), '{"usernameHash":"x","passwordHash":"y"}', 'utf-8');
        await fs.writeFile(path.join(tmpDir, 'users.json'), JSON.stringify([{ ts: 1, tk: 'live-session' }]), 'utf-8');
        await fs.writeFile(path.join(tmpDir, 'credentials.json'), '{"usernameHash":"live","passwordHash":"live"}', 'utf-8');
        await fs.writeFile(path.join(tmpDir, 'state.json'), '[]', 'utf-8');
    });

    after(async () => {
        delete process.env.DATA_DIR;
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('does not overwrite live sessions when restoring graph JSON from snapshots', async () => {
        const mod = loadSaveStateFresh(tmpDir);
        await mod.populateNodes();
        const users = JSON.parse(await fs.readFile(path.join(tmpDir, 'users.json'), 'utf-8'));
        const creds = await fs.readFile(path.join(tmpDir, 'credentials.json'), 'utf-8');
        assert.deepEqual(users, [{ ts: 1, tk: 'live-session' }]);
        assert.match(creds, /"live"/);
    });
});
