/** Shared, side-effect-free plugin row normalization for Node and browser faces. */
export const DEFAULT_API_URL = 'http://127.0.0.1:8430';
export const DEFAULT_TIMEOUT_MS = 300_000;
export const MIN_TIMEOUT_MS = 1_000;
export const MAX_TIMEOUT_MS = 900_000;
/**
 * Accept only an HTTP(S) API origin/base path without credentials, query or
 * fragment. Invalid row values fail closed to the local NewsClaw default.
 */
export function normalizeApiUrl(value) {
    if (typeof value !== 'string' || value.trim() === '')
        return DEFAULT_API_URL;
    try {
        const url = new URL(value.trim());
        const loopback = url.hostname === '127.0.0.1' || url.hostname.toLowerCase() === 'localhost' || url.hostname === '[::1]';
        if (!loopback || (url.protocol !== 'http:' && url.protocol !== 'https:') || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
            return DEFAULT_API_URL;
        }
        return url.toString().replace(/\/+$/, '');
    }
    catch {
        return DEFAULT_API_URL;
    }
}
/** Clamp the per-command budget to a finite, operationally useful range. */
export function normalizeTimeoutMs(value) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return DEFAULT_TIMEOUT_MS;
    return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.floor(value)));
}
//# sourceMappingURL=config.js.map