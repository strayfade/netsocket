/*
 * Top-panel indicator: quick access to the three ported features
 * (dashboard link, command palette, authenticator) plus a live connection
 * status. This is the GNOME analogue of the Android app's FeaturesActivity
 * hub screen, minus the Settings row (that's a normal GNOME Extensions
 * preferences window instead) and minus notification forwarding.
 */
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Status } from '../lib/connection.js';
import { CommandPaletteDialog } from './commandPalette.js';
import { OtpWindow } from './otpWindow.js';

const STATUS_TEXT = {
    [Status.DISCONNECTED]: 'Disconnected',
    [Status.CONNECTING]: 'Connecting…',
    [Status.PENDING]: 'Pending approval',
    [Status.APPROVED]: 'Connected',
    [Status.DENIED]: 'Denied',
    [Status.ERROR]: 'Connection error',
};

export const NetsocketIndicator = GObject.registerClass(
class NetsocketIndicator extends PanelMenu.Button {
    _init(extensionObject, connection, store) {
        super._init(0.5, 'Netsocket');

        this._extensionObject = extensionObject;
        this._connection = connection;
        this._store = store;

        const icon = new St.Icon({
            gicon: Gio.icon_new_for_string(`${extensionObject.path}/icons/netsocket-symbolic.svg`),
            style_class: 'system-status-icon',
        });
        this.add_child(icon);

        this._statusItem = new PopupMenu.PopupMenuItem('Disconnected', { reactive: false });
        this.menu.addMenuItem(this._statusItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this.menu.addAction('Open Dashboard', () => this._openDashboard());
        this.menu.addAction('Command Palette', () => this._openCommandPalette());
        this.menu.addAction('Authenticator', () => this._openOtpWindow());

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction('Preferences', () => this._extensionObject.openPreferences());

        this._statusListenerRemove = connection.on('status-changed', (status) => {
            this._statusItem.label.text = STATUS_TEXT[status] ?? status;
        });

        this._unsolicitedListenerRemove = connection.on('unsolicited-reply', (text) => {
            if (!store.notifyOnReply) return;
            this._notify('Netsocket', text || 'New reply from your agent');
        });
    }

    _notify(title, body) {
        Main.notify(title, body);
    }

    _openDashboard() {
        Gio.AppInfo.launch_default_for_uri(this._store.siteUrl(), null);
    }

    _openCommandPalette() {
        const dialog = new CommandPaletteDialog(this._connection, this._store, {
            openSettings: () => this._extensionObject.openPreferences(),
            openOtp: () => {
                dialog.close();
                this._openOtpWindow();
            },
        });
        dialog.open();
    }

    _openOtpWindow() {
        const dialog = new OtpWindow(this._connection, this._store);
        dialog.open();
    }

    destroy() {
        this._statusListenerRemove?.();
        this._unsolicitedListenerRemove?.();
        super.destroy();
    }
});
