import { useZenithStore } from "@/stores/zenith-store";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { SelectField } from "@/components/controls/select-field";
import { PromptField } from "@/components/controls/prompt-field";
import { MiniReadout } from "@/components/layout/panel-section";

export function InpaintSection() {
  const { readouts, controls, setControl } = useZenithStore();

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger>Inpaint Handoff</CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-3 pt-3">
          <SelectField
            label="Quality"
            value={controls.runwayQuality}
            options={[
              { value: "auto", label: "Auto" },
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" },
            ]}
            onChange={(v) => setControl("runwayQuality", v as typeof controls.runwayQuality)}
          />

          <PromptField
            label="Prompt"
            value={controls.runwayPrompt}
            onChange={(v) => setControl("runwayPrompt", v)}
            rows={6}
          />

          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" size="sm" disabled>
              Run inpaint
            </Button>
            <Button variant="outline" size="sm" disabled>
              Export PNG
            </Button>
          </div>

          {/* Results strip - would show thumbnails */}
          <div className="grid grid-cols-4 gap-2 min-h-0 empty:hidden" />

          <MiniReadout items={[{ label: "Inpaint", value: readouts.inpaint }]} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
