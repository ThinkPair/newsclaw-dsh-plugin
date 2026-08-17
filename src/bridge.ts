/**
 * Agent-bridge invocation over HTTP. Every tool POSTs to the running
 * serve-api's `/api/agent-bridge` endpoint (the host-neutral agent-bridge/v2
 * JSON contract), which dispatches against a warm in-process adapter and
 * avoids per-call process startup. Parses the JSON reply, and turns
 * `{"ok": false, ...}` payloads into thrown errors — the skill's working
 * rules: parse JSON, surface errors, stop.
 * @module @newsclaw/dsh-plugin
 */
import type { JsonValue } from '@deepseek-ai/dsh-session'

/** Resolved plugin config (defaults applied in the plugin entry). */
export interface BridgeConfig {
  /** Base URL of the running NewsClaw serve-api (default http://127.0.0.1:8430). */
  apiUrl: string
  /** Adapter SKILL.md path or bundled file URL. */
  skillPath: string | URL
  /** Per-command budget in ms. */
  timeoutMs: number
}

/** The bridge service face the tools need (config + HTTP transport). */
export interface Bridge {
  readonly config: BridgeConfig
  /** Run one bridge command with CLI-style argv; returns the parsed `data` payload as lossless JSON. */
  run(command: string, args: readonly string[]): Promise<JsonValue>
}

/** A successful bridge reply: `{"ok": true, "data": ...}`. */
export interface BridgeOk {
  ok: true
  data: unknown
}

/** A failed bridge reply: `{"ok": false, ...}`. */
export interface BridgeError {
  ok: false
  error?: string
  message?: string
  [key: string]: unknown
}

const SECRET_KEY = /(?:token|api[_-]?key|authorization|cookie|secret|password)/i

/** Redact credential-looking fragments before errors or Agent output. */
export function redactText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:token|api[_-]?key|authorization|cookie|secret|password)\s*[=:]\s*)[^\s,;"'}]+/gi, '$1[REDACTED]')
}

/** Recursively remove credential values even if a backend forgets to mask them. */
export function sanitizeBridgeValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return redactText(value)
  if (Array.isArray(value)) return value.map(sanitizeBridgeValue)
  if (typeof value !== 'object') return String(value)
  const output: Record<string, JsonValue> = {}
  for (const [key, nested] of Object.entries(value)) {
    output[key] = SECRET_KEY.test(key) ? '[REDACTED]' : sanitizeBridgeValue(nested)
  }
  return output
}

/** Parse the bridge's single JSON reply object. */
export function parseBridgeLine(text: string): BridgeOk | BridgeError {
  const trimmed = text.trim()
  if (trimmed === '') throw new Error('newsclaw bridge: empty reply')
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error(`newsclaw bridge: non-JSON reply: ${redactText(trimmed.slice(0, 400))}`)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`newsclaw bridge: unexpected payload shape: ${redactText(trimmed.slice(0, 400))}`)
  }
  const reply = parsed as Record<string, unknown>
  if (reply.ok !== true) {
    const err = reply as BridgeError
    throw new Error(`newsclaw bridge error: ${redactText(String(err.error ?? err.message ?? 'unknown'))}`)
  }
  return { ok: true, data: reply.data }
}

/**
 * Build the bridge face over HTTP to the serve-api's `/api/agent-bridge`
 * endpoint. The serve-api keeps a warm in-process adapter, so these calls do
 * not launch a subprocess per tool invocation.
 * @param config - resolved plugin config.
 * @returns the bridge face.
 */
export function createBridge(config: BridgeConfig): Bridge {
  const endpoint = `${config.apiUrl.replace(/\/+$/, '')}/api/agent-bridge`
  return {
    config,
    async run(command: string, args: readonly string[]): Promise<JsonValue> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), config.timeoutMs)
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ command, argv: args }),
          signal: controller.signal,
        })
        const text = await resp.text()
        if (!resp.ok) {
          throw new Error(`newsclaw bridge HTTP ${resp.status}: ${redactText(text.slice(-1500))}`)
        }
        const reply = parseBridgeLine(text)
        return sanitizeBridgeValue(reply.data)
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error(`newsclaw bridge timed out after ${config.timeoutMs}ms while running ${command}`)
        }
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`newsclaw bridge failed while running ${command}: ${redactText(detail)}`)
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
