import { type SpotlightItem } from './api.ts';
/** One probe notification row (interest/avoidance/challenge). */
export interface ProbeNotice {
    key: string;
    type: 'interest.probe' | 'avoidance.probe';
    domain: string;
    reason: string;
    challenge: boolean;
    confidence: number;
}
/** One spotlight message row. */
export interface SpotlightNotice {
    article_id: string;
    title: string;
    reason: string;
    hook: string;
    media: string;
    content_url: string;
    content_id: string;
    score: number;
}
/** One pending notification (a recommendation the system wants to surface). */
export interface RecommendationNotice {
    article_id: string;
    title: string;
    reason: string;
    media: string;
    original_url: string;
}
/** Dedupe helpers (same key scheme as probe-notification-helpers.js). */
export declare function probeKey(type: string, domain: string): string;
/** The messages drawer (bell overlay). */
export declare function MessagesDrawer(props: {
    base: string;
    probes: ProbeNotice[];
    spotlights: SpotlightNotice[];
    notifications: RecommendationNotice[];
    onClose: () => void;
    onProbeHandled: (key: string) => void;
    onSpotlightHandled: (article_id: string) => void;
    onNotificationHandled: (article_id: string) => void;
    onError: (text: string) => void;
}): React.JSX.Element;
/** Build a spotlight notice from a spotlight payload. */
export declare function toSpotlightNotice(item: SpotlightItem): SpotlightNotice;
/** Hydrate the drawer from the REST surfaces (probes + spotlights + notification). */
export declare function hydrateDrawer(base: string, handledProbes: ReadonlySet<string>): Promise<{
    probes: ProbeNotice[];
    spotlights: SpotlightNotice[];
    notifications: RecommendationNotice[];
}>;
//# sourceMappingURL=notifications.d.ts.map