import { externalImageTextureUsage } from "../graphics/texture-usage.js";

type SourceTextureControllerOptions = {
  device: GPUDevice;
  sampler: GPUSampler;
  bindGroupLayout: GPUBindGroupLayout;
  uniformBuffer: GPUBuffer;
};

export class SourceTextureController {
  private device: GPUDevice;
  private sampler: GPUSampler;
  private bindGroupLayout: GPUBindGroupLayout;
  private uniformBuffer: GPUBuffer;
  private texture: GPUTexture | null = null;
  private bindGroup: GPUBindGroup | null = null;

  constructor({ device, sampler, bindGroupLayout, uniformBuffer }: SourceTextureControllerOptions) {
    this.device = device;
    this.sampler = sampler;
    this.bindGroupLayout = bindGroupLayout;
    this.uniformBuffer = uniformBuffer;
  }

  create(width: number, height: number): GPUTexture {
    this.ensureTextureFits(width, height);
    if (this.texture) {
      this.texture.destroy();
    }
    this.texture = this.device.createTexture({
      size: { width, height },
      format: "rgba8unorm",
      usage: externalImageTextureUsage(),
    });
    this.bind();
    return this.texture;
  }

  upload(source: ImageBitmap | HTMLCanvasElement | HTMLVideoElement, width: number, height: number): GPUTexture {
    const texture = this.create(width, height);
    this.copyExternal(source, width, height);
    return texture;
  }

  copyExternal(source: ImageBitmap | HTMLCanvasElement | HTMLVideoElement, width: number, height: number): void {
    if (!this.texture) {
      throw new Error("Create a source texture before uploading media.");
    }
    this.device.queue.copyExternalImageToTexture({ source }, { texture: this.texture }, [width, height]);
  }

  bind(texture = this.texture): GPUBindGroup | null {
    if (!texture) return null;
    this.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: texture.createView() },
      ],
    });
    return this.bindGroup;
  }

  getBindGroup(): GPUBindGroup | null {
    return this.bindGroup;
  }

  ensureTextureFits(width: number, height: number): void {
    const limit = this.device.limits.maxTextureDimension2D;
    if (width > limit || height > limit) {
      throw new Error(`Media is ${width} x ${height}; this GPU accepts up to ${limit} px per side.`);
    }
  }
}
