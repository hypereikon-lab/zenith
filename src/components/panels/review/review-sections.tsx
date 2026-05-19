import { useZenithStore, VIEW_LABELS, type ViewMode } from "@/stores/zenith-store";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { SliderField } from "@/components/controls/slider-field";
import { SelectField } from "@/components/controls/select-field";
import { PanelSection } from "@/components/layout/panel-section";
import { cn } from "@/lib/utils";

export function ViewSection() {
  const { viewMode, setViewMode } = useZenithStore();

  const viewOptions: { value: ViewMode; label: string }[] = [
    { value: "inside", label: "Center" },
    { value: "theater", label: "Theater" },
    { value: "orbit", label: "Orbit" },
    { value: "flat", label: "Flat" },
    { value: "split", label: "Split" },
  ];

  return (
    <PanelSection>
      <div className="flex items-center gap-2 text-muted-foreground text-[11px] tracking-wider uppercase">
        <span className="size-1.5 rounded-full bg-warning shadow-[0_0_14px_rgba(246,200,95,0.7)]" />
        View
      </div>

      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(v) => v && setViewMode(v as ViewMode)}
        className="grid-cols-3"
      >
        {viewOptions.map((opt) => (
          <ToggleGroupItem key={opt.value} value={opt.value}>
            {opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" size="sm">
          Zenith
        </Button>
        <Button variant="outline" size="sm">
          North
        </Button>
        <Button variant="outline" size="sm">
          Horizon
        </Button>
      </div>
    </PanelSection>
  );
}

export function ProjectionSection() {
  const { controls, setControl } = useZenithStore();

  return (
    <Collapsible>
      <CollapsibleTrigger>Projection</CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-2.5 pt-3">
          <SelectField
            label="Lens"
            value={controls.projectionMode}
            options={[
              { value: "equidistant", label: "Equidistant" },
              { value: "equisolid", label: "Equisolid" },
              { value: "orthographic", label: "Orthographic" },
              { value: "stereographic", label: "Stereographic" },
              { value: "custom", label: "Custom curve" },
            ]}
            onChange={(v) => setControl("projectionMode", v as typeof controls.projectionMode)}
          />
          <SliderField
            label="FOV"
            value={controls.fov}
            min={45}
            max={130}
            step={1}
            onChange={(v) => setControl("fov", v)}
            formatValue={(v) => `${v}°`}
          />
          <SliderField
            label="Render scale"
            value={controls.renderScale}
            min={0.5}
            max={1}
            step={0.05}
            onChange={(v) => setControl("renderScale", v)}
          />
          <SliderField
            label="Mesh quality"
            value={controls.meshQuality}
            min={0}
            max={2}
            step={1}
            onChange={(v) => setControl("meshQuality", v)}
            formatValue={(v) => ["Low", "Medium", "High"][v] || String(v)}
          />
          <SliderField
            label="Map radius"
            value={controls.radiusScale}
            min={0.75}
            max={1.25}
            step={0.001}
            onChange={(v) => setControl("radiusScale", v)}
          />
          <SliderField
            label="Azimuth"
            value={controls.rotation}
            min={-180}
            max={180}
            step={0.1}
            onChange={(v) => setControl("rotation", v)}
            formatValue={(v) => `${v.toFixed(1)}°`}
          />
          <SliderField
            label="Dome tilt"
            value={controls.domeTilt}
            min={-35}
            max={35}
            step={0.1}
            onChange={(v) => setControl("domeTilt", v)}
            formatValue={(v) => `${v.toFixed(1)}°`}
          />
          <SliderField
            label="Eye drop"
            value={controls.theaterEyeDrop}
            min={0}
            max={0.85}
            step={0.01}
            onChange={(v) => setControl("theaterEyeDrop", v)}
          />
          <SliderField
            label="Seat back"
            value={controls.theaterSeatBack}
            min={0}
            max={1.35}
            step={0.01}
            onChange={(v) => setControl("theaterSeatBack", v)}
          />
          <SliderField
            label="View pitch"
            value={controls.theaterPitch}
            min={4}
            max={68}
            step={0.1}
            onChange={(v) => setControl("theaterPitch", v)}
            formatValue={(v) => `${v.toFixed(1)}°`}
          />
          <SliderField
            label="Curve"
            value={controls.customCurve}
            min={0.35}
            max={2.5}
            step={0.01}
            onChange={(v) => setControl("customCurve", v)}
          />
          <SliderField
            label="Shell shade"
            value={controls.shellShade}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setControl("shellShade", v)}
          />
          <SliderField
            label="Floor"
            value={controls.floorOpacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setControl("floorOpacity", v)}
          />
          <SliderField
            label="Exposure"
            value={controls.exposure}
            min={0.25}
            max={2.5}
            step={0.01}
            onChange={(v) => setControl("exposure", v)}
          />
          <SliderField
            label="Overlay"
            value={controls.overlayOpacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setControl("overlayOpacity", v)}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function OverlaysSection() {
  const { controls, setControl } = useZenithStore();

  const toggles: { key: keyof typeof controls; label: string }[] = [
    { key: "mirror", label: "Mirror" },
    { key: "autoRotate", label: "Auto orbit" },
    { key: "showRings", label: "Rings" },
    { key: "showSpokes", label: "Spokes" },
    { key: "showHorizon", label: "Horizon" },
    { key: "showLabels", label: "Labels" },
    { key: "showSourceCircle", label: "Source circle" },
    { key: "showZenith", label: "Zenith" },
  ];

  return (
    <PanelSection>
      <div className="flex items-center gap-2 text-muted-foreground text-[11px] tracking-wider uppercase">
        <span className="size-1.5 rounded-full bg-warning shadow-[0_0_14px_rgba(246,200,95,0.7)]" />
        Overlays
      </div>

      <div className="grid grid-cols-2 gap-2">
        {toggles.map(({ key, label }) => (
          <label
            key={key}
            className={cn(
              "flex items-center gap-2 min-h-[34px] px-2 rounded-lg border text-xs cursor-pointer transition-colors",
              controls[key]
                ? "border-accent/40 bg-accent/10 text-accent-foreground"
                : "border-border/60 bg-input/45 text-[#dce2dc]"
            )}
          >
            <input
              type="checkbox"
              checked={controls[key] as boolean}
              onChange={(e) => setControl(key, e.target.checked as never)}
              className="accent-primary"
            />
            {label}
          </label>
        ))}
      </div>
    </PanelSection>
  );
}
