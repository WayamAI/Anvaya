import { House } from "lucide-react";

interface CommandHeaderProps {
  title: string;
  breadcrumb: string;
}

export function CommandHeader({ title, breadcrumb }: CommandHeaderProps) {
  return (
    <header>
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-[12px] leading-none text-muted">
          <li className="flex items-center">
            <House className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <span className="sr-only">Home</span>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-secondary">{breadcrumb}</li>
        </ol>
      </nav>
      <h1 className="mt-2.5 text-[27px] font-light leading-none tracking-[-0.02em] text-primary">
        {title}
      </h1>
    </header>
  );
}
