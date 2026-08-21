/** Shared, side-effect-free plugin row normalization for Node and browser faces. */
export declare const DEFAULT_API_URL = "http://127.0.0.1:8430";
export declare const DEFAULT_TIMEOUT_MS = 300000;
export declare const MIN_TIMEOUT_MS = 1000;
export declare const MAX_TIMEOUT_MS = 900000;
/**
 * Accept only an HTTP(S) API origin/base path without credentials, query or
 * fragment. Invalid row values fail closed to the local NewsClaw default.
 */
export declare function normalizeApiUrl(value: unknown): string;
/** Clamp the per-command budget to a finite, operationally useful range. */
export declare function normalizeTimeoutMs(value: unknown): number;
//# sourceMappingURL=config.d.ts.map