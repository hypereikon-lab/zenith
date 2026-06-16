import { buildCaveRoomGeometry, buildDomeGeometry } from "./geometry.js";
import { caveShaderCode, domeShaderCode, flatShaderCode } from "./shaders.js";
import {
  sourceProjectionGeometryRange,
  sourceProjectionProfileForMode,
  sourceProjectionShaderTheta,
} from "../geometry/source-projection.js";
import { sourceGuideCarrierHorizonRadius } from "../geometry/source-guide-semantics.js";
import { normalizeDomeGuideSemanticSplit } from "../geometry/dome-handoff-guide.js";
import { multiplyMat4, perspectiveLH } from "../projection.js";
import {
  normalizePlateEditorCamera,
  plateEditorViewMatrix,
  type PlateEditorCamera,
  type PlateEditorViewMode,
} from "../plates/plate-editor-view.js";
import type { SourceProjectionMode } from "../geometry/source-projection.js";

const TEXTURE_FORMAT: GPUTextureFormat = "rgba8unorm";

export type SourceMapPreviewRenderOptions = {
  width: number;
  height: number;
  sourceProjectionMode: SourceProjectionMode;
  projectionViewMode: PlateEditorViewMode;
  projectionCamera?: Partial<PlateEditorCamera>;
  showProjectionGuides?: boolean;
  domeGuideSemanticSplit?: number | string | null;
  domeGuideHorizonSplit?: number | string | null;
  showCaveMask?: boolean;
  invertCaveMask?: boolean;
};

export type SourceMapPreviewSource = ImageBitmap | HTMLCanvasElement | HTMLVideoElement;

export type SourceMapPreviewRenderer = {
  setSourceImage: (source: SourceMapPreviewSource) => void;
  render: (options: SourceMapPreviewRenderOptions) => void;
  destroy: () => void;
};

export async function createSourceMapPreviewRenderer(canvas: HTMLCanvasElement): Promise<SourceMapPreviewRenderer> {
  if (!navigator.gpu) {
    throw new Error("WebGPU is not available in this browser.");
  }

  let device!: GPUDevice;
  let context!: GPUCanvasContext;
  let presentationFormat!: GPUTextureFormat;
  let sampler!: GPUSampler;
  let bindGroupLayout!: GPUBindGroupLayout;
  let pipelineLayout!: GPUPipelineLayout;
  let flatPipeline!: GPURenderPipeline;
  let domePipeline!: GPURenderPipeline;
  let cavePipeline!: GPURenderPipeline;
  let uniformBuffer!: GPUBuffer;
  let caveVertexBuffer!: GPUBuffer;
  let caveIndexBuffer!: GPUBuffer;

  let sourceTexture: GPUTexture | null = null;
  let sourceWidth = 1;
  let sourceHeight = 1;
  let sourceTextureWidth = 0;
  let sourceTextureHeight = 0;
  let domeVertexBuffer: GPUBuffer | null = null;
  let domeIndexBuffer: GPUBuffer | null = null;
  let domeIndexCount = 0;
  let domeGeometryMode: SourceProjectionMode | null = null;
  let depthTexture: GPUTexture | null = null;
  let depthWidth = 0;
  let depthHeight = 0;

  let destroyed = false;
  let lastSourceImage: SourceMapPreviewSource | null = null;
  const caveGeometry = buildCaveRoomGeometry();

  async function init(): Promise<void> {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No WebGPU adapter was found.");
    }

    device = await adapter.requestDevice();
    device.lost.then((info) => {
      if (destroyed || info.reason === "destroyed") return;
      console.warn("Source Map Preview WebGPU device lost. Re-initializing...", info.message);
      cleanup();
      void init().then(() => {
        if (lastSourceImage) {
          setSourceImage(lastSourceImage);
        }
      }).catch((error) => {
        console.error("Failed to re-initialize WebGPU renderer after device loss:", error);
      });
    });

    context = canvas.getContext("webgpu")!;
    presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format: presentationFormat,
      alphaMode: "opaque",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });

    bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float", viewDimension: "2d" },
        },
      ],
    });
    pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

    flatPipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: device.createShaderModule({ code: flatShaderCode }),
        entryPoint: "vertexMain",
      },
      fragment: {
        module: device.createShaderModule({ code: flatShaderCode }),
        entryPoint: "fragmentMain",
        targets: [{ format: presentationFormat }],
      },
      primitive: {
        topology: "triangle-list",
      },
    });

    domePipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: device.createShaderModule({ code: domeShaderCode }),
        entryPoint: "vertexMain",
        buffers: [
          {
            arrayStride: 12,
            attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
          },
        ],
      },
      fragment: {
        module: device.createShaderModule({ code: domeShaderCode }),
        entryPoint: "fragmentMain",
        targets: [{ format: presentationFormat }],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "none",
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less",
        format: "depth24plus",
      },
    });

    cavePipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: device.createShaderModule({ code: caveShaderCode }),
        entryPoint: "vertexMain",
        buffers: [
          {
            arrayStride: 24,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" },
              { shaderLocation: 1, offset: 12, format: "float32x2" },
              { shaderLocation: 2, offset: 20, format: "float32" },
            ],
          },
        ],
      },
      fragment: {
        module: device.createShaderModule({ code: caveShaderCode }),
        entryPoint: "fragmentMain",
        targets: [{ format: presentationFormat }],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "none",
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less",
        format: "depth24plus",
      },
    });

    uniformBuffer = device.createBuffer({
      size: 192,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    caveVertexBuffer = createBuffer(caveGeometry.vertices, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
    caveIndexBuffer = createBuffer(caveGeometry.indices, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST);
  }

  await init();

  function setSourceImage(source: SourceMapPreviewSource): void {
    if (!device) return;
    lastSourceImage = source;
    const dimensions = sourceDimensions(source);
    if (!dimensions) return;
    sourceWidth = dimensions.width;
    sourceHeight = dimensions.height;
    if (!sourceTexture || sourceTextureWidth !== sourceWidth || sourceTextureHeight !== sourceHeight) {
      sourceTexture?.destroy();
      sourceTexture = device.createTexture({
        size: { width: sourceWidth, height: sourceHeight },
        format: TEXTURE_FORMAT,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      sourceTextureWidth = sourceWidth;
      sourceTextureHeight = sourceHeight;
    }
    device.queue.copyExternalImageToTexture({ source }, { texture: sourceTexture }, [sourceWidth, sourceHeight]);
  }

  function render(options: SourceMapPreviewRenderOptions): void {
    if (!device || !sourceTexture) return;
    const width = Math.max(1, Math.round(options.width));
    const height = Math.max(1, Math.round(options.height));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    writeUniforms(width, height, options);

    if (options.projectionViewMode === "source-map") {
      renderFlat();
      return;
    }
    renderProjection(width, height, options);
  }

  function renderFlat(): void {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0.012, g: 0.015, b: 0.018, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(flatPipeline);
    pass.setBindGroup(0, bindGroup());
    pass.draw(6);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  function renderProjection(width: number, height: number, options: SourceMapPreviewRenderOptions): void {
    ensureDepthTexture(width, height);
    if (options.projectionViewMode !== "cave-room") {
      ensureDomeGeometry(options.sourceProjectionMode);
    }

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0.012, g: 0.015, b: 0.018, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depthTexture!.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "discard",
      },
    });
    pass.setBindGroup(0, bindGroup());
    if (options.projectionViewMode === "cave-room") {
      pass.setPipeline(cavePipeline);
      pass.setVertexBuffer(0, caveVertexBuffer);
      pass.setIndexBuffer(caveIndexBuffer, "uint32");
      pass.drawIndexed(caveGeometry.indices.length);
    } else {
      pass.setPipeline(domePipeline);
      pass.setVertexBuffer(0, domeVertexBuffer);
      pass.setIndexBuffer(domeIndexBuffer, "uint32");
      pass.drawIndexed(domeIndexCount);
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  function bindGroup(): GPUBindGroup {
    return device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: sourceTexture!.createView() },
      ],
    });
  }

  function ensureDomeGeometry(sourceProjectionMode: SourceProjectionMode): void {
    if (domeGeometryMode === sourceProjectionMode && domeVertexBuffer && domeIndexBuffer) return;
    domeVertexBuffer?.destroy();
    domeIndexBuffer?.destroy();
    const range = sourceProjectionGeometryRange(sourceProjectionMode);
    const geometry = buildDomeGeometry(1, range.thetaStart, range.thetaEnd);
    domeVertexBuffer = createBuffer(geometry.vertices, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
    domeIndexBuffer = createBuffer(geometry.indices, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST);
    domeIndexCount = geometry.indices.length;
    domeGeometryMode = sourceProjectionMode;
  }

  function ensureDepthTexture(width: number, height: number): void {
    if (depthTexture && depthWidth === width && depthHeight === height) return;
    depthTexture?.destroy();
    depthTexture = device.createTexture({
      size: { width, height },
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    depthWidth = width;
    depthHeight = height;
  }

  function writeUniforms(width: number, height: number, options: SourceMapPreviewRenderOptions): void {
    const sourceProjectionMode = options.sourceProjectionMode;
    const camera = normalizePlateEditorCamera(options.projectionCamera || {});
    const projectionViewMode =
      options.projectionViewMode === "source-map" ? "dome-orbit" : options.projectionViewMode;
    const projection = perspectiveLH((camera.fovDegrees * Math.PI) / 180, width / Math.max(1, height), 0.01, 24);
    const view = plateEditorViewMatrix(projectionViewMode, camera, sourceProjectionMode);
    const profile = sourceProjectionProfileForMode(sourceProjectionMode, sourceWidth, sourceHeight, 1);
    const showGuides = options.showProjectionGuides ? 1 : 0;
    const data = new Float32Array(48);
    data.set(multiplyMat4(projection, view), 0);
    data[16] = profile.fisheyeScaleX;
    data[17] = profile.fisheyeScaleY;
    data[18] = 0;
    data[19] = 1;
    data[20] = options.showProjectionGuides ? 0.78 : 0.28;
    data[21] = 0;
    data[22] = 0;
    data[23] = 0;
    data[24] = showGuides;
    data[25] = showGuides;
    data[26] = showGuides;
    data[27] = showGuides;
    data[28] = showGuides;
    data[29] = options.projectionViewMode === "dome-pov" ? 0.12 : 0.3;
    data[30] = normalizeDomeGuideSemanticSplit(options.domeGuideSemanticSplit);
    data[31] = sourceGuideCarrierHorizonRadius(sourceProjectionMode, data[30], options.domeGuideHorizonSplit);
    data.set(profile.centerAxis, 32);
    data[35] = sourceProjectionShaderTheta(
      sourceProjectionMode,
      profile.fieldOfViewDegrees,
      options.domeGuideSemanticSplit,
    );
    data.set(profile.imageRightAxis, 36);
    data.set(profile.imageUpAxis, 40);
    data[44] = options.showCaveMask ? (options.invertCaveMask ? 2 : 1) : 0;
    data[45] = camera.position[0];
    data[46] = camera.position[1];
    data[47] = camera.position[2];
    device.queue.writeBuffer(uniformBuffer, 0, data);
  }

  function createBuffer(data: Float32Array | Uint32Array, usage: GPUBufferUsageFlags): GPUBuffer {
    const buffer = device.createBuffer({
      size: data.byteLength,
      usage,
    });
    device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  function cleanup(): void {
    sourceTexture?.destroy();
    sourceTexture = null;
    domeVertexBuffer?.destroy();
    domeVertexBuffer = null;
    domeIndexBuffer?.destroy();
    domeIndexBuffer = null;
    caveVertexBuffer?.destroy();
    caveIndexBuffer?.destroy();
    depthTexture?.destroy();
    depthTexture = null;
  }

  function destroy(): void {
    destroyed = true;
    cleanup();
    if (device && "destroy" in device && typeof device.destroy === "function") {
      device.destroy();
    }
  }

  return {
    setSourceImage,
    render,
    destroy,
  };
}

function sourceDimensions(source: SourceMapPreviewSource): { width: number; height: number } | null {
  if ("videoWidth" in source) {
    const width = Math.round(source.videoWidth || 0);
    const height = Math.round(source.videoHeight || 0);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  const width = Math.round(source.width || 0);
  const height = Math.round(source.height || 0);
  return width > 0 && height > 0 ? { width, height } : null;
}
