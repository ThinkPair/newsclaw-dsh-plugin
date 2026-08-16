const SECRET_KEY = /(?:token|api[_-]?key|authorization|cookie|secret|password)/i;
/** Redact credential-looking fragments before errors or Agent output. */
export function redactText(value) {
    return value
        .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
        .replace(/((?:token|api[_-]?key|authorization|cookie|secret|password)\s*[=:]\s*)[^\s,;"'}]+/gi, '$1[REDACTED]');
}
/** Recursively remove credential values even if a backend forgets to mask them. */
export function sanitizeBridgeValue(value) {
    if (value === null || typeof value === 'boolean' || typeof value === 'number')
        return value;
    if (typeof value === 'string')
        return redactText(value);
    if (Array.isArray(value))
        return value.map(sanitizeBridgeValue);
    if (typeof value !== 'object')
        return String(value);
    const output = {};
    for (const [key, nested] of Object.entries(value)) {
        output[key] = SECRET_KEY.test(key) ? '[REDACTED]' : sanitizeBridgeValue(nested);
    }
    return output;
}
/** Parse the bridge's single JSON reply object. */
export function parseBridgeLine(text) {
    const trimmed = text.trim();
    if (trimmed === '')
        throw new Error('newsclaw bridge: empty reply');
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    }
    catch {
        throw new Error(`newsclaw bridge: non-JSON reply: ${redactText(trimmed.slice(0, 400))}`);
    }
    if (typeof parsed !== 'object' || parsed === null) {
        throw new Error(`newsclaw bridge: unexpected payload shape: ${redactText(trimmed.slice(0, 400))}`);
    }
    const reply = parsed;
    if (reply.ok !== true) {
        const err = reply;
        throw new Error(`newsclaw bridge error: ${redactText(String(err.error ?? err.message ?? 'unknown'))}`);
    }
    return { ok: true, data: reply.data };
}
/**
 * Build the bridge face over HTTP to the serve-api's `/api/agent-bridge`
 * endpoint. The serve-api keeps a warm in-process adapter, so these calls do
 * not launch a subprocess per tool invocation.
 * @param config - resolved plugin config.
 * @returns the bridge face.
 */
export function createBridge(config) {
    const endpoint = `${config.apiUrl.replace(/\/+$/, '')}/api/agent-bridge`;
    return {
        config,
        async run(command, args) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), config.timeoutMs);
            try {
                const resp = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ command, argv: args }),
                    signal: controller.signal,
                });
                const text = await resp.text();
                if (!resp.ok) {
                    throw new Error(`newsclaw bridge HTTP ${resp.status}: ${redactText(text.slice(-1500))}`);
                }
                const reply = parseBridgeLine(text);
                return sanitizeBridgeValue(reply.data);
            }
            finally {
                clearTimeout(timer);
            }
        },
    };
}
//# sourceMappingURL=bridge.js.map