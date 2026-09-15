// Browser-side graph migration: legacy array/object -> JSON
(function (global) {
    const LEGACY_RE = /^(array|object)$/i;
    function isLegacy(t) { return typeof t === 'string' && LEGACY_RE.test(t.trim()); }
    function migratePort(p) {
        if (p && isLegacy(p.type)) { p.type = 'JSON'; return true; }
        return false;
    }
    function migrateNode(n) {
        if (!n || typeof n !== 'object') return false;
        let ch = false;
        if (typeof n.type === 'string' && n.type === 'Constants/Array') { n.type = 'Constants/JSON'; ch = true; }
        for (const a of (n.inputs||[])) if (migratePort(a)) ch = true;
        for (const a of (n.outputs||[])) if (migratePort(a)) ch = true;
        return ch;
    }
    function migrateLinks(links) {
        if (!links) return false;
        let ch = false;
        const handle = (link) => {
            if (!link) return;
            if (!Array.isArray(link) && typeof link === 'object') {
                if (isLegacy(link.type)) { link.type='JSON'; ch=true; }
                return;
            }
            if (Array.isArray(link) && link.length>=6 && isLegacy(link[5])) { link[5]='JSON'; ch=true; }
        };
        if (Array.isArray(links)) { for (const l of links) handle(l); }
        else if (typeof links==='object') { for (const k of Object.keys(links)) handle(links[k]); }
        return ch;
    }
    function migrateSerialize(s) {
        if (!s||typeof s!=='object') return false;
        let ch=false;
        if (Array.isArray(s.nodes)) for (const n of s.nodes) if (migrateNode(n)) ch=true;
        if (s.links!=null && migrateLinks(s.links)) ch=true;
        return ch;
    }
    function migrateGraphRoot(raw) {
        if (!raw||typeof raw!=='object') return false;
        if (Array.isArray(raw.nodes)) return migrateSerialize(raw);
        if (raw.nodes && typeof raw.nodes==='object') return migrateSerialize(raw.nodes);
        return false;
    }
    global.NetsocketGraphMigration = { isLegacy, migratePort, migrateNode, migrateLinks, migrateSerialize, migrateGraphRoot };
})(typeof window!=='undefined'?window:globalThis);
