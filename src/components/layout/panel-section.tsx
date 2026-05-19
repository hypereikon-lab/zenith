import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MiniReadoutProps {
  items: { label: string; value: string }[];
  className?: string;
}

export function MiniReadout({ items, className }: MiniReadoutProps) {
  return (
    <dl className={cn("grid gap-2 mt-0.5", className)}>
      {items.map(({ label, value }) => (
        <div key={label} className="grid grid-cols-[72px_1fr] gap-2.5">
          <dt className="m-0 text-xs text-muted leading-normal">{label}</dt>
          <dd className="m-0 text-xs text-foreground leading-normal break-words">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface PanelSectionProps {
  children: ReactNode;
  className?: string;
}

export function PanelSection({ children, className }: PanelSectionProps) {
  return (
    <div
      className={cn(
        "grid gap-3 mt-3 pt-3 border-t border-border/60",
        className
      )}
    >
      {children}
    </div>
  );
}
