import { useRef } from "react";
import { Upload } from "lucide-react";
import { useZenithStore } from "@/stores/zenith-store";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { SelectField } from "@/components/controls/select-field";
import { PanelSection, MiniReadout } from "@/components/layout/panel-section";

export function SessionSection() {
  const { readouts } = useZenithStore();

  return (
    <PanelSection>
      <div className="flex items-center gap-2 text-muted-foreground text-[11px] tracking-wider uppercase">
        <span className="size-1.5 rounded-full bg-warning shadow-[0_0_14px_rgba(246,200,95,0.7)]" />
        Session
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" size="sm">
          Save now
        </Button>
        <Button variant="outline" size="sm" disabled>
          Restore last
        </Button>
        <Button variant="outline" size="sm" disabled>
          Clear saved
        </Button>
      </div>

      <Button variant="outline" size="sm" className="w-full">
        Export full state
      </Button>

      <MiniReadout items={[{ label: "Session", value: readouts.session }]} />
    </PanelSection>
  );
}

export function VersionsSection() {
  const { readouts, versions } = useZenithStore();
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger>Versions</CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-3 pt-3">
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" size="sm" disabled>
              Save version
            </Button>
            <Button variant="outline" size="sm" disabled>
              Apply
            </Button>
            <Button variant="outline" size="sm" disabled>
              Delete
            </Button>
          </div>

          <SelectField
            label="Saved"
            value=""
            options={
              versions.length > 0
                ? versions.map((v) => ({ value: v.id, label: v.name }))
                : [{ value: "", label: "No versions" }]
            }
            onChange={() => {}}
            disabled={versions.length === 0}
          />

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" disabled>
              Export JSON
            </Button>
            <label className="block">
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleImportClick}
                asChild
              >
                <span className="flex items-center justify-center gap-2 cursor-pointer">
                  <Upload className="size-3.5" />
                  Import JSON
                </span>
              </Button>
            </label>
          </div>

          {/* Version gallery */}
          {versions.length > 0 && (
            <div className="grid gap-2 max-h-60 overflow-auto">
              {versions.map((version) => (
                <button
                  key={version.id}
                  className="grid grid-cols-[68px_1fr] gap-2.5 min-h-[68px] p-2 rounded-lg border border-border bg-input text-left transition-colors hover:border-primary/50"
                >
                  <div className="grid grid-cols-2 gap-1">
                    {/* Thumbnail placeholders */}
                    <div className="aspect-square rounded bg-muted/20" />
                    <div className="aspect-square rounded bg-muted/20" />
                    <div className="aspect-square rounded bg-muted/20" />
                    <div className="aspect-square rounded bg-muted/20" />
                  </div>
                  <div className="grid content-center gap-1 min-w-0">
                    <span className="text-xs text-foreground truncate">
                      {version.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(version.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <MiniReadout items={[{ label: "Versions", value: readouts.versions }]} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function OutputSection() {
  const { readouts } = useZenithStore();

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger>Output</CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-3 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm">
              Screenshot
            </Button>
            <Button variant="outline" size="sm">
              Square PNG
            </Button>
            <Button variant="outline" size="sm">
              Record MP4
            </Button>
            <Button variant="outline" size="sm">
              Mock compose
            </Button>
            <Button variant="outline" size="sm">
              6s per view
            </Button>
            <Button variant="outline" size="sm">
              Before/after
            </Button>
            <Button variant="outline" size="sm" className="col-span-2">
              Export preset
            </Button>
          </div>

          <MiniReadout items={[{ label: "Capture", value: readouts.capture }]} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
