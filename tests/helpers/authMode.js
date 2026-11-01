'use strict';

// Shared helper for toggling netsocket's opt-in login system inside tests.
// Login is disabled unless `--enable-auth` is in process.argv or
// NETSOCKET_ENABLE_AUTH=1, matching how the server itself starts.

const originalArgv = [...process.argv];
const ENABLE_FLAG = '--enable-auth';
const LEGACY_SKIP_FLAG = '--skip-auth';

// Drop enable/legacy-skip flags so tests never inherit a stale auth state.
const sanitizeArgv = () =>
    process.argv.filter((arg) => arg !== ENABLE_FLAG && arg !== LEGACY_SKIP_FLAG);

/** Turn login on via the CLI flag (same as starting the server with --enable-auth). */
function enableAuth() {
    process.argv = [...sanitizeArgv(), ENABLE_FLAG];
    delete process.env.NETSOCKET_ENABLE_AUTH;
}

/** Turn login on via the environment variable (the Docker/compose path). */
function enableAuthViaEnv() {
    process.argv = sanitizeArgv();
    process.env.NETSOCKET_ENABLE_AUTH = '1';
}

/** Leave login disabled — the default for fresh installs and updates. */
function disableAuth() {
    process.argv = sanitizeArgv();
    delete process.env.NETSOCKET_ENABLE_AUTH;
}

/** Simulate a stale launch config still passing the deprecated --skip-auth. */
function withLegacySkipAuth() {
    process.argv = [...sanitizeArgv(), LEGACY_SKIP_FLAG];
    delete process.env.NETSOCKET_ENABLE_AUTH;
}

module.exports = { enableAuth, enableAuthViaEnv, disableAuth, withLegacySkipAuth };
