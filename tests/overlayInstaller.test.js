'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const {
    INSTALLER_FILENAME,
    INSTALLER_PATH,
    overlayInstallerAvailable,
} = require('../server/manager/overlayInstaller');

describe('overlay installer', () => {
    it('ships a Windows executable the web UI can download', () => {
        assert.equal(INSTALLER_FILENAME, 'netsocket-overlay-setup.exe');
        assert.equal(overlayInstallerAvailable(), true);
        const header = Buffer.alloc(2);
        const fd = fs.openSync(INSTALLER_PATH, 'r');
        try {
            fs.readSync(fd, header, 0, 2, 0);
        } finally {
            fs.closeSync(fd);
        }
        assert.equal(header.toString('ascii'), 'MZ');
    });
});
