/**
 * Shared control styling.
 *
 * Buttons across the ERP had three heights, three radii, two type sizes and
 * three different fills. These constants are the single source for sizing,
 * typography, border, focus and disabled treatment; components keep their own
 * markup and behaviour and only borrow the classes.
 *
 * Shape follows the reference system: every control that is not a text field
 * is a fully-rounded pill at 32px, set in the 12px medium label size. A pill
 * is the one shape a filter chip, a toolbar button, a segmented toggle and a
 * select can all take, so a dense toolbar reads as one instrument instead of
 * five borrowed ones. Text fields keep the pill too, but at a softer fill so
 * the thing you can type into is distinguishable from the thing you press.
 */

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-full text-label-sm whitespace-nowrap " +
  "transition-colors duration-200 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-1 focus-visible:ring-offset-background " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "[&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0 [&_.chronos-icon]:h-3.5 [&_.chronos-icon]:w-3.5";

/** The main action. Near-black, and at most one per screen. */
export const btnPrimary = `${base} h-8 px-3.5 bg-primary text-primary-foreground hover:bg-primary/90`;

/** The default for almost every action. */
export const btnSecondary = `${base} h-8 px-3 border border-border bg-secondary text-secondary-foreground hover:border-input hover:bg-sunken`;

/** Toolbar and inline actions that should not compete for attention. */
export const btnGhost = `${base} h-8 px-3 text-muted-foreground hover:bg-secondary hover:text-foreground`;

/** Irreversible actions only. Restrained: an outline, not a red slab. */
export const btnDestructive = `${base} h-8 px-3 border border-danger/30 bg-transparent text-danger hover:bg-danger/10`;

/** Compact variants for table rows and dense toolbars. */
export const btnSecondarySm = `${base} h-7 px-2.5 border border-border bg-secondary text-secondary-foreground hover:border-input hover:bg-sunken`;
export const btnGhostSm = `${base} h-7 px-2 text-muted-foreground hover:bg-secondary hover:text-foreground`;

/** Text-only action, e.g. "View all". Never the brand colour. */
export const btnLink =
  "text-body-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 rounded-sm";

const field =
  "h-8 w-full rounded-full border border-border bg-secondary px-3 text-label-sm text-ink-secondary " +
  "placeholder:text-ink-quaternary transition-colors " +
  "focus-visible:outline-none focus-visible:border-input focus-visible:ring-2 focus-visible:ring-ring/20 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export const inputBase = field;
export const selectBase = `${field} cursor-pointer pr-8`;
export const inputSm = `${field.replace("h-8", "h-7")} px-2.5`;
export const selectSm = `${inputSm} cursor-pointer pr-7`;
