import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-caption font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring/25",
  {
    variants: {
      /* Washes with a hairline, not solid chips — see StatusBadge for why. */
      variant: {
        default: "border-brand/25 bg-brand/10 text-brand",
        secondary: "border-border bg-secondary text-muted-foreground",
        destructive: "border-destructive/25 bg-destructive/10 text-destructive",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
