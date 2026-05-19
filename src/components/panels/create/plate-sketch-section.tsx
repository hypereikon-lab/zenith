import { useRef } from "react";
import { Upload } from "lucide-react";
import { useZenithStore } from "@/stores/zenith-store";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { SliderField } from "@/components/controls/slider-field";
import { SelectField } from "@/components/controls/select-field";
import { PanelSection, MiniReadout } from "@/components/layout/panel-section";
import { cn } from "@/lib/utils";

export function PlateSketchSection() {
  const { readouts, controls, setControl } = useZenithStore();
  const platesInputRef = useRef<HTMLInputElement>(null);

  const handlePlatesClick = () => {
    platesInputRef.current?.click();
  };

  const handlePlatesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // TODO: Wire up plate loading
      console.log("[v0] Plate files selected:", files.length);
    }
  };

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger>Plate Sketch</CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-3 pt-3">
          {/* File upload */}
          <label className="block">
            <input
              ref={platesInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePlatesChange}
              className="sr-only"
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handlePlatesClick}
              asChild
            >
              <span className="flex items-center justify-center gap-2 cursor-pointer">
                <Upload className="size-3.5" />
                Load images
              </span>
            </Button>
          </label>

          {/* Plate controls */}
          <SelectField
            label="Fit"
            value={controls.plateFit}
            options={[
              { value: "contain", label: "Contain ratio" },
              { value: "cover", label: "Cover crop" },
            ]}
            onChange={(v) => setControl("plateFit", v as "contain" | "cover")}
          />

          <SliderField
            label="Edge fade"
            value={controls.plateFeather}
            min={0}
            max={0.18}
            step={0.005}
            onChange={(v) => setControl("plateFeather", v)}
          />

          {/* Placement toggle */}
          <label
            className={cn(
              "flex items-center justify-center gap-2 h-9 px-2.5 rounded-lg border cursor-pointer transition-colors",
              controls.editPlacement
                ? "border-accent/58 bg-accent/13 text-accent-foreground"
                : "border-border bg-input text-foreground"
            )}
          >
            <input
              type="checkbox"
              checked={controls.editPlacement}
              onChange={(e) => setControl("editPlacement", e.target.checked)}
              className="sr-only"
            />
            <span className="text-xs">Edit placement</span>
          </label>

          {/* Patch editor - shown when editPlacement is true */}
          {controls.editPlacement && (
            <div className="grid gap-2.5 p-2.5 rounded-lg border border-primary/18 bg-primary/5">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Click a plate to select it. Drag inside the selected plate to move it.
                Corner handles resize, the round handle rotates, wheel scales, and Shift+wheel rotates.
              </p>
              <div className="grid grid-cols-4 gap-2">
                <Button variant="outline" size="sm" disabled>
                  Auto arrange
                </Button>
                <Button variant="outline" size="sm" disabled>
                  Reset plate
                </Button>
                <Button variant="outline" size="sm" disabled>
                  Flip H
                </Button>
                <Button variant="outline" size="sm" disabled>
                  Flip V
                </Button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" disabled>
              Commit map
            </Button>
            <Button variant="outline" size="sm" disabled>
              Export plate PNG
            </Button>
          </div>

          <MiniReadout items={[{ label: "Plates", value: readouts.plates }]} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
