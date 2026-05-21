import { clamp } from "../projection.js";
import { externalImageTextureUsage, renderCopyTextureUsage } from "../graphics/texture-usage.js";
import { depthGuideModeIndex, motionPoseAt, normalizeDepthMotionSettings } from "./depth-parallax-renderer.js";
import type { ProjectionProfile } from "../projection.js";
import type { DepthMotionInput, DepthMotionSettings, MotionPose } from "./depth-parallax-renderer.js";

export const depthReprojectionShaderCode = /* wgsl */ `
struct Uniforms {
  fisheyeScaleOutputSize: vec4<f32>,
  nearFarPolarityContrast: vec4<f32>,
  anglesSplat: vec4<f32>,
  motionOffset: vec4<f32>,
  guideOptions: vec4<f32>,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) sourceUv: vec2<f32>,
  @location(1) targetUv: vec2<f32>,
  @location(2) splatLocal: vec2<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var sourceTexture: texture_2d<f32>;
@group(0) @binding(3) var depthTexture: texture_2d<f32>;

const HALF_PI: f32 = 1.5707963267948966;

fn equidistantRadiusForTheta(theta: f32) -> f32 {
  return clamp(theta / HALF_PI, 0.0, 1.0);
}

fn thetaFromEquidistantRadius(radial: f32) -> f32 {
  return clamp(radial, 0.0, 1.0) * HALF_PI;
}

fn mapUvToDomeDirection(uv: vec2<f32>) -> vec4<f32> {
  let fisheyeScale = max(uniforms.fisheyeScaleOutputSize.xy, vec2<f32>(0.0001, 0.0001));
  let normalized = (uv - vec2<f32>(0.5, 0.5)) / fisheyeScale;
  let radial = length(normalized);
  if (radial > 1.0001) {
    return vec4<f32>(0.0, 1.0, 0.0, -1.0);
  }
  let theta = thetaFromEquidistantRadius(radial);
  let azimuth = select(0.0, atan2(normalized.x, -normalized.y), radial > 0.000001);
  let sinTheta = sin(theta);
  return vec4<f32>(
    sinTheta * sin(azimuth),
    cos(theta),
    sinTheta * cos(azimuth),
    1.0
  );
}

fn domeDirectionToUv(direction: vec3<f32>) -> vec4<f32> {
  if (direction.y < -0.0001) {
    return vec4<f32>(0.5, 0.5, 0.0, -1.0);
  }
  let fisheyeScale = uniforms.fisheyeScaleOutputSize.xy;
  let theta = acos(clamp(direction.y, 0.0, 1.0));
  let radial = equidistantRadiusForTheta(theta);
  if (radial > 1.0001) {
    return vec4<f32>(0.5, 0.5, 0.0, -1.0);
  }
  let azimuth = atan2(direction.x, direction.z);
  return vec4<f32>(
    0.5 + sin(azimuth) * fisheyeScale.x * radial,
    0.5 - cos(azimuth) * fisheyeScale.y * radial,
    radial,
    1.0
  );
}

fn rotateX(value: vec3<f32>, angle: f32) -> vec3<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec3<f32>(value.x, value.y * c - value.z * s, value.y * s + value.z * c);
}

fn rotateY(value: vec3<f32>, angle: f32) -> vec3<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec3<f32>(value.x * c - value.z * s, value.y, value.x * s + value.z * c);
}

fn rotateZ(value: vec3<f32>, angle: f32) -> vec3<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec3<f32>(value.x * c - value.y * s, value.x * s + value.y * c, value.z);
}

fn depthFarFactor(sourceUv: vec2<f32>) -> f32 {
  let depthColor = textureSampleLevel(depthTexture, linearSampler, sourceUv, 0.0).rgb;
  let luma = dot(depthColor, vec3<f32>(0.2126, 0.7152, 0.0722));
  let polarity = uniforms.nearFarPolarityContrast.z;
  let rawFarFactor = select(luma, 1.0 - luma, polarity > 0.5);
  let contrast = max(uniforms.nearFarPolarityContrast.w, 0.001);
  return clamp(0.5 + (rawFarFactor - 0.5) * contrast, 0.0, 1.0);
}

fn depthMeters(sourceUv: vec2<f32>) -> f32 {
  let farFactor = depthFarFactor(sourceUv);
  let nearMeters = uniforms.nearFarPolarityContrast.x;
  let farMeters = uniforms.nearFarPolarityContrast.y;
  return nearMeters + farFactor * max(farMeters - nearMeters, 0.001);
}

fn hash12(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453123);
}

fn signedHash12(p: vec2<f32>) -> f32 {
  return hash12(p) * 2.0 - 1.0;
}

fn valueNoise(p: vec2<f32>) -> f32 {
  let cell = floor(p);
  let local = fract(p);
  let blend = local * local * (3.0 - 2.0 * local);
  let a = signedHash12(cell);
  let b = signedHash12(cell + vec2<f32>(1.0, 0.0));
  let c = signedHash12(cell + vec2<f32>(0.0, 1.0));
  let d = signedHash12(cell + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}

fn gaussianGrain(pixel: vec2<f32>) -> f32 {
  let cell = floor(pixel);
  let sum =
    signedHash12(cell + vec2<f32>(0.0, 0.0)) +
    signedHash12(cell + vec2<f32>(19.19, 7.31)) +
    signedHash12(cell + vec2<f32>(41.13, 29.17)) +
    signedHash12(cell + vec2<f32>(67.97, 53.71)) +
    signedHash12(cell + vec2<f32>(101.33, 83.11)) +
    signedHash12(cell + vec2<f32>(149.71, 127.53));
  return sum * 0.16666667;
}

fn multiOctaveGuideNoise(uv: vec2<f32>) -> f32 {
  let outputSize = max(uniforms.fisheyeScaleOutputSize.zw, vec2<f32>(1.0, 1.0));
  let pixel = uv * outputSize;
  let wide = valueNoise(pixel / 96.0) * 0.38;
  let mid = valueNoise(pixel / 28.0 + vec2<f32>(17.13, 43.71)) * 0.28;
  let grain = gaussianGrain(pixel) * 0.34;
  return clamp(wide + mid + grain, -1.0, 1.0);
}

fn applyGuideNoise(rgb: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
  let amount = clamp(uniforms.guideOptions.z, 0.0, 0.2);
  if (amount <= 0.00001) {
    return rgb;
  }
  let noise = multiOctaveGuideNoise(uv) * amount;
  return clamp(rgb + vec3<f32>(noise), vec3<f32>(0.0), vec3<f32>(1.0));
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32, @location(0) sourceUv: vec2<f32>) -> VertexOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(1.0, 1.0)
  );

  var out: VertexOut;
  out.sourceUv = sourceUv;
  out.targetUv = vec2<f32>(0.5, 0.5);
  out.splatLocal = corners[vertexIndex % 6u];

  let sourceDirection = mapUvToDomeDirection(sourceUv);
  if (sourceDirection.w < 0.0) {
    out.position = vec4<f32>(3.0, 3.0, 1.0, 1.0);
    return out;
  }

  let meters = depthMeters(sourceUv);
  let point = sourceDirection.xyz * meters;
  let relative = point - uniforms.motionOffset.xyz;
  let distance = length(relative);
  if (distance <= 0.0001) {
    out.position = vec4<f32>(3.0, 3.0, 1.0, 1.0);
    return out;
  }

  var cameraDirection = relative / distance;
  cameraDirection = rotateY(cameraDirection, -uniforms.anglesSplat.x);
  cameraDirection = rotateX(cameraDirection, -uniforms.anglesSplat.y);
  cameraDirection = rotateZ(cameraDirection, -uniforms.anglesSplat.z);

  let outputUv = domeDirectionToUv(normalize(cameraDirection));
  if (outputUv.w < 0.0) {
    out.position = vec4<f32>(3.0, 3.0, 1.0, 1.0);
    return out;
  }
  out.targetUv = outputUv.xy;

  let outputSize = max(uniforms.fisheyeScaleOutputSize.zw, vec2<f32>(1.0, 1.0));
  let clip = vec2<f32>(outputUv.x * 2.0 - 1.0, 1.0 - outputUv.y * 2.0);
  let splat = max(uniforms.anglesSplat.w, 0.5);
  let clipOffset = corners[vertexIndex % 6u] * vec2<f32>((splat / outputSize.x) * 2.0, (splat / outputSize.y) * 2.0);
  out.position = vec4<f32>(clip + clipOffset, clamp(distance / max(uniforms.nearFarPolarityContrast.y, 0.001), 0.0, 1.0), 1.0);
  return out;
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4<f32> {
  if (dot(in.splatLocal, in.splatLocal) > 1.32) {
    discard;
  }
  let normalized = (in.targetUv - vec2<f32>(0.5, 0.5)) / max(uniforms.fisheyeScaleOutputSize.xy, vec2<f32>(0.0001, 0.0001));
  if (length(normalized) > 1.0) {
    discard;
  }
  let color = textureSample(sourceTexture, linearSampler, in.sourceUv);
  let guideMode = uniforms.guideOptions.y;
  var rgb = color.rgb;
  if (guideMode < 0.5) {
    rgb = color.rgb;
  } else {
    let farFactor = depthFarFactor(in.sourceUv);
    if (guideMode < 1.5) {
      let sourceLuma = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
      let depthWeighted = sourceLuma * mix(0.58, 1.18, farFactor);
      let mono = clamp(mix(sourceLuma, depthWeighted, 0.72), 0.0, 1.0);
      rgb = vec3<f32>(mono);
    } else {
      rgb = vec3<f32>(farFactor);
    }
  }

  return vec4<f32>(applyGuideNoise(rgb, in.targetUv), 1.0);
}
`;

const DEPTH_STENCIL_FORMAT = "depth24plus-stencil8";
const BASE_SPLAT_PIXELS = 0.78;

type DepthWebGpuPreviewRendererOptions = {
  canvas?: HTMLCanvasElement | null;
  device?: GPUDevice | null;
  format?: GPUTextureFormat;
};
type DepthWebGpuRenderInput = {
  sourceCanvas: HTMLCanvasElement;
  depthCanvas: HTMLCanvasElement;
  profile: ProjectionProfile;
  settings: DepthMotionInput;
  progress?: number;
  waitForCompletion?: boolean;
};
type DepthWebGpuFrame = { texture: GPUTexture | null; width: number; height: number };
type DepthPreviewUniformProfile = Pick<ProjectionProfile, "fisheyeScaleX" | "fisheyeScaleY">;
type DepthPreviewUniformSettings = Pick<
  DepthMotionSettings,
  "nearMeters" | "farMeters" | "polarity" | "depthContrast" | "guideMode" | "guideNoise" | "gapFillPasses"
>;
type UniformInput = {
  profile: DepthPreviewUniformProfile;
  settings: DepthPreviewUniformSettings;
  pose: MotionPose;
  size: number;
  splatPixels?: number;
};

export function createDepthWebGpuPreviewRenderer({
  canvas = null,
  device: providedDevice = null,
  format = "rgba8unorm",
}: DepthWebGpuPreviewRendererOptions = {}) {
  let device: GPUDevice;
  let context: GPUCanvasContext;
  let presentationFormat: GPUTextureFormat;
  let basePipeline: GPURenderPipeline;
  let gapFillPipeline: GPURenderPipeline;
  let bindGroupLayout: GPUBindGroupLayout;
  let sampler: GPUSampler;
  let baseUniformBuffer: GPUBuffer;
  let gapFillUniformBuffer: GPUBuffer;
  let sourceTexture: GPUTexture | null = null;
  let depthTexture: GPUTexture | null = null;
  let depthBuffer: GPUTexture | null = null;
  let outputTexture: GPUTexture | null = null;
  let uvBuffer: GPUBuffer | null = null;
  let uvCount = 0;
  let uvSize = 0;
  let targetSize = 0;

  async function initialize(): Promise<void> {
    if (device) return;
    if (providedDevice) {
      device = providedDevice;
      presentationFormat = format;
    } else if (!navigator.gpu) {
      throw new Error("WebGPU is not available for depth preview.");
    } else {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        throw new Error("No WebGPU adapter was found for depth preview.");
      }
      device = await adapter.requestDevice();
      presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    }

    if (canvas) {
      context = canvas.getContext("webgpu");
      presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    }
    sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float", viewDimension: "2d" },
        },
      ],
    });
    const module = device.createShaderModule({ code: depthReprojectionShaderCode });
    basePipeline = createReprojectionPipeline(module, "base");
    gapFillPipeline = createReprojectionPipeline(module, "gapFill");
    baseUniformBuffer = createUniformBuffer();
    gapFillUniformBuffer = createUniformBuffer();
  }

  function createReprojectionPipeline(module: GPUShaderModule, passKind: "base" | "gapFill"): GPURenderPipeline {
    const depthCompare: GPUCompareFunction = passKind === "base" ? "less" : "greater";
    const stencilState =
      passKind === "base"
        ? {
            compare: "always" as GPUCompareFunction,
            failOp: "keep" as GPUStencilOperation,
            depthFailOp: "keep" as GPUStencilOperation,
            passOp: "replace" as GPUStencilOperation,
          }
        : {
            compare: "equal" as GPUCompareFunction,
            failOp: "keep" as GPUStencilOperation,
            depthFailOp: "keep" as GPUStencilOperation,
            passOp: "keep" as GPUStencilOperation,
          };
    return device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: {
        module,
        entryPoint: "vertexMain",
        buffers: [
          {
            arrayStride: 8,
            stepMode: "instance",
            attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: "fragmentMain",
        targets: [{ format: presentationFormat }],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare,
        format: DEPTH_STENCIL_FORMAT,
        stencilFront: stencilState,
        stencilBack: stencilState,
        stencilReadMask: 0xff,
        stencilWriteMask: passKind === "base" ? 0xff : 0x00,
      },
    });
  }

  function createUniformBuffer(): GPUBuffer {
    return device.createBuffer({
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  async function render({
    sourceCanvas,
    depthCanvas,
    profile,
    settings,
    progress = 0.55,
    waitForCompletion = false,
  }: DepthWebGpuRenderInput): Promise<DepthWebGpuFrame> {
    await initialize();
    const size = clamp(Math.round(profile.width || 512), 128, 1536);
    ensureTarget(size);
    ensureUvBuffer(profile);
    sourceTexture = uploadCanvasTexture(sourceTexture, sourceCanvas);
    depthTexture = uploadCanvasTexture(depthTexture, depthCanvas);
    const normalizedSettings = normalizeDepthMotionSettings(settings);
    const pose = motionPoseAt(progress, normalizedSettings);
    const baseUniforms = buildUniforms({
      profile,
      settings: normalizedSettings,
      pose,
      size,
      splatPixels: BASE_SPLAT_PIXELS,
    });
    device.queue.writeBuffer(baseUniformBuffer, 0, baseUniforms);
    const baseBindGroup = bindGroupForUniformBuffer(baseUniformBuffer);

    // Enlarged splats run as a second pass and are stencil-gated to pixels the base pass left empty.
    const useGapFill = normalizedSettings.gapFillPasses > 0;
    let gapFillBindGroup: GPUBindGroup | null = null;
    if (useGapFill) {
      const gapFillUniforms = buildUniforms({
        profile,
        settings: normalizedSettings,
        pose,
        size,
        splatPixels: gapFillSplatPixels(normalizedSettings.gapFillPasses),
      });
      device.queue.writeBuffer(gapFillUniformBuffer, 0, gapFillUniforms);
      gapFillBindGroup = bindGroupForUniformBuffer(gapFillUniformBuffer);
    }

    const encoder = device.createCommandEncoder();
    const targetTexture = currentTargetTexture();
    const basePass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: targetTexture.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depthBuffer.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "discard",
        stencilClearValue: 0,
        stencilLoadOp: "clear",
        stencilStoreOp: useGapFill ? "store" : "discard",
      },
    });
    basePass.setViewport(0, 0, size, size, 0, 1);
    basePass.setScissorRect(0, 0, size, size);
    basePass.setPipeline(basePipeline);
    basePass.setStencilReference(1);
    basePass.setBindGroup(0, baseBindGroup);
    basePass.setVertexBuffer(0, uvBuffer);
    basePass.draw(6, uvCount);
    basePass.end();

    if (gapFillBindGroup) {
      const gapFillPass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: targetTexture.createView(),
            loadOp: "load",
            storeOp: "store",
          },
        ],
        depthStencilAttachment: {
          view: depthBuffer.createView(),
          depthClearValue: 0,
          depthLoadOp: "clear",
          depthStoreOp: "discard",
          stencilLoadOp: "load",
          stencilStoreOp: "discard",
        },
      });
      gapFillPass.setViewport(0, 0, size, size, 0, 1);
      gapFillPass.setScissorRect(0, 0, size, size);
      gapFillPass.setPipeline(gapFillPipeline);
      gapFillPass.setStencilReference(0);
      gapFillPass.setBindGroup(0, gapFillBindGroup);
      gapFillPass.setVertexBuffer(0, uvBuffer);
      gapFillPass.draw(6, uvCount);
      gapFillPass.end();
    }
    device.queue.submit([encoder.finish()]);
    if (waitForCompletion) {
      await device.queue.onSubmittedWorkDone();
    }
    return {
      texture: outputTexture,
      width: size,
      height: size,
    };
  }

  function ensureTarget(size: number): void {
    if (targetSize === size && depthBuffer) return;
    targetSize = size;
    if (canvas) {
      canvas.width = size;
      canvas.height = size;
      context.configure({
        device,
        format: presentationFormat,
        usage: renderCopyTextureUsage(),
        alphaMode: "opaque",
      });
    } else {
      if (outputTexture) outputTexture.destroy();
      outputTexture = device.createTexture({
        size: { width: size, height: size },
        format: presentationFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
      });
    }
    if (depthBuffer) depthBuffer.destroy();
    depthBuffer = device.createTexture({
      size: { width: size, height: size },
      format: DEPTH_STENCIL_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  function bindGroupForUniformBuffer(uniformBuffer: GPUBuffer): GPUBindGroup {
    return device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: sourceTexture.createView() },
        { binding: 3, resource: depthTexture.createView() },
      ],
    });
  }

  function currentTargetTexture(): GPUTexture {
    return canvas ? context.getCurrentTexture() : outputTexture;
  }

  function ensureUvBuffer(profile: ProjectionProfile): void {
    const size = Math.round(profile.width);
    if (uvBuffer && uvSize === size) return;
    const data = buildUvSamples(profile);
    if (uvBuffer) uvBuffer.destroy();
    uvBuffer = device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(uvBuffer, 0, data);
    uvCount = data.length / 2;
    uvSize = size;
  }

  function uploadCanvasTexture(previousTexture: GPUTexture | null, source: HTMLCanvasElement): GPUTexture {
    if (previousTexture) previousTexture.destroy();
    const texture = device.createTexture({
      size: { width: source.width, height: source.height },
      format: "rgba8unorm",
      usage: externalImageTextureUsage(),
    });
    device.queue.copyExternalImageToTexture({ source }, { texture }, [source.width, source.height]);
    return texture;
  }

  return {
    render,
  };
}

export function buildDepthPreviewUniformArray({
  profile,
  settings,
  pose,
  size,
  splatPixels = BASE_SPLAT_PIXELS,
}: UniformInput): Float32Array {
  return new Float32Array([
    profile.fisheyeScaleX,
    profile.fisheyeScaleY,
    size,
    size,
    settings.nearMeters,
    settings.farMeters,
    settings.polarity === "brightNear" ? 1 : 0,
    settings.depthContrast,
    pose.yaw,
    pose.pitch,
    pose.roll,
    splatPixels,
    pose.offset[0],
    pose.offset[1],
    pose.offset[2],
    0,
    0,
    depthGuideModeIndex(settings.guideMode),
    settings.guideNoise,
    0,
  ]);
}

function buildUniforms({ profile, settings, pose, size, splatPixels }: UniformInput): Float32Array {
  return buildDepthPreviewUniformArray({ profile, settings, pose, size, splatPixels });
}

function buildUvSamples(profile: ProjectionProfile): Float32Array {
  const values: number[] = [];
  const width = Math.round(profile.width);
  const height = Math.round(profile.height);
  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      const normalizedX = (u - 0.5) / Math.max(profile.fisheyeScaleX, 0.0001);
      const normalizedY = (v - 0.5) / Math.max(profile.fisheyeScaleY, 0.0001);
      if (Math.hypot(normalizedX, normalizedY) > 1.02) continue;
      values.push(u, v);
    }
  }
  return new Float32Array(values);
}

export function gapFillSplatPixels(gapFillPasses: number): number {
  return clamp(1 + Math.max(0, Math.round(Number(gapFillPasses) || 0)) * 0.55, 1, 4.5);
}
