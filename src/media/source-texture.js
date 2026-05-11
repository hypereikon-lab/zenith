import { externalImageTextureUsage } from "../graphics/texture-usage.js";

export class SourceTextureController {
  constructor({ device, sampler, bindGroupLayout, uniformBuffer }) {
    this.device = device;
    this.sampler = sampler;
    this.bindGroupLayout = bindGroupLayout;
    this.uniformBuffer = uniformBuffer;
    this.texture = null;
    this.bindGroup = null;
  }

  create(width, height) {
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

  upload(source, width, height) {
    const texture = this.create(width, height);
    this.copyExternal(source, width, height);
    return texture;
  }

  copyExternal(source, width, height) {
    if (!this.texture) {
      throw new Error("Create a source texture before uploading media.");
    }
    this.device.queue.copyExternalImageToTexture({ source }, { texture: this.texture }, [width, height]);
  }

  bind(texture = this.texture) {
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

  ensureTextureFits(width, height) {
    const limit = this.device.limits.maxTextureDimension2D;
    if (width > limit || height > limit) {
      throw new Error(`Media is ${width} x ${height}; this GPU accepts up to ${limit} px per side.`);
    }
  }
}
