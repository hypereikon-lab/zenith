import { preparePlatePlacement } from "./plate-placement.js";
import {
  CAVE_HANDOFF_GUIDE,
  caveGuideLineWidthForSize,
} from "../geometry/cave-handoff-guide.js";
import { DOME_HANDOFF_GUIDE, normalizeDomeGuideSemanticSplit } from "../geometry/dome-handoff-guide.js";
import {
  sourceProjectionHorizonRadius,
  sourceProjectionProfileForMode,
  sourceProjectionShaderTheta,
} from "../geometry/source-projection.js";
import { sourceGuideCarrierHorizonRadius } from "../geometry/source-guide-semantics.js";
import type { PlatePlacementInput } from "./plate-placement.js";
import type { SourceProjectionMode } from "../geometry/source-projection.js";

const OUTPUT_FORMAT = "rgba8unorm";
const UNIFORM_FLOATS = 44;
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
  sourceProjectionMode?: SourceProjectionMode;
  guideMode?: "transparent" | "inpaint-handoff";
  domeGuideSemanticSplit?: number | string | null;
  domeGuideHorizonSplit?: number | string | null;
};
type PlacementUniformOptions = {
  placement: PlatePlacementInput;
  plate: PlateImage;
  plateFit: string;
  plateFeather: number | string;
  outputSize: number;
  sourceProjectionMode: SourceProjectionMode;
  domeGuideSemanticSplit?: number | string | null;
  domeGuideHorizonSplit?: number | string | null;
};

function wgslFloat(value: number): string {
  return value.toFixed(10).replace(/0+$/, "").replace(/\.$/, ".0");
}

function wgslVec3Rgb(rgb: readonly [number, number, number]): string {
  return `vec3<f32>(${rgb.map((channel) => wgslFloat(channel / 255)).join(", ")})`;
}

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
  sourceCenterTheta: vec4<f32>,
  sourceRight: vec4<f32>,
  sourceUp: vec4<f32>,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@group(0) @binding(0) var<uniform> plate: PlateUniforms;
@group(0) @binding(1) var plateSampler: sampler;
@group(0) @binding(2) var plateTexture: texture_2d<f32>;

const PI: f32 = 3.141592653589793;
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

fn caveWallPointFromPerimeterFraction(fraction: f32) -> vec2<f32> {
  let distance = fract(fraction) * 16.0;
  if (distance <= 4.0) {
    return vec2<f32>(distance - 2.0, 2.0);
  }
  if (distance <= 8.0) {
    return vec2<f32>(2.0, 2.0 - (distance - 4.0));
  }
  if (distance <= 12.0) {
    return vec2<f32>(2.0 - (distance - 8.0), -2.0);
  }
  return vec2<f32>(-2.0, -2.0 + (distance - 12.0));
}

fn rectangleBoundaryFractionFromUv(uv: vec2<f32>) -> f32 {
  let local = (uv - vec2<f32>(0.5)) * vec2<f32>(2.0, -2.0);
  let rho = max(abs(local.x), abs(local.y));
  if (rho <= 0.000001) {
    return 0.125;
  }
  let boundary = local / rho;
  var distance = 0.0;
  if (abs(boundary.y - 1.0) <= 0.0001) {
    distance = boundary.x + 1.0;
  } else if (abs(boundary.x - 1.0) <= 0.0001) {
    distance = 2.0 + (1.0 - boundary.y);
  } else if (abs(boundary.y + 1.0) <= 0.0001) {
    distance = 4.0 + (1.0 - boundary.x);
  } else {
    distance = 6.0 + (boundary.y + 1.0);
  }
  return fract(distance / 8.0);
}

fn caveContinuityDirectionFromSurfacePoint(point: vec3<f32>) -> vec3<f32> {
  let bottom = -2.0;
  if (abs(point.y - bottom) <= 0.0001) {
    let distance = length(point.xz);
    if (distance <= 0.000001) {
      return vec3<f32>(0.0, -1.0, 0.0);
    }
    let halfSize = vec2<f32>(2.0, 2.0);
    let scaleX = select(999999.0, halfSize.x / abs(point.x), abs(point.x) > 0.000001);
    let scaleZ = select(999999.0, halfSize.y / abs(point.z), abs(point.z) > 0.000001);
    let boundary = point.xz * min(scaleX, scaleZ);
    let perimeterFraction = rectangleBoundaryFractionFromUv(vec2<f32>(
      0.5 + select(0.0, boundary.x / max(abs(boundary.x), abs(boundary.y)) * 0.5, distance > 0.000001),
      0.5 - select(0.0, boundary.y / max(abs(boundary.x), abs(boundary.y)) * 0.5, distance > 0.000001)
    ));
    let angle = (perimeterFraction - 0.125) * 2.0 * PI;
    let boundaryDistance = max(length(boundary), 0.000001);
    let boundaryElevation = atan2(-2.0, boundaryDistance);
    let radiusFraction = clamp(distance / boundaryDistance, 0.0, 1.0);
    let elevation = -HALF_PI + radiusFraction * (boundaryElevation + HALF_PI);
    let cosElevation = cos(elevation);
    return normalize(vec3<f32>(sin(angle) * cosElevation, sin(elevation), cos(angle) * cosElevation));
  }
  let perimeterFraction = rectangleBoundaryFractionFromUv(vec2<f32>(0.5 + point.x / 4.0, 0.5 - point.z / 4.0));
  let angle = (perimeterFraction - 0.125) * 2.0 * PI;
  let horizontalDistance = max(length(point.xz), 0.000001);
  let elevation = atan2(point.y, horizontalDistance);
  let cosElevation = cos(elevation);
  return normalize(vec3<f32>(sin(angle) * cosElevation, sin(elevation), cos(angle) * cosElevation));
}

fn caveCarrierSourceDirectionFromUv(uv: vec2<f32>) -> vec3<f32> {
  let local = (uv - vec2<f32>(0.5)) * vec2<f32>(2.0, -2.0);
  let rho = max(abs(local.x), abs(local.y));
  if (rho <= 0.000001) {
    return vec3<f32>(0.0, -1.0, 0.0);
  }
  let perimeterFraction = rectangleBoundaryFractionFromUv(uv);
  let wallBase = caveWallPointFromPerimeterFraction(perimeterFraction);
  let floorBand = abs(plate.sourceCenterTheta.w);
  let horizonBand = clamp(plate.sourceRight.w, floorBand + 0.0001, 0.9999);
  if (rho <= floorBand + 0.000001) {
    let floorT = clamp(rho / max(floorBand, 0.000001), 0.0, 1.0);
    return caveContinuityDirectionFromSurfacePoint(vec3<f32>(wallBase.x * floorT, -2.0, wallBase.y * floorT));
  }
  let wallT = select(
    clamp((rho - floorBand) / max(horizonBand - floorBand, 0.000001), 0.0, 1.0) * 0.5,
    0.5 + clamp((rho - horizonBand) / max(1.0 - horizonBand, 0.000001), 0.0, 1.0) * 0.5,
    rho > horizonBand
  );
  return caveContinuityDirectionFromSurfacePoint(vec3<f32>(wallBase.x, -2.0 + 4.0 * wallT, wallBase.y));
}

fn sourceDirectionFromUv(uv: vec2<f32>) -> vec3<f32> {
  if (plate.sourceCenterTheta.w < 0.0) {
    return caveCarrierSourceDirectionFromUv(uv);
  }

  let domeRadiusUv = max(plate.flags.z, 0.000001);
  let domePoint = (uv - vec2<f32>(0.5)) / domeRadiusUv;
  let radius = length(domePoint);
  let thetaMax = max(plate.sourceCenterTheta.w, 0.0001);
  let split = clamp(plate.flags.w, 0.18, 0.72);
  let horizon = clamp(HALF_PI / thetaMax, 0.0001, 1.0);
  let semanticPhysical = clamp(horizon * 0.5, 0.0001, max(horizon - 0.0001, 0.0001));
  let carrierHorizon = select(1.0, clamp(plate.sourceRight.w, split + 0.0001, 0.9999), horizon < 0.999);
  var physicalRadius = clamp(radius, 0.0, 1.0);
  if (physicalRadius <= split) {
    physicalRadius = (physicalRadius / max(split, 0.0001)) * semanticPhysical;
  } else if (physicalRadius <= carrierHorizon) {
    physicalRadius = semanticPhysical +
      ((physicalRadius - split) / max(carrierHorizon - split, 0.0001)) * (horizon - semanticPhysical);
  } else {
    physicalRadius = horizon +
      ((physicalRadius - carrierHorizon) / max(1.0 - carrierHorizon, 0.0001)) * (1.0 - horizon);
  }
  let theta = physicalRadius * thetaMax;
  var tangent = vec3<f32>(0.0);
  if (radius > 0.000001) {
    let local = domePoint / radius;
    tangent = normalize(plate.sourceRight.xyz * local.x + plate.sourceUp.xyz * -local.y);
  }
  return normalize(plate.sourceCenterTheta.xyz * cos(theta) + tangent * sin(theta));
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
  if (plate.sourceCenterTheta.w >= 0.0 && radius > 1.0) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }

  let direction = sourceDirectionFromUv(in.uv);
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

export const plateGuideShader = /* wgsl */ `
struct GuideUniforms {
  values: vec4<f32>,
  semantics: vec4<f32>,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@group(0) @binding(0) var<uniform> guide: GuideUniforms;

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
  let domeRadiusUv = max(guide.values.x, 0.000001);
  let horizonRadius = abs(guide.values.w);
  if (guide.values.x < 0.0) {
    let local = (in.uv - vec2<f32>(0.5)) * vec2<f32>(2.0, -2.0);
    let rho = max(abs(local.x), abs(local.y));
    let floorBand = guide.values.w;
    let horizonBand = clamp(guide.semantics.y, floorBand + 0.0001, 0.9999);
    let wallColor = select(
      ${wgslVec3Rgb(CAVE_HANDOFF_GUIDE.colors.lowerWall)},
      ${wgslVec3Rgb(CAVE_HANDOFF_GUIDE.colors.upperWall)},
      rho > horizonBand
    );
    var guideBackground = wallColor;
    if (rho <= floorBand) {
      guideBackground = ${wgslVec3Rgb(CAVE_HANDOFF_GUIDE.colors.floor)};
    }
    return vec4<f32>(guideBackground, 1.0);
  }

  let local = (in.uv - vec2<f32>(0.5)) / domeRadiusUv;
  let radius = length(local);
  if (radius > 1.0) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }

  let skyGuideColor = ${wgslVec3Rgb(DOME_HANDOFF_GUIDE.colors.sky)};
  let horizonGuideColor = ${wgslVec3Rgb(DOME_HANDOFF_GUIDE.colors.horizon)};
  let floorGuideColor = ${wgslVec3Rgb(DOME_HANDOFF_GUIDE.colors.floor)};
  let isNadir = guide.values.w < 0.0;
  let semanticSplit = clamp(guide.semantics.x, 0.18, 0.72);
  let carrierHorizon = clamp(guide.semantics.y, semanticSplit + 0.0001, 0.9999);
  let semanticTransition = ${wgslFloat(DOME_HANDOFF_GUIDE.semanticTransitionWidth)};
  let horizonAmount = smoothstep(semanticSplit - semanticTransition, semanticSplit + semanticTransition, radius);
  let belowHorizonAmount = smoothstep(carrierHorizon - semanticTransition, carrierHorizon + semanticTransition, radius);
  var guideBackground = mix(mix(skyGuideColor, horizonGuideColor, horizonAmount), floorGuideColor, belowHorizonAmount);
  if (horizonRadius >= 0.999) {
    guideBackground = mix(skyGuideColor, horizonGuideColor, horizonAmount);
  }
  if (isNadir) {
    guideBackground = mix(floorGuideColor, horizonGuideColor, horizonAmount);
  }
  return vec4<f32>(guideBackground, 1.0);
}
`;

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
        targets: [{ format: OUTPUT_FORMAT }],
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

  guideBindGroup(): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.guideBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.guideUniformBuffer } }],
    });
  }
}

function placementUniformData({
  placement,
  plate,
  plateFit,
  plateFeather,
  outputSize,
  sourceProjectionMode,
  domeGuideSemanticSplit,
  domeGuideHorizonSplit,
}: PlacementUniformOptions): Float32Array {
  const prepared = preparePlatePlacement(
    placement,
    plate,
    sourceProjectionMode,
    domeGuideSemanticSplit,
    domeGuideHorizonSplit,
  );
  const projection = sourceProjectionProfileForMode(sourceProjectionMode, outputSize, outputSize);
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
  data[23] = normalizeDomeGuideSemanticSplit(domeGuideSemanticSplit);
  data[24] = prepared.cornerOffsets.nw.x;
  data[25] = prepared.cornerOffsets.ne.x;
  data[26] = prepared.cornerOffsets.se.x;
  data[27] = prepared.cornerOffsets.sw.x;
  data[28] = prepared.cornerOffsets.nw.y;
  data[29] = prepared.cornerOffsets.ne.y;
  data[30] = prepared.cornerOffsets.se.y;
  data[31] = prepared.cornerOffsets.sw.y;
  data.set(projection.centerAxis, 32);
  data[35] = sourceProjectionShaderTheta(sourceProjectionMode, projection.fieldOfViewDegrees, domeGuideSemanticSplit);
  data.set(projection.imageRightAxis, 36);
  data[39] = sourceGuideCarrierHorizonRadius(sourceProjectionMode, data[23], domeGuideHorizonSplit);
  data.set(projection.imageUpAxis, 40);
  return data;
}

function plateFitMode(value: string): number {
  if (value === "cover") return 1;
  if (value === "stretch") return 2;
  return 0;
}

function guideUniformData(
  outputSize: number,
  sourceProjectionMode: SourceProjectionMode,
  domeGuideSemanticSplit: number | string | null | undefined,
  domeGuideHorizonSplit?: number | string | null,
): Float32Array {
  const split = normalizeDomeGuideSemanticSplit(domeGuideSemanticSplit);
  const carrierHorizon = sourceGuideCarrierHorizonRadius(sourceProjectionMode, split, domeGuideHorizonSplit);
  if (sourceProjectionMode === "cave-270") {
    const normalizedLineWidth = caveGuideLineWidthForSize(outputSize);
    return new Float32Array([
      -1,
      normalizedLineWidth,
      outputSize * 0.5,
      sourceProjectionHorizonRadius(sourceProjectionMode, split, carrierHorizon),
      split,
      carrierHorizon,
      0,
      0,
    ]);
  }
  const projection = sourceProjectionProfileForMode(sourceProjectionMode, outputSize, outputSize);
  const domeRadiusUv = Math.max(0.001, (outputSize * 0.5 - 2) / outputSize);
  const thetaMax = (projection.fieldOfViewDegrees * 0.5 * Math.PI) / 180;
  const thetaPerPixel = thetaMax / Math.max(outputSize * domeRadiusUv, 1);
  const horizonRadius = (Math.PI * 0.5) / Math.max(thetaMax, 0.000001);
  return new Float32Array([
    domeRadiusUv,
    thetaMax,
    thetaPerPixel * 1.45,
    sourceProjectionMode === "nadir-180" ? -horizonRadius : horizonRadius,
    split,
    carrierHorizon,
    0,
    0,
  ]);
}
