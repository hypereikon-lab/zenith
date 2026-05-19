import { useState } from "react";
import { TabsContent } from "@/components/ui/tabs";
import { SidePanel } from "@/components/layout/side-panel";
import { Readout } from "@/components/layout/readout";
import { TransportBar } from "@/components/layout/transport-bar";
import { ViewerCanvas } from "@/components/viewer/viewer-canvas";
import { DropOverlay } from "@/components/viewer/drop-overlay";
import { PlateSketchSection } from "@/components/panels/create/plate-sketch-section";
import { InpaintSection } from "@/components/panels/create/inpaint-section";
import { DepthMotionSection } from "@/components/panels/motion/depth-motion-section";
import { ImageToVideoSection } from "@/components/panels/motion/image-to-video-section";
import { ViewSection, ProjectionSection, OverlaysSection } from "@/components/panels/review/review-sections";
import { SessionSection, VersionsSection, OutputSection } from "@/components/panels/workspace/workspace-sections";
import { PanelSection } from "@/components/layout/panel-section";

export default function App() {
  const [dropVisible, setDropVisible] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setDragDepth((d) => d + 1);
    setDropVisible(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragLeave = () => {
    setDragDepth((d) => {
      const next = Math.max(0, d - 1);
      if (next === 0) setDropVisible(false);
      return next;
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragDepth(0);
    setDropVisible(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      console.log("[v0] Dropped file:", file.name);
      // TODO: Wire up file loading
    }
  };

  return (
    <main
      className="w-full h-full overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* WebGPU canvases */}
      <ViewerCanvas />

      {/* Drop overlay */}
      <DropOverlay visible={dropVisible} />

      {/* Control panel */}
      <SidePanel>
        {/* Create tab */}
        <TabsContent value="create" className="mt-0">
          <PanelSection>
            <PlateSketchSection />
          </PanelSection>
          <PanelSection>
            <InpaintSection />
          </PanelSection>
        </TabsContent>

        {/* Motion tab */}
        <TabsContent value="motion" className="mt-0">
          <PanelSection>
            <DepthMotionSection />
          </PanelSection>
          <PanelSection>
            <ImageToVideoSection />
          </PanelSection>
        </TabsContent>

        {/* Review tab */}
        <TabsContent value="review" className="mt-0">
          <ViewSection />
          <PanelSection>
            <ProjectionSection />
          </PanelSection>
          <OverlaysSection />
        </TabsContent>

        {/* Workspace tab */}
        <TabsContent value="workspace" className="mt-0">
          <SessionSection />
          <PanelSection>
            <VersionsSection />
          </PanelSection>
          <PanelSection>
            <OutputSection />
          </PanelSection>
        </TabsContent>
      </SidePanel>

      {/* Info readout */}
      <Readout />

      {/* Video transport */}
      <TransportBar />

      {/* Hidden video element for video sources */}
      <video id="videoSource" className="hidden" muted loop playsInline />
    </main>
  );
}
