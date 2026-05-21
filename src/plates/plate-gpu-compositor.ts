import { preparePlatePlacement } from "./plate-placement.js";
import type { PlatePlacementInput } from "./plate-placement.js";

const OUTPUT_FORMAT = "rgba8unorm";
const UNIFORM_FLOATS = 32;
const UNIFORM_BYTES = UNIFORM_FLOATS * 4;
type PlateImage = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width: number;
  height: number;
  aspect?: number;
};
type PlateTextureCache = {
  texture: GPUTexture;
  width: number;
  height: number;
};
type PlateGpuCompositorOptions = {
  device: GPUDevice;
  sampler: GPUSampler;
};
export type PlateRenderOptions = {
  plates: PlateImage[];
  plateCount: number;
  plateFit: string;
  plateFeather: number | string;
  platePlacements: PlatePlacementInput[];
  size: number;
};
type PlacementUniformOptions = {
  placement: PlatePlacementInput;
  plate: PlateImage;
  plateFit: string;
  plateFeather: number | string;
  outputSize: number;
};

export const plateCompositeShader = /* wgsl */ `
struct PlateUniforms {
  center: vec4<f32>,
  right: vec4<f32>,
  down: vec4<f32>,
  scale: vec4<f32>,
  options: vec4<f32>,
  flags: vec4<f32>,
  warpX: vec4<f32>,
  warpY: vec4<f32>,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@group(0) @binding(0) var<uniform> plate: PlateUniforms;
@group(0) @binding(1) var plateSampler: sampler;
@group(0) @binding(2) var plateTexture: texture_2d<f32>;

const HALF_PI: f32 = 1.5707963267948966;

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

fn mapDirectionToLocal(direction: vec3<f32>) -> vec2<f32> {
  let cosine = clamp(dot(direction, plate.center.xyz), -1.0, 1.0);
  let angle = acos(cosine);
  var map = vec2<f32>(0.0);
  if (angle > 0.000001) {
    let tangentScale = angle / max(sin(angle), 0.000001);
    map = vec2<f32>(
      dot(direction, plate.right.xyz) * tangentScale,
      dot(direction, plate.down.xyz) * tangentScale
    );
  }
  return vec2<f32>(
    map.x * plate.scale.w + map.y * plate.scale.z,
    -map.x * plate.scale.z + map.y * plate.scale.w
  );
}

fn mapPlateUv(rawUv: vec2<f32>) -> vec2<f32> {
  let imageAspect = max(plate.options.z, 0.000001);
  let domainAspect = max(plate.scale.x / max(plate.scale.y, 0.000001), 0.000001);
  let fitMode = plate.options.w;
  var uv = rawUv;

  if (fitMode < 0.5) {
    if (imageAspect > domainAspect) {
      let fittedHeight = domainAspect / imageAspect;
      uv.y = (rawUv.y - (1.0 - fittedHeight) * 0.5) / max(fittedHeight, 0.000001);
    } else {
      let fittedWidth = imageAspect / domainAspect;
      uv.x = (rawUv.x - (1.0 - fittedWidth) * 0.5) / max(fittedWidth, 0.000001);
    }
  } else if (fitMode < 1.5) {
    if (imageAspect > domainAspect) {
      let cropWidth = domainAspect / imageAspect;
      uv.x = rawUv.x * cropWidth + (1.0 - cropWidth) * 0.5;
    } else {
      let cropHeight = imageAspect / domainAspect;
      uv.y = rawUv.y * cropHeight + (1.0 - cropHeight) * 0.5;
    }
    uv = clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0));
  }

  if (plate.flags.x > 0.5) {
    uv.x = 1.0 - uv.x;
  }
  if (plate.flags.y > 0.5) {
    uv.y = 1.0 - uv.y;
  }
  return uv;
}

fn warpedUvToLocal(rawUv: vec2<f32>) -> vec2<f32> {
  let halfSize = plate.scale.xy * 0.5;
  let nw = vec2<f32>(-halfSize.x, -halfSize.y) + vec2<f32>(plate.warpX.x * plate.scale.x, plate.warpY.x * plate.scale.y);
  let ne = vec2<f32>(halfSize.x, -halfSize.y) + vec2<f32>(plate.warpX.y * plate.scale.x, plate.warpY.y * plate.scale.y);
  let se = vec2<f32>(halfSize.x, halfSize.y) + vec2<f32>(plate.warpX.z * plate.scale.x, plate.warpY.z * plate.scale.y);
  let sw = vec2<f32>(-halfSize.x, halfSize.y) + vec2<f32>(plate.warpX.w * plate.scale.x, plate.warpY.w * plate.scale.y);
  return mix(mix(nw, ne, rawUv.x), mix(sw, se, rawUv.x), rawUv.y);
}

fn warpedLocalToUv(local: vec2<f32>) -> vec2<f32> {
  var rawUv = local / max(plate.scale.xy, vec2<f32>(0.000001)) + vec2<f32>(0.5);
  for (var i = 0; i < 8; i = i + 1) {
    let halfSize = plate.scale.xy * 0.5;
    let nw = vec2<f32>(-halfSize.x, -halfSize.y) + vec2<f32>(plate.warpX.x * plate.scale.x, plate.warpY.x * plate.scale.y);
    let ne = vec2<f32>(halfSize.x, -halfSize.y) + vec2<f32>(plate.warpX.y * plate.scale.x, plate.warpY.y * plate.scale.y);
    let se = vec2<f32>(halfSize.x, halfSize.y) + vec2<f32>(plate.warpX.z * plate.scale.x, plate.warpY.z * plate.scale.y);
    let sw = vec2<f32>(-halfSize.x, halfSize.y) + vec2<f32>(plate.warpX.w * plate.scale.x, plate.warpY.w * plate.scale.y);
    let top = mix(nw, ne, rawUv.x);
    let bottom = mix(sw, se, rawUv.x);
    let point = mix(top, bottom, rawUv.y);
    let du = mix(ne - nw, se - sw, rawUv.y);
    let dv = mix(sw - nw, se - ne, rawUv.x);
    let error = point - local;
    let determinant = du.x * dv.y - du.y * dv.x;
    if (abs(determinant) < 0.0000001) {
      break;
    }
    let step = vec2<f32>(
      (error.x * dv.y - error.y * dv.x) / determinant,
      (-error.x * du.y + error.y * du.x) / determinant
    );
    rawUv = rawUv - step;
  }
  return rawUv;
}

fn plateEdgeFade(rawUv: vec2<f32>) -> f32 {
  let feather = plate.options.y;
  if (feather <= 0.0) {
    return 1.0;
  }
  let edge = min(min(rawUv.x, 1.0 - rawUv.x), min(rawUv.y, 1.0 - rawUv.y));
  return clamp(edge / feather, 0.0, 1.0);
}

fn warpResidualLimit() -> f32 {
  return max(max(plate.scale.x, plate.scale.y) * 0.003, 0.0005);
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4<f32> {
  let domeRadiusUv = max(plate.flags.z, 0.000001);
  let domePoint = (in.uv - vec2<f32>(0.5)) / domeRadiusUv;
  let radius = length(domePoint);
  if (radius > 1.0) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }

  let theta = clamp(radius, 0.0, 1.0) * HALF_PI;
  let azimuth = atan2(domePoint.x, -domePoint.y);
  let sinTheta = sin(theta);
  let direction = vec3<f32>(sinTheta * sin(azimuth), cos(theta), sinTheta * cos(azimuth));
  let local = mapDirectionToLocal(direction);
  let rawUv = warpedLocalToUv(local);
  if (rawUv.x != rawUv.x || rawUv.y != rawUv.y) {
    discard;
  }
  if (rawUv.x < 0.0 || rawUv.x > 1.0 || rawUv.y < 0.0 || rawUv.y > 1.0) {
    discard;
  }
  if (distance(warpedUvToLocal(rawUv), local) > warpResidualLimit()) {
    discard;
  }

  let uv = mapPlateUv(rawUv);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    discard;
  }

  let color = textureSampleLevel(plateTexture, plateSampler, uv, 0.0);
  let alpha = clamp(color.a * plate.options.x * plateEdgeFade(rawUv), 0.0, 1.0);
  if (alpha <= 0.0) {
    discard;
  }
  return vec4<f32>(color.rgb, alpha);
}
`;

export class PlateGpuCompositor {
  private device: GPUDevice;
  private sampler: GPUSampler;
  private outputTexture: GPUTexture | null = null;
  private outputSize = 0;
  private plateTextures = new WeakMap<PlateImage, PlateTextureCache>();
  private uniformBuffers: GPUBuffer[] = [];
  private bindGroupLayout: GPUBindGroupLayout;
  private pipeline: GPURenderPipeline;

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
            format: OUTPUT_FORMAT,
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
  }

  render({ plates, plateCount, plateFit, plateFeather, platePlacements, size }: PlateRenderOptions): GPUTexture {
    const outputSize = Math.max(1, Math.round(size || 2048));
    this.ensureOutputTexture(outputSize);

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
      format: OUTPUT_FORMAT,
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
      format: OUTPUT_FORMAT,
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
      size: UNIFORM_BYTES,
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
}

function placementUniformData({
  placement,
  plate,
  plateFit,
  plateFeather,
  outputSize,
}: PlacementUniformOptions): Float32Array {
  const prepared = preparePlatePlacement(placement, plate);
  const data = new Float32Array(UNIFORM_FLOATS);
  data.set(prepared.center, 0);
  data.set(prepared.right, 4);
  data.set(prepared.down, 8);
  data[12] = prepared.angularWidth;
  data[13] = prepared.angularHeight;
  data[14] = prepared.spinSin;
  data[15] = prepared.spinCos;
  data[16] = Number(prepared.opacity) || 0;
  data[17] = Number(plateFeather) || 0;
  data[18] = Number(plate.aspect) || 1;
  data[19] = plateFitMode(plateFit);
  data[20] = prepared.flipX ? 1 : 0;
  data[21] = prepared.flipY ? 1 : 0;
  data[22] = Math.max(0.001, (outputSize * 0.5 - 2) / outputSize);
  data[24] = prepared.cornerOffsets.nw.x;
  data[25] = prepared.cornerOffsets.ne.x;
  data[26] = prepared.cornerOffsets.se.x;
  data[27] = prepared.cornerOffsets.sw.x;
  data[28] = prepared.cornerOffsets.nw.y;
  data[29] = prepared.cornerOffsets.ne.y;
  data[30] = prepared.cornerOffsets.se.y;
  data[31] = prepared.cornerOffsets.sw.y;
  return data;
}

function plateFitMode(value: string): number {
  if (value === "cover") return 1;
  if (value === "stretch") return 2;
  return 0;
}
