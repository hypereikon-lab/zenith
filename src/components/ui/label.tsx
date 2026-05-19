import * as React from "react";
import { cn } from "@/lib/utils";

const Label = React.forwardRef<
  HTMLLabelElement,
  React.ComponentProps<"label">
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "text-sm text-muted-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-45",
      className
    )}
    {...props}
  />
));
Label.displayName = "Label";

export { Label };
