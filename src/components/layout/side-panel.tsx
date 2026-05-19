import { useRef, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { useZenithStore } from "@/stores/zenith-store";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface SidePanelProps {
  children: ReactNode;
  className?: string;
}

export function SidePanel({ children, className }: SidePanelProps) {
  const { panelHidden, gpuState, gpuError, activeWorkspace, setActiveWorkspace } = useZenithStore();
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const handleMediaClick = () => {
    mediaInputRef.current?.click();
  };

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // TODO: Wire up media loading
      console.log("[v0] Media file selected:", file.name);
    }
  };

  return (
    <section
      className={cn(
        "fixed top-4 left-4 z-[4] w-[min(418px,calc(100vw-32px))] max-h-[calc(100vh-112px)]",
        "overflow-auto rounded-lg border border-border bg-card shadow-lg backdrop-blur-[22px] saturate-[1.18]",
        "p-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-primary/34",
        panelHidden && "hidden",
        className
      )}
      aria-label="Viewer controls"
    >
      {/* Brand header */}
      <div className="flex items-start justify-between gap-3.5 mb-3">
        <div>
          <p className="text-accent text-[11px] leading-relaxed tracking-[0.08em] uppercase">
            Runway API hackathon
          </p>
          <h1 className="text-[#fffaf0] text-[25px] leading-tight font-bold tracking-normal m-0">
            Zenith
          </h1>
          <p className="text-muted-foreground text-xs leading-normal m-0">
            Fulldome generation cockpit
          </p>
        </div>
        <div
          className={cn(
            "flex-shrink-0 min-w-[78px] px-2 py-1.5 rounded-full border text-xs text-center",
            gpuError
              ? "border-destructive/34 bg-destructive/12 text-[#ffbbb5]"
              : "border-accent/32 bg-accent/10 text-[#d7ffc8]"
          )}
        >
          {gpuState}
        </div>
      </div>

      {/* Primary media load */}
      <label className="block w-full mb-3">
        <input
          ref={mediaInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={handleMediaChange}
          className="sr-only"
        />
        <Button
          variant="primary"
          className="w-full h-11"
          onClick={handleMediaClick}
          asChild
        >
          <span className="flex items-center justify-center gap-2 cursor-pointer">
            <Upload className="size-4" />
            Load source media
          </span>
        </Button>
      </label>

      {/* Workspace tabs */}
      <Tabs
        value={activeWorkspace}
        onValueChange={(v) => setActiveWorkspace(v as typeof activeWorkspace)}
      >
        <TabsList className="grid-cols-4 mb-0.5">
          <TabsTrigger value="create" index="01">
            Create
          </TabsTrigger>
          <TabsTrigger value="motion" index="02">
            Motion
          </TabsTrigger>
          <TabsTrigger value="review" index="03">
            Review
          </TabsTrigger>
          <TabsTrigger value="workspace" index="04">
            Workspace
          </TabsTrigger>
        </TabsList>

        {children}
      </Tabs>
    </section>
  );
}
