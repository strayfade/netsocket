'use strict';

/**
 * Over-the-air update metadata for the Tauri desktop overlay and the
 * Android companion app.
 *
 * Both clients self-update quietly overnight when their
 * "Automatic updates" toggle is on:
 * - the overlay polls `GET /v1/updates/overlay` (or the `getUpdateInfo`
 *   device-socket purpose) and silently reinstalls during quiet hours,
 * - the Android app polls `GET /v1/updates/android` from a nightly
 *   WorkManager job and commits the APK via PackageInstaller.
 *
 * The JSON manifests and artifact downloads under `/v1/updates/*` are
 * intentionally public (no session cookie): background updaters run
 * without a browser session. Manual browser downloads stay
 * session-gated under `/downloads/*`.
 */

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const {
    INSTALLER_FILENAME: OVERLAY_INSTALLER_FILENAME,
    INSTALLER_PATH: OVERLAY_INSTALLER_PATH,
} = require('./overlayInstaller.js')

const SUPPORTED_PLATFORMS = new Set(['overlay', 'android'])

const ANDROID_APK_FILENAME = 'netsocket-android.apk'
const ANDROID_DIST_DIR = path.join(__dirname, '../../extensions/android/dist')
const OVERLAY_PACKAGE_JSON = path.join(__dirname, '../../extensions/overlay/package.json')
const ANDROID_GRADLE_FILE = path.join(
    __dirname,
    '../../extensions/android/app/build.gradle.kts'
)

const isSupportedPlatform = (platform) => SUPPORTED_PLATFORMS.has(platform)

const safeStatSync = (filePath) => {
    try {
        const stat = fs.statSync(filePath)
        if (stat.isFile() && stat.size > 0) return stat
    } catch {
        // Missing artifact: callers treat this as "no update available".
    }
    return null
}

/** Newest `*.apk` in a directory (by mtime), or null. */
const findNewestApkSync = (distDir) => {
    let entries = []
    try {
        entries = fs.readdirSync(distDir)
    } catch {
        return null
    }
    let newest = null
    for (const entry of entries) {
        if (!entry.toLowerCase().endsWith('.apk')) continue
        const full = path.join(distDir, entry)
        const stat = safeStatSync(full)
        if (!stat) continue
        if (!newest || stat.mtimeMs > newest.stat.mtimeMs) {
            newest = { fileName: entry, filePath: full, stat }
        }
    }
    return newest
}

const resolveOverlayArtifact = (overrides = {}) => {
    const filePath = overrides.overlayInstallerPath || OVERLAY_INSTALLER_PATH
    const stat = safeStatSync(filePath)
    if (!stat) return null
    return {
        fileName: overrides.overlayInstallerFileName || OVERLAY_INSTALLER_FILENAME,
        filePath,
        stat,
    }
}

const resolveAndroidArtifact = (overrides = {}) => {
    const distDir = overrides.androidDistDir || ANDROID_DIST_DIR
    const canonical = path.join(
        distDir,
        overrides.androidApkFileName || ANDROID_APK_FILENAME
    )
    const canonicalStat = safeStatSync(canonical)
    if (canonicalStat) {
        return {
            fileName: path.basename(canonical),
            filePath: canonical,
            stat: canonicalStat,
        }
    }
    return findNewestApkSync(distDir)
}

const resolveArtifact = (platform, overrides = {}) => {
    if (platform === 'overlay') return resolveOverlayArtifact(overrides)
    if (platform === 'android') return resolveAndroidArtifact(overrides)
    return null
}

const readJsonVersionSync = (packageJsonPath) => {
    try {
        const raw = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
        if (typeof raw.version === 'string' && raw.version.trim()) {
            return raw.version.trim()
        }
    } catch {
        // Fall through to the default below.
    }
    return '0.0.0'
}

/** `1.2.3` -> 10203 so numeric comparisons work for the overlay too. */
const semverToCode = (version) => {
    const parts = String(version || '')
        .split('.')
        .map((part) => parseInt(String(part).trim(), 10))
    const major = Number.isInteger(parts[0]) ? parts[0] : 0
    const minor = Number.isInteger(parts[1]) ? parts[1] : 0
    const patch = Number.isInteger(parts[2]) ? parts[2] : 0
    return major * 10000 + minor * 100 + patch
}

const parseAndroidGradleVersionSync = (gradlePath) => {
    let text = ''
    try {
        text = fs.readFileSync(gradlePath, 'utf8')
    } catch {
        return { version: '0.0.0', versionCode: 0 }
    }
    const nameMatch = text.match(/versionName\s*=\s*"([^"]+)"/)
    const codeMatch = text.match(/versionCode\s*=\s*(\d+)/)
    return {
        version: nameMatch ? nameMatch[1].trim() : '0.0.0',
        versionCode: codeMatch ? parseInt(codeMatch[1], 10) : 0,
    }
}

const resolveVersion = (platform, overrides = {}) => {
    if (platform === 'overlay') {
        const version = readJsonVersionSync(
            overrides.overlayPackageJsonPath || OVERLAY_PACKAGE_JSON
        )
        return { version, versionCode: semverToCode(version) }
    }
    if (platform === 'android') {
        return parseAndroidGradleVersionSync(
            overrides.androidGradlePath || ANDROID_GRADLE_FILE
        )
    }
    return { version: '0.0.0', versionCode: 0 }
}

const sha256OfFileSync = (filePath) => {
    const hash = crypto.createHash('sha256')
    const fd = fs.openSync(filePath, 'r')
    try {
        const chunk = Buffer.alloc(1024 * 1024)
        let bytesRead = 0
        do {
            bytesRead = fs.readSync(fd, chunk, 0, chunk.length, null)
            if (bytesRead > 0) hash.update(chunk.subarray(0, bytesRead))
        } while (bytesRead > 0)
    } finally {
        fs.closeSync(fd)
    }
    return hash.digest('hex')
}

/**
 * Build the public update manifest for a platform, or null when no
 * artifact is available (clients treat null/404 as "nothing to install").
 */
const buildUpdateManifest = (platform, overrides = {}) => {
    if (!isSupportedPlatform(platform)) return null
    const artifact = resolveArtifact(platform, overrides)
    if (!artifact) return null
    const { version, versionCode } = resolveVersion(platform, overrides)
    return {
        platform,
        version,
        versionCode,
        fileName: artifact.fileName,
        size: artifact.stat.size,
        sha256: sha256OfFileSync(artifact.filePath),
        updatedAt: artifact.stat.mtime.toISOString(),
        url: `/v1/updates/${platform}/download`,
        notes: '',
    }
}

const handleGetUpdateManifest = (req, res, overrides = {}) => {
    const platform = req.params?.platform
    if (!isSupportedPlatform(platform)) {
        return res.status(404).type('text/plain').send('Unknown update platform.')
    }
    const manifest = buildUpdateManifest(platform, overrides)
    if (!manifest) {
        return res.status(404).type('text/plain').send('No update available.')
    }
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(manifest)
}

const sendArtifactDownload = (res, artifact, logFn) => {
    res.setHeader('Cache-Control', 'no-store')
    return res.download(artifact.filePath, artifact.fileName, (error) => {
        if (!error || res.headersSent) return
        if (error.code === 'ENOENT') {
            return res.status(404).type('text/plain').send('Update artifact is not available.')
        }
        if (typeof logFn === 'function') logFn(`app-update-download: ${error}`)
        return res.sendStatus(500)
    })
}

const handleDownloadUpdateArtifact = (req, res, logFn, overrides = {}) => {
    const platform = req.params?.platform
    if (!isSupportedPlatform(platform)) {
        return res.status(404).type('text/plain').send('Unknown update platform.')
    }
    const artifact = resolveArtifact(platform, overrides)
    if (!artifact) {
        return res.status(404).type('text/plain').send('Update artifact is not available.')
    }
    return sendArtifactDownload(res, artifact, logFn)
}

/** Session-gated browser download of the Android APK (mirrors the overlay). */
const handleDownloadAndroid = (req, res, logFn, overrides = {}) => {
    const artifact = resolveAndroidArtifact(overrides)
    if (!artifact) {
        return res.status(404).type('text/plain').send('Android app is not available.')
    }
    return sendArtifactDownload(res, artifact, logFn)
}

module.exports = {
    SUPPORTED_PLATFORMS: ['overlay', 'android'],
    ANDROID_APK_FILENAME,
    ANDROID_DIST_DIR,
    isSupportedPlatform,
    resolveOverlayArtifact,
    resolveAndroidArtifact,
    resolveArtifact,
    resolveVersion,
    semverToCode,
    sha256OfFileSync,
    buildUpdateManifest,
    handleGetUpdateManifest,
    handleDownloadUpdateArtifact,
    handleDownloadAndroid,
}
