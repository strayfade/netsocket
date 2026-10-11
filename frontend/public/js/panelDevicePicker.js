(function (root) {
    'use strict';

    var MAX_DEVICES = 20;

    function text(value) {
        return value == null ? '' : String(value);
    }

    function shortId(id) {
        var value = text(id);
        if (value.length <= 18) return value;
        return value.slice(0, 8) + '…' + value.slice(-4);
    }

    function deviceName(device) {
        var name = text(device && device.name).trim();
        if (name) return name;
        var platform = text(device && device.platform).trim();
        if (platform) return platform;
        return text(device && device.deviceId).trim() || 'Device';
    }

    function approvedDevices(list) {
        var seen = {};
        var out = [];
        (list || []).forEach(function (device) {
            if (!device || device.status !== 'approved') return;
            var id = text(device.deviceId).trim();
            if (!id || seen[id]) return;
            seen[id] = true;
            out.push(device);
        });
        return out;
    }

    function formatNames(names) {
        if (!names.length) return '';
        if (names.length <= 2) return names.join(', ');
        return names.slice(0, 2).join(', ') + ' +' + (names.length - 2);
    }

    function attach(container, options) {
        var opts = options || {};
        var doc = container.ownerDocument;
        var input = container.querySelector('#edit-panel-device-search');
        var results = container.querySelector('#edit-panel-device-results');
        var assigned = container.querySelector('#edit-panel-device-assigned');
        var empty = container.querySelector('#edit-panel-device-empty');
        var note = container.querySelector('#edit-panel-device-note');
        var count = doc.getElementById('edit-panel-device-count');
        var selected = [];
        var open = false;
        var activeIndex = 0;
        var optionButtons = [];

        function getDevices() {
            return approvedDevices(typeof opts.getDevices === 'function' ? opts.getDevices() : []);
        }

        function getPanels() {
            var list = typeof opts.getPanels === 'function' ? opts.getPanels() : [];
            return Array.isArray(list) ? list : [];
        }

        function currentPanelId() {
            return typeof opts.getPanelId === 'function' ? opts.getPanelId() : null;
        }

        function deviceById(id) {
            var found = null;
            getDevices().some(function (device) {
                if (text(device.deviceId) === id) {
                    found = device;
                    return true;
                }
                return false;
            });
            return found;
        }

        function otherPanels(deviceId) {
            var current = currentPanelId();
            return getPanels().filter(function (panel) {
                if (!panel || panel.id === current) return false;
                var ids = Array.isArray(panel.deviceIds) ? panel.deviceIds : [];
                return ids.map(text).indexOf(deviceId) !== -1;
            });
        }

        function otherPanelLabel(deviceId) {
            var names = otherPanels(deviceId).map(function (panel) {
                var name = text(panel.name).trim() || panel.id;
                var room = text(panel.room).trim();
                return room ? name + ' (' + room + ')' : name;
            });
            return formatNames(names);
        }

        function setNote(message) {
            if (!note) return;
            note.textContent = message || '';
            note.hidden = !message;
        }

        function close() {
            open = false;
            if (input) input.setAttribute('aria-expanded', 'false');
            if (results) results.hidden = true;
        }

        function matches() {
            var query = input ? input.value.trim().toLowerCase() : '';
            var taken = {};
            selected.forEach(function (id) { taken[id] = true; });
            return getDevices().filter(function (device) {
                var id = text(device.deviceId);
                if (taken[id]) return false;
                if (!query) return true;
                var hay = [
                    device.name,
                    device.platform,
                    device.deviceId,
                    otherPanelLabel(id),
                ].join(' ').toLowerCase();
                return hay.indexOf(query) !== -1;
            }).sort(function (a, b) {
                var byName = deviceName(a).localeCompare(deviceName(b));
                if (byName) return byName;
                return text(a.deviceId).localeCompare(text(b.deviceId));
            });
        }

        function grouped(list) {
            var order = [];
            var buckets = {};
            list.forEach(function (device) {
                var platform = text(device.platform).trim() || 'Other';
                if (!buckets[platform]) {
                    buckets[platform] = [];
                    order.push(platform);
                }
                buckets[platform].push(device);
            });
            order.sort(function (a, b) {
                if (a === 'Other') return 1;
                if (b === 'Other') return -1;
                return a.localeCompare(b);
            });
            return order.map(function (platform) {
                return { platform: platform, devices: buckets[platform] };
            });
        }

        function addDevice(id) {
            if (selected.indexOf(id) !== -1) return;
            if (selected.length >= MAX_DEVICES) {
                setNote('A panel can show on up to ' + MAX_DEVICES + ' devices.');
                return;
            }
            selected.push(id);
            setNote('');
            if (input) input.value = '';
            activeIndex = 0;
            renderAssigned();
            renderResults();
        }

        function removeDevice(id) {
            selected = selected.filter(function (entry) { return entry !== id; });
            setNote('');
            renderAssigned();
            if (open) renderResults();
        }

        function renderAssigned() {
            if (count) {
                count.textContent = selected.length
                    ? selected.length + ' assigned'
                    : '';
            }
            if (empty) empty.hidden = selected.length > 0;
            if (!assigned) return;
            assigned.innerHTML = '';
            selected.forEach(function (id) {
                var device = deviceById(id);
                var row = doc.createElement('li');
                row.className = 'panel-device-row';
                var main = doc.createElement('div');
                main.className = 'panel-device-row-main';
                var title = doc.createElement('div');
                title.className = 'panel-device-row-title';
                title.textContent = device ? deviceName(device) : 'Unapproved device';
                var meta = doc.createElement('div');
                meta.className = 'panel-device-row-meta';
                var parts = [];
                if (device && text(device.platform).trim()) parts.push(text(device.platform).trim());
                parts.push(shortId(id));
                var elsewhere = otherPanelLabel(id);
                if (elsewhere) parts.push('Also on ' + elsewhere);
                else if (!device) parts.push('Kept until you remove it');
                meta.textContent = parts.join(' · ');
                meta.title = id;
                main.appendChild(title);
                main.appendChild(meta);
                var remove = doc.createElement('button');
                remove.type = 'button';
                remove.className = 'panel-device-remove';
                remove.setAttribute('aria-label', 'Remove ' + title.textContent);
                remove.textContent = 'Remove';
                remove.addEventListener('click', function () { removeDevice(id); });
                row.appendChild(main);
                row.appendChild(remove);
                assigned.appendChild(row);
            });
        }

        function renderResults() {
            if (!results || !input) return;
            results.innerHTML = '';
            optionButtons = [];
            var list = matches();
            input.setAttribute('aria-expanded', open ? 'true' : 'false');
            results.hidden = !open;
            if (!open) return;
            if (!list.length) {
                var message = doc.createElement('p');
                message.className = 'panel-device-result-empty';
                var approved = getDevices();
                if (!approved.length) {
                    message.textContent = 'No approved devices. Approve one in Settings → Devices.';
                } else if (input.value.trim()) {
                    message.textContent = 'No devices match that search.';
                } else {
                    message.textContent = 'Every approved device is already on this panel.';
                }
                results.appendChild(message);
                return;
            }
            if (activeIndex >= list.length) activeIndex = list.length - 1;
            if (activeIndex < 0) activeIndex = 0;
            var flat = 0;
            grouped(list).forEach(function (group) {
                var heading = doc.createElement('div');
                heading.className = 'panel-device-group';
                heading.textContent = group.platform;
                results.appendChild(heading);
                group.devices.forEach(function (device) {
                    var id = text(device.deviceId);
                    var index = flat;
                    flat += 1;
                    var button = doc.createElement('button');
                    button.type = 'button';
                    button.className = 'panel-device-option' + (index === activeIndex ? ' is-active' : '');
                    button.setAttribute('role', 'option');
                    button.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');
                    button.id = 'edit-panel-device-option-' + index;
                    var title = doc.createElement('span');
                    title.className = 'panel-device-option-title';
                    title.textContent = deviceName(device);
                    var meta = doc.createElement('span');
                    meta.className = 'panel-device-option-meta';
                    var elsewhere = otherPanelLabel(id);
                    meta.textContent = elsewhere ? shortId(id) + ' · On ' + elsewhere : shortId(id);
                    meta.title = id;
                    button.appendChild(title);
                    button.appendChild(meta);
                    button.addEventListener('mousedown', function (event) {
                        event.preventDefault();
                        addDevice(id);
                        input.focus();
                    });
                    results.appendChild(button);
                    optionButtons.push(button);
                });
            });
            if (optionButtons[activeIndex]) {
                input.setAttribute('aria-activedescendant', optionButtons[activeIndex].id);
                if (typeof optionButtons[activeIndex].scrollIntoView === 'function') {
                    try {
                        optionButtons[activeIndex].scrollIntoView({ block: 'nearest' });
                    } catch (_) { /* jsdom */ }
                }
            }
        }

        function openResults() {
            open = true;
            renderResults();
        }

        if (input) {
            input.addEventListener('focus', openResults);
            input.addEventListener('input', function () {
                activeIndex = 0;
                openResults();
            });
            input.addEventListener('keydown', function (event) {
                var list = matches();
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    if (!open) {
                        activeIndex = 0;
                        openResults();
                        return;
                    }
                    if (!list.length) return;
                    activeIndex = Math.min(list.length - 1, activeIndex + 1);
                    renderResults();
                    return;
                }
                if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    if (!open) {
                        activeIndex = 0;
                        openResults();
                        return;
                    }
                    if (!list.length) return;
                    activeIndex = Math.max(0, activeIndex - 1);
                    renderResults();
                    return;
                }
                if (event.key === 'Enter') {
                    event.preventDefault();
                    if (!open) {
                        openResults();
                        return;
                    }
                    if (list[activeIndex]) addDevice(text(list[activeIndex].deviceId));
                    return;
                }
                if (event.key === 'Escape' && open) {
                    event.preventDefault();
                    event.stopPropagation();
                    close();
                }
            });
        }

        doc.addEventListener('pointerdown', function (event) {
            if (!open) return;
            if (container.contains(event.target)) return;
            close();
        });

        function setSelected(ids) {
            var seen = {};
            selected = [];
            (ids || []).forEach(function (id) {
                var value = text(id).trim();
                if (!value || seen[value]) return;
                seen[value] = true;
                if (selected.length >= MAX_DEVICES) return;
                selected.push(value);
            });
            activeIndex = 0;
            if (input) input.value = '';
            setNote('');
            close();
            renderAssigned();
        }

        renderAssigned();
        close();

        return {
            setSelected: setSelected,
            getDeviceIds: function () { return selected.slice(); },
            isOpen: function () { return open; },
            close: close,
        };
    }

    var api = { attach: attach, MAX_DEVICES: MAX_DEVICES };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.PanelDevicePicker = api;
})(typeof window !== 'undefined' ? window : globalThis);
