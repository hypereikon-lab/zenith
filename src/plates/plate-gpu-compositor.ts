import { DOME_HANDOFF_GUIDE } from "../geometry/dome-handoff-guide.js";
import {
  PLATE_OUTPUT_FORMAT,
  PLATE_UNIFORM_BYTES,
  type PlateGpuCompositorOptions,
  type PlateImage,
  type PlateRenderOptions,
  type PlateTextureCache,
} from "./plate-gpu-compositor-types.js";
import { plateCompositeShader, plateGuideShader } from "./plate-gpu-compositor-shaders.js";
import { guideUniformData, placementUniformData } from "./plate-gpu-compositor-uniforms.js";

export { plateCompositeShader, plateGuideShader } from "./plate-gpu-compositor-shaders.js";
export type { PlateRenderOptions } from "./plate-gpu-compositor-types.js";

export class PlateGpuCompositor {
  private device: GPUDevice;
  private sampler: GPUSampler;
  private outputTexture: GPUTexture | null = null;
  private outputSize = 0;
  private plateTextures = new WeakMap<PlateImage, PlateTextureCache>();
  private uniformBuffers: GPUBuffer[] = [];
  private guideUniformBuffer: GPUBuffer;
  private bindGroupLayout: GPUBindGroupLayout;
  private pipeline: GPURenderPipeline;
  private guideBindGroupLayout: GPUBindGroupLayout;
  private guidePipeline: GPURenderPipeline;

  constructor({ device, sampler }: PlateGpuCompositorOptions) {
    this.device = device;
    this.sampler = sampler;

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
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

    const module = device.createShaderModule({ code: plateCompositeShader });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      vertex: {
        module,
        entryPoint: "vertexMain",
      },
      fragment: {
        module,
        entryPoint: "fragmentMain",
        targets: [
          {
            format: PLATE_OUTPUT_FORMAT,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
      },
    });

    this.guideBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });
    this.guideUniformBuffer = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const guideModule = device.createShaderModule({ code: plateGuideShader });
    this.guidePipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.guideBindGroupLayout] }),
      vertex: {
        module: guideModule,
        entryPoint: "vertexMain",
      },
      fragment: {
        module: guideModule,
        entryPoint: "fragmentMain",
        targets: [{ format: PLATE_OUTPUT_FORMAT }],
      },
      primitive: {
        topology: "triangle-list",
      },
    });
  }

  render({
    plates,
    plateCount,
    plateFit,
    plateFeather,
    platePlacements,
    size,
    sourceProjectionMode = "zenith-180",
    guideMode = "transparent",
    domeGuideSemanticSplit = DOME_HANDOFF_GUIDE.defaultSemanticSplit,
    domeGuideHorizonSplit,
  }: PlateRenderOptions): GPUTexture {
    const outputSize = Math.max(1, Math.round(size || 2048));
    this.ensureOutputTexture(outputSize);
    if (guideMode === "inpaint-handoff") {
      this.device.queue.writeBuffer(
        this.guideUniformBuffer,
        0,
        guideUniformData(outputSize, sourceProjectionMode, domeGuideSemanticSplit, domeGuideHorizonSplit),
      );
    }

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.outputTexture!.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    if (guideMode === "inpaint-handoff") {
      pass.setPipeline(this.guidePipeline);
      pass.setBindGroup(0, this.guideBindGroup());
      pass.draw(6);
    }
    pass.setPipeline(this.pipeline);
    pass.setViewport(0, 0, outputSize, outputSize, 0, 1);
    pass.setScissorRect(0, 0, outputSize, outputSize);

    const count = Math.min(plateCount, plates.length, platePlacements.length);
    for (let index = 0; index < count; index += 1) {
      const plate = plates[index];
      const placement = platePlacements[index];
      if (!plate || !placement || !plate.canvas) continue;
      const texture = this.textureForPlate(plate);
      const buffer = this.uniformBufferForIndex(index);
      this.device.queue.writeBuffer(
        buffer,
        0,
        placementUniformData({
          placement,
          plate,
          plateFit,
          plateFeather,
          outputSize,
          sourceProjectionMode,
          domeGuideSemanticSplit,
          domeGuideHorizonSplit,
        }),
      );
      pass.setBindGroup(0, this.bindGroupFor(texture, buffer));
      pass.draw(6);
    }

    pass.end();
    this.device.queue.submit([encoder.finish()]);
    return this.outputTexture!;
  }

  ensureOutputTexture(size: number): void {
    if (this.outputTexture && this.outputSize === size) return;
    if (this.outputTexture) this.outputTexture.destroy();
    if (size > this.device.limits.maxTextureDimension2D) {
      throw new Error(
        `Plate sketch is ${size} x ${size}; this GPU accepts up to ${this.device.limits.maxTextureDimension2D}.`,
      );
    }
    this.outputTexture = this.device.createTexture({
      size: { width: size, height: size },
      format: PLATE_OUTPUT_FORMAT,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST,
    });
    this.outputSize = size;
  }

  textureForPlate(plate: PlateImage): GPUTexture {
    const cached = this.plateTextures.get(plate);
    if (cached && cached.width === plate.width && cached.height === plate.height) {
      return cached.texture;
    }
    if (cached) cached.texture.destroy();
    const texture = this.device.createTexture({
      size: { width: plate.width, height: plate.height },
      format: PLATE_OUTPUT_FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.device.queue.copyExternalImageToTexture({ source: plate.canvas }, { texture }, [plate.width, plate.height]);
    this.plateTextures.set(plate, {
      texture,
      width: plate.width,
      height: plate.height,
    });
    return texture;
  }

  uniformBufferForIndex(index: number): GPUBuffer {
    if (this.uniformBuffers[index]) return this.uniformBuffers[index];
    const buffer = this.device.createBuffer({
      size: PLATE_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.uniformBuffers[index] = buffer;
    return buffer;
  }

  bindGroupFor(texture: GPUTexture, uniformBuffer: GPUBuffer): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: texture.createView() },
      ],
    });
  }

  guideBindGroup(): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.guideBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.guideUniformBuffer } }],
    });
  }
}
