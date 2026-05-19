import { useRef } from "react";
import { cn } from "@/lib/utils";

interface ViewerCanvasProps {
  className?: string;
}

export function ViewerCanvas({ className }: ViewerCanvasProps) {
  const viewerRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLCanvasElement>(null);

  return (
    <>
      <canvas
        ref={viewerRef}
        id="viewer"
        aria-label="Fulldome hemisphere viewer"
        className={cn(
          "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1]",
          "w-[min(100vw,100vh)] h-[min(100vw,100vh)]",
          "cursor-grab touch-none",
          "data-[dragging=true]:cursor-grabbing",
          className
        )}
      />
      <canvas
        ref={hudRef}
        id="hud"
        aria-hidden="true"
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[2] w-[min(100vw,100vh)] h-[min(100vw,100vh)] pointer-events-none"
      />
    </>
  );
}
