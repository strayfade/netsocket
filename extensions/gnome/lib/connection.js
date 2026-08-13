/*
 * WebSocket client for the netsocket device-pairing protocol, structured
 * after the desktop overlay's src-tauri/src/websocket.rs (the closest
 * existing non-mobile reference implementation) and validated against
 * server/utils/deviceAuth.js's message shapes.
 *
 * Handshake: deviceHello -> deviceChallenge -> deviceAuth -> deviceStatus.
 * Once approved, all application traffic is wrapped in an "encrypted"
 * envelope (AES-256-GCM, key derived via X25519 + HKDF-SHA256). The
 * server's identity key is pinned on first connect (trust-on-first-use);
 * if it ever changes, the connection is refused rather than silently
 * trusting a new key.
 */
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';
import * as Crypto from './crypto.js';

const PING_INTERVAL_MS = 10000;
const RECONNECT_DELAY_MS = 1750;
const RECONNECT_DELAY_DENIED_MS = 15000;
const REQUEST_TIMEOUT_MS = 15000;

export const Status = Object.freeze({
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    PENDING: 'pending',
    APPROVED: 'approved',
    DENIED: 'denied',
    ERROR: 'error',
});

export class HostConnection {
    constructor(store) {
        this._store = store;
        this._session = new Soup.Session();
        this._ws = null;
        this._sessionKey = null;
        this._ecdhKeyPair = null;
        this._status = Status.DISCONNECTED;
        this._listeners = new Map();
        this._pingSourceId = 0;
        this._reconnectSourceId = 0;
        this._pendingCommands = new Map(); // conversationId -> {onAck,onReply,timeoutId}
        this._pendingRequests = new Map(); // requestId -> {resolve,reject,timeoutId}
        this._shouldRun = false;
    }

    on(event, callback) {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event).add(callback);
        return () => this._listeners.get(event)?.delete(callback);
    }

    _emit(event, ...args) {
        for (const cb of this._listeners.get(event) ?? []) {
            try {
                cb(...args);
            } catch (e) {
                logError(e, `netsocket: listener for '${event}' threw`);
            }
        }
    }

    get status() { return this._status; }

    _setStatus(status) {
        if (this._status === status) return;
        this._status = status;
        this._emit('status-changed', status);
    }

    start() {
        this._shouldRun = true;
        this._connect();
    }

    stop() {
        this._shouldRun = false;
        this._clearReconnect();
        this._clearPing();
        for (const { timeoutId } of this._pendingCommands.values()) {
            if (timeoutId) GLib.source_remove(timeoutId);
        }
        this._pendingCommands.clear();
        for (const { timeoutId, reject } of this._pendingRequests.values()) {
            if (timeoutId) GLib.source_remove(timeoutId);
            reject(new Error('connection stopped'));
        }
        this._pendingRequests.clear();
        if (this._ws) {
            try { this._ws.close(1000, 'client shutdown'); } catch (e) { /* ignore */ }
            this._ws = null;
        }
        this._sessionKey = null;
        this._setStatus(Status.DISCONNECTED);
    }

    _connect() {
        this._setStatus(Status.CONNECTING);
        const url = this._store.websocketUrl();
        let message;
        try {
            message = Soup.Message.new('GET', url);
        } catch (e) {
            this._emit('error', new Error(`invalid host URL: ${url}`));
            this._scheduleReconnect(false);
            return;
        }

        this._session.websocket_connect_async(
            message, null, [], GLib.PRIORITY_DEFAULT, null,
            (session, result) => {
                let conn;
                try {
                    conn = session.websocket_connect_finish(result);
                } catch (e) {
                    this._emit('error', e);
                    this._setStatus(Status.ERROR);
                    this._scheduleReconnect(false);
                    return;
                }
                this._onOpen(conn);
            }
        );
    }

    _onOpen(conn) {
        if (!this._shouldRun) {
            try { conn.close(1000, 'shutting down'); } catch (e) { /* ignore */ }
            return;
        }
        this._ws = conn;
        conn.connect('message', (_c, type, bytes) => this._onMessage(type, bytes));
        conn.connect('closed', () => this._onClosed());
        conn.connect('error', (_c, error) => this._emit('error', error));

        this._ecdhKeyPair = Crypto.generateEcdhKeyPair();
        const identity = this._store.getOrCreateDeviceIdentity();
        this._identity = identity;

        this._sendPlain('deviceHello', {
            deviceId: identity.deviceId,
            identityPublicKey: identity.identityPublicKey,
            ecdhPublicKey: this._ecdhKeyPair.publicKey,
            platform: 'gnome',
            name: this._store.deviceName,
        });
    }

    _onClosed() {
        this._ws = null;
        this._sessionKey = null;
        this._clearPing();
        const wasDenied = this._status === Status.DENIED;
        this._setStatus(Status.DISCONNECTED);
        this._scheduleReconnect(wasDenied);
    }

    _scheduleReconnect(wasDenied) {
        if (!this._shouldRun || this._reconnectSourceId) return;
        const delay = wasDenied ? RECONNECT_DELAY_DENIED_MS : RECONNECT_DELAY_MS;
        this._reconnectSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._reconnectSourceId = 0;
            if (this._shouldRun) this._connect();
            return GLib.SOURCE_REMOVE;
        });
    }

    _clearReconnect() {
        if (this._reconnectSourceId) {
            GLib.source_remove(this._reconnectSourceId);
            this._reconnectSourceId = 0;
        }
    }

    _clearPing() {
        if (this._pingSourceId) {
            GLib.source_remove(this._pingSourceId);
            this._pingSourceId = 0;
        }
    }

    _startPing() {
        this._clearPing();
        this._pingSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, PING_INTERVAL_MS, () => {
            this._sendApp('ping', { deviceId: this._identity?.deviceId });
            return GLib.SOURCE_CONTINUE;
        });
    }

    _sendPlain(purpose, data) {
        if (!this._ws) return;
        this._ws.send_text(JSON.stringify({ broadcastPurpose: purpose, broadcastData: data }));
    }

    /** Sends an app-level message, encrypted once approved. Queued (dropped) if not yet approved. */
    _sendApp(purpose, data, requestId) {
        if (!this._ws || !this._sessionKey) return;
        const inner = { broadcastPurpose: purpose, broadcastData: data };
        if (requestId) inner.requestId = requestId;
        const envelope = Crypto.encryptJson(this._sessionKey, inner);
        this._ws.send_text(JSON.stringify({ broadcastPurpose: 'encrypted', broadcastData: envelope }));
    }

    _onMessage(type, bytes) {
        if (type !== Soup.WebsocketDataType.TEXT) return;
        let parsed;
        try {
            parsed = JSON.parse(new TextDecoder().decode(bytes.toArray()));
        } catch (e) {
            return;
        }
        const { broadcastPurpose, broadcastData } = parsed;

        switch (broadcastPurpose) {
            case 'deviceChallenge':
                this._handleChallenge(broadcastData);
                break;
            case 'deviceStatus':
                this._handleDeviceStatus(broadcastData);
                break;
            case 'encrypted':
                this._handleEncrypted(broadcastData);
                break;
            default:
                break;
        }
    }

    _handleChallenge(data) {
        const {
            challenge, deviceId, status, serverIdentityPublicKey,
            serverEcdhPublicKey, serverSignature,
        } = data;

        const pinned = this._store.getPinnedServerKey();
        if (pinned && pinned !== serverIdentityPublicKey) {
            this._emit('error', new Error(
                'Server identity changed since last connection — refusing to connect. ' +
                'If you intentionally reinstalled the netsocket server, clear the pinned key in preferences.'));
            this._setStatus(Status.ERROR);
            try { this._ws?.close(4000, 'server identity mismatch'); } catch (e) { /* ignore */ }
            return;
        }

        const challengeMessage = Crypto.buildChallengeMessage({
            challenge,
            deviceId,
            deviceIdentityPublicKey: this._identity.identityPublicKey,
            deviceEcdhPublicKey: this._ecdhKeyPair.publicKey,
            serverIdentityPublicKey,
            serverEcdhPublicKey,
        });

        if (!Crypto.verifyDetached(challengeMessage, serverSignature, serverIdentityPublicKey)) {
            this._emit('error', new Error('Server challenge signature did not verify'));
            this._setStatus(Status.ERROR);
            try { this._ws?.close(4001, 'bad server signature'); } catch (e) { /* ignore */ }
            return;
        }

        if (!pinned) this._store.setPinnedServerKey(serverIdentityPublicKey);

        const sharedSecret = Crypto.ecdh(this._ecdhKeyPair.secretKey, serverEcdhPublicKey);
        this._sessionKey = Crypto.hkdfSha256(sharedSecret, Crypto.base64Decode(challenge));

        const signature = Crypto.signDetached(challengeMessage, this._identity.identitySecretKey);
        this._sendPlain('deviceAuth', { signature });

        this._setStatus(status === 'approved' ? Status.APPROVED : Status.PENDING);
    }

    _handleDeviceStatus(data) {
        const { status } = data;
        if (status === 'approved') {
            this._setStatus(Status.APPROVED);
            this._startPing();
        } else if (status === 'denied') {
            this._setStatus(Status.DENIED);
            try { this._ws?.close(4403, 'denied'); } catch (e) { /* ignore */ }
        } else {
            this._setStatus(Status.PENDING);
        }
    }

    _handleEncrypted(envelope) {
        if (!this._sessionKey) return;
        let inner;
        try {
            inner = Crypto.decryptJson(this._sessionKey, envelope);
        } catch (e) {
            logError(e, 'netsocket: failed to decrypt incoming message');
            return;
        }
        const { broadcastPurpose, broadcastData, requestId } = inner;

        if (requestId && this._pendingRequests.has(requestId)) {
            const { resolve, timeoutId } = this._pendingRequests.get(requestId);
            this._pendingRequests.delete(requestId);
            if (timeoutId) GLib.source_remove(timeoutId);
            resolve(broadcastData);
            return;
        }

        switch (broadcastPurpose) {
            case 'ack':
                this._handleAck(inner);
                break;
            case 'overlay':
                this._handleOverlay(broadcastData);
                break;
            case 'pong':
                break;
            default:
                this._emit('app-message', broadcastPurpose, broadcastData);
                break;
        }
    }

    _handleAck(inner) {
        const conversationId = inner.conversationId ?? inner.broadcastData?.conversationId;
        const pending = this._pendingCommands.get(conversationId);
        if (pending?.onAck) pending.onAck();
    }

    _handleOverlay(data) {
        const text = typeof data === 'string' ? data : data?.text;
        const conversationId = typeof data === 'object' ? data?.conversationId : null;
        const deviceId = typeof data === 'object' ? data?.deviceId : null;

        let pending = conversationId ? this._pendingCommands.get(conversationId) : null;
        if (!pending && !conversationId && deviceId && deviceId === this._identity?.deviceId) {
            // Fall back to the single most recent pending command when the
            // server didn't echo a conversationId, matching Android's
            // alertTargetsDevice behaviour.
            const [only] = this._pendingCommands.values();
            pending = only;
        }
        if (pending) {
            if (pending.timeoutId) GLib.source_remove(pending.timeoutId);
            this._pendingCommands.delete(conversationId ?? [...this._pendingCommands.keys()][0]);
            pending.onReply?.(text);
        } else {
            this._emit('unsolicited-reply', text);
        }
    }

    // ---- Public API ----

    /** Sends a chat/command-palette message. Callbacks fire on ack / reply / timeout. */
    sendCommand(text, { onAck, onReply, onTimeout } = {}) {
        const conversationId = this._store.getOrCreateConversationId();
        const deviceId = this._identity?.deviceId;
        const timeoutSeconds = this._store.responseTimeoutSeconds;

        const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeoutSeconds * 1000, () => {
            this._pendingCommands.delete(conversationId);
            onTimeout?.();
            return GLib.SOURCE_REMOVE;
        });

        this._pendingCommands.set(conversationId, { onAck, onReply, timeoutId });
        this._sendApp('command', { command: text, conversationId, deviceId });
    }

    _request(purpose, data = {}) {
        return new Promise((resolve, reject) => {
            if (this._status !== Status.APPROVED) {
                reject(new Error('not connected'));
                return;
            }
            const requestId = GLib.uuid_string_random();
            const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REQUEST_TIMEOUT_MS, () => {
                this._pendingRequests.delete(requestId);
                reject(new Error('request timed out'));
                return GLib.SOURCE_REMOVE;
            });
            this._pendingRequests.set(requestId, { resolve, reject, timeoutId });
            this._sendApp(purpose, data, requestId);
        });
    }

    getOtpAccounts() {
        return this._request('getOtpAccounts');
    }

    reorderOtpAccounts(keys) {
        return this._request('reorderOtpAccounts', { keys });
    }

    importOtpFromQr(payloads) {
        return this._request('importOtpFromQr', { payloads });
    }
}
