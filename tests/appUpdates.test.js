'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const appUpdates = require('../server/manager/appUpdates');

const mockRes = () => {
    const res = {
        statusCode: null,
        headers: {},
        body: undefined,
        downloadPath: null,
        downloadName: null,
        status(code) {
            res.statusCode = code;
            return res;
        },
        type(value) {
            res.headers['content-type'] = value;
            return res;
        },
        send(payload) {
            res.body = payload;
            return res;
        },
        json(payload) {
            res.body = payload;
            return res;
        },
        sendStatus(code) {
            res.statusCode = code;
            return res;
        },
        setHeader(name, value) {
            res.headers[name] = value;
        },
        download(filePath, fileName, callback) {
            res.downloadPath = filePath;
            res.downloadName = fileName;
            res.statusCode = 200;
            if (typeof callback === 'function') callback(null);
            return res;
        },
    };
    return res;
};

describe('appUpdates', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netsocket-updates-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const writeArtifact = (dir, name, content) => {
        const full = path.join(dir, name);
        fs.writeFileSync(full, content);
        return full;
    };

    const overridesFor = (extra = {}) => ({
        overlayInstallerPath: path.join(tmpDir, 'missing-overlay.exe'),
        overlayPackageJsonPath: path.join(tmpDir, 'missing-package.json'),
        androidGradlePath: path.join(tmpDir, 'missing.gradle.kts'),
        androidDistDir: path.join(tmpDir, 'missing-dist'),
        ...extra,
    });

    it('accepts only the overlay and android platforms', () => {
        assert.equal(appUpdates.isSupportedPlatform('overlay'), true);
        assert.equal(appUpdates.isSupportedPlatform('android'), true);
        assert.equal(appUpdates.isSupportedPlatform('ios'), false);
        assert.equal(appUpdates.isSupportedPlatform(''), false);
        assert.equal(appUpdates.isSupportedPlatform(undefined), false);
    });

    it('converts semver to a comparable version code', () => {
        assert.ok(appUpdates.semverToCode('1.0.1') > appUpdates.semverToCode('1.0.0'));
        assert.ok(appUpdates.semverToCode('1.10.0') > appUpdates.semverToCode('1.9.9'));
        assert.ok(appUpdates.semverToCode('2.0.0') > appUpdates.semverToCode('1.99.99'));
        assert.equal(appUpdates.semverToCode('1.0.0'), 10000);
    });

    it('reads the overlay version from package.json', () => {
        const pkg = writeArtifact(tmpDir, 'package.json', JSON.stringify({ version: '2.3.4' }));
        assert.deepEqual(
            appUpdates.resolveVersion('overlay', overridesFor({ overlayPackageJsonPath: pkg })),
            { version: '2.3.4', versionCode: 20304 }
        );
    });

    it('parses the android version from build.gradle.kts', () => {
        const gradle = writeArtifact(
            tmpDir,
            'build.gradle.kts',
            'android {\n    defaultConfig {\n        versionCode = 42\n        versionName = "3.1.0"\n    }\n}\n'
        );
        assert.deepEqual(
            appUpdates.resolveVersion('android', overridesFor({ androidGradlePath: gradle })),
            { version: '3.1.0', versionCode: 42 }
        );
    });

    it('falls back to 0.0.0 when version sources are missing', () => {
        assert.deepEqual(appUpdates.resolveVersion('overlay', overridesFor()), {
            version: '0.0.0',
            versionCode: 0,
        });
        assert.deepEqual(appUpdates.resolveVersion('android', overridesFor()), {
            version: '0.0.0',
            versionCode: 0,
        });
    });

    it('prefers the canonical APK name, then the newest apk in dist', () => {
        const dist = path.join(tmpDir, 'dist');
        fs.mkdirSync(dist);
        const oldApk = writeArtifact(dist, 'old.apk', 'old-bytes');
        const oldTime = new Date(Date.now() - 60000);
        fs.utimesSync(oldApk, oldTime, oldTime);
        writeArtifact(dist, 'new.apk', 'new-bytes');

        const fallback = appUpdates.resolveAndroidArtifact(
            overridesFor({ androidDistDir: dist })
        );
        assert.equal(fallback.fileName, 'new.apk');

        const canonical = writeArtifact(dist, 'netsocket-android.apk', 'canonical-bytes');
        const resolved = appUpdates.resolveAndroidArtifact(
            overridesFor({ androidDistDir: dist })
        );
        assert.equal(resolved.filePath, canonical);
        assert.equal(resolved.fileName, 'netsocket-android.apk');
    });

    it('ignores empty files when resolving artifacts', () => {
        const dist = path.join(tmpDir, 'dist');
        fs.mkdirSync(dist);
        writeArtifact(dist, 'netsocket-android.apk', '');
        assert.equal(
            appUpdates.resolveAndroidArtifact(overridesFor({ androidDistDir: dist })),
            null
        );
    });

    it('builds a manifest with size, hash, and download url', () => {
        const apk = writeArtifact(dist_mkdir(tmpDir), 'netsocket-android.apk', 'apk-bytes-here');
        const gradle = writeArtifact(
            tmpDir,
            'build.gradle.kts',
            'versionCode = 7\nversionName = "1.2.0"\n'
        );
        const manifest = appUpdates.buildUpdateManifest(
            'android',
            overridesFor({
                androidDistDir: path.dirname(apk),
                androidGradlePath: gradle,
            })
        );
        const expectedHash = crypto.createHash('sha256').update('apk-bytes-here').digest('hex');
        assert.equal(manifest.platform, 'android');
        assert.equal(manifest.version, '1.2.0');
        assert.equal(manifest.versionCode, 7);
        assert.equal(manifest.fileName, 'netsocket-android.apk');
        assert.equal(manifest.size, Buffer.byteLength('apk-bytes-here'));
        assert.equal(manifest.sha256, expectedHash);
        assert.equal(manifest.url, '/v1/updates/android/download');
        assert.ok(Date.parse(manifest.updatedAt) > 0);
    });

    it('returns null manifests for unknown platforms or missing artifacts', () => {
        assert.equal(appUpdates.buildUpdateManifest('ios', overridesFor()), null);
        assert.equal(appUpdates.buildUpdateManifest('overlay', overridesFor()), null);
        assert.equal(appUpdates.buildUpdateManifest('android', overridesFor()), null);
    });

    it('serves manifests with no-store and 404s unknown platforms', () => {
        const unknown = mockRes();
        appUpdates.handleGetUpdateManifest({ params: { platform: 'ios' } }, unknown);
        assert.equal(unknown.statusCode, 404);

        const missing = mockRes();
        appUpdates.handleGetUpdateManifest(
            { params: { platform: 'android' } },
            missing,
            overridesFor()
        );
        assert.equal(missing.statusCode, 404);

        const apk = writeArtifact(dist_mkdir(tmpDir), 'netsocket-android.apk', 'apk!');
        const ok = mockRes();
        appUpdates.handleGetUpdateManifest(
            { params: { platform: 'android' } },
            ok,
            overridesFor({ androidDistDir: path.dirname(apk) })
        );
        assert.equal(ok.statusCode, 200);
        assert.equal(ok.headers['Cache-Control'], 'no-store');
        assert.equal(ok.body.platform, 'android');
        assert.equal(ok.body.url, '/v1/updates/android/download');
    });

    it('downloads artifacts by platform and 404s when absent', () => {
        const ok = mockRes();
        const apk = writeArtifact(dist_mkdir(tmpDir), 'netsocket-android.apk', 'apk!');
        appUpdates.handleDownloadUpdateArtifact(
            { params: { platform: 'android' } },
            ok,
            () => {},
            overridesFor({ androidDistDir: path.dirname(apk) })
        );
        assert.equal(ok.statusCode, 200);
        assert.equal(ok.downloadPath, apk);
        assert.equal(ok.downloadName, 'netsocket-android.apk');

        const missing = mockRes();
        appUpdates.handleDownloadUpdateArtifact(
            { params: { platform: 'android' } },
            missing,
            () => {},
            overridesFor()
        );
        assert.equal(missing.statusCode, 404);

        const unknown = mockRes();
        appUpdates.handleDownloadUpdateArtifact(
            { params: { platform: 'nope' } },
            unknown,
            () => {},
            overridesFor()
        );
        assert.equal(unknown.statusCode, 404);
    });

    it('exposes the session-gated android browser download', () => {
        const ok = mockRes();
        const apk = writeArtifact(dist_mkdir(tmpDir), 'netsocket-android.apk', 'apk!');
        appUpdates.handleDownloadAndroid(
            {},
            ok,
            () => {},
            overridesFor({ androidDistDir: path.dirname(apk) })
        );
        assert.equal(ok.statusCode, 200);
        assert.equal(ok.downloadPath, apk);

        const missing = mockRes();
        appUpdates.handleDownloadAndroid({}, missing, () => {}, overridesFor());
        assert.equal(missing.statusCode, 404);
    });
});

function dist_mkdir(root) {
    const dist = path.join(root, `dist-${Math.random().toString(16).slice(2)}`);
    fs.mkdirSync(dist, { recursive: true });
    return dist;
}
