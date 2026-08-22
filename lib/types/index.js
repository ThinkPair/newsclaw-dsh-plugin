/**
 * NewsClaw DeepSeek Harness plugin — node half.
 *
 * Registers the agent-bridge tool set (recommend / spotlight / probes / chat /
 * profile / saved / feedback — the user-consumption loop) and the canonical
 * newsclaw-adapter skill, so the DSH agent can operate a running
 * NewsClaw backend in a closed loop. Two bounded, opt-in research tools expose
 * public-web search/evidence extraction through the backend; media-account
 * access and external saved-list synchronization remain intentionally absent.
 *
 * Config (row config in cordis.patch.yml; all optional):
 *   apiUrl         NewsClaw serve-api base URL (default: http://127.0.0.1:8430)
 *   skillPath      adapter SKILL.md path (default: the copy bundled with this plugin)
 *   timeoutMs      per-command budget in ms (default 300000)
 * @module @newsclaw/dsh-plugin
 */
import { readFileSync } from 'node:fs';
import { createBridge } from "./bridge.js";
import { registerBridgeTools } from "./tools.js";
import { loadAdapterSkill } from "./skill.js";
import { normalizeApiUrl, normalizeTimeoutMs } from "./config.js";
/** Plugin id for loader rows. */
export const name = 'newsclaw';
/** Required services: the tool registry and the skill registry. */
export const inject = ['tools', 'skills'];
const DEFAULT_SKILL_PATH = new URL('../skills/newsclaw-adapter/SKILL.md', import.meta.url);
/** Apply config defaults and normalize paths. */
export function resolveConfig(config) {
    return {
        apiUrl: normalizeApiUrl(config?.apiUrl),
        skillPath: typeof config?.skillPath === 'string' && config.skillPath.trim() !== ''
            ? config.skillPath.trim()
            : DEFAULT_SKILL_PATH,
        timeoutMs: normalizeTimeoutMs(config?.timeoutMs),
    };
}
/**
 * Plugin body: wire the bridge tools and the adapter skill.
 * @param ctx - plugin context.
 * @param config - raw row config (optional; defaults apply).
 */
export function apply(ctx, config) {
    const resolved = resolveConfig(config);
    const bridge = createBridge(resolved);
    const logger = ctx.logger('newsclaw');
    ctx.effect(() => {
        try {
            return registerBridgeTools(ctx, bridge);
        }
        catch (error) {
            logger.error('bridge tool registration failed; NewsClaw disabled without affecting Harness: %s', error instanceof Error ? error.message : String(error));
            return () => undefined;
        }
    }, 'newsclaw: bridge tools');
    // The adapter skill is read synchronously at activation: the file lives in
    // the checkout and is the canonical contract the bridge tools implement.
    let skillText = null;
    try {
        skillText = readFileSync(resolved.skillPath, 'utf8');
    }
    catch {
        logger.warn('adapter SKILL.md not found at %s — skill registration skipped', resolved.skillPath);
    }
    if (skillText !== null) {
        try {
            const skill = loadAdapterSkill(skillText, String(resolved.skillPath));
            ctx.effect(() => {
                try {
                    return ctx.skills.register(skill);
                }
                catch (error) {
                    logger.error('adapter skill registration failed; bridge tools remain available: %s', error instanceof Error ? error.message : String(error));
                    return () => undefined;
                }
            }, 'newsclaw: adapter skill');
        }
        catch (error) {
            logger.error('adapter SKILL.md is invalid; skill skipped without affecting Harness: %s', error instanceof Error ? error.message : String(error));
        }
    }
}
//# sourceMappingURL=index.js.map