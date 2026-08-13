/*
 * Text-only command palette window (voice intentionally out of scope).
 * Mirrors the Android app's chat screen / ConversationRepository state
 * machine: send -> local echo -> "ack" from host -> async "overlay" reply
 * matched by conversationId, or a client-side timeout.
 *
 * Slash commands (/settings, /otp, /clear, /?) are handled entirely
 * client-side via lib/slashCommands.js and never touch the network.
 */
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import { ModalDialog } from 'resource:///org/gnome/shell/ui/modalDialog.js';
import { Status } from '../lib/connection.js';
import { isSlashCommand, runSlashCommand } from '../lib/slashCommands.js';

const STATUS_LABEL = {
    [Status.DISCONNECTED]: 'Disconnected',
    [Status.CONNECTING]: 'Connecting…',
    [Status.PENDING]: 'Waiting for approval in the dashboard…',
    [Status.APPROVED]: 'Connected',
    [Status.DENIED]: 'Device denied — check Settings → Devices on the host',
    [Status.ERROR]: 'Connection error',
};

export const CommandPaletteDialog = GObject.registerClass(
class CommandPaletteDialog extends ModalDialog {
    _init(connection, store, actions = {}) {
        super._init({ styleClass: 'netsocket-dialog', destroyOnClose: true });

        this._connection = connection;
        this._store = store;
        this._actions = actions;

        const root = new St.BoxLayout({
            vertical: true,
            style_class: 'netsocket-command-palette',
            width: 520,
            height: 600,
        });

        this._statusLabel = new St.Label({
            style_class: 'netsocket-status-label',
            text: STATUS_LABEL[connection.status] ?? '',
        });
        root.add_child(this._statusLabel);

        this._scrollView = new St.ScrollView({
            style_class: 'netsocket-message-scroll',
            y_expand: true,
        });
        this._messageBox = new St.BoxLayout({ vertical: true, style_class: 'netsocket-message-box' });
        this._scrollView.set_child(this._messageBox);
        root.add_child(this._scrollView);

        const entryRow = new St.BoxLayout({ style_class: 'netsocket-entry-row' });
        this._entry = new St.Entry({
            style_class: 'netsocket-entry',
            hint_text: 'Type a message or /? for local commands…',
            can_focus: true,
            x_expand: true,
        });
        this._entry.clutter_text.connect('key-press-event', (_actor, event) => {
            const symbol = event.get_key_symbol();
            if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
                this._onSend();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        entryRow.add_child(this._entry);

        const sendButton = new St.Button({ style_class: 'netsocket-send-button button', label: 'Send' });
        sendButton.connect('clicked', () => this._onSend());
        entryRow.add_child(sendButton);
        root.add_child(entryRow);

        this.contentLayout.add_child(root);

        this._statusListenerRemove = connection.on('status-changed', (status) => {
            this._statusLabel.text = STATUS_LABEL[status] ?? status;
        });

        this.addButton({ label: 'Authenticator', action: () => this._actions.openOtp?.(), key: null });
        this.addButton({ label: 'Close', action: () => this.close(), key: Clutter.KEY_Escape, default: true });

        this._appendMessage('system', 'Type /? to see local commands. Everything else is sent to your agent.');
    }

    vfunc_key_press_event(event) {
        if (event.get_key_symbol() === Clutter.KEY_Escape) {
            this.close();
            return Clutter.EVENT_STOP;
        }
        return super.vfunc_key_press_event(event);
    }

    _appendMessage(role, text) {
        const bubble = new St.BoxLayout({ style_class: `netsocket-bubble netsocket-bubble-${role}`, vertical: true });
        const label = new St.Label({ text });
        label.clutter_text.set_line_wrap(true);
        bubble.add_child(label);
        this._messageBox.add_child(bubble);

        const adjustment = this._scrollView.vscroll.adjustment;
        adjustment.value = adjustment.upper;
    }

    _onSend() {
        const text = this._entry.get_text().trim();
        if (!text) return;
        this._entry.set_text('');

        if (isSlashCommand(text)) {
            this._appendMessage('user', text);
            const feedback = runSlashCommand(text, {
                openSettings: () => this._actions.openSettings?.(),
                openOtp: () => this._actions.openOtp?.(),
                clearChat: () => {
                    this._messageBox.destroy_all_children();
                    this._store.resetConversationId();
                },
            });
            this._appendMessage('system', feedback);
            return;
        }

        if (this._connection.status !== Status.APPROVED) {
            this._appendMessage('user', text);
            this._appendMessage('error', 'Not connected to the netsocket host yet.');
            return;
        }

        this._appendMessage('user', text);
        const pendingBubble = this._appendPendingMessage();

        this._connection.sendCommand(text, {
            onAck: () => { /* delivered; still waiting on the async reply */ },
            onReply: (replyText) => {
                pendingBubble.destroy();
                this._appendMessage('assistant', replyText || '(empty response)');
            },
            onTimeout: () => {
                pendingBubble.destroy();
                this._appendMessage('error', 'Timed out waiting for a response.');
            },
        });
    }

    _appendPendingMessage() {
        const bubble = new St.BoxLayout({ style_class: 'netsocket-bubble netsocket-bubble-assistant' });
        const label = new St.Label({ text: '…' });
        bubble.add_child(label);
        this._messageBox.add_child(bubble);
        const adjustment = this._scrollView.vscroll.adjustment;
        adjustment.value = adjustment.upper;
        return bubble;
    }

    close(timestamp) {
        this._statusListenerRemove?.();
        super.close(timestamp);
    }
});
