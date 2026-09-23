import { cn } from "@/lib/utils";
import { DashboardIcon, type DashboardIconName } from "@/components/app/dashboard-icon";

interface SectionProps {
  title?: string;
  /** The illustrated icon for this section, drawn before the title. */
  iconName?: DashboardIconName;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /**
   * Draw a container around the content. Off by default — most sections read
   * better as content on the page than as another bordered box.
   */
  bordered?: boolean;
  className?: string;
}

/**
 * A titled region of a page.
 *
 * Replaces the `bg-card rounded-lg border p-4` wrapper that was applied to
 * roughly ninety blocks. Separation comes from the heading and whitespace;
 * a border is opt-in for the cases that genuinely need enclosing.
 *
 * The title is an eyebrow rather than a heading. A page carries one thing set
 * at title size — the page title — and everything below it is labelled. That
 * keeps a screen with nine sections from reading as nine competing pages.
 */
export function Section({
  title,
  iconName,
  description,
  actions,
  children,
  bordered = false,
  className,
}: SectionProps) {
  return (
    <section className={cn("min-w-0", className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-end justify-between gap-4">
          <div className="min-w-0">
            {title && (
              <h2 className="flex items-center gap-2">
                {iconName && <DashboardIcon name={iconName} />}
                <span className="label-caps">{title}</span>
              </h2>
            )}
            {description && (
              <p className="mt-1.5 text-body-sm text-ink-tertiary">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(bordered && "surface-panel p-5")}>{children}</div>
    </section>
  );
}
