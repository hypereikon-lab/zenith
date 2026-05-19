import { useZenithStore } from "@/stores/zenith-store";
import { cn } from "@/lib/utils";

interface ReadoutProps {
  className?: string;
}

export function Readout({ className }: ReadoutProps) {
  const { readouts } = useZenithStore();

  const items = [
    { label: "Source", value: readouts.source },
    { label: "Media", value: readouts.media },
    { label: "View", value: readouts.view },
    { label: "Upload", value: readouts.upload },
    { label: "Renderer", value: readouts.perf },
  ];

  return (
    <dl
      className={cn(
        "fixed top-4 right-4 z-[3] w-[min(320px,calc(100vw-470px))]",
        "grid gap-2 m-0 p-3 rounded-lg border border-border",
        "bg-[rgba(8,10,10,0.72)] shadow-[0_20px_60px_rgba(0,0,0,0.36)]",
        "backdrop-blur-[20px] saturate-[1.12]",
        "max-md:hidden",
        className
      )}
    >
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
