import { cn } from "@/lib/utils";
import { PageIcon } from "@/components/app/page-icon";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Right-aligned controls: primary action, filters, date range. */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * The single page-title treatment for Anvaya.
 *
 * Pages previously opened with an ad-hoc h1 that repeated the breadcrumb.
 * Title lives here; the breadcrumb stays in the app header, so the two are
 * never duplicated.
 *
 * Set in the display face at regular weight rather than small and bold. It is
 * the one place per page where Michroma appears at size, and at 28px its wide
 * technical letterforms carry the hierarchy on their own — a bold cut would
 * fight the dense figures immediately below it.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    // Actions align with the title, not the description: at this title size,
    // hanging them off the last line leaves them stranded mid-block.
    <header className={cn("flex flex-wrap items-start justify-between gap-x-6 gap-y-4 pb-6", className)}>
      <div className="min-w-0">
        {/* The mark resolves itself from the route, so a page opts in by
            rendering the title and nothing more. Pages without one keep the
            heading exactly as it was. */}
        <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">{title}</span>
        </h1>
        {description && (
          <p className="mt-2 max-w-[68ch] text-body-md text-ink-tertiary">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1">{actions}</div>}
    </header>
  );
}
