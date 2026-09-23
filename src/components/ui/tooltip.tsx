import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

/*
  `disableHoverableContent` — a tooltip is never a hover target of its own.
  Without it Radix keeps the bubble open so the pointer can travel into it,
  which is only useful for tooltips containing links. Ours contain a word.
*/
const TooltipProvider = ({
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) => (
  <TooltipPrimitive.Provider disableHoverableContent {...props}>
    {children}
  </TooltipPrimitive.Provider>
);

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    // Hook for the wrapper rule in globals.css — Radix owns the positioning
    // div around this element and it cannot be given a class from here.
    data-tooltip=""
    className={cn(
      // `pointer-events-none` is load-bearing, not cosmetic.
      //
      // The bubble is positioned beside its trigger, so a tooltip on the
      // collapsed nav rail floats over the page content next to it. With the
      // default `pointer-events: auto` it becomes the topmost element in that
      // strip and swallows the click meant for whatever sits underneath — the
      // first click only dismisses the tooltip, and the control appears to
      // need two clicks. A tooltip is purely informational and must never be
      // a hit-test target.
      "pointer-events-none z-50 overflow-hidden rounded-md border border-input bg-popover px-2.5 py-1.5 text-body-sm text-popover-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
