/**
 * Agent-bridge invocation over HTTP. Every tool POSTs to the running
 * serve-api's `/api/agent-bridge` endpoint (the host-neutral agent-bridge/v2
 * JSON contract), which dispatches against a warm in-process adapter and
 * avoids per-call process startup. Parses the JSON reply, and turns
 * `{"ok": false, ...}` payloads into thrown errors — the skill's working
 * rules: parse JSON, surface errors, stop.
 * @module @newsclaw/dsh-plugin
 */
import type { JsonValue } from '@deepseek-ai/dsh-session';
/** Resolved plugin config (defaults applied in the plugin entry). */
export interface BridgeConfig {
    /** Base URL of the running NewsClaw serve-api (default http://127.0.0.1:8430). */
    apiUrl: string;
    /** Adapter SKILL.md path or bundled file URL. */
    skillPath: string | URL;
    /** Per-command budget in ms. */
    timeoutMs: number;
}
/** The bridge service face the tools need (config + HTTP transport). */
export interface Bridge {
    readonly config: BridgeConfig;
    /** Run one bridge command with CLI-style argv; returns the parsed `data` payload as lossless JSON. */
    run(command: string, args: readonly string[]): Promise<JsonValue>;
}
/** A successful bridge reply: `{"ok": true, "data": ...}`. */
export interface BridgeOk {
    ok: true;
    data: unknown;
}
/** A failed bridge reply: `{"ok": false, ...}`. */
export interface BridgeError {
    ok: false;
    error?: string;
    message?: string;
    [key: string]: unknown;
}
/** Redact credential-looking fragments before errors or Agent output. */
export declare function redactText(value: string): string;
/** Recursively remove credential values even if a backend forgets to mask them. */
export declare function sanitizeBridgeValue(value: unknown): JsonValue;
/** Parse the bridge's single JSON reply object. */
export declare function parseBridgeLine(text: string): BridgeOk | BridgeError;
/**
 * Build the bridge face over HTTP to the serve-api's `/api/agent-bridge`
 * endpoint. The serve-api keeps a warm in-process adapter, so these calls do
 * not launch a subprocess per tool invocation.
 * @param config - resolved plugin config.
 * @returns the bridge face.
 */
export declare function createBridge(config: BridgeConfig): Bridge;
//# sourceMappingURL=bridge.d.ts.map