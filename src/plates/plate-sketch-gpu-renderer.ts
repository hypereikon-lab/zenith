import { PlateGpuCompositor } from "./plate-gpu-compositor.js";
import { buildCaveRoomGeometry, buildDomeGeometry } from "../graphics/geometry.js";
import { caveShaderCode, domeShaderCode } from "../graphics/shaders.js";
import { multiplyMat4 } from "../projection.js";
import {
  normalizePlateEditorCamera,
  plateEditorProjectionMatrix,
  plateEditorViewMatrix,
  type PlateEditorCamera,
  type PlateEditorViewMode,
} from "./plate-editor-view.js";
import {
  sourceProjectionGeometryRange,
  sourceProjectionProfileForMode,
  sourceProjectionShaderTheta,
} from "../geometry/source-projection.js";
import { sourceGuideCarrierHorizonRadius } from "../geometry/source-guide-semantics.js";
import { normalizeDomeGuideSemanticSplit } from "../geometry/dome-handoff-guide.js";
import type { PlateRenderOptions } from "./plate-gpu-compositor.js";
import type { SourceProjectionMode } from "../geometry/source-projection.js";

const previewCopyShader = /* wgsl */ `
struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@group(0) @binding(0) var previewSampler: sampler;
@group(0) @binding(1) var previewTexture: texture_2d<f32>;

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOut {
  var positions = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(1.0, 1.0)
  );
  let position = positions[index];
  var out: VertexOut;
  out.position = vec4<f32>(position, 0.0, 1.0);
  out.uv = vec2<f32>(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
  return out;
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4<f32> {
  return textureSampleLevel(previewTexture, previewSampler, in.uv, 0.0);
}
`;

export type PlateSketchRenderOptions = PlateRenderOptions & {
  projectionViewMode?: PlateEditorViewMode;
  projectionCamera?: Partial<PlateEditorCamera>;
  showProjectionGuides?: boolean;
  showCaveMask?: boolean;
  invertCaveMask?: boolean;
};

export type PlateSketchGpuRenderer = {
  renderPreview: (options: PlateSketchRenderOptions) => void;
  renderToCanvas: (options: PlateRenderOptions) => Promise<HTMLCanvasElement>;
  destroy: () => void;
};

export async function createPlateSketchGpuRenderer(canvas: HTMLCanvasElement): Promise<PlateSketchGpuRenderer> {
  if (!navigator.gpu) {
    throw new Error("WebGPU is not available in this browser.");
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error("No WebGPU adapter was found.");
  }

  const device = await adapter.requestDevice();
  let destroyed = false;
  device.lost.then((info) => {
    if (destroyed || info.reason === "destroyed") return;
    console.error("Plate Sketch WebGPU device lost:", info.message);
  });

  const context = canvas.getContext("webgpu");
  if (!context) {
    throw new Error("Could not create a WebGPU canvas context.");
  }

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat,
    alphaMode: "opaque",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });
  const compositor = new PlateGpuCompositor({ device, sampler });
  const copyBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: "filtering" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "float", viewDimension: "2d" },
      },
    ],
  });
  const copyShaderModule = device.createShaderModule({ code: previewCopyShader });
  const copyPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [copyBindGroupLayout] }),
    vertex: {
      module: copyShaderModule,
      entryPoint: "vertexMain",
    },
    fragment: {
      module: copyShaderModule,
      entryPoint: "fragmentMain",
      targets: [{ format: presentationFormat }],
    },
    primitive: {
      topology: "triangle-list",
    },
  });
  const projectionBindGroupLayout = device.createBindGroupLayout({
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
  const projectionPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [projectionBindGroupLayout] });
  const domeShaderModule = device.createShaderModule({ code: domeShaderCode });
  const domePipeline = device.createRenderPipeline({
    layout: projectionPipelineLayout,
    vertex: {
      module: domeShaderModule,
      entryPoint: "vertexMain",
      buffers: [
        {
          arrayStride: 12,
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
        },
      ],
    },
    fragment: {
      module: domeShaderModule,
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
  const caveShaderModule = device.createShaderModule({ code: caveShaderCode });
  const cavePipeline = device.createRenderPipeline({
    layout: projectionPipelineLayout,
    vertex: {
      module: caveShaderModule,
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
      module: caveShaderModule,
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
  const projectionUniformBuffer = device.createBuffer({
    size: 192,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const caveGeometry = buildCaveRoomGeometry();
  const caveVertexBuffer = createBuffer(caveGeometry.vertices, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
  const caveIndexBuffer = createBuffer(caveGeometry.indices, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST);
  let domeVertexBuffer: GPUBuffer | null = null;
  let domeIndexBuffer: GPUBuffer | null = null;
  let domeIndexCount = 0;
  let domeGeometryMode: SourceProjectionMode | null = null;
  let depthTexture: GPUTexture | null = null;
  let depthTextureSize = 0;

  function renderPreview(options: PlateSketchRenderOptions): void {
    const size = Math.max(1, Math.round(options.size || 768));
    if (canvas.width !== size) canvas.width = size;
    if (canvas.height !== size) canvas.height = size;
    // Render the compositor texture at a constant high resolution (2048x2048)
    // so that the 3D projection passes have enough pixel density to prevent scaling artifacts
    const texture = compositor.render({ ...options, size: 2048 });
    if (options.projectionViewMode && options.projectionViewMode !== "source-map") {
      renderProjectionPreview(texture, size, options);
      return;
    }
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(copyPipeline);
    pass.setBindGroup(0, copyBindGroup(texture));
    pass.draw(6);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  function renderProjectionPreview(texture: GPUTexture, size: number, options: PlateSketchRenderOptions): void {
    const sourceProjectionMode = options.sourceProjectionMode || "zenith-180";
    ensureDomeGeometry(sourceProjectionMode);
    ensureDepthTexture(size);
    writeProjectionUniforms(size, options);

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
    pass.setBindGroup(0, projectionBindGroup(texture));
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

  async function renderToCanvas(options: PlateRenderOptions): Promise<HTMLCanvasElement> {
    const size = Math.max(1, Math.round(options.size || 2048));
    const texture = compositor.render({ ...options, size });
    return readTextureToCanvas(device, texture, size, size);
  }

  function copyBindGroup(texture: GPUTexture): GPUBindGroup {
    return device.createBindGroup({
      layout: copyBindGroupLayout,
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: texture.createView() },
      ],
    });
  }

  function projectionBindGroup(texture: GPUTexture): GPUBindGroup {
    return device.createBindGroup({
      layout: projectionBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: projectionUniformBuffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: texture.createView() },
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

  function ensureDepthTexture(size: number): void {
    if (depthTexture && depthTextureSize === size) return;
    depthTexture?.destroy();
    depthTexture = device.createTexture({
      size: { width: size, height: size },
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    depthTextureSize = size;
  }

  function writeProjectionUniforms(size: number, options: PlateSketchRenderOptions): void {
    const sourceProjectionMode = options.sourceProjectionMode || "zenith-180";
    const camera = normalizePlateEditorCamera(options.projectionCamera || {});
    const projectionViewMode = options.projectionViewMode === "cave-room" ? "cave-room" : options.projectionViewMode || "dome-orbit";
    const projection = plateEditorProjectionMatrix(camera, sourceProjectionMode, 1);
    const view = plateEditorViewMatrix(projectionViewMode === "source-map" ? "dome-orbit" : projectionViewMode, camera, sourceProjectionMode);
    const mvp = multiplyMat4(projection, view);
    const profile = sourceProjectionProfileForMode(sourceProjectionMode, size, size, 1);
    const showGuides = options.showProjectionGuides ? 1 : 0;
    const data = new Float32Array(48);
    data.set(mvp, 0);
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
    data[29] = projectionViewMode === "dome-pov" ? 0.12 : 0.3;
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
    device.queue.writeBuffer(projectionUniformBuffer, 0, data);
  }

  function createBuffer(data: Float32Array | Uint32Array, usage: GPUBufferUsageFlags): GPUBuffer {
    const buffer = device.createBuffer({
      size: data.byteLength,
      usage,
    });
    device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  function destroy(): void {
    destroyed = true;
    domeVertexBuffer?.destroy();
    domeIndexBuffer?.destroy();
    caveVertexBuffer.destroy();
    caveIndexBuffer.destroy();
    depthTexture?.destroy();
    if ("destroy" in device && typeof device.destroy === "function") {
      device.destroy();
    }
  }

  return {
    renderPreview,
    renderToCanvas,
    destroy,
  };
}

async function readTextureToCanvas(
  device: GPUDevice,
  texture: GPUTexture,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  const bytesPerPixel = 4;
  const unpaddedBytesPerRow = width * bytesPerPixel;
  const bytesPerRow = Math.ceil(unpaddedBytesPerRow / 256) * 256;
  const buffer = device.createBuffer({
    size: bytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer(
    { texture },
    { buffer, bytesPerRow, rowsPerImage: height },
    { width, height, depthOrArrayLayers: 1 },
  );
  device.queue.submit([encoder.finish()]);
  await buffer.mapAsync(GPUMapMode.READ);

  const source = new Uint8Array(buffer.getMappedRange());
  const pixels = new Uint8ClampedArray(unpaddedBytesPerRow * height);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = row * bytesPerRow;
    const targetStart = row * unpaddedBytesPerRow;
    pixels.set(source.subarray(sourceStart, sourceStart + unpaddedBytesPerRow), targetStart);
  }
  buffer.unmap();
  buffer.destroy();

  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  output.getContext("2d").putImageData(new ImageData(pixels, width, height), 0, 0);
  return output;
}
