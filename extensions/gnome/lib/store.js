/*
 * Settings + local state for the netsocket extension, mirroring the
 * relevant subset of the Android app's Prefs.kt (host/port/https, response
 * timeout, device identity, TOFU-pinned server key, conversation id, and a
 * local OTP cache for offline use). Notification-forwarding-only prefs are
 * intentionally not ported.
 *
 * User-facing prefs (host, port, etc.) live in GSettings (org.gnome.shell.
 * extensions.netsocket, editable from the Preferences window). Device
 * identity / pin / conversation id / OTP cache are local-only state, not
 * meant to be hand-edited, so they live in a JSON file under
 * ~/.config/netsocket-gnome/. The Ed25519 secret key is kept in the
 * user's keyring via libsecret when available, falling back to the state
 * file (with a warning) if libsecret isn't usable.
 */
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Crypto from './crypto.js';

let Secret = null;
try {
    Secret = (await import('gi://Secret')).default;
} catch (e) {
    Secret = null;
}

const STATE_DIR = GLib.build_filenamev([GLib.get_user_config_dir(), 'netsocket-gnome']);
const STATE_FILE = GLib.build_filenamev([STATE_DIR, 'state.json']);

const SECRET_SCHEMA = Secret
    ? new Secret.Schema('org.gnome.shell.extensions.netsocket.DeviceKey', Secret.SchemaFlags.NONE, {
          'device-id': Secret.SchemaAttributeType.STRING,
      })
    : null;

function readJsonFile(path) {
    try {
        const [ok, contents] = GLib.file_get_contents(path);
        if (!ok) return null;
        return JSON.parse(new TextDecoder().decode(contents));
    } catch (e) {
        return null;
    }
}

function writeJsonFile(path, obj) {
    GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o700);
    const bytes = new TextEncoder().encode(JSON.stringify(obj, null, 2));
    GLib.file_set_contents(path, bytes);
    // best-effort: keep local state file user-readable-only
    try {
        Gio.File.new_for_path(path).set_attribute_uint32(
            Gio.FILE_ATTRIBUTE_UNIX_MODE, 0o600, Gio.FileQueryInfoFlags.NONE, null);
    } catch (e) { /* not fatal on non-POSIX or restricted filesystems */ }
}

export class NetsocketStore {
    constructor(extensionObject) {
        this._extension = extensionObject;
        this._gsettings = extensionObject.getSettings();
        this._state = readJsonFile(STATE_FILE) || {};
    }

    _saveState() {
        writeJsonFile(STATE_FILE, this._state);
    }

    // ---- GSettings-backed preferences ----

    get host() { return this._gsettings.get_string('host'); }
    set host(v) { this._gsettings.set_string('host', v); }

    get port() { return this._gsettings.get_int('port'); }
    set port(v) { this._gsettings.set_int('port', v); }

    get useHttps() { return this._gsettings.get_boolean('use-https'); }
    set useHttps(v) { this._gsettings.set_boolean('use-https', v); }

    get responseTimeoutSeconds() { return this._gsettings.get_int('response-timeout-seconds'); }
    set responseTimeoutSeconds(v) { this._gsettings.set_int('response-timeout-seconds', v); }

    get deviceName() {
        return this._gsettings.get_string('device-name') || GLib.get_host_name();
    }
    set deviceName(v) { this._gsettings.set_string('device-name', v); }

    get notifyOnReply() { return this._gsettings.get_boolean('notify-on-reply'); }
    set notifyOnReply(v) { this._gsettings.set_boolean('notify-on-reply', v); }

    connectSettingsChanged(callback) {
        return this._gsettings.connect('changed', callback);
    }

    disconnectSettingsChanged(id) {
        this._gsettings.disconnect(id);
    }

    // ---- URL construction, mirrors Prefs.kt normalizeHost/resolvePort ----

    _normalizedHost() {
        return this.host.trim().replace(/^\w+:\/\//, '').replace(/\/+$/, '');
    }

    _portSuffix() {
        const port = this.port;
        const defaultPort = this.useHttps ? 443 : 80;
        if (!port || port === defaultPort) return '';
        return `:${port}`;
    }

    websocketUrl() {
        const scheme = this.useHttps ? 'wss' : 'ws';
        return `${scheme}://${this._normalizedHost()}${this._portSuffix()}/`;
    }

    siteUrl() {
        const scheme = this.useHttps ? 'https' : 'http';
        return `${scheme}://${this._normalizedHost()}${this._portSuffix()}/`;
    }

    // ---- Device identity (Ed25519, generated once) ----

    getOrCreateDeviceIdentity() {
        if (this._state.deviceId && this._state.identityPublicKey) {
            const secretKey = this._loadSecretKey(this._state.deviceId);
            if (secretKey) {
                return {
                    deviceId: this._state.deviceId,
                    identityPublicKey: this._state.identityPublicKey,
                    identitySecretKey: secretKey,
                };
            }
        }

        const deviceId = GLib.uuid_string_random();
        const { publicKey, secretKey } = Crypto.generateIdentityKeyPair();
        this._state.deviceId = deviceId;
        this._state.identityPublicKey = publicKey;
        this._storeSecretKey(deviceId, secretKey);
        this._saveState();

        return { deviceId, identityPublicKey: publicKey, identitySecretKey: secretKey };
    }

    _storeSecretKey(deviceId, secretKeyB64) {
        if (Secret) {
            try {
                Secret.password_store_sync(
                    SECRET_SCHEMA,
                    { 'device-id': deviceId },
                    Secret.COLLECTION_DEFAULT,
                    'Netsocket device identity key',
                    secretKeyB64,
                    null
                );
                return;
            } catch (e) {
                logError(e, 'netsocket: libsecret store failed, falling back to state file');
            }
        }
        // Fallback: keep it in the 0600 state file. Not as good as the
        // keyring, but still local-only and not world-readable.
        this._state.identitySecretKeyFallback = secretKeyB64;
    }

    _loadSecretKey(deviceId) {
        if (Secret) {
            try {
                const pw = Secret.password_lookup_sync(SECRET_SCHEMA, { 'device-id': deviceId }, null);
                if (pw) return pw;
            } catch (e) {
                logError(e, 'netsocket: libsecret lookup failed, checking state file fallback');
            }
        }
        return this._state.identitySecretKeyFallback || null;
    }

    // ---- TOFU-pinned server identity key ----

    getPinnedServerKey() {
        return this._state.pinnedServerIdentityPublicKey || null;
    }

    setPinnedServerKey(publicKeyB64) {
        this._state.pinnedServerIdentityPublicKey = publicKeyB64;
        this._saveState();
    }

    clearPinnedServerKey() {
        delete this._state.pinnedServerIdentityPublicKey;
        this._saveState();
    }

    // ---- Conversation id (sticky agent session) ----

    getOrCreateConversationId() {
        if (!this._state.conversationId) {
            this._state.conversationId = GLib.uuid_string_random();
            this._saveState();
        }
        return this._state.conversationId;
    }

    resetConversationId() {
        this._state.conversationId = GLib.uuid_string_random();
        this._saveState();
        return this._state.conversationId;
    }

    // ---- Local OTP cache (offline fallback, mirrors otp_accounts.json) ----

    getOtpCache() {
        return this._state.otpAccounts || [];
    }

    setOtpCache(accounts) {
        this._state.otpAccounts = accounts;
        this._saveState();
    }
}
