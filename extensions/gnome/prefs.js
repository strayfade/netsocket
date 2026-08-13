import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/shell/extensions/prefs.js';
import { NetsocketStore } from './lib/store.js';

export default class NetsocketPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const store = new NetsocketStore(this);

        const page = new Adw.PreferencesPage({ title: 'Netsocket' });
        window.add(page);

        const connectionGroup = new Adw.PreferencesGroup({
            title: 'Host connection',
            description: 'Same host your netsocket dashboard runs on.',
        });
        page.add(connectionGroup);

        const hostRow = new Adw.EntryRow({ title: 'Host' });
        settings.bind('host', hostRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        connectionGroup.add(hostRow);

        const portRow = new Adw.SpinRow({
            title: 'Port',
            adjustment: new Gtk_Adjustment(1, 65535, 1, settings.get_int('port')),
        });
        settings.bind('port', portRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        connectionGroup.add(portRow);

        const httpsRow = new Adw.SwitchRow({
            title: 'Use TLS (wss/https)',
            subtitle: 'Enable for a netsocket server behind HTTPS',
        });
        settings.bind('use-https', httpsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        connectionGroup.add(httpsRow);

        const nameRow = new Adw.EntryRow({ title: 'Device name shown on host' });
        settings.bind('device-name', nameRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        connectionGroup.add(nameRow);

        const behaviorGroup = new Adw.PreferencesGroup({ title: 'Command palette' });
        page.add(behaviorGroup);

        const timeoutRow = new Adw.SpinRow({
            title: 'Response timeout (seconds)',
            adjustment: new Gtk_Adjustment(5, 300, 5, settings.get_int('response-timeout-seconds')),
        });
        settings.bind('response-timeout-seconds', timeoutRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        behaviorGroup.add(timeoutRow);

        const notifyRow = new Adw.SwitchRow({
            title: 'Notify on reply',
            subtitle: 'Show a desktop notification when a reply arrives while the window is closed',
        });
        settings.bind('notify-on-reply', notifyRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        behaviorGroup.add(notifyRow);

        const identityGroup = new Adw.PreferencesGroup({
            title: 'Device identity',
            description: 'Approve this device in the dashboard under Settings → Devices.',
        });
        page.add(identityGroup);

        const identity = store.getOrCreateDeviceIdentity();
        identityGroup.add(readOnlyRow('Device ID', identity.deviceId));
        identityGroup.add(readOnlyRow('Public key', identity.identityPublicKey));

        const pinned = store.getPinnedServerKey();
        const pinRow = new Adw.ActionRow({
            title: 'Pinned server identity',
            subtitle: pinned ?? 'Not pinned yet — will pin on first successful connection',
        });
        if (pinned) {
            const clearButton = new Gtk.Button({
                label: 'Forget',
                valign: 3 /* Gtk.Align.CENTER */,
            });
            clearButton.connect('clicked', () => {
                store.clearPinnedServerKey();
                pinRow.subtitle = 'Not pinned yet — will pin on first successful connection';
            });
            pinRow.add_suffix(clearButton);
        }
        identityGroup.add(pinRow);
    }
}

function readOnlyRow(title, value) {
    return new Adw.ActionRow({ title, subtitle: value, subtitle_selectable: true });
}

function Gtk_Adjustment(lower, upper, step, value) {
    return new Gtk.Adjustment({ lower, upper, step_increment: step, value });
}
