/** Canonical media display names for provider codes. */
export declare function mediaLabel(media: string): string;
/** Format a raw count into a compact display number. */
export declare function formatCount(value: number): string;
/** Small cover thumbnail with an optional media corner label. */
export declare function Thumb(props: {
    base?: string;
    url: string;
    title: string;
    kind?: string;
    media?: string;
}): import("react").JSX.Element;
/** Media tag + publisher/time meta row. */
export declare function MetaRow(props: {
    media: string;
    author?: string;
    time?: string;
}): import("react").JSX.Element | null;
/** Compact timestamp formatter. */
export declare function formatTime(iso: string): string;
/** Small action button. */
export declare function ActionButton(props: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    primary?: boolean;
    danger?: boolean;
    title?: string;
}): import("react").JSX.Element;
/** Empty state line. */
export declare function EmptyState(props: {
    text: string;
}): import("react").JSX.Element;
/** Error note. */
export declare function ErrorNote(props: {
    text: string;
}): import("react").JSX.Element;
/** Stable idempotency key per (item identity × action): reuse on retries only. */
export declare function useActionId(identity: string, action: string): string;
/** Open a content URL immediately, then report whether the weak open signal persisted. */
export declare function openItem(base: string, item: {
    recommendation_id?: number;
    content_id: string;
    article_id: string;
    content_url: string;
    media: string;
    title: string;
}, onPersistError?: (error: unknown) => void): void;
/** Activity footer — popup-style: collapsed line (summary + headline) with a
 *  更多/收起 toggle; expanded rows are footer-item cards with a kind pill,
 *  time and summary, plus a dashed load-more button. */
export declare function ActivityFooter(props: {
    base: string;
}): React.JSX.Element | null;
/** 推荐 tab: header + pool status + spotlight + recommendation cards + activity. */
export declare function RecommendView(props: {
    base: string;
    refreshKey: number;
}): React.JSX.Element;
//# sourceMappingURL=views.d.ts.map