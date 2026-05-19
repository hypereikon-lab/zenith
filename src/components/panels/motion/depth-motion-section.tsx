import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useZenithStore } from "@/stores/zenith-store";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { SliderField } from "@/components/controls/slider-field";
import { NumberField } from "@/components/controls/number-field";
import { SelectField } from "@/components/controls/select-field";
import { PromptField } from "@/components/controls/prompt-field";
import { MiniReadout } from "@/components/layout/panel-section";
import { cn } from "@/lib/utils";

export function DepthMotionSection() {
  const { readouts, controls, setControl, setDepthMotionControl } = useZenithStore();
  const [showMotion, setShowMotion] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const dm = controls.depthMotion;

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger>2.5D Motion Reference</CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-3 pt-3">
          {/* Primary action */}
          <Button variant="primary" disabled>
            Generate depth
          </Button>

          {/* Depth prompt */}
          <PromptField
            label="Depth prompt"
            value={controls.depthPrompt}
            onChange={(v) => setControl("depthPrompt", v)}
            rows={5}
          />

          {/* Seedance prompt preview */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2.5">
              <span className="text-[13px] text-[#cfd6d1]">Seedance prompt</span>
              <span className="text-[11px] text-muted uppercase">Not planned</span>
            </div>
            <p className="m-0 p-2 rounded-lg border border-border bg-input/45 text-foreground text-sm leading-relaxed whitespace-pre-wrap">
              {controls.seedancePrompt || "Generated on send"}
            </p>
          </div>

          {/* Essential controls - always visible */}
          <Card className="border-primary/15 bg-primary/5">
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Essential
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2.5 p-3 pt-0">
              <NumberField
                label="Near m"
                value={dm.near}
                min={0.01}
                max={1000}
                step={0.01}
                onChange={(v) => setDepthMotionControl("near", v)}
              />
              <NumberField
                label="Far m"
                value={dm.far}
                min={0.02}
                max={5000}
                step={0.1}
                onChange={(v) => setDepthMotionControl("far", v)}
              />
              <NumberField
                label="Duration"
                value={dm.duration}
                min={1}
                max={15}
                step={0.5}
                onChange={(v) => setDepthMotionControl("duration", v)}
              />
              <NumberField
                label="FPS"
                value={dm.fps}
                min={6}
                max={30}
                step={1}
                onChange={(v) => setDepthMotionControl("fps", v)}
              />
            </CardContent>
          </Card>

          {/* Motion controls - collapsible */}
          <Collapsible open={showMotion} onOpenChange={setShowMotion}>
            <button
              onClick={() => setShowMotion(!showMotion)}
              className="flex w-full items-center justify-between gap-2 py-2 text-[11px] text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
            >
              <span className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(124,231,238,0.5)]" />
                Camera Motion
              </span>
              <ChevronDown className={cn("size-4 transition-transform", showMotion && "rotate-180")} />
            </button>
            <CollapsibleContent>
              <Card className="border-primary/15 bg-primary/5">
                <CardContent className="grid gap-2.5 p-3">
                  <SliderField
                    label="Yaw"
                    value={dm.yaw}
                    min={-45}
                    max={45}
                    step={0.1}
                    onChange={(v) => setDepthMotionControl("yaw", v)}
                  />
                  <SliderField
                    label="Pitch"
                    value={dm.pitch}
                    min={-20}
                    max={20}
                    step={0.1}
                    onChange={(v) => setDepthMotionControl("pitch", v)}
                  />
                  <SliderField
                    label="Roll"
                    value={dm.roll}
                    min={-12}
                    max={12}
                    step={0.1}
                    onChange={(v) => setDepthMotionControl("roll", v)}
                  />
                  <SliderField
                    label="Truck m"
                    value={dm.truck}
                    min={-6}
                    max={6}
                    step={0.01}
                    onChange={(v) => setDepthMotionControl("truck", v)}
                  />
                  <SliderField
                    label="Lift m"
                    value={dm.lift}
                    min={-3}
                    max={3}
                    step={0.01}
                    onChange={(v) => setDepthMotionControl("lift", v)}
                  />
                  <SliderField
                    label="Push m"
                    value={dm.push}
                    min={-6}
                    max={6}
                    step={0.01}
                    onChange={(v) => setDepthMotionControl("push", v)}
                  />
                  <SliderField
                    label="Motion gain"
                    value={dm.motionGain}
                    min={0.25}
                    max={8}
                    step={0.05}
                    onChange={(v) => setDepthMotionControl("motionGain", v)}
                  />
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {/* Advanced controls - collapsible */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full items-center justify-between gap-2 py-2 text-[11px] text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
            >
              <span className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-warning shadow-[0_0_10px_rgba(246,200,95,0.5)]" />
                Advanced
              </span>
              <ChevronDown className={cn("size-4 transition-transform", showAdvanced && "rotate-180")} />
            </button>
            <CollapsibleContent>
              <Card className="border-warning/15 bg-warning/5">
                <CardContent className="grid gap-2.5 p-3">
                  <SliderField
                    label="Depth contrast"
                    value={dm.contrast}
                    min={0.5}
                    max={3}
                    step={0.05}
                    onChange={(v) => setDepthMotionControl("contrast", v)}
                  />
                  <SliderField
                    label="Guide noise"
                    value={dm.guideNoise}
                    min={0}
                    max={0.16}
                    step={0.005}
                    onChange={(v) => setDepthMotionControl("guideNoise", v)}
                  />
                  <SliderField
                    label="Gap fill"
                    value={dm.gapFill}
                    min={0}
                    max={5}
                    step={1}
                    onChange={(v) => setDepthMotionControl("gapFill", v)}
                  />
                  <SelectField
                    label="Depth tone"
                    value={dm.polarity}
                    options={[
                      { value: "brightFar", label: "Bright is far" },
                      { value: "brightNear", label: "Bright is near" },
                    ]}
                    onChange={(v) => setDepthMotionControl("polarity", v as typeof dm.polarity)}
                  />
                  <SelectField
                    label="Guide look"
                    value={dm.guideMode}
                    options={[
                      { value: "source", label: "Source color" },
                      { value: "depthShaded", label: "Depth shaded mono" },
                      { value: "depthMap", label: "Depth map mono" },
                    ]}
                    onChange={(v) => setDepthMotionControl("guideMode", v as typeof dm.guideMode)}
                  />
                  <SelectField
                    label="Export size"
                    value={String(dm.exportSize)}
                    options={[
                      { value: "720", label: "720 square" },
                      { value: "1024", label: "1024 square" },
                      { value: "1280", label: "1280 square" },
                    ]}
                    onChange={(v) => setDepthMotionControl("exportSize", Number(v))}
                  />
                  <SelectField
                    label="Prompt mode"
                    value={dm.promptMode}
                    options={[
                      { value: "auto", label: "Auto repair" },
                      { value: "strict_repair", label: "Strict repair" },
                      { value: "conservative_lock", label: "Conservative lock" },
                      { value: "more_volumetric", label: "More volumetric" },
                    ]}
                    onChange={(v) => setDepthMotionControl("promptMode", v as typeof dm.promptMode)}
                  />
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {/* Action buttons */}
          <div className="grid grid-cols-4 gap-2">
            <Button variant="outline" size="sm" disabled>
              Play GPU
            </Button>
            <Button variant="primary" size="sm" disabled>
              Export MP4
            </Button>
            <Button variant="outline" size="sm" disabled>
              Plan prompt
            </Button>
            <Button variant="primary" size="sm" disabled>
              Generate video
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" disabled>
              Show video
            </Button>
            <Button variant="outline" size="sm" disabled>
              Export Seedance
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm">
              Copy config
            </Button>
            <Button variant="outline" size="sm">
              Export config
            </Button>
          </div>

          {/* Results strip */}
          <div className="grid grid-cols-2 gap-2 min-h-0 empty:hidden" />

          <MiniReadout items={[{ label: "Depth", value: readouts.depthMotion }]} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
