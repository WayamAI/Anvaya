interface StatusBadgeProps {
  status: "green" | "amber" | "red" | "blue" | "gray";
  label: string;
}

/*
  A state marker.

  Every variant is a solid saturated pill with white text — same fill weight,
  same padding, same shape — so a status column reads as one set of labels
  distinguished by hue rather than as a mix of chips and washes. Hue alone
  carries the meaning, which is why the fills come from five clearly separated
  points on the colour wheel rather than five steps of one ramp.

  Fills live in the badge tokens (see globals.css) so the pair of background
  and foreground is chosen together and stays identical across both themes.
*/
const styles: Record<StatusBadgeProps["status"], string> = {
  green: "bg-[hsl(var(--badge-ok-bg))] text-[hsl(var(--badge-ok-fg))]",
  amber: "bg-[hsl(var(--badge-low-bg))] text-[hsl(var(--badge-low-fg))]",
  red: "bg-[hsl(var(--badge-critical-bg))] text-[hsl(var(--badge-critical-fg))]",
  blue: "bg-[hsl(var(--badge-info-bg))] text-[hsl(var(--badge-info-fg))]",
  gray: "bg-[hsl(var(--badge-neutral-bg))] text-[hsl(var(--badge-neutral-fg))]",
};

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex max-w-full items-center justify-center truncate whitespace-nowrap rounded-full px-3 py-0.5 text-caption font-medium ${styles[status]}`}
    >
      {label}
    </span>
  );
}
