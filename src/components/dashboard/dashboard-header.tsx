import { AppIcon } from "@/components/ui/app-icon";

interface DashboardHeaderProps {
  title: string;
  breadcrumb: string;
}

/** Breadcrumb plus screen title. */
export function DashboardHeader({ title, breadcrumb }: DashboardHeaderProps) {
  return (
    <header>
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-body-sm text-tertiary">
          <li className="flex items-center">
            <AppIcon name="home" size="sm" />
            <span className="sr-only">Home</span>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-secondary">{breadcrumb}</li>
        </ol>
      </nav>
      <h1 className="mt-3 font-display text-display-page text-primary">{title}</h1>
    </header>
  );
}
