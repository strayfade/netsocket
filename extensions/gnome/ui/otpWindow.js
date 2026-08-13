/*
 * Searchable authenticator (TOTP) window. Accounts are stored canonically
 * on the netsocket host (server/utils/authenticator.js); this window
 * fetches them via the "getOtpAccounts" request, caches them locally for
 * offline use (mirrors Android's otp_accounts.json), and generates live
 * 6-digit codes client-side every second so the countdown feels instant
 * rather than waiting on a round trip.
 */
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import { ModalDialog } from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as Totp from '../lib/totp.js';

export const OtpWindow = GObject.registerClass(
class OtpWindow extends ModalDialog {
    _init(connection, store) {
        super._init({ styleClass: 'netsocket-dialog', destroyOnClose: true });

        this._connection = connection;
        this._store = store;
        this._accounts = [];
        this._rows = new Map(); // key -> {container, codeLabel, remainingLabel, account}

        const root = new St.BoxLayout({
            vertical: true,
            style_class: 'netsocket-otp-window',
            width: 480,
            height: 560,
        });

        this._searchEntry = new St.Entry({
            style_class: 'netsocket-entry netsocket-search-entry',
            hint_text: 'Search accounts…',
            can_focus: true,
        });
        this._searchEntry.clutter_text.connect('text-changed', () => this._applyFilter());
        root.add_child(this._searchEntry);

        this._statusLabel = new St.Label({ style_class: 'netsocket-status-label', text: '' });
        root.add_child(this._statusLabel);

        this._scrollView = new St.ScrollView({ style_class: 'netsocket-otp-scroll', y_expand: true });
        this._listBox = new St.BoxLayout({ vertical: true, style_class: 'netsocket-otp-list' });
        this._scrollView.set_child(this._listBox);
        root.add_child(this._scrollView);

        this.contentLayout.add_child(root);
        this.addButton({ label: 'Close', action: () => this.close(), key: Clutter.KEY_Escape, default: true });

        this._loadFromCache();
        this._refreshFromHost();

        this._tickSourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._tick();
            return GLib.SOURCE_CONTINUE;
        });

        this.connect('destroy', () => {
            if (this._tickSourceId) GLib.source_remove(this._tickSourceId);
        });
    }

    _loadFromCache() {
        const cached = this._store.getOtpCache();
        if (cached.length) this._setAccounts(cached);
    }

    async _refreshFromHost() {
        try {
            const { accounts } = await this._connection.getOtpAccounts();
            this._setAccounts(accounts ?? []);
            this._store.setOtpCache(accounts ?? []);
            this._statusLabel.text = '';
        } catch (e) {
            this._statusLabel.text = this._accounts.length
                ? 'Showing cached codes (host unreachable)'
                : 'Could not load accounts from the host';
        }
    }

    _setAccounts(accounts) {
        this._accounts = accounts;
        this._listBox.destroy_all_children();
        this._rows.clear();
        for (const account of accounts) this._addRow(account);
        this._applyFilter();
        this._tick();
    }

    _addRow(account) {
        const row = new St.BoxLayout({ style_class: 'netsocket-otp-row', reactive: true, track_hover: true });

        const infoBox = new St.BoxLayout({ vertical: true, x_expand: true });
        infoBox.add_child(new St.Label({ style_class: 'netsocket-otp-issuer', text: account.issuer || account.key }));
        infoBox.add_child(new St.Label({ style_class: 'netsocket-otp-account', text: account.account || '' }));
        row.add_child(infoBox);

        const codeLabel = new St.Label({ style_class: 'netsocket-otp-code', text: '------' });
        row.add_child(codeLabel);

        const remainingLabel = new St.Label({ style_class: 'netsocket-otp-remaining', text: '' });
        row.add_child(remainingLabel);

        row.connect('button-press-event', () => {
            const code = codeLabel.text.replace(/\s/g, '');
            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, code);
            this._flashStatus(`Copied code for ${account.issuer || account.key}`);
            return Clutter.EVENT_STOP;
        });

        this._listBox.add_child(row);
        this._rows.set(account.key, { container: row, codeLabel, remainingLabel, account });
    }

    _flashStatus(text) {
        this._statusLabel.text = text;
        if (this._flashSourceId) GLib.source_remove(this._flashSourceId);
        this._flashSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
            this._flashSourceId = 0;
            this._statusLabel.text = '';
            return GLib.SOURCE_REMOVE;
        });
    }

    _tick() {
        const now = Date.now();
        for (const { codeLabel, remainingLabel, account } of this._rows.values()) {
            const period = account.periodSeconds || 30;
            let code = account.code;
            if (account.secret) {
                try {
                    code = Totp.generateTotp(account.secret, { periodSeconds: period, atTimeMs: now });
                } catch (e) {
                    code = account.code || '------';
                }
            }
            codeLabel.text = code ? `${code.slice(0, code.length / 2)} ${code.slice(code.length / 2)}` : '------';
            remainingLabel.text = `${Totp.secondsRemaining(period, now)}s`;
        }
    }

    _applyFilter() {
        const query = this._searchEntry.get_text().trim().toLowerCase();
        for (const { container, account } of this._rows.values()) {
            const haystack = `${account.issuer ?? ''} ${account.account ?? ''}`.toLowerCase();
            container.visible = !query || haystack.includes(query);
        }
    }
});
