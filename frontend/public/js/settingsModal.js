(function () {
    'use strict';

    async function fetchPreferences() {
        try {
            var res = await fetch('/v1/preferences', { credentials: 'same-origin' });
            if (!res.ok) return [];
            var json = await res.json();
            if (Array.isArray(json.preferences)) return json.preferences;
            if (Array.isArray(json)) return json;
            // Fallback: WS response shape compatibility
            if (Array.isArray(json.broadcastData)) return json.broadcastData;
            return [];
        } catch (e) {
            console.warn('Failed to load preferences', e);
            // Fallback to WS if REST fails (editor page has sendWsRequest)
            if (typeof window.sendWsRequest === 'function' || typeof sendWsRequest === 'function') {
                try {
                    var fn = window.sendWsRequest || sendWsRequest;
                    var response = await fn({ broadcastPurpose: 'getPreferences' });
                    return Array.isArray(response.broadcastData) ? response.broadcastData : [];
                } catch (err2) {
                    console.warn('WS fallback failed', err2);
                }
            }
            return [];
        }
    }

    async function saveSetting(name, value) {
        try {
            var res = await fetch('/v1/preferences', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, value: value })
            });
            if (res.ok) return;
            throw new Error('HTTP ' + res.status);
        } catch (e) {
            // Fallback to WS
            var fn = window.sendWsRequest || (typeof sendWsRequest !== 'undefined' ? sendWsRequest : null);
            if (fn) {
                await fn({ broadcastPurpose: 'saveSetting', broadcastData: { name: name, value: value } });
                return;
            }
            throw e;
        }
    }

    function init() {
        var openSettingsBtns = document.querySelectorAll('#open-settings');
        var settingsModal = document.getElementById('settings-modal');
        if (!settingsModal || !openSettingsBtns.length) return;
        // Avoid double-bound if editor inline already bound (editor page)
        if (settingsModal.getAttribute('data-settings-shared-bound') === 'true') return;
        settingsModal.setAttribute('data-settings-shared-bound', 'true');

        var closeSettingsBtn = document.getElementById('close-settings');
        var settingsBackdrop = document.getElementById('settings-backdrop');
        var tabsContainerEl = document.getElementById('settings-tabs-container');
        var panelsScrollEl = document.getElementById('settings-panels-scroll');
        if (!tabsContainerEl || !panelsScrollEl) return;

        var buildFieldRow = function (pref) {
            var field = document.createElement('div');
            field.className = 'settings-field';

            var readValue = function (control) {
                if (pref.type === 'boolean') return control.checked ? 'true' : 'false';
                return control.value;
            };

            if (pref.type === 'readonly') {
                var title = document.createElement('div');
                title.className = 'settings-label-block';
                title.textContent = pref.displayName;
                field.appendChild(title);
                var row = document.createElement('div');
                row.className = 'settings-field-row';
                var control = document.createElement('input');
                control.type = 'text';
                control.readOnly = true;
                control.value = pref.value != null ? String(pref.value) : '';
                control.placeholder = 'Not connected';
                row.appendChild(control);
                field.appendChild(row);
                return field;
            }

            if (pref.type === 'boolean') {
                var title2 = document.createElement('div');
                title2.className = 'settings-label-block';
                title2.textContent = pref.displayName;
                field.appendChild(title2);

                var row2 = document.createElement('label');
                row2.className = 'settings-field-row';
                row2.style.cursor = 'pointer';
                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = pref.value === true || pref.value === 'true';
                var span = document.createElement('span');
                span.textContent = 'Enabled';
                span.style.fontSize = '13px';
                span.style.color = '#ddd';
                row2.appendChild(cb);
                row2.appendChild(span);
                field.appendChild(row2);

                var btnRow = document.createElement('div');
                btnRow.className = 'settings-field-row';
                btnRow.style.marginTop = '10px';
                var saveBtn = document.createElement('button');
                saveBtn.type = 'button';
                saveBtn.textContent = 'Save';
                btnRow.appendChild(saveBtn);
                field.appendChild(btnRow);

                saveBtn.addEventListener('click', async function () {
                    try {
                        await saveSetting(pref.id, readValue(cb));
                        saveBtn.textContent = 'Saved';
                        setTimeout(function () { saveBtn.textContent = 'Save'; }, 1400);
                    } catch (err) {
                        console.warn('Save failed', err);
                    }
                });
                return field;
            }

            var lab = document.createElement('label');
            lab.className = 'settings-label-block';
            lab.textContent = pref.displayName;
            field.appendChild(lab);

            var row3 = document.createElement('div');
            row3.className = 'settings-field-row';
            var control3;
            if (pref.type === 'number') {
                control3 = document.createElement('input');
                control3.type = 'number';
                control3.value = pref.value != null ? String(pref.value) : '';
            } else {
                control3 = document.createElement('input');
                control3.type = 'text';
                control3.value = pref.value != null ? String(pref.value) : '';
            }
            var saveBtn3 = document.createElement('button');
            saveBtn3.type = 'button';
            saveBtn3.textContent = 'Save';
            row3.appendChild(control3);
            row3.appendChild(saveBtn3);
            field.appendChild(row3);

            saveBtn3.addEventListener('click', async function () {
                try {
                    await saveSetting(pref.id, readValue(control3));
                    saveBtn3.textContent = 'Saved';
                    setTimeout(function () { saveBtn3.textContent = 'Save'; }, 1400);
                } catch (err) {
                    console.warn('Save failed', err);
                }
            });
            return field;
        };

        var renderPreferences = function (list, devicesList) {
            tabsContainerEl.innerHTML = '';
            panelsScrollEl.innerHTML = '';
            var prefs = Array.isArray(list) ? list : [];
            var byCat = {};
            for (var i = 0; i < prefs.length; i++) {
                var p = prefs[i];
                var c = p.category || 'Other';
                if (!byCat[c]) byCat[c] = [];
                byCat[c].push(p);
            }
            var categories = Object.keys(byCat).sort(function (a, b) { return a.localeCompare(b); });

            var panels = [];
            var tabs = [];
            var devicesPanelEl = null;

            var iconForCategory = function (cat) {
                var map = {
                    'Devices': 'devices',
                    'AI Providers': 'smart_toy',
                    'Rendering': 'tune',
                    'Email': 'mail',
                    'Google': 'cloud',
                    'Philips Hue': 'lightbulb',
                    'Authenticator': 'key',
                    'Debug': 'bug_report',
                    'Webhook': 'webhook',
                    'MCP': 'extension',
                    'Triggers': 'bolt',
                    'Notifiers': 'notifications'
                };
                if (map[cat]) return map[cat];
                var lower = String(cat).toLowerCase();
                if (lower.includes('hue')) return 'lightbulb';
                if (lower.includes('mail') || lower.includes('email')) return 'mail';
                if (lower.includes('google')) return 'cloud';
                if (lower.includes('auth')) return 'key';
                if (lower.includes('debug')) return 'bug_report';
                if (lower.includes('webhook')) return 'webhook';
                if (lower.includes('mcp')) return 'extension';
                return 'settings';
            };
            var tabWithIcon = function (label) { return '<span class="material-symbols-outlined" aria-hidden="true">' + iconForCategory(label) + '</span> ' + label; };
            var showTab = function (index) {
                tabs.forEach(function (t, i) { t.classList.toggle('settings-tab-active', i === index); });
                panels.forEach(function (p, i) { p.style.display = i === index ? '' : 'none'; });
            };
            var formatTime = function (ts) {
                if (!ts) return '—';
                try { return new Date(ts).toLocaleString(); } catch (e) { return '—'; }
            };
            var shortId = function (id) {
                var s = String(id || '');
                if (s.length <= 18) return s;
                return s.slice(0, 8) + '…' + s.slice(-6);
            };
            var deviceAction = async function (deviceId, action) {
                var url = action === 'remove' ? '/v1/devices/' + encodeURIComponent(deviceId) : '/v1/devices/' + encodeURIComponent(deviceId) + '/' + action;
                var method = action === 'remove' ? 'DELETE' : 'POST';
                var res = await fetch(url, { method: method, credentials: 'same-origin' });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                if (action !== 'remove') {
                    var json = await res.json().catch(function () { return {}; });
                    return json.device;
                }
                return null;
            };
            var renderDevicesPanel = function (devices) {
                if (!devicesPanelEl) return;
                devicesPanelEl.innerHTML = '';
                var groups = [
                    { key: 'pending', title: 'Pending approval', empty: 'No devices waiting for approval.' },
                    { key: 'approved', title: 'Approved', empty: 'No approved devices yet.' },
                    { key: 'denied', title: 'Denied', empty: 'No denied devices.' }
                ];
                var list = Array.isArray(devices) ? devices : [];
                for (var gi = 0; gi < groups.length; gi++) {
                    var group = groups[gi];
                    var section = document.createElement('div');
                    section.className = 'devices-section';
                    var heading = document.createElement('h3');
                    heading.textContent = group.title;
                    section.appendChild(heading);
                    var matching = list.filter(function (d) { return d.status === group.key; });
                    if (!matching.length) {
                        var empty = document.createElement('p');
                        empty.className = 'devices-empty';
                        empty.textContent = group.empty;
                        section.appendChild(empty);
                    } else {
                        for (var di = 0; di < matching.length; di++) {
                            var device = matching[di];
                            var card = document.createElement('div');
                            card.className = 'device-card device-card-' + device.status;
                            var top = document.createElement('div');
                            top.className = 'device-card-top';
                            var title = document.createElement('div');
                            title.className = 'device-card-title';
                            title.textContent = device.name || device.platform || 'Unknown device';
                            var badge = document.createElement('span');
                            badge.className = 'device-status-badge device-status-' + device.status;
                            badge.textContent = device.status;
                            top.appendChild(title);
                            top.appendChild(badge);
                            card.appendChild(top);
                            var meta = document.createElement('div');
                            meta.className = 'device-card-meta';
                            meta.innerHTML = [
                                '<div><span>Device ID</span><code title="' + device.deviceId + '">' + shortId(device.deviceId) + '</code></div>',
                                '<div><span>IP address</span><code>' + (device.ipAddress || '—') + '</code></div>',
                                '<div><span>Platform</span><code>' + (device.platform || '—') + '</code></div>',
                                '<div><span>Last seen</span><code>' + formatTime(device.lastSeenAt) + '</code></div>'
                            ].join('');
                            card.appendChild(meta);
                            var actions = document.createElement('div');
                            actions.className = 'device-card-actions';
                            (function (dev) {
                                var run = async function (action, label) {
                                    try {
                                        await deviceAction(dev.deviceId, action);
                                        var refreshed = await fetchDevices();
                                        renderDevicesPanel(refreshed);
                                    } catch (err) {
                                        console.warn('Device ' + label + ' failed', err);
                                        window.alert('Could not ' + label + ' device.');
                                    }
                                };
                                if (dev.status === 'pending' || dev.status === 'denied') {
                                    var approveBtn = document.createElement('button');
                                    approveBtn.type = 'button';
                                    approveBtn.textContent = 'Approve';
                                    approveBtn.addEventListener('click', function () { run('approve', 'approve'); });
                                    actions.appendChild(approveBtn);
                                }
                                if (dev.status === 'pending' || dev.status === 'approved') {
                                    var denyBtn = document.createElement('button');
                                    denyBtn.type = 'button';
                                    denyBtn.className = 'device-btn-danger';
                                    denyBtn.textContent = 'Deny';
                                    denyBtn.addEventListener('click', function () { run('deny', 'deny'); });
                                    actions.appendChild(denyBtn);
                                }
                                if (dev.status === 'approved') {
                                    var pendingBtn = document.createElement('button');
                                    pendingBtn.type = 'button';
                                    pendingBtn.textContent = 'Revoke';
                                    pendingBtn.addEventListener('click', function () { run('pending', 'revoke'); });
                                    actions.appendChild(pendingBtn);
                                }
                                var removeBtn = document.createElement('button');
                                removeBtn.type = 'button';
                                removeBtn.className = 'device-btn-muted';
                                removeBtn.textContent = 'Remove';
                                removeBtn.addEventListener('click', function () {
                                    if (!window.confirm('Remove this device permanently? It will need to pair again.')) return;
                                    run('remove', 'remove');
                                });
                                actions.appendChild(removeBtn);
                            })(device);
                            card.appendChild(actions);
                            section.appendChild(card);
                        }
                    }
                    devicesPanelEl.appendChild(section);
                }
            };
            var fetchDevices = async function () {
                var res = await fetch('/v1/devices', { credentials: 'same-origin' });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                var json = await res.json();
                return Array.isArray(json.devices) ? json.devices : [];
            };

            // Devices tab first
            (function () {
                var tab = document.createElement('div');
                tab.className = 'settings-tab settings-tab-active';
                tab.innerHTML = tabWithIcon('Devices');
                tab.addEventListener('click', function () { showTab(0); });
                tabsContainerEl.appendChild(tab);
                tabs.push(tab);
                devicesPanelEl = document.createElement('div');
                devicesPanelEl.className = 'settings-panel';
                devicesPanelEl.style.display = '';
                panelsScrollEl.appendChild(devicesPanelEl);
                panels.push(devicesPanelEl);
                renderDevicesPanel(devicesList || []);
            })();

            // AI Providers
            var aiProvidersPanelEl = null;
            var renderAIProvidersPanel = async function () {
                if (!aiProvidersPanelEl) return;
                aiProvidersPanelEl.innerHTML = '';
                var providers = [];
                try {
                    var res = await fetch('/v1/providers', { credentials: 'same-origin' });
                    if (res.ok) {
                        var j = await res.json();
                        providers = Array.isArray(j.providers) ? j.providers : [];
                    }
                } catch (e) {}
                if (!providers.length) {
                    var empty = document.createElement('div');
                    empty.className = 'provider-empty';
                    empty.innerHTML = '<div class="provider-empty-icon"><span class="material-symbols-outlined">cloud_off</span></div><p>No providers configured yet.</p><p>Add an Ollama or OpenAI-compatible provider below to enable AI nodes.</p>';
                    aiProvidersPanelEl.appendChild(empty);
                } else {
                    for (var pi = 0; pi < providers.length; pi++) {
                        var p = providers[pi];
                        var card = document.createElement('div');
                        card.className = 'provider-card' + (p.isDefault ? ' provider-card-default' : '');
                        var top = document.createElement('div');
                        top.className = 'provider-card-top';
                        var title = document.createElement('div');
                        title.className = 'provider-card-title';
                        title.textContent = p.name;
                        title.title = p.name;
                        var badges = document.createElement('div');
                        badges.className = 'provider-badges';
                        var kindBadge = document.createElement('span');
                        kindBadge.className = 'provider-badge provider-badge-kind-' + (p.kind === 'ollama' ? 'ollama' : 'openai');
                        kindBadge.textContent = p.kind === 'ollama' ? 'Ollama' : 'OpenAI';
                        badges.appendChild(kindBadge);
                        if (p.isDefault) {
                            var defBadge = document.createElement('span');
                            defBadge.className = 'provider-badge provider-badge-default';
                            defBadge.innerHTML = '<span class="material-symbols-outlined" style="font-size:11px;vertical-align:-2px">star</span> default';
                            badges.appendChild(defBadge);
                        }
                        if (p.hasApiKey) {
                            var tok = document.createElement('span');
                            tok.className = 'provider-badge provider-badge-token';
                            tok.innerHTML = '<span class="material-symbols-outlined" style="font-size:11px">key</span> token';
                            badges.appendChild(tok);
                        }
                        top.appendChild(title); top.appendChild(badges); card.appendChild(top);
                        var meta = document.createElement('div');
                        meta.className = 'provider-card-meta';
                        var baseItem = document.createElement('div'); baseItem.className = 'provider-card-meta-item';
                        baseItem.innerHTML = '<span><span class="material-symbols-outlined">link</span> Base URL</span><code title="' + (p.baseUrl || '') + '">' + (p.baseUrl || '<span class="is-empty">—</span>') + '</code>';
                        var modelItem = document.createElement('div'); modelItem.className = 'provider-card-meta-item';
                        var modelVal = p.defaultModel ? p.defaultModel : '<span class="is-empty">none</span>';
                        modelItem.innerHTML = '<span><span class="material-symbols-outlined">model_training</span> Default model</span><code title="' + (p.defaultModel || '') + '">' + modelVal + '</code>';
                        meta.appendChild(baseItem); meta.appendChild(modelItem);
                        card.appendChild(meta);
                        var actions = document.createElement('div');
                        actions.className = 'provider-card-actions';
                        (function (prov) {
                            if (!prov.isDefault) {
                                var defBtn = document.createElement('button'); defBtn.type = 'button'; defBtn.className = 'btn-primary';
                                defBtn.innerHTML = '<span class="material-symbols-outlined">star</span> Make default';
                                defBtn.addEventListener('click', async function () {
                                    defBtn.disabled = true;
                                    var res2 = await fetch('/v1/providers/' + encodeURIComponent(prov.id), { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isDefault: true }) });
                                    if (!res2.ok) { window.alert('Failed to set default'); defBtn.disabled = false; return; }
                                    await renderAIProvidersPanel();
                                });
                                actions.appendChild(defBtn);
                            }
                            var editBtn = document.createElement('button'); editBtn.type = 'button';
                            editBtn.innerHTML = '<span class="material-symbols-outlined">edit</span> Edit';
                            editBtn.addEventListener('click', function () { if (window.openProviderForm) window.openProviderForm(prov); });
                            actions.appendChild(editBtn);
                            var modelsBtn = document.createElement('button'); modelsBtn.type = 'button'; modelsBtn.className = 'btn-muted';
                            modelsBtn.innerHTML = '<span class="material-symbols-outlined">list</span> Models';
                            modelsBtn.addEventListener('click', async function () {
                                modelsBtn.disabled = true; var orig = modelsBtn.innerHTML; modelsBtn.innerHTML = '<span class="material-symbols-outlined">progress_activity</span> Loading…';
                                try {
                                    var res3 = await fetch('/v1/providers/' + encodeURIComponent(prov.id) + '/models', { credentials: 'same-origin' });
                                    if (!res3.ok) throw new Error('HTTP ' + res3.status);
                                    var j3 = await res3.json();
                                    var models = Array.isArray(j3.models) ? j3.models.map(function (m) { return m.id; }) : [];
                                    if (!models.length) window.alert('No models returned or provider unreachable.\nCheck base URL and token.');
                                    else window.alert('Models for ' + prov.name + ' (' + models.length + '):\n' + models.join('\n'));
                                } catch (e) { window.alert('Failed to list models: ' + e.message); }
                                modelsBtn.disabled = false; modelsBtn.innerHTML = orig;
                            });
                            actions.appendChild(modelsBtn);
                            var delBtn = document.createElement('button'); delBtn.type = 'button'; delBtn.className = 'btn-danger';
                            delBtn.innerHTML = '<span class="material-symbols-outlined">delete</span> Remove';
                            delBtn.addEventListener('click', async function () {
                                if (!window.confirm('Remove provider "' + prov.name + '"?\nAI nodes using it will fall back to the default provider.')) return;
                                var res4 = await fetch('/v1/providers/' + encodeURIComponent(prov.id), { method: 'DELETE', credentials: 'same-origin' });
                                if (!res4.ok) { window.alert('Failed to delete'); return; }
                                await renderAIProvidersPanel();
                            });
                            actions.appendChild(delBtn);
                        })(p);
                        card.appendChild(actions);
                        aiProvidersPanelEl.appendChild(card);
                    }
                }
                var formCard = document.createElement('div');
                formCard.className = 'provider-form-card';
                var head = document.createElement('div'); head.className = 'provider-form-head';
                head.innerHTML = '<p class="provider-form-title"><span id="ai-provider-form-title">Add provider</span></p>';
                formCard.appendChild(head);
                var grid = document.createElement('div'); grid.className = 'provider-form-grid';
                var mkField = function (label, icon, type, id, placeholder) {
                    var wrap = document.createElement('div'); wrap.className = 'provider-form-field';
                    var lab = document.createElement('label'); lab.htmlFor = id; lab.innerHTML = '<span class="material-symbols-outlined">' + icon + '</span> ' + label;
                    var inp;
                    if (type === 'select') {
                        inp = document.createElement('select'); inp.id = id; inp.innerHTML = '<option value="ollama">Ollama</option><option value="openai-compatible">OpenAI-compatible</option>';
                    } else {
                        inp = document.createElement('input'); inp.type = type; inp.id = id; inp.placeholder = placeholder || '';
                    }
                    wrap.appendChild(lab); wrap.appendChild(inp); grid.appendChild(wrap); return inp;
                };
                var nameInp = mkField('Name', 'label', 'text', 'ai-prov-name', 'Local Ollama');
                var kindSel = mkField('Kind', 'category', 'select', 'ai-prov-kind', '');
                var baseWrap = document.createElement('div'); baseWrap.className = 'provider-form-field span-2';
                baseWrap.innerHTML = '<label for="ai-prov-base"><span class="material-symbols-outlined">link</span> Base URL</label>';
                var baseInp = document.createElement('input'); baseInp.type = 'text'; baseInp.id = 'ai-prov-base'; baseInp.placeholder = 'http://127.0.0.1:11434';
                baseWrap.appendChild(baseInp); grid.appendChild(baseWrap);
                var tokenWrap = document.createElement('div'); tokenWrap.className = 'provider-form-field span-2';
                tokenWrap.innerHTML = '<label for="ai-prov-token"><span class="material-symbols-outlined">key</span> Bearer token / API key <span style="font-weight:400;color:#666">- optional</span></label>';
                var tokenRow = document.createElement('div'); tokenRow.className = 'provider-form-token-row';
                var tokenInp = document.createElement('input'); tokenInp.type = 'password'; tokenInp.id = 'ai-prov-token'; tokenInp.placeholder = 'leave blank to keep existing';
                var toggleBtn = document.createElement('button'); toggleBtn.type = 'button'; toggleBtn.className = 'provider-form-token-toggle'; toggleBtn.innerHTML = '<span class="material-symbols-outlined">visibility</span>'; toggleBtn.title = 'Show/hide';
                toggleBtn.addEventListener('click', function () {
                    var isPwd = tokenInp.type === 'password';
                    tokenInp.type = isPwd ? 'text' : 'password';
                    toggleBtn.innerHTML = isPwd ? '<span class="material-symbols-outlined">visibility_off</span>' : '<span class="material-symbols-outlined">visibility</span>';
                });
                tokenRow.appendChild(tokenInp); tokenRow.appendChild(toggleBtn); tokenWrap.appendChild(tokenRow); grid.appendChild(tokenWrap);
                var modelInp = mkField('Default model', 'model_training', 'text', 'ai-prov-model', 'gemma4:e2b');
                var checkLabel = document.createElement('label'); checkLabel.className = 'provider-form-check span-2'; checkLabel.htmlFor = 'ai-prov-default';
                checkLabel.innerHTML = '<input type="checkbox" id="ai-prov-default"><span>Set as <strong>default provider</strong> - new AI nodes use its default model</span>';
                var isDefCb = checkLabel.querySelector('input');
                grid.appendChild(checkLabel);
                formCard.appendChild(grid);
                var editingId = null;
                var statusEl = document.createElement('div'); statusEl.className = 'provider-form-status';
                var setStatus = function (msg, kind) {
                    statusEl.textContent = msg; statusEl.className = 'provider-form-status is-visible is-' + (kind || 'info');
                    if (!msg) statusEl.className = 'provider-form-status';
                };
                var resetForm = function () { editingId = null; var t = document.getElementById('ai-provider-form-title'); if (t) t.textContent = 'Add provider'; submitBtn.innerHTML = 'Add provider'; cancelBtn.style.display = 'none'; nameInp.value = ''; kindSel.value = 'ollama'; baseInp.value = ''; tokenInp.value = ''; tokenInp.type = 'password'; toggleBtn.innerHTML = '<span class="material-symbols-outlined">visibility</span>'; modelInp.value = ''; isDefCb.checked = false; setStatus('', ''); };
                window.openProviderForm = function (p) {
                    editingId = p.id; var t = document.getElementById('ai-provider-form-title'); if (t) t.textContent = 'Edit ' + p.name; submitBtn.innerHTML = '<span class="material-symbols-outlined">save</span> Save changes'; cancelBtn.style.display = ''; nameInp.value = p.name; kindSel.value = p.kind; baseInp.value = p.baseUrl; tokenInp.value = ''; modelInp.value = p.defaultModel || ''; isDefCb.checked = !!p.isDefault; setStatus('Leave token blank to keep current.', 'info');
                    formCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                };
                var actionsRow = document.createElement('div'); actionsRow.className = 'provider-form-actions';
                var submitBtn = document.createElement('button'); submitBtn.type = 'button'; submitBtn.className = 'btn-primary'; submitBtn.innerHTML = 'Add provider';
                var cancelBtn = document.createElement('button'); cancelBtn.type = 'button'; cancelBtn.className = 'btn-ghost'; cancelBtn.textContent = 'Cancel'; cancelBtn.style.display = 'none';
                cancelBtn.addEventListener('click', resetForm);
                submitBtn.addEventListener('click', async function () {
                    var payload = { name: nameInp.value.trim(), kind: kindSel.value, baseUrl: baseInp.value.trim(), defaultModel: modelInp.value.trim(), isDefault: isDefCb.checked };
                    if (tokenInp.value) payload.apiKey = tokenInp.value;
                    else if (editingId) {} else payload.apiKey = '';
                    if (!payload.name || !payload.baseUrl) { setStatus('Name and Base URL are required.', 'error'); return; }
                    submitBtn.disabled = true; setStatus(editingId ? 'Saving...' : 'Creating...', 'info');
                    try {
                        var res;
                        if (editingId) {
                            var body = { name: payload.name, kind: payload.kind, baseUrl: payload.baseUrl, defaultModel: payload.defaultModel, isDefault: payload.isDefault };
                            if (payload.apiKey !== undefined) body.apiKey = payload.apiKey;
                            res = await fetch('/v1/providers/' + encodeURIComponent(editingId), { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                        } else {
                            res = await fetch('/v1/providers', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                        }
                        if (!res.ok) { var j = await res.json().catch(function () { return {}; }); setStatus('Failed: ' + (j.error || res.statusText), 'error'); submitBtn.disabled = false; return; }
                        setStatus(editingId ? 'Saved.' : 'Provider added.', 'success');
                        resetForm(); await renderAIProvidersPanel();
                    } catch (e) { setStatus('Error: ' + e.message, 'error'); } finally { submitBtn.disabled = false; }
                });
                kindSel.addEventListener('change', function () {
                    if (kindSel.value === 'ollama' && !baseInp.value) baseInp.placeholder = 'http://127.0.0.1:11434';
                    else if (kindSel.value === 'openai-compatible' && !baseInp.value) baseInp.placeholder = 'https://api.openai.com/v1';
                });
                actionsRow.appendChild(submitBtn); actionsRow.appendChild(cancelBtn); formCard.appendChild(actionsRow); formCard.appendChild(statusEl);
                aiProvidersPanelEl.appendChild(formCard);
            };
            (function () {
                var tabIndex = tabs.length;
                var tab = document.createElement('div');
                tab.className = 'settings-tab';
                tab.innerHTML = tabWithIcon('AI Providers');
                tab.addEventListener('click', function () { showTab(tabIndex); });
                tabsContainerEl.appendChild(tab);
                tabs.push(tab);
                var aiPanel = document.createElement('div');
                aiPanel.className = 'settings-panel';
                aiPanel.style.display = 'none';
                aiProvidersPanelEl = aiPanel;
                panelsScrollEl.appendChild(aiPanel);
                panels.push(aiPanel);
                renderAIProvidersPanel();
            })();

            // Rendering quality
            (function () {
                var tabIndex = tabs.length;
                var tab = document.createElement('div');
                tab.className = 'settings-tab';
                tab.innerHTML = '<span class="material-symbols-outlined">tune</span> Rendering';
                tab.addEventListener('click', function () { showTab(tabIndex); });
                tabsContainerEl.appendChild(tab);
                tabs.push(tab);
                var panel = document.createElement('div');
                panel.className = 'settings-panel';
                panel.style.display = 'none';
                var field = document.createElement('div');
                field.className = 'settings-field';
                var title = document.createElement('div');
                title.className = 'settings-label-block';
                title.textContent = 'Quality preset';
                field.appendChild(title);
                var row = document.createElement('div');
                row.className = 'settings-field-row settings-quality-presets';
                var presets = (window.LGraphCanvas && LGraphCanvas.RENDER_QUALITY_PRESETS) || {};
                var order = ['low', 'medium', 'high'];
                var current = (typeof window.getNetsocketRenderQuality === 'function') ? window.getNetsocketRenderQuality() : 'medium';
                var syncActive = function () {
                    row.querySelectorAll('.settings-quality-btn').forEach(function (btn) { btn.classList.toggle('settings-quality-btn-active', btn.dataset.quality === current); });
                };
                for (var oi = 0; oi < order.length; oi++) {
                    var key = order[oi];
                    var preset = presets[key];
                    if (!preset) continue;
                    (function (k) {
                        var btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'settings-quality-btn';
                        btn.dataset.quality = k;
                        btn.textContent = preset.label || k;
                        btn.addEventListener('click', function () {
                            if (typeof window.applyNetsocketRenderQuality === 'function') {
                                current = window.applyNetsocketRenderQuality(k);
                            } else { current = k; }
                            syncActive();
                        });
                        row.appendChild(btn);
                    })(key);
                }
                field.appendChild(row);
                panel.appendChild(field);
                syncActive();
                var fpsField = document.createElement('div');
                fpsField.className = 'settings-field';
                var fpsTitle = document.createElement('div');
                fpsTitle.className = 'settings-label-block';
                fpsTitle.textContent = 'Show framerate';
                fpsField.appendChild(fpsTitle);
                var fpsRow = document.createElement('label');
                fpsRow.className = 'settings-field-row';
                fpsRow.style.cursor = 'pointer';
                var fpsCb = document.createElement('input');
                fpsCb.type = 'checkbox';
                fpsCb.checked = typeof window.getNetsocketShowFps === 'function' ? window.getNetsocketShowFps() : false;
                var fpsSpan = document.createElement('span');
                fpsSpan.textContent = 'Enabled';
                fpsSpan.style.fontSize = '13px';
                fpsSpan.style.color = '#ddd';
                fpsRow.appendChild(fpsCb);
                fpsRow.appendChild(fpsSpan);
                fpsField.appendChild(fpsRow);
                fpsCb.addEventListener('change', function () { if (typeof window.setNetsocketShowFps === 'function') window.setNetsocketShowFps(fpsCb.checked); });
                panel.appendChild(fpsField);
                var keybindsField = document.createElement('div');
                keybindsField.className = 'settings-field';
                var keybindsTitle = document.createElement('div');
                keybindsTitle.className = 'settings-label-block';
                keybindsTitle.textContent = 'Selection hotkeys bar';
                keybindsField.appendChild(keybindsTitle);
                var keybindsRow = document.createElement('label');
                keybindsRow.className = 'settings-field-row';
                keybindsRow.style.cursor = 'pointer';
                var keybindsCb = document.createElement('input');
                keybindsCb.type = 'checkbox';
                keybindsCb.checked = typeof window.getNetsocketShowSelectionKeybinds === 'function' ? window.getNetsocketShowSelectionKeybinds() : true;
                var keybindsSpan = document.createElement('span');
                keybindsSpan.textContent = 'Enabled';
                keybindsSpan.style.fontSize = '13px';
                keybindsSpan.style.color = '#ddd';
                keybindsRow.appendChild(keybindsCb);
                keybindsRow.appendChild(keybindsSpan);
                keybindsField.appendChild(keybindsRow);
                keybindsCb.addEventListener('change', function () { if (typeof window.setNetsocketShowSelectionKeybinds === 'function') window.setNetsocketShowSelectionKeybinds(keybindsCb.checked); });
                panel.appendChild(keybindsField);
                var resField = document.createElement('div');
                resField.className = 'settings-field';
                var resTitle = document.createElement('div');
                resTitle.className = 'settings-label-block';
                resTitle.textContent = 'Render resolution';
                resField.appendChild(resTitle);
                var resRow = document.createElement('div');
                resRow.className = 'settings-field-row settings-render-resolution';
                var resRange = document.createElement('input');
                resRange.type = 'range'; resRange.min = '25'; resRange.max = '100'; resRange.step = '5';
                resRange.value = String(typeof window.getNetsocketRenderResolution === 'function' ? window.getNetsocketRenderResolution() : 100);
                var resValue = document.createElement('span');
                resValue.className = 'settings-render-resolution-value';
                var syncResLabel = function () { resValue.textContent = resRange.value + '%'; };
                syncResLabel();
                var applyRes = function () {
                    if (typeof window.setNetsocketRenderResolution === 'function') {
                        var applied = window.setNetsocketRenderResolution(resRange.value);
                        resRange.value = String(applied);
                        syncResLabel();
                    } else syncResLabel();
                };
                resRange.addEventListener('input', syncResLabel);
                resRange.addEventListener('change', applyRes);
                resRow.appendChild(resRange); resRow.appendChild(resValue); resField.appendChild(resRow);
                var resPresets = document.createElement('div');
                resPresets.className = 'settings-field-row settings-quality-presets';
                [50, 75, 100].forEach(function (pct) {
                    var btn = document.createElement('button');
                    btn.type = 'button'; btn.className = 'settings-quality-btn'; btn.textContent = pct + '%';
                    btn.addEventListener('click', function () { resRange.value = String(pct); applyRes(); });
                    resPresets.appendChild(btn);
                });
                resField.appendChild(resPresets);
                panel.appendChild(resField);
                panelsScrollEl.appendChild(panel);
                panels.push(panel);
            })();

            var categoryBase = tabs.length;
            categories.forEach(function (cat, idx) {
                var tabIndex = categoryBase + idx;
                var tab = document.createElement('div');
                tab.className = 'settings-tab';
                tab.innerHTML = tabWithIcon(cat);
                tab.addEventListener('click', function () { showTab(tabIndex); });
                tabsContainerEl.appendChild(tab);
                tabs.push(tab);
                var panel = document.createElement('div');
                panel.className = 'settings-panel';
                panel.style.display = 'none';
                for (var ci = 0; ci < byCat[cat].length; ci++) {
                    panel.appendChild(buildFieldRow(byCat[cat][ci]));
                }
                panelsScrollEl.appendChild(panel);
                panels.push(panel);
            });

            window.__netsocketOnDevicesChanged = function (devices) {
                if (settingsModal.style.display === 'block') {
                    renderDevicesPanel(devices);
                }
            };
        };

        // Expose for manual refresh
        window.__netsocketSettingsRender = renderPreferences;

        var openHandler = async function (e) {
            if (e) e.preventDefault();
            settingsModal.style.display = 'block';
            settingsModal.setAttribute('aria-hidden', 'false');
            var devices = [];
            try {
                var res = await fetch('/v1/devices', { credentials: 'same-origin' });
                if (res.ok) {
                    var json = await res.json();
                    devices = Array.isArray(json.devices) ? json.devices : [];
                }
            } catch (err) { console.warn('Failed to load devices', err); }
            var prefs = await fetchPreferences();
            renderPreferences(prefs, devices);
        };

        openSettingsBtns.forEach(function (btn) {
            btn.addEventListener('click', openHandler);
        });

        var closeSettingsModal = function () {
            settingsModal.style.display = 'none';
            settingsModal.setAttribute('aria-hidden', 'true');
        };
        if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettingsModal);
        if (settingsBackdrop) settingsBackdrop.addEventListener('click', closeSettingsModal);
        // Also handle Escape via shell.js, but ensure here too
        document.addEventListener('keydown', function (e) {
            if ((e.key === 'Escape' || e.keyCode === 27) && settingsModal.style.display === 'block') {
                closeSettingsModal();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
