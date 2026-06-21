<script lang="ts">
  import { onMount } from "svelte";
  import {
    changeViewerMode,
    changeProjectionProfile,
    installPlateSketchCommitHandler,
    setDomeGuideHorizonSplit,
    setDomeGuideSemanticSplit,
  } from "../app/workbench-commands.js";
  import { DEFAULT_ACTIVE_PLATE_INDEX, DEFAULT_PLATE_PLACEMENTS, DEFAULT_PLATE_REFERENCES } from "../app/default-profile.js";
  import {
    addArtifactResult,
    selectArtifact,
    setArtifactMediaHandle,
    updateArtifact,
    workbench,
  } from "../artifacts/artifact-store.svelte.js";
  import { visiblePlateUvBounds } from "../geometry/flat-domemaster.js";
  import { CAVE_HANDOFF_GUIDE, caveGuideFloorBands, caveGuideHorizonBand, caveGuideWallBands } from "../geometry/cave-handoff-guide.js";
  import { domeGuideScaffold } from "../geometry/dome-handoff-guide.js";
  import { projectPlateScreenControls } from "../geometry/plate-screen-controls.js";
  import { sourceGuideBreakpoints, sourceGuideCarrierHorizonRadius, sourceGuideZones } from "../geometry/source-guide-semantics.js";
  import {
    eulerDegreesFromQuaternion,
    lookAtPivot,
    quaternionFromEulerDegrees,
  } from "../geometry/camera-rig.js";
  import {
    applyProjectionCameraPointerDrag,
    applyProjectionCameraWheel,
    nudgeProjectionCamera,
    projectionCameraControlHelp,
  } from "../geometry/projection-camera-controls.js";
  import {
    SOURCE_PROJECTION_MODES,
    sourceProjectionHorizonRadius,
    sourceProjectionLabel,
    sourceProjectionSummary,
    type SourceProjectionMode,
  } from "../geometry/source-projection.js";
  import { canvasToBlob, downloadBlob } from "../media/canvas-utils.js";
  import {
    MAX_PLATE_SCALE,
    MIN_PLATE_SCALE,
    clonePlateCornerOffsets,
    normalizePlatePlacement,
    plateLocalToWarpedUv,
    preparePlatePlacement,
  } from "../plates/plate-placement.js";
  import {
    PLATE_EDITOR_VIEW_MODES,
    defaultPlateEditorCamera,
    plateEditorViewDisabledReason,
    plateEditorViewLabel,
  } from "../plates/plate-editor-view.js";
  import {
    cornerOffsetsFromSourceLocalDrag,
    moveDomePointBySourcePointerDrag,
    plateLocalFromSourceDirection,
    scaleFromSourceLocalDrag,
    spinFromSourceLocalRotateDrag,
  } from "../plates/plate-drag-math.js";
  import { createPlateEditorProjectionAdapter } from "../plates/plate-editor-projection-adapter.js";
  import { createPlateSketchGpuRenderer } from "../plates/plate-sketch-gpu-renderer.js";
  import CameraControlsPanel from "./CameraControlsPanel.svelte";
  import { clamp, wrapDegrees } from "../projection.js";
  import type {
    NormalizedPlatePlacement,
    PlateCorner,
    PlateCornerOffsets,
    PlatePlacementInput,
    PlateLike,
    PreparedPlatePlacement,
  } from "../plates/plate-placement.js";
  import type { PlateEditorProjectionAdapter } from "../plates/plate-editor-projection-adapter.js";
  import type { PlateSketchGpuRenderer } from "../plates/plate-sketch-gpu-renderer.js";
  import type { PlateSketchRenderOptions } from "../plates/plate-sketch-gpu-renderer.js";
  import type { PlateRenderOptions } from "../plates/plate-gpu-compositor.js";
  import type { PlateEditorViewMode } from "../plates/plate-editor-view.js";
  import type { ProjectionCameraDragModifiers } from "../geometry/projection-camera-controls.js";
  import type { SourceGuideBreakpoint } from "../geometry/source-guide-semantics.js";
  import type { Point2D, Rect, Vec3 } from "../projection.js";

  const PREVIEW_SIZE = 768;
  const COMMIT_SIZE = 2048;
  const HANDLE_RADIUS = 28;
  const PLATE_HIT_LOCAL_PAD = 0.012;
  const GUIDE_SPOKE_COUNT = CAVE_HANDOFF_GUIDE.baseSpokeCount;

  let renderCanvas = $state<HTMLCanvasElement | null>(null);
  let previewCanvas = $state<HTMLCanvasElement | null>(null);
  let plates = $state<PlateSketchImage[]>([]);
  let placements = $state<NormalizedPlatePlacement[]>([]);
  let activeIndex = $state(0);
  let plateFit = $state("contain");
  let plateFeather = $state(0.02);
  let plateEditMode = $state<"scale" | "warp">("scale");
  let plateProjectionViewMode = $state<PlateEditorViewMode>("source-map");
  let showCaveMask = $state<boolean>(false);
  let invertCaveMask = $state<boolean>(false);
  let canvasWidth = $state(768);
  let canvasHeight = $state(768);
  let viewCamera = $state(defaultPlateEditorCamera(workbench.projectionProfile));
  let renderStatus = $state("Load plates or use the default references.");
  let gpuRenderer = $state.raw<PlateSketchGpuRenderer | null>(null);
  let gpuRendererPromise: Promise<PlateSketchGpuRenderer> | null = null;
  let activeDrag: PlateEditorDrag | null = null;
  let activeGuideBreakpointDrag: GuideBreakpointDrag | null = null;
  let previewFrame: number | null = null;
  let previousProjectionProfile = workbench.projectionProfile;
  let previousViewerMode = workbench.viewerMode;

  type PlateSketchImage = PlateRenderOptions["plates"][number] & {
    name: string;
    aspect: number;
    canvas: HTMLCanvasElement;
  };

  let activePlacement = $derived(placements[activeIndex] || null);
  let activePlate = $derived(plates[activeIndex] || null);
  let canCommit = $derived(plates.length > 0 && placements.length >= plates.length);
  let projectionSummary = $derived(sourceProjectionSummary(workbench.projectionProfile, workbench.domeGuideSemanticSplit));
  let guideBreakpoints = $derived(
    sourceGuideBreakpoints(workbench.projectionProfile, workbench.domeGuideSemanticSplit, workbench.domeGuideHorizonSplit),
  );
  let guideZones = $derived(
    sourceGuideZones(workbench.projectionProfile, workbench.domeGuideSemanticSplit, workbench.domeGuideHorizonSplit),
  );

  type PlateEditorHandle = Point2D & ({ action: "scale"; corner: PlateCorner } | { action: "rotate" });
  type PlateHit = { index: number; handle: { action: "move" } | PlateEditorHandle };
  type GuideBreakpointId = SourceGuideBreakpoint["id"];
  type GuideBreakpointDrag = {
    id: GuideBreakpointId;
    pointerId: number;
    railRect: DOMRect;
  };
  type PlateEditorDrag =
    | {
        action: "move";
        pointerId: number;
        startClient: Point2D;
        startCenter: Point2D;
        startPointerDirection: Vec3 | null;
        startCenterDirection: Vec3;
        started: boolean;
      }
    | {
        action: "scale";
        pointerId: number;
        startScale: number;
        startLocal: Point2D | null;
        startPrepared: PreparedPlatePlacement;
      }
    | {
        action: "warp";
        pointerId: number;
        corner: PlateCorner;
        startLocal: Point2D | null;
        startPrepared: PreparedPlatePlacement;
        startCornerOffsets: PlateCornerOffsets;
      }
    | {
        action: "rotate";
        pointerId: number;
        startSpin: number;
        startLocal: Point2D | null;
        startPrepared: PreparedPlatePlacement;
        started: boolean;
      }
    | {
        action: "camera";
        pointerId: number;
        startClient: Point2D;
        startCamera: typeof viewCamera;
        modifiers: ProjectionCameraDragModifiers;
        started: boolean;
      };

  let viewCameraEuler = $derived(eulerDegreesFromQuaternion(viewCamera.orientation));

  onMount(() => {
    const cleanup = installPlateSketchCommitHandler(commitPlateSketch);
    void ensureGpuRenderer();
    void loadDefaultPlates();
    return () => {
      cleanup();
      if (previewFrame !== null) cancelAnimationFrame(previewFrame);
      gpuRenderer?.destroy();
    };
  });

  $effect(() => {
    const projectionProfile = workbench.projectionProfile;
    const viewerMode = workbench.viewerMode;
    if (!previewCanvas) return;
    if (projectionProfile !== previousProjectionProfile) {
      previousProjectionProfile = projectionProfile;
      viewCamera = defaultPlateEditorCamera(projectionProfile);
      if (plateEditorViewDisabledReason(plateProjectionViewMode, projectionProfile)) {
        plateProjectionViewMode = "source-map";
      }
      renderPreview();
      return;
    }
    if (viewerMode !== previousViewerMode) {
      previousViewerMode = viewerMode;
      renderOverlay();
    }
  });

  $effect(() => {
    if (!previewCanvas) return;
    const updateSize = () => {
      if (!previewCanvas) return;
      const rect = previewCanvas.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width * pixelRatio));
      const h = Math.max(1, Math.round(rect.height * pixelRatio));
      if (canvasWidth !== w || canvasHeight !== h) {
        canvasWidth = w;
        canvasHeight = h;
      }
    };
    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(previewCanvas);

    window.addEventListener("resize", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  });

  $effect(() => {
    viewCamera;
    plateProjectionViewMode;
    showCaveMask;
    invertCaveMask;
    canvasWidth;
    canvasHeight;
    scheduleRenderPreview();
  });

  async function handlePlateInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    await loadPlateFiles(Array.from(input.files || []));
    input.value = "";
  }

  async function loadDefaultPlates() {
    if (plates.length > 0 || DEFAULT_PLATE_REFERENCES.length === 0) return;
    renderStatus = "Loading default plate references...";
    const loaded: PlateSketchImage[] = [];
    for (const reference of DEFAULT_PLATE_REFERENCES) {
      const response = await fetch(reference.url);
      if (!response.ok) continue;
      loaded.push(await loadPlateSource(reference.name, await response.blob()));
    }
    if (loaded.length > 0) {
      plates = loaded;
      autoArrange(false);
      renderPreview();
    } else {
      renderStatus = "Default plate references could not be loaded.";
    }
  }

  async function loadPlateFiles(files: File[]) {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      renderStatus = "No image plates selected.";
      return;
    }
    renderStatus = "Loading plate images...";
    plates = await Promise.all(imageFiles.map((file) => loadPlateSource(file.name, file)));
    autoArrange(false);
    renderPreview();
  }

  async function loadPlateSource(name: string, blob: Blob): Promise<PlateSketchImage> {
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    return { name, width, height, aspect: width / height, canvas };
  }

  function autoArrange(force: boolean) {
    if (plates.length === 0) return;
    if (!force && placements.length === plates.length) return;
    placements = plates.map((plate, index) => normalizePlatePlacement(defaultPlatePlacement(index, plates.length, plate), plate));
    activeIndex = plates.length === DEFAULT_PLATE_PLACEMENTS.length ? DEFAULT_ACTIVE_PLATE_INDEX : 0;
  }

  function defaultPlatePlacement(index: number, plateCount: number, plate: PlateLike): PlatePlacementInput {
    if (plateCount === DEFAULT_PLATE_PLACEMENTS.length && DEFAULT_PLATE_PLACEMENTS[index]) {
      return { ...DEFAULT_PLATE_PLACEMENTS[index] };
    }
    const goldenAngle = 137.507764;
    return {
      azimuth: wrapDegrees(index * goldenAngle + 180),
      radius: plateCount === 1 ? 0.35 : clamp(0.16 + 0.78 * Math.sqrt(index / Math.max(1, plateCount - 1)), 0, 0.94),
      scale: clamp(1.18 / Math.sqrt(Math.max(1, plateCount)), 0.22, 0.92),
      spin: 0,
      opacity: 1,
      flipX: false,
      flipY: false,
      aspect: plate.aspect,
    };
  }

  function updateActivePlacement(patch: Partial<NormalizedPlatePlacement>) {
    if (!activePlacement || !activePlate) return;
    placements[activeIndex] = normalizePlatePlacement({ ...activePlacement, ...patch }, activePlate);
    placements = [...placements];
    scheduleRenderPreview();
  }

  function resetActivePlate() {
    if (!activePlate) return;
    placements[activeIndex] = normalizePlatePlacement(defaultPlatePlacement(activeIndex, plates.length, activePlate), activePlate);
    placements = [...placements];
    renderPreview();
  }

  async function ensureGpuRenderer(): Promise<PlateSketchGpuRenderer> {
    if (gpuRenderer) return gpuRenderer;
    if (!renderCanvas) throw new Error("Plate Sketch WebGPU canvas is not mounted.");
    if (!gpuRendererPromise) {
      gpuRendererPromise = createPlateSketchGpuRenderer(renderCanvas).then((renderer) => {
        gpuRenderer = renderer;
        return renderer;
      });
    }
    return gpuRendererPromise;
  }

  function renderPreview() {
    void renderPreviewAsync();
  }

  async function renderPreviewAsync() {
    if (!renderCanvas || !previewCanvas || plates.length === 0 || placements.length === 0) return;
    if (previewFrame !== null) {
      cancelAnimationFrame(previewFrame);
      previewFrame = null;
    }
    try {
      renderStatus = "Rendering WebGPU plate sketch preview...";
      const gpu = await ensureGpuRenderer();
      gpu.renderPreview(buildRenderOptions(canvasWidth));
      renderOverlay();
      const viewMode = currentPlateProjectionViewMode();
      renderStatus = `${plates.length} plate${plates.length === 1 ? "" : "s"} previewed through WebGPU ${workbench.projectionProfile} ${plateEditorViewLabel(viewMode)}.`;
    } catch (error) {
      console.error(error);
      renderStatus = error instanceof Error ? error.message : "Could not render Plate Sketch preview.";
    }
  }

  function buildRenderOptions(size: number): PlateSketchRenderOptions {
    return {
      plates,
      platePlacements: placements,
      plateCount: plates.length,
      size,
      plateFit,
      plateFeather,
      domeGuideSemanticSplit: workbench.domeGuideSemanticSplit,
      domeGuideHorizonSplit: workbench.domeGuideHorizonSplit,
      sourceProjectionMode: workbench.projectionProfile,
      guideMode: "inpaint-handoff",
      projectionViewMode: currentPlateProjectionViewMode(),
      projectionCamera: viewCamera,
      showProjectionGuides: workbench.viewerMode !== "domemaster",
      showCaveMask,
      invertCaveMask,
    };
  }

  function scheduleRenderPreview() {
    if (previewFrame !== null) return;
    previewFrame = requestAnimationFrame(() => {
      previewFrame = null;
      renderPreview();
    });
  }

  function renderOverlay() {
    if (!previewCanvas) return;
    previewCanvas.width = canvasWidth;
    previewCanvas.height = canvasHeight;
    const context = previewCanvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.save();
    context.scale(canvasWidth / PREVIEW_SIZE, canvasHeight / PREVIEW_SIZE);
    if (currentPlateProjectionViewMode() === "source-map") {
      drawProjectionGuide(context);
    }
    drawPlateEditorOverlay(context);
    context.restore();
  }

  function drawProjectionGuide(context: CanvasRenderingContext2D) {
    const radius = PREVIEW_SIZE * 0.5;
    const cx = radius;
    const cy = radius;
    const horizonRadius = radius * sourceProjectionHorizonRadius(
      workbench.projectionProfile,
      workbench.domeGuideSemanticSplit,
      workbench.domeGuideHorizonSplit,
    );
    const carrierHorizonRadius = radius * sourceGuideCarrierHorizonRadius(
      workbench.projectionProfile,
      workbench.domeGuideSemanticSplit,
      workbench.domeGuideHorizonSplit,
    );
    const caveCarrier = workbench.projectionProfile === "cave-270";
    context.save();

    if (workbench.viewerMode === "dome-check" && !caveCarrier) {
      context.fillStyle = "rgba(0, 0, 0, 0.32)";
      context.beginPath();
      context.rect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
      context.arc(cx, cy, radius, 0, Math.PI * 2, true);
      context.fill("evenodd");
    }

    if (workbench.viewerMode === "rim-check") {
      context.fillStyle = "rgba(238, 120, 109, 0.12)";
      context.beginPath();
      if (caveCarrier) {
        context.rect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
        context.rect(56, 56, PREVIEW_SIZE - 112, PREVIEW_SIZE - 112);
      } else {
        context.arc(cx, cy, radius, 0, Math.PI * 2);
        context.arc(cx, cy, Math.max(0, radius - 56), 0, Math.PI * 2, true);
      }
      context.fill("evenodd");
    }

    context.lineWidth = workbench.viewerMode === "rim-check" ? 3 : 1.4;
    context.strokeStyle =
      workbench.viewerMode === "rim-check" ? "rgba(238, 120, 109, 0.9)" : "rgba(232, 189, 97, 0.76)";
    context.beginPath();
    if (caveCarrier) {
      context.rect(1, 1, PREVIEW_SIZE - 2, PREVIEW_SIZE - 2);
    } else {
      context.arc(cx, cy, radius - 1, 0, Math.PI * 2);
    }
    context.stroke();

    context.lineWidth = workbench.viewerMode === "domemaster" ? 1 : 1.8;
    context.strokeStyle = "rgba(117, 215, 229, 0.74)";
    context.beginPath();
    if (caveCarrier) {
      const seamInset = radius - horizonRadius;
      context.rect(seamInset, seamInset, PREVIEW_SIZE - seamInset * 2, PREVIEW_SIZE - seamInset * 2);
    } else {
      context.arc(cx, cy, workbench.projectionProfile === "zenith-230" ? carrierHorizonRadius : horizonRadius, 0, Math.PI * 2);
    }
    context.stroke();

    if (caveCarrier) {
      const eyeHorizon = caveGuideHorizonBand(workbench.domeGuideSemanticSplit, workbench.domeGuideHorizonSplit);
      const horizonInset = radius - radius * eyeHorizon;
      context.lineWidth = workbench.viewerMode === "rim-check" ? 2.2 : 1.65;
      context.strokeStyle = "rgba(117, 215, 229, 0.58)";
      context.beginPath();
      context.rect(horizonInset, horizonInset, PREVIEW_SIZE - horizonInset * 2, PREVIEW_SIZE - horizonInset * 2);
      context.stroke();
    }

    if (workbench.viewerMode !== "domemaster") {
      context.strokeStyle = caveCarrier ? "rgba(245, 242, 233, 0.34)" : "rgba(245, 242, 233, 0.30)";
      context.lineWidth = 1.15;
      const floorBand = sourceProjectionHorizonRadius(
        workbench.projectionProfile,
        workbench.domeGuideSemanticSplit,
        workbench.domeGuideHorizonSplit,
      );
      const domeScaffold = caveCarrier
        ? null
        : domeGuideScaffold(
            workbench.projectionProfile,
            floorBand,
            workbench.domeGuideSemanticSplit,
            workbench.domeGuideHorizonSplit,
          );
      context.beginPath();
      const spokeCount = caveCarrier ? CAVE_HANDOFF_GUIDE.wallRayCount : GUIDE_SPOKE_COUNT;
      for (let spoke = 0; spoke < spokeCount; spoke += 1) {
        const angle = (spoke / spokeCount) * Math.PI * 2 - Math.PI * 0.5;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        if (caveCarrier) {
          const squareScale = radius / Math.max(Math.abs(dx), Math.abs(dy), 0.000001);
          context.moveTo(cx + dx * squareScale * floorBand, cy + dy * squareScale * floorBand);
          context.lineTo(cx + dx * squareScale, cy + dy * squareScale);
        } else {
          const startRadius = radius * (domeScaffold?.spokeStartRadius ?? 0);
          context.moveTo(cx + dx * startRadius, cy + dy * startRadius);
          context.lineTo(cx + dx * radius, cy + dy * radius);
        }
      }
      context.stroke();

      context.setLineDash([6, 9]);
      context.strokeStyle = caveCarrier ? "rgba(245, 242, 233, 0.22)" : "rgba(245, 242, 233, 0.18)";
      context.lineWidth = 1.15;
      const guideScales = caveCarrier
        ? [...caveGuideFloorBands(floorBand), ...caveGuideWallBands(floorBand, workbench.domeGuideHorizonSplit)]
        : (domeScaffold?.ringRadii ?? []);
      for (const scale of guideScales) {
        context.beginPath();
        if (caveCarrier) {
          const inset = radius - radius * scale;
          context.rect(inset, inset, PREVIEW_SIZE - inset * 2, PREVIEW_SIZE - inset * 2);
        } else {
          context.arc(cx, cy, radius * scale, 0, Math.PI * 2);
        }
        context.stroke();
      }
      context.setLineDash([]);
    }

    context.restore();
  }

  function drawPlateEditorOverlay(context: CanvasRenderingContext2D) {
    context.save();
    for (let index = 0; index < Math.min(plates.length, placements.length); index += 1) {
      const geometry = plateGeometry(index);
      if (!geometry) continue;
      const active = index === activeIndex;
      context.lineWidth = active ? 2.2 : 1.15;
      context.strokeStyle = active ? "rgba(117, 215, 229, 0.96)" : "rgba(230, 244, 248, 0.38)";
      context.fillStyle = active ? "rgba(117, 215, 229, 0.1)" : "rgba(230, 244, 248, 0.035)";
      drawOutline(context, geometry.outline);
      if (active) {
        drawCenterHandle(context, geometry.center);
        if (geometry.rotateAnchor && geometry.rotateHandle) {
          context.beginPath();
          context.moveTo(geometry.rotateAnchor.x, geometry.rotateAnchor.y);
          context.lineTo(geometry.rotateHandle.x, geometry.rotateHandle.y);
          context.stroke();
        }
        for (const handle of geometry.handles) {
          if (handle.action === "scale") {
            drawSquareHandle(context, handle, plateEditMode === "warp");
          } else {
            drawRoundHandle(context, handle);
          }
        }
      }
    }
    context.restore();
  }

  function drawOutline(context: CanvasRenderingContext2D, outline: Point2D[]) {
    if (outline.length === 0) return;
    context.beginPath();
    context.moveTo(outline[0].x, outline[0].y);
    for (const point of outline.slice(1)) context.lineTo(point.x, point.y);
    context.closePath();
    context.fill();
    context.stroke();
  }

  function drawCenterHandle(context: CanvasRenderingContext2D, point: Point2D) {
    context.save();
    context.fillStyle = "rgba(117, 215, 229, 0.22)";
    context.strokeStyle = "rgba(117, 215, 229, 0.96)";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(point.x, point.y, 13, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }

  function drawSquareHandle(context: CanvasRenderingContext2D, point: Point2D, warpMode: boolean) {
    const size = warpMode ? 32 : 28;
    context.save();
    context.fillStyle = warpMode ? "rgba(238, 120, 109, 0.92)" : "rgba(6, 10, 13, 0.92)";
    context.strokeStyle = "rgba(180, 255, 225, 0.98)";
    context.lineWidth = 2;
    context.beginPath();
    context.rect(point.x - size * 0.5, point.y - size * 0.5, size, size);
    context.fill();
    context.stroke();
    context.restore();
  }

  function drawRoundHandle(context: CanvasRenderingContext2D, point: Point2D) {
    context.save();
    context.fillStyle = "rgba(6, 10, 13, 0.92)";
    context.strokeStyle = "rgba(180, 255, 225, 0.98)";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(point.x, point.y, 15, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }

  async function commitPlateSketch() {
    if (!canCommit) {
      renderStatus = "Load at least one plate before committing.";
      return;
    }
    renderStatus = "Committing 2048 square inpaint handoff...";
    const committedPlacements = placements.slice(0, plates.length).map(serializePlacement);
    const warpedCornerCount = committedPlacements.reduce(
      (count, placement) =>
        count +
        Object.values(placement.cornerOffsets).filter((offset) => Math.abs(offset.x) > 0.0001 || Math.abs(offset.y) > 0.0001)
          .length,
      0,
    );
    const gpu = await ensureGpuRenderer();
    const handoff = await gpu.renderToCanvas({
      plates,
      platePlacements: placements,
      plateCount: plates.length,
      size: COMMIT_SIZE,
      plateFit,
      plateFeather,
      domeGuideSemanticSplit: workbench.domeGuideSemanticSplit,
      domeGuideHorizonSplit: workbench.domeGuideHorizonSplit,
      sourceProjectionMode: workbench.projectionProfile,
      guideMode: "inpaint-handoff",
    });
    const dataUrl = handoff.toDataURL("image/png");
    setArtifactMediaHandle("plate-sketch", { canvas: handoff });
    updateArtifact("plate-sketch", {
      status: "ready",
      stale: false,
      summary: `${plates.length} plates committed as ${COMMIT_SIZE} square inpaint handoff${warpedCornerCount > 0 ? ` with ${warpedCornerCount} warped corners` : ""}.`,
      operatorId: "commit-plates",
      media: {
        kind: "image",
        url: dataUrl,
        name: `Committed Plate Sketch (${plates.length} plates)`,
        mime: "image/png",
        alt: "Committed semantic-color Plate Sketch inpaint handoff",
        blob: null,
        file: null,
        canvas: null,
      },
      config: {
        plateCount: plates.length,
        plateFit,
        plateFeather,
        domeGuideSemanticSplit: workbench.domeGuideSemanticSplit,
        domeGuideHorizonSplit: workbench.domeGuideHorizonSplit,
        plateEditMode,
        placements: committedPlacements,
        projectionProfile: workbench.projectionProfile,
      },
      warnings: [],
    });
    addArtifactResult("plate-sketch", {
      label: `Committed Plate Sketch (${plates.length})`,
      media: {
        kind: "image",
        url: dataUrl,
        name: `Committed Plate Sketch (${plates.length} plates)`,
        mime: "image/png",
        alt: "Committed semantic-color Plate Sketch inpaint handoff",
        blob: null,
        file: null,
        canvas: null,
      },
      operatorId: "commit-plates",
    });
    selectArtifact("plate-sketch");
    renderStatus = `${COMMIT_SIZE} x ${COMMIT_SIZE} Plate Sketch handoff committed for inpaint${warpedCornerCount > 0 ? ` with ${warpedCornerCount} warped corners` : ""}.`;
  }

  async function downloadCurrentHandoff() {
    if (!canCommit) {
      renderStatus = "Load at least one plate before downloading.";
      return;
    }
    renderStatus = `Rendering ${COMMIT_SIZE} square Plate Sketch PNG...`;
    const gpu = await ensureGpuRenderer();
    const handoff = await gpu.renderToCanvas({
      plates,
      platePlacements: placements,
      plateCount: plates.length,
      size: COMMIT_SIZE,
      plateFit,
      plateFeather,
      domeGuideSemanticSplit: workbench.domeGuideSemanticSplit,
      domeGuideHorizonSplit: workbench.domeGuideHorizonSplit,
      sourceProjectionMode: workbench.projectionProfile,
      guideMode: "inpaint-handoff",
    });
    const blob = await canvasToBlob(handoff, "image/png");
    downloadBlob(blob, `zenith-plate-sketch-${COMMIT_SIZE}-${Date.now()}.png`);
    renderStatus = `${COMMIT_SIZE} x ${COMMIT_SIZE} Plate Sketch PNG downloaded.`;
  }

  function handlePointerDown(event: PointerEvent) {
    if (!previewCanvas || plates.length === 0 || placements.length === 0) return;
    const hit = hitTestPlate(event);
    if (!hit) {
      if (currentPlateProjectionViewMode() !== "source-map") {
        activeDrag = {
          action: "camera",
          pointerId: event.pointerId,
          startClient: pointerToCanvasPoint(event) || { x: event.clientX, y: event.clientY },
          startCamera: { ...viewCamera, position: [...viewCamera.position], orientation: [...viewCamera.orientation], pivot: viewCamera.pivot ? [...viewCamera.pivot] : null },
          modifiers: cameraDragModifiers(event),
          started: false,
        };
        previewCanvas.setPointerCapture(event.pointerId);
      }
      return;
    }
    activeIndex = hit.index;
    const placement = placements[activeIndex];
    const drag = createPlateDrag(event, hit, placement);
    if (!drag) return;
    activeDrag = drag;
    previewCanvas.setPointerCapture(event.pointerId);
    renderOverlay();
  }

  function handlePointerMove(event: PointerEvent) {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    if (activeDrag.action === "camera") {
      updateCameraDrag(event, activeDrag);
    } else {
      updatePlateDrag(event, activeDrag);
    }
  }

  function handlePointerUp(event: PointerEvent) {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    activeDrag = null;
    previewCanvas?.releasePointerCapture(event.pointerId);
  }

  function createPlateDrag(event: PointerEvent, hit: PlateHit, placement: NormalizedPlatePlacement): PlateEditorDrag | null {
    const point = pointerToCanvasPoint(event);
    const geometry = plateGeometry(hit.index);
    if (!point || !geometry) return null;
    if (hit.handle.action === "rotate") {
      const prepared = preparePlatePlacement(
        placement,
        plates[hit.index],
        workbench.projectionProfile,
        workbench.domeGuideSemanticSplit,
        workbench.domeGuideHorizonSplit,
      );
      const direction = currentProjectionAdapter().sourceDirectionAt(point);
      return {
        action: "rotate",
        pointerId: event.pointerId,
        startSpin: placement.spin,
        startLocal: plateLocalFromSourceDirection(direction, prepared),
        startPrepared: prepared,
        started: false,
      };
    }
    if (hit.handle.action === "scale") {
      const prepared = preparePlatePlacement(
        placement,
        plates[hit.index],
        workbench.projectionProfile,
        workbench.domeGuideSemanticSplit,
        workbench.domeGuideHorizonSplit,
      );
      const direction = currentProjectionAdapter().sourceDirectionAt(point);
      const useWarp = plateEditMode === "warp" || event.shiftKey || event.altKey;
      if (useWarp) {
        return {
          action: "warp",
          pointerId: event.pointerId,
          corner: hit.handle.corner,
          startLocal: plateLocalFromSourceDirection(direction, prepared),
          startPrepared: prepared,
          startCornerOffsets: clonePlateCornerOffsets(prepared.cornerOffsets),
        };
      }
      return {
        action: "scale",
        pointerId: event.pointerId,
        startScale: placement.scale,
        startLocal: plateLocalFromSourceDirection(direction, prepared),
        startPrepared: prepared,
      };
    }
    return {
      action: "move",
      pointerId: event.pointerId,
      startClient: point,
      startCenter: geometry.center,
      startPointerDirection: currentProjectionAdapter().sourceDirectionAt(point),
      startCenterDirection: preparePlatePlacement(
        placement,
        plates[hit.index],
        workbench.projectionProfile,
        workbench.domeGuideSemanticSplit,
        workbench.domeGuideHorizonSplit,
      ).center,
      started: false,
    };
  }

  function updatePlateDrag(event: PointerEvent, drag: PlateEditorDrag) {
    if (drag.action === "camera") return;
    const placement = placements[activeIndex];
    if (!placement) return;
    if (drag.action === "move") {
      moveActivePlacement(event, drag, placement);
    } else if (drag.action === "scale") {
      scaleActivePlacement(event, drag, placement);
    } else if (drag.action === "warp") {
      warpActivePlacement(event, drag, placement);
    } else {
      rotateActivePlacement(event, drag, placement);
    }
    placements[activeIndex] = normalizePlatePlacement(placement, activePlate);
    placements = [...placements];
    scheduleRenderPreview();
  }

  function updateCameraDrag(event: PointerEvent, drag: Extract<PlateEditorDrag, { action: "camera" }>) {
    const point = pointerToCanvasPoint(event);
    if (!point) return;
    const dx = point.x - drag.startClient.x;
    const dy = point.y - drag.startClient.y;
    if (!drag.started && Math.hypot(dx, dy) < 3) return;
    drag.started = true;
    viewCamera = applyProjectionCameraPointerDrag({
      viewMode: currentPlateProjectionViewMode(),
      startCamera: drag.startCamera,
      startPoint: drag.startClient,
      currentPoint: point,
      viewport: previewViewport(),
      modifiers: drag.modifiers,
    });
    scheduleRenderPreview();
  }

  function moveActivePlacement(event: PointerEvent, drag: Extract<PlateEditorDrag, { action: "move" }>, placement: NormalizedPlatePlacement) {
    const point = pointerToCanvasPoint(event);
    if (!point) return;
    const nextCenter = {
      x: drag.startCenter.x + point.x - drag.startClient.x,
      y: drag.startCenter.y + point.y - drag.startClient.y,
    };
    if (!drag.started && distance2d(nextCenter, drag.startCenter) < 3) return;
    drag.started = true;
    if (drag.startPointerDirection) {
      const currentDirection = currentProjectionAdapter().sourceDirectionAt(point);
      if (!currentDirection) return;
      const movedDomePoint = moveDomePointBySourcePointerDrag(
        drag.startCenterDirection,
        drag.startPointerDirection,
        currentDirection,
        workbench.projectionProfile,
        workbench.domeGuideSemanticSplit,
        workbench.domeGuideHorizonSplit,
      );
      placement.azimuth = movedDomePoint.azimuth;
      placement.radius = movedDomePoint.radius;
      return;
    }
    const domePoint = sourcePointAt(nextCenter);
    if (!domePoint) return;
    placement.azimuth = domePoint.azimuth;
    placement.radius = domePoint.radius;
  }

  function scaleActivePlacement(event: PointerEvent, drag: Extract<PlateEditorDrag, { action: "scale" }>, placement: NormalizedPlatePlacement) {
    const point = pointerToCanvasPoint(event);
    const direction = point ? currentProjectionAdapter().sourceDirectionAt(point) : null;
    const local = plateLocalFromSourceDirection(direction, drag.startPrepared);
    const scale = scaleFromSourceLocalDrag(
      drag.startScale,
      drag.startLocal,
      local,
      {
        x: drag.startPrepared.angularWidth * 0.5,
        y: drag.startPrepared.angularHeight * 0.5,
      },
      MIN_PLATE_SCALE,
      MAX_PLATE_SCALE,
    );
    if (scale === null) return;
    placement.scale = scale;
  }

  function rotateActivePlacement(event: PointerEvent, drag: Extract<PlateEditorDrag, { action: "rotate" }>, placement: NormalizedPlatePlacement) {
    const point = pointerToCanvasPoint(event);
    if (!point) return;
    const direction = currentProjectionAdapter().sourceDirectionAt(point);
    const local = plateLocalFromSourceDirection(direction, drag.startPrepared);
    const spin = spinFromSourceLocalRotateDrag(drag.startSpin, drag.startLocal, local);
    if (spin === null) return;
    if (!drag.started && Math.abs(wrapDegrees(spin - drag.startSpin)) < 3) return;
    drag.started = true;
    placement.spin = spin;
  }

  function warpActivePlacement(event: PointerEvent, drag: Extract<PlateEditorDrag, { action: "warp" }>, placement: NormalizedPlatePlacement) {
    const point = pointerToCanvasPoint(event);
    const direction = point ? currentProjectionAdapter().sourceDirectionAt(point) : null;
    const local = plateLocalFromSourceDirection(direction, drag.startPrepared);
    const nextOffsets = cornerOffsetsFromSourceLocalDrag(
      drag.startPrepared,
      drag.corner,
      drag.startLocal,
      local,
      drag.startCornerOffsets,
    );
    if (!nextOffsets) return;
    placement.cornerOffsets = nextOffsets;
  }

  function hitTestPlate(event: PointerEvent): PlateHit | null {
    const point = pointerToCanvasPoint(event);
    const direction = point ? currentProjectionAdapter().sourceDirectionAt(point) : null;
    if (!point) return null;

    const activeGeometry = plateGeometry(activeIndex);
    const handle = hitHandle(point, activeGeometry?.handles || []);
    if (handle) return { index: activeIndex, handle };

    if (!direction) return null;
    for (let index = Math.min(plates.length, placements.length) - 1; index >= 0; index -= 1) {
      if (hitPlateBody(direction, index)) return { index, handle: { action: "move" } };
    }
    return null;
  }

  function hitHandle(point: Point2D, handles: PlateEditorHandle[]): PlateEditorHandle | null {
    for (const handle of handles) {
      if (distance2d(point, handle) <= HANDLE_RADIUS) return handle;
    }
    return null;
  }

  function hitPlateBody(direction: Vec3, index: number): boolean {
    const placement = placements[index];
    const plate = plates[index];
    if (!placement || !plate) return false;
    const prepared = preparePlatePlacement(
      placement,
      plate,
      workbench.projectionProfile,
      workbench.domeGuideSemanticSplit,
      workbench.domeGuideHorizonSplit,
    );
    const local = plateLocalFromSourceDirection(direction, prepared);
    if (!local) return false;
    const uv = plateLocalToWarpedUv(local, prepared);
    if (!uv) return false;
    const bounds = visiblePlateUvBounds(prepared, plateFit);
    return (
      uv.x >= bounds.minU - PLATE_HIT_LOCAL_PAD &&
      uv.x <= bounds.maxU + PLATE_HIT_LOCAL_PAD &&
      uv.y >= bounds.minV - PLATE_HIT_LOCAL_PAD &&
      uv.y <= bounds.maxV + PLATE_HIT_LOCAL_PAD
    );
  }

  function plateGeometry(index: number) {
    const placement = placements[index];
    const plate = plates[index];
    if (!placement || !plate) return null;
    const prepared = preparePlatePlacement(
      placement,
      plate,
      workbench.projectionProfile,
      workbench.domeGuideSemanticSplit,
      workbench.domeGuideHorizonSplit,
    );
    const bounds = visiblePlateUvBounds(prepared, plateFit);
    const controls = projectPlateScreenControls(prepared, bounds, {
      projectSourceDirection: currentProjectionAdapter().projectSourceDirection,
      projectPlateUv: currentProjectionAdapter().projectPlateUv,
    });
    if (!controls) return null;
    return {
      center: controls.center,
      outline: controls.outline,
      rotateAnchor: controls.rotateAnchor,
      rotateHandle: controls.rotateHandle,
      handles: [
        ...controls.scaleHandles.map((handle) => ({ ...handle, action: "scale" as const })),
        controls.rotateHandle ? { ...controls.rotateHandle, action: "rotate" as const } : null,
      ].filter((handle): handle is PlateEditorHandle => Boolean(handle)),
    };
  }

  function sourcePointAt(point: Point2D): { radius: number; azimuth: number } | null {
    return currentProjectionAdapter().sourcePointAt(point);
  }

  function previewRect(): Rect {
    return { x: 0, y: 0, width: PREVIEW_SIZE, height: PREVIEW_SIZE };
  }

  function currentProjectionAdapter(): PlateEditorProjectionAdapter {
    return createPlateEditorProjectionAdapter({
      mode: currentPlateProjectionViewMode(),
      sourceProjectionMode: workbench.projectionProfile,
      camera: viewCamera,
      rect: previewRect(),
      domeGuideSemanticSplit: workbench.domeGuideSemanticSplit,
      domeGuideHorizonSplit: workbench.domeGuideHorizonSplit,
      showCaveMask,
    });
  }

  function pointerToCanvasPoint(event: PointerEvent): Point2D | null {
    if (!previewCanvas) return null;
    const rect = previewCanvas.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / Math.max(rect.width, 1)) * PREVIEW_SIZE, 0, PREVIEW_SIZE),
      y: clamp(((event.clientY - rect.top) / Math.max(rect.height, 1)) * PREVIEW_SIZE, 0, PREVIEW_SIZE),
    };
  }

  function handleWheel(event: WheelEvent) {
    const mode = currentPlateProjectionViewMode();
    if (mode === "source-map") return;
    event.preventDefault();
    viewCamera = applyProjectionCameraWheel({
      viewMode: mode,
      camera: viewCamera,
      deltaY: event.deltaY,
      modifiers: cameraDragModifiers(event),
    });
    scheduleRenderPreview();
  }

  function previewViewport(): { width: number; height: number } {
    return { width: PREVIEW_SIZE, height: PREVIEW_SIZE };
  }

  function cameraDragModifiers(event: MouseEvent): ProjectionCameraDragModifiers {
    return {
      button: event.button,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    };
  }

  function resetActiveWarp() {
    if (!activePlacement) return;
    updateActivePlacement({
      cornerOffsets: {
        nw: { x: 0, y: 0 },
        ne: { x: 0, y: 0 },
        se: { x: 0, y: 0 },
        sw: { x: 0, y: 0 },
      },
    });
  }

  function serializePlacement(placement: NormalizedPlatePlacement) {
    return {
      azimuth: roundPlacementValue(placement.azimuth),
      radius: roundPlacementValue(placement.radius),
      scale: roundPlacementValue(placement.scale),
      spin: roundPlacementValue(placement.spin),
      opacity: roundPlacementValue(placement.opacity),
      flipX: placement.flipX,
      flipY: placement.flipY,
      cornerOffsets: {
        nw: {
          x: roundPlacementValue(placement.cornerOffsets.nw.x),
          y: roundPlacementValue(placement.cornerOffsets.nw.y),
        },
        ne: {
          x: roundPlacementValue(placement.cornerOffsets.ne.x),
          y: roundPlacementValue(placement.cornerOffsets.ne.y),
        },
        se: {
          x: roundPlacementValue(placement.cornerOffsets.se.x),
          y: roundPlacementValue(placement.cornerOffsets.se.y),
        },
        sw: {
          x: roundPlacementValue(placement.cornerOffsets.sw.x),
          y: roundPlacementValue(placement.cornerOffsets.sw.y),
        },
      },
    };
  }

  function roundPlacementValue(value: number): number {
    return Math.round(value * 10000) / 10000;
  }

  function distance2d(a: Point2D, b: Point2D): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function handleProjectionChange(event: Event) {
    const profile = (event.currentTarget as HTMLSelectElement).value as SourceProjectionMode;
    changeProjectionProfile(profile);
  }

  function handleGuideRailPointerDown(event: PointerEvent) {
    if (!(event.currentTarget instanceof HTMLElement)) return;
    const breakpoint = nearestEditableBreakpoint(pointerRadiusOnRail(event, event.currentTarget.getBoundingClientRect()));
    if (!breakpoint) return;
    startGuideBreakpointDrag(event, breakpoint.id, event.currentTarget);
  }

  function handleGuideBreakpointPointerDown(event: PointerEvent, breakpointId: GuideBreakpointId) {
    if (!(event.currentTarget instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopPropagation();
    const rail = event.currentTarget.closest(".guide-breakpoint-rail");
    if (!(rail instanceof HTMLElement)) return;
    startGuideBreakpointDrag(event, breakpointId, rail);
  }

  function startGuideBreakpointDrag(event: PointerEvent, breakpointId: GuideBreakpointId, rail: HTMLElement) {
    activeGuideBreakpointDrag = {
      id: breakpointId,
      pointerId: event.pointerId,
      railRect: rail.getBoundingClientRect(),
    };
    rail.setPointerCapture(event.pointerId);
    updateGuideBreakpointFromPointer(event, activeGuideBreakpointDrag);
  }

  function handleGuideBreakpointPointerMove(event: PointerEvent) {
    const drag = activeGuideBreakpointDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    updateGuideBreakpointFromPointer(event, drag);
  }

  function handleGuideBreakpointPointerUp(event: PointerEvent) {
    const drag = activeGuideBreakpointDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    activeGuideBreakpointDrag = null;
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleGuideBreakpointKeydown(event: KeyboardEvent, breakpointId: GuideBreakpointId) {
    const step = event.shiftKey ? 0.05 : 0.01;
    let delta = 0;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") delta = -step;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") delta = step;
    if (event.key === "Home") {
      setGuideBreakpointRadius(breakpointId, 0);
      event.preventDefault();
      return;
    }
    if (event.key === "End") {
      setGuideBreakpointRadius(breakpointId, 1);
      event.preventDefault();
      return;
    }
    if (delta === 0) return;
    const current = guideBreakpoints.find((breakpoint) => breakpoint.id === breakpointId)?.radius ?? 0;
    setGuideBreakpointRadius(breakpointId, current + delta);
    event.preventDefault();
  }

  function updateGuideBreakpointFromPointer(event: PointerEvent, drag: GuideBreakpointDrag) {
    setGuideBreakpointRadius(drag.id, pointerRadiusOnRail(event, drag.railRect));
  }

  function pointerRadiusOnRail(event: PointerEvent, rect: DOMRect): number {
    return clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
  }

  function nearestEditableBreakpoint(radius: number): SourceGuideBreakpoint | null {
    const editable = guideBreakpoints.filter((breakpoint) => breakpoint.editable);
    if (editable.length === 0) return null;
    return editable.reduce((nearest, breakpoint) =>
      Math.abs(breakpoint.radius - radius) < Math.abs(nearest.radius - radius) ? breakpoint : nearest,
    );
  }

  function setGuideBreakpointRadius(breakpointId: GuideBreakpointId, radius: number) {
    if (breakpointId === "inner-split") {
      setDomeGuideSemanticSplit(radius);
    } else if (breakpointId === "carrier-horizon" || breakpointId === "physical-horizon") {
      setDomeGuideHorizonSplit(radius);
    }
    renderPreview();
  }

  function guideBreakpointSummary(): string {
    return guideBreakpoints.map((breakpoint) => `${breakpoint.label} ${formatPercent(breakpoint.radius)}`).join(" · ");
  }

  function guideZoneSummary(): string {
    return guideZones.map((zone) => zone.label).join(" → ");
  }

  function formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  function setViewerMode(mode: typeof workbench.viewerMode) {
    changeViewerMode(mode);
  }

  function setPlateProjectionViewMode(mode: PlateEditorViewMode) {
    if (plateEditorViewDisabledReason(mode, workbench.projectionProfile)) return;
    plateProjectionViewMode = mode;
    scheduleRenderPreview();
  }

  function currentPlateProjectionViewMode(): PlateEditorViewMode {
    return plateEditorViewDisabledReason(plateProjectionViewMode, workbench.projectionProfile) ? "source-map" : plateProjectionViewMode;
  }

</script>

<section class="plate-editor" aria-label="Plate Sketch placement editor">
  <div class="plate-canvas-wrap">
    <div
      class:dome-check={workbench.viewerMode === "dome-check"}
      class:rim-check={workbench.viewerMode === "rim-check"}
      class="plate-canvas-stack"
    >
      <canvas bind:this={renderCanvas} class="plate-preview-canvas plate-render-canvas" aria-hidden="true"></canvas>
      <canvas
        bind:this={previewCanvas}
        class="plate-preview-canvas plate-overlay-canvas"
        aria-label="Editable Plate Sketch placement handles"
        title={currentPlateProjectionViewMode() === "source-map" ? "Use projected views to drag the camera." : projectionCameraControlHelp(currentPlateProjectionViewMode())}
        onpointerdown={handlePointerDown}
        onpointermove={handlePointerMove}
        onpointerup={handlePointerUp}
        onpointercancel={handlePointerUp}
        onwheel={handleWheel}
        oncontextmenu={(event) => event.preventDefault()}
      ></canvas>
    </div>
  </div>

  <div class="plate-tools">
    <div class="tool-row">
      <label class="file-import compact" for="plate-editor-files">
        <span>Load plate images</span>
        <input id="plate-editor-files" type="file" accept="image/*" multiple onchange={handlePlateInput} />
      </label>
      <button type="button" class="secondary-action" onclick={() => loadDefaultPlates()}>Load default plates</button>
    </div>

    <label class="field-row" for="plate-editor-projection">
      <span>Projection profile</span>
      <select id="plate-editor-projection" value={workbench.projectionProfile} onchange={handleProjectionChange}>
        {#each SOURCE_PROJECTION_MODES as mode}
          <option value={mode}>{sourceProjectionLabel(mode)}</option>
        {/each}
      </select>
    </label>

    <p class="projection-readout">
      {projectionSummary.center} center · {projectionSummary.fieldOfViewDegrees}° FOV · {guideBreakpointSummary()}
    </p>

    <div class="projection-guide-controls" aria-label="Projection handoff guide controls">
      <div class="guide-breakpoint-control">
        <span class="guide-breakpoint-title">Source-map breakpoints</span>
        <span class="guide-breakpoint-summary">{guideZoneSummary()}</span>
        <span class="guide-breakpoint-rail-wrap">
          <span
            class="guide-breakpoint-rail"
            role="group"
            aria-label="Source-map breakpoint rail"
            onpointerdown={handleGuideRailPointerDown}
            onpointermove={handleGuideBreakpointPointerMove}
            onpointerup={handleGuideBreakpointPointerUp}
            onpointercancel={handleGuideBreakpointPointerUp}
          >
            {#each guideZones as zone}
              <span
                class={`guide-breakpoint-zone ${zone.tone}`}
                style={`left: ${zone.startRadius * 100}%; width: ${(zone.endRadius - zone.startRadius) * 100}%`}
              ></span>
            {/each}
            {#each guideBreakpoints as breakpoint}
              {#if breakpoint.editable}
                <button
                  type="button"
                  class:editable={breakpoint.editable}
                  class:horizon={breakpoint.role === "horizon"}
                  class="guide-breakpoint-marker"
                  style={`left: ${breakpoint.radius * 100}%`}
                  title={`${breakpoint.label} ${formatPercent(breakpoint.radius)}`}
                  aria-label={`${breakpoint.label} breakpoint at ${formatPercent(breakpoint.radius)}`}
                  onpointerdown={(event) => handleGuideBreakpointPointerDown(event, breakpoint.id)}
                  onkeydown={(event) => handleGuideBreakpointKeydown(event, breakpoint.id)}
                ></button>
              {:else}
                <span
                  class:horizon={breakpoint.role === "horizon"}
                  class="guide-breakpoint-marker"
                  style={`left: ${breakpoint.radius * 100}%`}
                  title={`${breakpoint.label} ${formatPercent(breakpoint.radius)}`}
                ></span>
              {/if}
            {/each}
          </span>
        </span>
        <span class="guide-breakpoint-values">
          {#each guideBreakpoints as breakpoint}
            <span class:fixed={!breakpoint.editable}>
              {breakpoint.label} {formatPercent(breakpoint.radius)}
            </span>
          {/each}
        </span>
      </div>
    </div>

    <CameraControlsPanel
      bind:viewMode={plateProjectionViewMode}
      bind:viewCamera
      bind:showCaveMask
      bind:invertCaveMask
      projectionProfile={workbench.projectionProfile}
      onNudge={(truck, lift, push) => {
        viewCamera = nudgeProjectionCamera(viewCamera, currentPlateProjectionViewMode(), truck, lift, push);
      }}
    />

    <div class="viewer-mode-group plate-viewer-mode" aria-label="Plate editor viewer mode">
      <button
        type="button"
        class:selected={workbench.viewerMode === "domemaster"}
        aria-pressed={workbench.viewerMode === "domemaster" ? "true" : "false"}
        onclick={() => setViewerMode("domemaster")}
      >
        Domemaster
      </button>
      <button
        type="button"
        class:selected={workbench.viewerMode === "dome-check"}
        aria-pressed={workbench.viewerMode === "dome-check" ? "true" : "false"}
        onclick={() => setViewerMode("dome-check")}
      >
        Dome Check
      </button>
      <button
        type="button"
        class:selected={workbench.viewerMode === "rim-check"}
        aria-pressed={workbench.viewerMode === "rim-check" ? "true" : "false"}
        onclick={() => setViewerMode("rim-check")}
      >
        Rim Check
      </button>
    </div>

    <label class="field-row" for="plate-editor-active">
      <span>Active plate</span>
      <select id="plate-editor-active" bind:value={activeIndex} disabled={plates.length === 0} onchange={() => renderOverlay()}>
        {#each plates as plate, index}
          <option value={index}>{index + 1}. {plate.name}</option>
        {/each}
      </select>
    </label>

    <div class="motion-controls" aria-label="Active plate transform controls">
      <label for="plate-editor-fit">
        <span>Fit mode</span>
        <select id="plate-editor-fit" bind:value={plateFit} onchange={renderPreview}>
          <option value="contain">Contain ratio</option>
          <option value="cover">Cover crop</option>
          <option value="stretch">Stretch</option>
        </select>
      </label>
      <label for="plate-editor-handle-mode">
        <span>Corner handles</span>
        <select id="plate-editor-handle-mode" bind:value={plateEditMode} onchange={renderOverlay}>
          <option value="scale">Scale plate</option>
          <option value="warp">Warp corners</option>
        </select>
      </label>
      <label for="plate-editor-feather">
        <span>Edge fade {plateFeather.toFixed(3)}</span>
        <input id="plate-editor-feather" type="range" min="0" max="0.18" step="0.002" bind:value={plateFeather} oninput={renderPreview} />
      </label>

      {#if activePlacement}
        <label for="plate-editor-azimuth">
          <span>Azimuth {Math.round(activePlacement.azimuth)}°</span>
          <input
            id="plate-editor-azimuth"
            type="range"
            min="-180"
            max="180"
            step="1"
            value={activePlacement.azimuth}
            oninput={(event) => updateActivePlacement({ azimuth: Number((event.currentTarget as HTMLInputElement).value) })}
          />
        </label>
        <label for="plate-editor-radius">
          <span>Radius {activePlacement.radius.toFixed(2)}</span>
          <input
            id="plate-editor-radius"
            type="range"
            min="0"
            max="0.98"
            step="0.01"
            value={activePlacement.radius}
            oninput={(event) => updateActivePlacement({ radius: Number((event.currentTarget as HTMLInputElement).value) })}
          />
        </label>
        <label for="plate-editor-scale">
          <span>Scale {activePlacement.scale.toFixed(2)}</span>
          <input
            id="plate-editor-scale"
            type="range"
            min={MIN_PLATE_SCALE}
            max={MAX_PLATE_SCALE}
            step="0.01"
            value={activePlacement.scale}
            oninput={(event) => updateActivePlacement({ scale: Number((event.currentTarget as HTMLInputElement).value) })}
          />
        </label>
        <label for="plate-editor-spin">
          <span>Spin {Math.round(activePlacement.spin)}°</span>
          <input
            id="plate-editor-spin"
            type="range"
            min="-180"
            max="180"
            step="1"
            value={activePlacement.spin}
            oninput={(event) => updateActivePlacement({ spin: Number((event.currentTarget as HTMLInputElement).value) })}
          />
        </label>
        <label for="plate-editor-opacity">
          <span>Opacity {activePlacement.opacity.toFixed(2)}</span>
          <input
            id="plate-editor-opacity"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={activePlacement.opacity}
            oninput={(event) => updateActivePlacement({ opacity: Number((event.currentTarget as HTMLInputElement).value) })}
          />
        </label>
      {/if}
    </div>

    <div class="tool-row">
      <button type="button" class="secondary-action" disabled={plates.length === 0} onclick={() => { autoArrange(true); renderPreview(); }}>Auto arrange</button>
      <button type="button" class="secondary-action" disabled={!activePlacement} onclick={resetActivePlate}>Reset active</button>
      <button
        type="button"
        class="secondary-action"
        disabled={!activePlacement}
        title={!activePlacement ? "Select a plate before editing warp." : "Reset active plate corner warp."}
        onclick={resetActiveWarp}
      >
        Reset warp
      </button>
      <button
        type="button"
        class="secondary-action"
        disabled={!activePlacement}
        onclick={() => updateActivePlacement({ flipX: !activePlacement?.flipX })}
      >
        Flip X
      </button>
      <button
        type="button"
        class="secondary-action"
        disabled={!activePlacement}
        onclick={() => updateActivePlacement({ flipY: !activePlacement?.flipY })}
      >
        Flip Y
      </button>
    </div>

    <div class="tool-row">
      <button type="button" class="operator-action" disabled={!canCommit} onclick={commitPlateSketch}>Commit Plate Sketch</button>
      <button type="button" class="secondary-action" disabled={!canCommit} onclick={downloadCurrentHandoff}>Download full-scale PNG</button>
    </div>

    <output class="plate-editor-status">{renderStatus}</output>
  </div>
</section>
