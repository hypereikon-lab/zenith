import { useZenithStore } from "@/stores/zenith-store";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { SelectField } from "@/components/controls/select-field";

export function ImageToVideoSection() {
  const { controls, setControl } = useZenithStore();

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger>Image to Fulldome Video</CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-3 pt-3">
          {/* Prompt preview */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2.5">
              <span className="text-[13px] text-[#cfd6d1]">Image prompt</span>
              <span className="text-[11px] text-muted uppercase">Not planned</span>
            </div>
            <p className="m-0 p-2 rounded-lg border border-border bg-input/45 text-foreground text-sm leading-relaxed whitespace-pre-wrap">
              {controls.imageSeedancePrompt || "Generated on send"}
            </p>
          </div>

          <SelectField
            label="Motion mode"
            value={controls.imageSeedancePromptMode}
            options={[
              { value: "auto", label: "Auto event" },
              { value: "ambient_scene_motion", label: "Ambient scene" },
              { value: "scene_event", label: "Scene event" },
              { value: "material_life", label: "Material life" },
            ]}
            onChange={(v) => setControl("imageSeedancePromptMode", v as typeof controls.imageSeedancePromptMode)}
          />

          <SelectField
            label="Size"
            value={controls.imageSeedanceRatio}
            options={[
              { value: "auto", label: "Auto" },
              { value: "960:960", label: "960 square" },
              { value: "640:640", label: "640 square" },
              { value: "1280:720", label: "1280 x 720" },
              { value: "720:1280", label: "720 x 1280" },
            ]}
            onChange={(v) => setControl("imageSeedanceRatio", v)}
          />

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" disabled>
              Plan image prompt
            </Button>
            <Button variant="primary" size="sm" disabled>
              Generate video
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
