import type { Context } from '@deepseek-ai/cordis';
import { type BridgeConfig } from './bridge.ts';
/** Plugin id for loader rows. */
export declare const name = "newsclaw";
/** Required services: the tool registry and the skill registry. */
export declare const inject: string[];
/** Raw row config (no schema — every field defaults in code). */
export interface NewsClawRowConfig {
    apiUrl?: string;
    skillPath?: string;
    timeoutMs?: number;
}
/** Apply config defaults and normalize paths. */
export declare function resolveConfig(config: NewsClawRowConfig | undefined): BridgeConfig;
/**
 * Plugin body: wire the bridge tools and the adapter skill.
 * @param ctx - plugin context.
 * @param config - raw row config (optional; defaults apply).
 */
export declare function apply(ctx: Context, config?: NewsClawRowConfig): void;
//# sourceMappingURL=index.d.ts.map