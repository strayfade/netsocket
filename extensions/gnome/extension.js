import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { NetsocketStore } from './lib/store.js';
import { HostConnection } from './lib/connection.js';
import { NetsocketIndicator } from './ui/indicator.js';

export default class NetsocketExtension extends Extension {
    enable() {
        this._store = new NetsocketStore(this);
        this._connection = new HostConnection(this._store);

        this._settingsChangedId = this._store.connectSettingsChanged(() => {
            // Any connection-relevant pref (host/port/tls) changed: reconnect
            // with the new settings rather than waiting for the next drop.
            this._connection.stop();
            this._connection.start();
        });

        this._indicator = new NetsocketIndicator(this, this._connection, this._store);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._connection.start();
    }

    disable() {
        this._store.disconnectSettingsChanged(this._settingsChangedId);
        this._settingsChangedId = null;

        this._connection.stop();
        this._connection = null;

        this._indicator?.destroy();
        this._indicator = null;

        this._store = null;
    }
}
