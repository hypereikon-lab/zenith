import { getArtifact, getArtifactMediaHandle, workbench } from "../artifacts/artifact-store.svelte.js";
import { canvasToBlob, downloadBlob, loadCanvasFromImageSource } from "../media/canvas-utils.js";
import { renderRgbdProxyViews } from "../graphics/rgbd-proxy-renderer.js";
import { createPointCloudExportManifest } from "../graphics/point-cloud-export.js";
import { reconstructProxyViewWithGptImage2 } from "../services/gpt-image-reconstruction-service.js";
import { generateRelativeDepthWithGemini } from "../services/gemini-depth-service.js";
import { buildCanonicalRgbdScene } from "./rgbd-scene-builder.js";
import { applyInverseDepthAlignment, fitInverseDepthAlignment, grayscaleToDepthMeters, type DepthAlignmentSample } from "./depth-alignment.js";
import { createExternalFeatureAnchorService } from "./feature-anchor-service.js";
import { fuseReconstructedView } from "./rgbd-scene-fusion.js";
import {
  canAlignRgbdDepth,
  canFuseRgbdView,
  canRenderRgbdProxy,
  finishRgbdJob,
  getSelectedRgbdKeyframe,
  recordRgbdError,
  rgbdCanvasHandles,
  rgbdLab,
  setRgbdStep,
  startRgbdJob,
  updateRgbdJob,
} from "./rgbd-scene-store.svelte.js";
import type { RgbdDepthArtifact, RgbdMediaRef, RgbdReconstructionArtifact } from "./rgbd-scene-types.js";

export async function buildRgbdSceneFromWorkbench(): Promise<void> {
  try {
    startRgbdJob("build-scene", "Build RGBD Scene", "Loading Start State and Start Depth");
    const sourceCanvas = await artifactCanvas("start-state");
    const depthCanvas = await artifactCanvas("start-depth");
    rgbdCanvasHandles.sourceCanvas = sourceCanvas;
    rgbdCanvasHandles.depthCanvas = depthCanvas;
    rgbdLab.scene = buildCanonicalRgbdScene({
      projectionProfile: workbench.projectionProfile,
      innerGuideSplit: workbench.domeGuideSemanticSplit,
      carrierHorizonSplit: workbench.domeGuideHorizonSplit,
      sourceWidth: sourceCanvas.width,
      sourceHeight: sourceCanvas.height,
      depthWidth: depthCanvas.width,
      depthHeight: depthCanvas.height,
      depthConvention: {
        polarity: workbench.motionConfig.polarity,
        nearMeters: workbench.motionConfig.nearMeters,
        farMeters: workbench.motionConfig.farMeters,
        source: "imported-relative",
      },
    });
    setRgbdStep("path");
    finishRgbdJob("build-scene", "Scene seeded");
  } catch (error) {
    handleError(error, "build-scene");
  }
}

export async function renderSelectedRgbdProxy(): Promise<void> {
  try {
    if (!canRenderRgbdProxy() || !rgbdLab.scene) throw new Error("Build the canonical RGBD scene before rendering a proxy.");
    if (!rgbdCanvasHandles.sourceCanvas || !rgbdCanvasHandles.depthCanvas) throw new Error("Scene canvases are not loaded.");
    const keyframe = getSelectedRgbdKeyframe();
    startRgbdJob("render-proxy", "Render RGBD Proxy", "Rendering WebGPU proxy views");
    const result = await renderRgbdProxyViews({
      sourceCanvas: rgbdCanvasHandles.sourceCanvas,
      depthCanvas: rgbdCanvasHandles.depthCanvas,
      projectionProfile: rgbdLab.scene.projectionProfile,
      pose: keyframe.pose,
      keyframeId: keyframe.id,
      width: rgbdLab.proxySize.width,
      height: rgbdLab.proxySize.height,
      innerGuideSplit: rgbdLab.scene.sourceMapGeometry.innerGuideSplit,
      carrierHorizonSplit: rgbdLab.scene.sourceMapGeometry.carrierHorizonSplit,
    });
    rgbdLab.proxy = result.artifact;
    rgbdCanvasHandles.proxyRgbCanvas = result.canvases.rgb;
    rgbdCanvasHandles.proxyDepthCanvas = result.canvases.depthPreview;
    rgbdCanvasHandles.knownMaskCanvas = result.canvases.knownMask;
    rgbdCanvasHandles.disocclusionMaskCanvas = result.canvases.disocclusionMask;
    rgbdCanvasHandles.confidenceCanvas = result.canvases.confidencePreview;
    rgbdLab.reconstruction = null;
    rgbdLab.depth = null;
    rgbdLab.alignment = null;
    rgbdLab.fusedView = null;
    setRgbdStep("reconstruct");
    finishRgbdJob("render-proxy", "Proxy ready");
  } catch (error) {
    handleError(error, "render-proxy");
  }
}

export async function importRgbdReconstructionFile(file: File): Promise<void> {
  try {
    if (!rgbdLab.proxy) throw new Error("Render a proxy before importing a reconstructed view.");
    const canvas = await imageFileToCanvas(file);
    rgbdCanvasHandles.reconstructionCanvas = canvas;
    const media = mediaRefFromFile(file, "Imported reconstructed proxy view");
    rgbdLab.reconstruction = reconstructionArtifact(media, "manual-import");
    rgbdLab.depth = null;
    rgbdLab.alignment = null;
    rgbdLab.fusedView = null;
    setRgbdStep("depth");
  } catch (error) {
    handleError(error, "import-reconstruction");
  }
}

export async function reconstructRgbdProxyWithApi(): Promise<void> {
  try {
    if (!rgbdLab.proxy || !rgbdCanvasHandles.proxyRgbCanvas) throw new Error("Render a proxy before reconstruction.");
    startRgbdJob("reconstruct-proxy-view", "Reconstruct Proxy View", "Preparing GPT-image-2 handoff");
    const result = await reconstructProxyViewWithGptImage2({
      proxyImageDataUrl: rgbdCanvasHandles.proxyRgbCanvas.toDataURL("image/png"),
      knownMaskDataUrl: rgbdCanvasHandles.knownMaskCanvas?.toDataURL("image/png"),
      disocclusionMaskDataUrl: rgbdCanvasHandles.disocclusionMaskCanvas?.toDataURL("image/png"),
      confidenceImageDataUrl: rgbdCanvasHandles.confidenceCanvas?.toDataURL("image/png"),
      prompt: rgbdLab.promptDrafts.reconstruct,
      onProgress: (stage, progress) => updateRgbdJob("reconstruct-proxy-view", stage, progress),
    });
    const output = result.outputs?.find((item) => item.dataUri || item.url);
    if (!output) throw new Error("API returned no reconstructed proxy view.");
    const url = output.dataUri || output.url || "";
    rgbdCanvasHandles.reconstructionCanvas = await loadCanvasFromImageSource(url);
    rgbdLab.reconstruction = reconstructionArtifact(
      {
        kind: "image",
        url,
        name: output.name || "GPT-image-2 reconstructed proxy view",
        mime: output.contentType || "image/png",
        alt: "GPT-image-2 reconstructed RGBD proxy view",
      },
      "gpt-image-2",
    );
    setRgbdStep("depth");
    finishRgbdJob("reconstruct-proxy-view", "Reconstruction ready");
  } catch (error) {
    handleError(error, "reconstruct-proxy-view");
  }
}

export async function importRgbdDepthFile(file: File): Promise<void> {
  try {
    if (!rgbdLab.reconstruction) throw new Error("Import or generate a reconstructed view before adding depth.");
    const canvas = await imageFileToCanvas(file);
    rgbdCanvasHandles.generatedDepthCanvas = canvas;
    rgbdLab.depth = depthArtifact(mediaRefFromFile(file, "Imported proxy relative depth"), "manual import");
    rgbdLab.alignment = null;
    rgbdLab.fusedView = null;
    setRgbdStep("align");
  } catch (error) {
    handleError(error, "import-depth");
  }
}

export async function generateRgbdDepthWithApi(): Promise<void> {
  try {
    if (!rgbdLab.reconstruction?.media.url) throw new Error("Import or generate a reconstructed view before depth generation.");
    startRgbdJob("generate-proxy-depth", "Generate Proxy Depth", "Preparing Gemini depth request");
    const imageDataUrl = rgbdCanvasHandles.reconstructionCanvas?.toDataURL("image/png") || (await urlToDataUrl(rgbdLab.reconstruction.media.url));
    const result = await generateRelativeDepthWithGemini({
      imageDataUrl,
      prompt: rgbdLab.promptDrafts.depth,
      onProgress: (stage, progress) => updateRgbdJob("generate-proxy-depth", stage, progress),
    });
    const output = result.outputs?.find((item) => item.dataUri || item.url);
    if (!output) throw new Error("API returned no depth map.");
    const url = output.dataUri || output.url || "";
    rgbdCanvasHandles.generatedDepthCanvas = await loadCanvasFromImageSource(url);
    rgbdLab.depth = depthArtifact(
      {
        kind: "image",
        url,
        name: output.name || "Gemini relative depth prior",
        mime: output.contentType || "image/png",
        alt: "Gemini relative depth prior for reconstructed RGBD proxy",
      },
      "Gemini relative depth prior",
    );
    setRgbdStep("align");
    finishRgbdJob("generate-proxy-depth", "Depth ready");
  } catch (error) {
    handleError(error, "generate-proxy-depth");
  }
}

export async function alignCurrentRgbdDepth(): Promise<void> {
  try {
    if (!canAlignRgbdDepth() || !rgbdLab.proxy || !rgbdLab.depth || !rgbdLab.scene) {
      throw new Error("Proxy, reconstruction, and depth must exist before alignment.");
    }
    if (!rgbdCanvasHandles.proxyDepthCanvas || !rgbdCanvasHandles.generatedDepthCanvas || !rgbdCanvasHandles.knownMaskCanvas) {
      throw new Error("Depth alignment requires proxy depth, generated depth, and known mask canvases.");
    }
    startRgbdJob("align-depth", "Align Depth", "Sampling reliable overlap");
    const samples = sampleDepthAlignmentPairs({
      sceneDepth: rgbdCanvasHandles.proxyDepthCanvas,
      generatedDepth: rgbdCanvasHandles.generatedDepthCanvas,
      knownMask: rgbdCanvasHandles.knownMaskCanvas,
      disocclusionMask: rgbdCanvasHandles.disocclusionMaskCanvas || null,
      confidence: rgbdCanvasHandles.confidenceCanvas || null,
      nearMeters: rgbdLab.scene.depthConvention.nearMeters,
      farMeters: rgbdLab.scene.depthConvention.farMeters,
      polarity: rgbdLab.scene.depthConvention.polarity,
    });
    rgbdLab.alignment = fitInverseDepthAlignment(rgbdLab.proxy.id, rgbdLab.depth.id, samples);
    rgbdCanvasHandles.alignedDepthCanvas = createAlignedDepthCanvas(
      rgbdCanvasHandles.generatedDepthCanvas,
      rgbdLab.alignment,
      rgbdLab.scene.depthConvention.nearMeters,
      rgbdLab.scene.depthConvention.farMeters,
      rgbdLab.scene.depthConvention.polarity,
    );
    setRgbdStep("fuse");
    finishRgbdJob("align-depth", rgbdLab.alignment.status === "aligned" ? "Depth aligned" : "Alignment needs review");
  } catch (error) {
    handleError(error, "align-depth");
  }
}

export async function importRgbdFeatureReportFile(file: File): Promise<void> {
  try {
    if (!rgbdLab.proxy) throw new Error("Render a proxy before importing a feature report.");
    const service = createExternalFeatureAnchorService();
    rgbdLab.featureReport = service.importReport(await file.text(), rgbdLab.proxy.id, rgbdLab.reconstruction?.id);
  } catch (error) {
    handleError(error, "import-feature-report");
  }
}

export async function markFeatureAnchorsUnavailable(): Promise<void> {
  if (!rgbdLab.proxy) {
    recordRgbdError("Render a proxy before requesting feature diagnostics.");
    return;
  }
  rgbdLab.featureReport = await createExternalFeatureAnchorService().compare({
    proxyId: rgbdLab.proxy.id,
    reconstructionId: rgbdLab.reconstruction?.id,
    sourceImage: null,
    targetImage: null,
    provider: "dinov3",
  });
}

export async function fuseCurrentRgbdView(): Promise<void> {
  try {
    if (!canFuseRgbdView() || !rgbdLab.scene || !rgbdLab.proxy || !rgbdLab.reconstruction || !rgbdLab.depth || !rgbdLab.alignment) {
      throw new Error("Scene, proxy, reconstruction, depth, and alignment must exist before fusion.");
    }
    startRgbdJob("fuse-view", "Fuse View", "Updating canonical RGBD scene");
    const result = fuseReconstructedView(rgbdLab.scene, rgbdLab.proxy, rgbdLab.reconstruction, rgbdLab.depth, rgbdLab.alignment, rgbdLab.featureReport || undefined);
    rgbdLab.scene = result.scene;
    rgbdLab.fusedView = result.fusedView;
    setRgbdStep("render");
    finishRgbdJob("fuse-view", "Scene expanded");
  } catch (error) {
    handleError(error, "fuse-view");
  }
}

export async function downloadRgbdCanvas(name: keyof typeof rgbdCanvasHandles, filename: string): Promise<void> {
  const canvas = rgbdCanvasHandles[name];
  if (!canvas) throw new Error("Requested RGBD canvas is not available.");
  downloadBlob(await canvasToBlob(canvas, "image/png"), filename);
}

export function downloadRgbdSceneManifest(): void {
  if (!rgbdLab.scene) {
    recordRgbdError("Build the RGBD scene before exporting a scene manifest.");
    return;
  }
  const manifest = {
    scene: rgbdLab.scene,
    cameraPath: rgbdLab.cameraPath,
    selectedKeyframeId: rgbdLab.selectedKeyframeId,
    proxy: rgbdLab.proxy,
    reconstruction: rgbdLab.reconstruction,
    depth: rgbdLab.depth,
    alignment: rgbdLab.alignment,
    featureReport: rgbdLab.featureReport,
    fusedView: rgbdLab.fusedView,
    splatCandidate: createPointCloudExportManifest(rgbdLab.scene),
  };
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
  downloadBlob(blob, `zenith-rgbd-scene-${Date.now()}.json`);
}

function reconstructionArtifact(media: RgbdMediaRef, model: RgbdReconstructionArtifact["model"]): RgbdReconstructionArtifact {
  if (!rgbdLab.proxy) throw new Error("Proxy is missing.");
  return {
    id: `reconstruction-${rgbdLab.proxy.id}`,
    proxyId: rgbdLab.proxy.id,
    label: "Reconstructed Proxy View",
    status: "ready",
    media,
    prompt: rgbdLab.promptDrafts.reconstruct,
    model,
    createdAt: new Date().toISOString(),
    warnings: model === "manual-import" ? ["Manual import bypassed paid API; verify it preserves the proxy camera geometry."] : [],
  };
}

function depthArtifact(media: RgbdMediaRef, sourceLabel: string): RgbdDepthArtifact {
  if (!rgbdLab.reconstruction || !rgbdLab.scene) throw new Error("Reconstruction and scene are required.");
  return {
    id: `depth-${rgbdLab.reconstruction.id}`,
    reconstructionId: rgbdLab.reconstruction.id,
    label: "Proxy Relative Depth",
    status: "ready",
    media,
    prompt: rgbdLab.promptDrafts.depth,
    convention: {
      ...rgbdLab.scene.depthConvention,
      source: sourceLabel.includes("Gemini") ? "gemini-relative" : "imported-relative",
    },
    createdAt: new Date().toISOString(),
    warnings: ["Depth is a relative dense prior and must be aligned before fusion."],
  };
}

function sampleDepthAlignmentPairs(input: {
  sceneDepth: HTMLCanvasElement;
  generatedDepth: HTMLCanvasElement;
  knownMask: HTMLCanvasElement;
  disocclusionMask: HTMLCanvasElement | null;
  confidence: HTMLCanvasElement | null;
  nearMeters: number;
  farMeters: number;
  polarity: "brightFar" | "brightNear";
}): DepthAlignmentSample[] {
  const width = Math.min(input.sceneDepth.width, input.generatedDepth.width, input.knownMask.width);
  const height = Math.min(input.sceneDepth.height, input.generatedDepth.height, input.knownMask.height);
  const scene = imageData(input.sceneDepth, width, height).data;
  const generated = imageData(input.generatedDepth, width, height).data;
  const known = imageData(input.knownMask, width, height).data;
  const hole = input.disocclusionMask ? imageData(input.disocclusionMask, width, height).data : null;
  const confidence = input.confidence ? imageData(input.confidence, width, height).data : null;
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 56));
  const samples: DepthAlignmentSample[] = [];
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const index = (y * width + x) * 4;
      const knownValue = luma(known, index);
      const holeValue = hole ? luma(hole, index) : 0;
      const confidenceValue = confidence ? luma(confidence, index) : knownValue;
      const sceneLuma = luma(scene, index);
      const generatedLuma = luma(generated, index);
      samples.push({
        sceneDepthMeters: grayscaleToDepthMeters(sceneLuma, input.nearMeters, input.farMeters, input.polarity),
        viewDepthMeters: grayscaleToDepthMeters(generatedLuma, input.nearMeters, input.farMeters, input.polarity),
        confidence: Math.min(knownValue, confidenceValue),
        disoccluded: holeValue > 0.5 || knownValue < 0.5,
        reprojectionError: Math.abs(sceneLuma - generatedLuma) * 2,
      });
    }
  }
  return samples;
}

function imageData(canvas: HTMLCanvasElement, width: number, height: number): ImageData {
  const scratch = document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

function createAlignedDepthCanvas(
  generatedDepth: HTMLCanvasElement,
  alignment: NonNullable<typeof rgbdLab.alignment>,
  nearMeters: number,
  farMeters: number,
  polarity: "brightFar" | "brightNear",
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = generatedDepth.width;
  canvas.height = generatedDepth.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(generatedDepth, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const range = Math.max(0.000001, farMeters - nearMeters);
  for (let index = 0; index < image.data.length; index += 4) {
    const depthMeters = grayscaleToDepthMeters(luma(image.data, index), nearMeters, farMeters, polarity);
    const alignedMeters = applyInverseDepthAlignment(depthMeters, alignment);
    const farFactor = Math.max(0, Math.min(1, (alignedMeters - nearMeters) / range));
    const encoded = polarity === "brightNear" ? 1 - farFactor : farFactor;
    const value = Math.round(encoded * 255);
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
    image.data[index + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function luma(data: Uint8ClampedArray, index: number): number {
  return (data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722) / 255;
}

async function artifactCanvas(artifactId: "start-state" | "start-depth"): Promise<HTMLCanvasElement> {
  const artifact = getArtifact(artifactId);
  if (artifact.media.kind !== "image" && artifact.media.kind !== "canvas") {
    throw new Error(`${artifact.label} must be an image artifact for RGBD scene expansion.`);
  }
  const handle = getArtifactMediaHandle(artifactId);
  if (handle?.canvas) return handle.canvas;
  if (handle?.blob) return loadCanvasFromImageSource(await blobToDataUrl(handle.blob));
  if (artifact.media.blob) return loadCanvasFromImageSource(await blobToDataUrl(artifact.media.blob));
  if (!artifact.media.url) throw new Error(`${artifact.label} has no readable media.`);
  return loadCanvasFromImageSource(artifact.media.url);
}

async function imageFileToCanvas(file: File): Promise<HTMLCanvasElement> {
  return loadCanvasFromImageSource(await blobToDataUrl(file));
}

function mediaRefFromFile(file: File, alt: string): RgbdMediaRef {
  return {
    kind: "image",
    url: URL.createObjectURL(file),
    name: file.name,
    mime: file.type || "image/png",
    alt,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read blob."));
    reader.readAsDataURL(blob);
  });
}

async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not fetch RGBD media.");
  return blobToDataUrl(await response.blob());
}

function handleError(error: unknown, jobId: string): void {
  const message = error instanceof Error ? error.message : "RGBD scene operation failed.";
  recordRgbdError(message);
  finishRgbdJob(jobId, "Failed");
}
