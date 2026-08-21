/** Composed props: the sidebar's `wide` owner share + the injected toggle. */
export type NewsClawSidebarButtonProps = {
    wide: boolean;
    togglePanel: () => void;
};
/**
 * Render the sidebar trigger row.
 * @param props - `wide` (column display state) + `togglePanel` callback.
 * @returns the trigger button.
 */
export declare function NewsClawSidebarButton({ wide, togglePanel }: NewsClawSidebarButtonProps): React.JSX.Element;
//# sourceMappingURL=sidebarButton.d.ts.map