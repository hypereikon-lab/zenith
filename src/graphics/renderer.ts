import { multiplyMat4, perspectiveLH, translationScaleMat4 } from "../projection.js";
import {
  normalizeSourceProjectionMode,
  sourceProjectionGeometryRange,
  sourceProjectionProfileForMode,
  sourceProjectionShaderTheta,
} from "../geometry/source-projection.js";
import { buildCaveRoomGeometry, buildDomeGeometry, buildRoomGeometry } from "./geometry.js";
import { getCssLayout as buildCssLayout, getRenderLayout as buildRenderLayout } from "./render-layout.js";
import { caveShaderCode, domeShaderCode, flatShaderCode, roomShaderCode } from "./shaders.js";
import { renderCopyTextureUsage } from "./texture-usage.js";
import { SourceTextureController } from "../media/source-texture.js";
import { PlateGpuCompositor } from "../plates/plate-gpu-compositor.js";
import type { PipelineReadouts } from "../app/pipeline-state.svelte.js";
import type { SetGpuState, ViewMode, ZenithState } from "../app/types.js";
import type { PlateRenderOptions } from "../plates/plate-gpu-compositor.js";
import type { ZenithControls, ZenithDom } from "../ui/dom.js";
import type { HudOptions } from "../ui/hud-renderer.js";
import type { CssLayout, Rect, RenderLayout, RenderLayoutOptions } from "./render-layout.js";

const LIVE_RENDER_SIZE = 1080;
type ReadTextureOptions = { format?: string };
type CaptureOptions = { width?: number; height?: number; square?: boolean };
type RenderSize = { width: number; height: number; dpr: number };
type MediaUploadSource = ImageBitmap | HTMLCanvasElement | HTMLVideoElement;
type RenderToViewOptions = {
  width: number;
  height: number;
  colorView: GPUTextureView;
  depthView: GPUTextureView;
  depthStoreOp?: GPUStoreOp;
  submit?: boolean;
};
type DomeRendererOptions = {
  dom: ZenithDom;
  state: ZenithState;
  controls: ZenithControls;
  video: HTMLVideoElement;
  videoTransport: { updateTransport: () => void };
  viewCamera: {
    currentDomeViewMatrix: () => Float32Array;
    theaterViewMatrix: () => Float32Array;
  };
  actions: {
    setGpuState: SetGpuState;
    setReadouts: (readouts: Partial<PipelineReadouts>) => void;
    updateMediaReadouts: () => void;
    drawHud: (ctx: CanvasRenderingContext2D | null, options: HudOptions) => void;
    buildHudOptions: (width: number, height: number, dpr: number, layout: CssLayout) => HudOptions;
  };
};

export function createDomeRenderer({
  dom,
  state,
  controls,
  video,
  videoTransport,
  viewCamera,
  actions,
}: DomeRendererOptions) {
  const { canvas, hud, hudContext } = dom;
  let device: GPUDevice;
  let context: GPUCanvasContext;
  let presentationFormat: GPUTextureFormat;
  let bindGroupLayout: GPUBindGroupLayout;
  let pipelineLayout: GPUPipelineLayout;
  let roomBindGroupLayout: GPUBindGroupLayout;
  let roomBindGroup: GPUBindGroup;
  let depthTexture: GPUTexture;
  let domePipeline: GPURenderPipeline;
  let flatPipeline: GPURenderPipeline;
  let cavePipeline: GPURenderPipeline;
  let roomPipeline: GPURenderPipeline;
  let vertexBuffer: GPUBuffer;
  let indexBuffer: GPUBuffer;
  let indexCount = 0;
  let caveVertexBuffer: GPUBuffer;
  let caveIndexBuffer: GPUBuffer;
  let caveIndexCount = 0;
  let floorVertexBuffer: GPUBuffer;
  let floorIndexBuffer: GPUBuffer;
  let floorIndexCount = 0;
  let uniformBuffer: GPUBuffer;
  let roomUniformBuffer: GPUBuffer;
  let sampler: GPUSampler;
  let sourceTexture: SourceTextureController;
  let plateCompositor: PlateGpuCompositor;
  let renderSize: RenderSize = { width: 1, height: 1, dpr: 1 };
  let lastFrameTime = performance.now();
  let lastVideoUploadTime = -1;

  async function initialize() {
    if (!navigator.gpu) {
      actions.setGpuState("No WebGPU", true);
      throw new Error("WebGPU is not available in this browser.");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      actions.setGpuState("No adapter", true);
      throw new Error("No WebGPU adapter was found.");
    }

    device = await adapter.requestDevice();
    device.lost.then((info) => {
      console.error("WebGPU device lost:", info.message);
      actions.setGpuState("Device lost", true);
    });

    context = canvas.getContext("webgpu");
    presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format: presentationFormat,
      usage: renderCopyTextureUsage(),
      alphaMode: "opaque",
    });

    sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });

    createPipelines();
    createDomeGeometry();
    createCaveGeometry();
    createRoomGeometry();
    createUniforms();
  }

  function createPipelines() {
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
    roomBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    const domeModule = device.createShaderModule({ code: domeShaderCode });
    domePipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: domeModule,
        entryPoint: "vertexMain",
        buffers: [
          {
            arrayStride: 12,
            attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
          },
        ],
      },
      fragment: {
        module: domeModule,
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

    const flatModule = device.createShaderModule({ code: flatShaderCode });
    flatPipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: flatModule,
        entryPoint: "vertexMain",
      },
      fragment: {
        module: flatModule,
        entryPoint: "fragmentMain",
        targets: [{ format: presentationFormat }],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "none",
      },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: "always",
        format: "depth24plus",
      },
    });

    const caveModule = device.createShaderModule({ code: caveShaderCode });
    cavePipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: caveModule,
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
        module: caveModule,
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

    const roomModule = device.createShaderModule({ code: roomShaderCode });
    roomPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [roomBindGroupLayout] }),
      vertex: {
        module: roomModule,
        entryPoint: "vertexMain",
        buffers: [
          {
            arrayStride: 12,
            attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
          },
        ],
      },
      fragment: {
        module: roomModule,
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
  }

  function createDomeGeometry() {
    const quality = Number(controls.meshQuality.value);
    const range = sourceProjectionGeometryRange(sourceProjectionMode());
    const { vertices, indices } = buildDomeGeometry(quality, range.thetaStart, range.thetaEnd);

    if (vertexBuffer) vertexBuffer.destroy();
    if (indexBuffer) indexBuffer.destroy();

    vertexBuffer = device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertices);

    indexBuffer = device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(indexBuffer, 0, indices);
    indexCount = indices.length;
  }

  function createCaveGeometry() {
    const { vertices, indices } = buildCaveRoomGeometry();

    if (caveVertexBuffer) caveVertexBuffer.destroy();
    if (caveIndexBuffer) caveIndexBuffer.destroy();

    caveVertexBuffer = device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(caveVertexBuffer, 0, vertices);

    caveIndexBuffer = device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(caveIndexBuffer, 0, indices);
    caveIndexCount = indices.length;
  }

  function createRoomGeometry() {
    const { vertices, indices } = buildRoomGeometry();

    floorVertexBuffer = device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(floorVertexBuffer, 0, vertices);

    floorIndexBuffer = device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(floorIndexBuffer, 0, indices);
    floorIndexCount = indices.length;
  }

  function createUniforms() {
    uniformBuffer = device.createBuffer({
      size: 176,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    roomUniformBuffer = device.createBuffer({
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    roomBindGroup = device.createBindGroup({
      layout: roomBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: roomUniformBuffer } }],
    });
    sourceTexture = new SourceTextureController({
      device,
      sampler,
      bindGroupLayout,
      uniformBuffer,
    });
    plateCompositor = new PlateGpuCompositor({ device, sampler });
  }

  function createMediaTexture(width: number, height: number): void {
    sourceTexture.create(width, height);
  }

  function uploadMediaSource(source: MediaUploadSource, width: number, height: number): void {
    sourceTexture.upload(source, width, height);
  }

  function renderPlateComposite(options: PlateRenderOptions): GPUTexture {
    if (!plateCompositor) {
      throw new Error("Plate GPU compositor is not ready.");
    }
    const texture = plateCompositor.render(options);
    sourceTexture.bind(texture);
    return texture;
  }

  async function readTextureToCanvas(
    texture: GPUTexture,
    width: number,
    height: number,
    options: ReadTextureOptions = {},
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
    if (options.format?.startsWith("bgra")) {
      swizzleBgraToRgba(pixels);
    }
    buffer.unmap();
    buffer.destroy();

    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const context2d = output.getContext("2d");
    context2d.putImageData(new ImageData(pixels, width, height), 0, 0);
    return output;
  }

  function swizzleBgraToRgba(pixels: Uint8ClampedArray): void {
    for (let index = 0; index < pixels.length; index += 4) {
      const blue = pixels[index];
      pixels[index] = pixels[index + 2];
      pixels[index + 2] = blue;
    }
  }

  function wrapDegrees(value: number): number {
    return ((((value + 180) % 360) + 360) % 360) - 180;
  }

  function resetVideoUploadState(): void {
    lastVideoUploadTime = -1;
  }

  function resize(): void {
    const cssWidth = Math.max(1, canvas.clientWidth || LIVE_RENDER_SIZE);
    const cssHeight = Math.max(1, canvas.clientHeight || LIVE_RENDER_SIZE);
    const width = LIVE_RENDER_SIZE;
    const height = LIVE_RENDER_SIZE;
    const dpr = LIVE_RENDER_SIZE / Math.min(cssWidth, cssHeight);

    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    hud.width = width;
    hud.height = height;
    renderSize = { width, height, dpr };

    if (depthTexture) depthTexture.destroy();
    depthTexture = device.createTexture({
      size: { width, height },
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  function startFrameLoop(): void {
    requestAnimationFrame(frame);
  }

  function frame(now: number): void {
    resize();
    const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
    lastFrameTime = now;

    if (controls.autoRotate.checked && !state.pointer.active) {
      if (state.viewMode === "flat") {
        controls.rotation.value = String(wrapDegrees(Number(controls.rotation.value) + dt * 9.2));
      } else {
        state.camera.orbitYaw += dt * 0.16;
        state.camera.insideYaw += dt * 0.16;
        state.camera.theaterYaw += dt * 0.16;
      }
    }

    if (
      !state.depthPreviewActive &&
      state.mediaKind === "video" &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      const pausedFrameChanged = video.paused && lastVideoUploadTime !== video.currentTime;
      if (state.pendingVideoUpload || pausedFrameChanged) {
        uploadCurrentVideoFrame();
        state.pendingVideoUpload = false;
      }
    }

    render();
    drawHud();
    updatePerformanceReadout(now);
    videoTransport.updateTransport();
    requestAnimationFrame(frame);
  }

  function updatePerformanceReadout(now: number): void {
    state.fpsFrameCount += 1;
    const elapsed = now - state.fpsSampleTime;
    if (elapsed < 500) return;
    state.fps = (state.fpsFrameCount * 1000) / elapsed;
    state.fpsFrameCount = 0;
    state.fpsSampleTime = now;
    const scale = Math.round(Number(controls.renderScale.value) * 100);
    const mesh = ["low", "medium", "high"][Number(controls.meshQuality.value)] ?? "medium";
    actions.setReadouts({ renderer: `${Math.round(state.fps)} fps, full map, ${scale}% scale, ${mesh} mesh` });
  }

  function uploadCurrentVideoFrame(): void {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width <= 0 || height <= 0) return;

    if (width !== state.sourceWidth || height !== state.sourceHeight) {
      createMediaTexture(width, height);
      state.sourceWidth = width;
      state.sourceHeight = height;
      actions.updateMediaReadouts();
    }

    sourceTexture.copyExternal(video, width, height);
    lastVideoUploadTime = video.currentTime;
    actions.setReadouts({ upload: "Direct WebGPU video frame" });
  }

  function render(): void {
    const colorView = context.getCurrentTexture().createView();
    renderToView({
      width: renderSize.width,
      height: renderSize.height,
      colorView,
      depthView: depthTexture.createView(),
      depthStoreOp: "discard",
      submit: true,
    });
  }

  function renderToView({
    width,
    height,
    colorView,
    depthView,
    depthStoreOp = "discard",
    submit = true,
  }: RenderToViewOptions): GPUCommandBuffer {
    const layout = getRenderLayout(width, height);
    const domeRect = layout.domeRect || layout.fullRect;
    writeUniforms(domeRect, state.viewMode === "cutaway");

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: colorView,
          clearValue: { r: 0.012, g: 0.015, b: 0.018, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depthView,
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp,
      },
    });

    if (state.viewMode === "flat") {
      drawFlat(pass, layout.flatRect);
    } else if (state.viewMode === "split") {
      drawFlat(pass, layout.flatRect);
      drawDome(pass, layout.domeRect);
    } else if (state.viewMode === "cave") {
      drawCave(pass, layout.fullRect);
    } else {
      if (state.viewMode === "theater" && !isNadirSourceProjection()) {
        writeRoomUniforms(layout.fullRect);
        drawRoom(pass, layout.fullRect);
        writeUniforms(layout.fullRect, false);
      }
      drawDome(pass, layout.fullRect);
    }

    pass.end();
    const command = encoder.finish();
    if (submit) {
      device.queue.submit([command]);
    }
    return command;
  }

  function drawDome(pass: GPURenderPassEncoder, rect: Rect): void {
    setViewport(pass, rect);
    pass.setPipeline(domePipeline);
    pass.setBindGroup(0, sourceTexture.getBindGroup());
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setIndexBuffer(indexBuffer, "uint32");
    pass.drawIndexed(indexCount);
  }

  function drawCave(pass: GPURenderPassEncoder, rect: Rect): void {
    setViewport(pass, rect);
    pass.setPipeline(cavePipeline);
    pass.setBindGroup(0, sourceTexture.getBindGroup());
    pass.setVertexBuffer(0, caveVertexBuffer);
    pass.setIndexBuffer(caveIndexBuffer, "uint32");
    pass.drawIndexed(caveIndexCount);
  }

  function drawRoom(pass: GPURenderPassEncoder, rect: Rect): void {
    setViewport(pass, rect);
    pass.setPipeline(roomPipeline);
    pass.setBindGroup(0, roomBindGroup);
    pass.setVertexBuffer(0, floorVertexBuffer);
    pass.setIndexBuffer(floorIndexBuffer, "uint32");
    pass.drawIndexed(floorIndexCount);
  }

  function drawFlat(pass: GPURenderPassEncoder, rect: Rect): void {
    setViewport(pass, rect);
    pass.setPipeline(flatPipeline);
    pass.setBindGroup(0, sourceTexture.getBindGroup());
    pass.draw(6);
  }

  function setViewport(pass: GPURenderPassEncoder, rect: Rect): void {
    const x = Math.max(0, Math.floor(rect.x));
    const y = Math.max(0, Math.floor(rect.y));
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    pass.setViewport(x, y, width, height, 0, 1);
    pass.setScissorRect(x, y, width, height);
  }

  function writeUniforms(viewport: Rect, cutaway: boolean): void {
    const aspect = viewport.width / viewport.height;
    const projection = perspectiveLH((Number(controls.fov.value) * Math.PI) / 180, aspect, 0.01, 20);
    const view = viewCamera.currentDomeViewMatrix();
    const mvp = multiplyMat4(projection, view);

    const { width: sourceWidth, height: sourceHeight } = effectiveSourceSize();
    const profile = sourceProjectionProfileForMode(sourceProjectionMode(), sourceWidth, sourceHeight, controls.radiusScale.value);

    const data = new Float32Array(44);
    data.set(mvp, 0);
    data[16] = profile.fisheyeScaleX;
    data[17] = profile.fisheyeScaleY;
    data[18] = (Number(controls.rotation.value) * Math.PI) / 180;
    data[19] = Number(controls.exposure.value);
    data[20] = Number(controls.overlayOpacity.value);
    data[21] = controls.mirror.checked ? 1 : 0;
    data[22] = (Number(controls.domeTilt.value) * Math.PI) / 180;
    data[23] = cutaway ? 1 : 0;
    data[24] = controls.showRings.checked ? 1 : 0;
    data[25] = controls.showSpokes.checked ? 1 : 0;
    data[26] = controls.showHorizon.checked ? 1 : 0;
    data[27] = controls.showZenith.checked ? 1 : 0;
    data[28] = controls.showSourceCircle.checked ? 1 : 0;
    data[29] = Number(controls.shellShade.value);
    data.set(profile.centerAxis, 32);
    data[35] = sourceProjectionShaderTheta(sourceProjectionMode(), profile.fieldOfViewDegrees);
    data.set(profile.imageRightAxis, 36);
    data.set(profile.imageUpAxis, 40);
    device.queue.writeBuffer(uniformBuffer, 0, data);
  }

  function sourceProjectionMode() {
    return normalizeSourceProjectionMode(controls.sourceProjection.value);
  }

  function isNadirSourceProjection(): boolean {
    return sourceProjectionMode().startsWith("nadir");
  }

  function writeRoomUniforms(viewport: Rect): void {
    const aspect = viewport.width / viewport.height;
    const projection = perspectiveLH((Number(controls.fov.value) * Math.PI) / 180, aspect, 0.01, 20);
    const view = viewCamera.theaterViewMatrix();
    const floorY = -Number(controls.theaterEyeDrop.value) - 0.18;
    const model = translationScaleMat4(0, floorY, 0, 1.18, 1, 1.18);
    const mvp = multiplyMat4(projection, multiplyMat4(view, model));
    const data = new Float32Array(20);
    data.set(mvp, 0);
    data[16] = Number(controls.floorOpacity.value);
    data[17] = Number(controls.overlayOpacity.value);
    data[18] = 1.18;
    device.queue.writeBuffer(roomUniformBuffer, 0, data);
  }

  function getRenderLayout(width: number, height: number): RenderLayout {
    return buildRenderLayout(width, height, renderLayoutOptions());
  }

  function drawHud(): void {
    const dpr = renderSize.dpr;
    const width = renderSize.width / dpr;
    const height = renderSize.height / dpr;
    const layout = getCssLayout(width, height);
    actions.drawHud(hudContext, actions.buildHudOptions(width, height, dpr, layout));
  }

  function getCssLayout(width: number, height: number): CssLayout {
    return buildCssLayout(width, height, renderLayoutOptions());
  }

  function renderLayoutOptions(): RenderLayoutOptions {
    const { width: sourceWidth, height: sourceHeight } = effectiveSourceSize();
    return {
      viewMode: state.viewMode as ViewMode,
      sourceWidth,
      sourceHeight,
      panelHidden: state.panelHidden,
      canvasClientWidth: canvas.clientWidth,
      dpr: renderSize.dpr,
    };
  }

  function effectiveSourceSize(): { width: number; height: number } {
    if (state.depthPreviewActive && state.depthPreviewWidth > 0 && state.depthPreviewHeight > 0) {
      return {
        width: state.depthPreviewWidth,
        height: state.depthPreviewHeight,
      };
    }
    return {
      width: Math.max(1, state.sourceWidth),
      height: Math.max(1, state.sourceHeight),
    };
  }

  function bindExternalSourceTexture(texture: GPUTexture): void {
    sourceTexture.bind(texture);
  }

  function restoreOwnedSourceTexture(): void {
    sourceTexture.bind();
  }

  async function captureFrame(downloadBlob: (blob: Blob, filename: string) => void): Promise<void> {
    const output = await captureCompositeCanvas();
    output.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(blob, `fulldome-view-${Date.now()}.png`);
    }, "image/png");
  }

  async function captureCompositeCanvas(options: CaptureOptions = {}): Promise<HTMLCanvasElement> {
    const output = await renderCaptureCanvas(options);
    drawHudToCapture(output, options);
    return output;
  }

  async function drawCompositeToCanvas(output: HTMLCanvasElement, options: CaptureOptions = {}): Promise<void> {
    const rendered = await renderCaptureCanvas(options);
    const ctx = output.getContext("2d");
    ctx.clearRect(0, 0, output.width, output.height);
    ctx.drawImage(rendered, 0, 0, output.width, output.height);
    drawHudToCapture(output, options);
  }

  async function renderCaptureCanvas(options: CaptureOptions = {}): Promise<HTMLCanvasElement> {
    const sourceWidth = Math.max(1, Math.round(options.width || renderSize.width));
    const sourceHeight = Math.max(1, Math.round(options.height || renderSize.height));
    const texture = device.createTexture({
      size: { width: sourceWidth, height: sourceHeight },
      format: presentationFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const captureDepth = device.createTexture({
      size: { width: sourceWidth, height: sourceHeight },
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    renderToView({
      width: sourceWidth,
      height: sourceHeight,
      colorView: texture.createView(),
      depthView: captureDepth.createView(),
      depthStoreOp: "discard",
      submit: true,
    });
    const rendered = await readTextureToCanvas(texture, sourceWidth, sourceHeight, { format: presentationFormat });
    texture.destroy();
    captureDepth.destroy();

    if (options.square) {
      const size = Math.min(rendered.width, rendered.height);
      const sx = Math.max(0, Math.round((rendered.width - size) / 2));
      const sy = Math.max(0, Math.round((rendered.height - size) / 2));
      const output = document.createElement("canvas");
      output.width = size;
      output.height = size;
      output.getContext("2d").drawImage(rendered, sx, sy, size, size, 0, 0, size, size);
      return output;
    }
    return rendered;
  }

  function drawHudToCapture(output: HTMLCanvasElement, options: CaptureOptions = {}): void {
    const ctx = output.getContext("2d");
    if (options.square) {
      const size = Math.min(hud.width, hud.height);
      const sx = Math.max(0, Math.round((hud.width - size) / 2));
      const sy = Math.max(0, Math.round((hud.height - size) / 2));
      ctx.drawImage(hud, sx, sy, size, size, 0, 0, output.width, output.height);
      return;
    }
    ctx.drawImage(hud, 0, 0, output.width, output.height);
  }

  return {
    initialize,
    resize,
    startFrameLoop,
    createDomeGeometry,
    createMediaTexture,
    uploadMediaSource,
    renderPlateComposite,
    readTextureToCanvas,
    bindExternalSourceTexture,
    restoreOwnedSourceTexture,
    resetVideoUploadState,
    getDevice: () => device,
    getCssLayout,
    captureCompositeCanvas,
    drawCompositeToCanvas,
    captureFrame,
  };
}
