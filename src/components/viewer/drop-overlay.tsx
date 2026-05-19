import { cn } from "@/lib/utils";

interface DropOverlayProps {
  visible: boolean;
  className?: string;
}

export function DropOverlay({ visible, className }: DropOverlayProps) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-[8] place-items-center bg-background/72 text-warning font-bold",
        "text-[clamp(24px,4vw,44px)] tracking-normal pointer-events-none",
        visible ? "grid" : "hidden",
        className
      )}
    >
      Drop media
    </div>
  );
}
