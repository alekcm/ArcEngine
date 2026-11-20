// All storage goes through Store (kit rule: direct localStorage throws in sandboxed iframes).
const PREFIX = 'witcher.';
export const Store = {
    get(key, fallback = null) {
        try { const raw = localStorage.getItem(PREFIX + key); return raw === null ? fallback : JSON.parse(raw); } catch { return fallback; }
    },
    set(key, value) {
        try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
    },
};
