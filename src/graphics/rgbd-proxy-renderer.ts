import { canvasToBlob } from "../media/canvas-utils.js";
import { cameraBasisFromPose } from "../scene/camera-path.js";
import { normalizeSourceInnerGuideSplit } from "../geometry/source-guide-semantics.js";
import type { RgbdCameraPose, RgbdProxyArtifact } from "../scene/rgbd-scene-types.js";
import type { SourceProjectionMode } from "../geometry/source-projection.js";
import { externalImageTextureUsage } from "./texture-usage.js";

export type RgbdProxyRenderInput = {
  sourceCanvas: HTMLCanvasElement;
  depthCanvas: HTMLCanvasElement;
  projectionProfile: SourceProjectionMode;
  pose: RgbdCameraPose;
  keyframeId: string;
  width: number;
  height: number;
  innerGuideSplit?: number | string | null;
  carrierHorizonSplit?: number | string | null;
};

export type RgbdProxyRenderOutput = {
  artifact: RgbdProxyArtifact;
  canvases: {
    rgb: HTMLCanvasElement;
    depthPreview: HTMLCanvasElement;
    knownMask: HTMLCanvasElement;
    disocclusionMask: HTMLCanvasElement;
    confidencePreview: HTMLCanvasElement;
  };
  blobs: {
    rgb: Blob;
    depthPreview: Blob;
    knownMask: Blob;
    disocclusionMask: Blob;
    confidencePreview: Blob;
  };
};

const SHADER = /* wgsl */ `
struct Uniforms {
  right: vec4<f32>,
  up: vec4<f32>,
  forward: vec4<f32>,
  position: vec4<f32>,
  options: vec4<f32>,
  depthOptions: vec4<f32>,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var sourceTexture: texture_2d<f32>;
@group(0) @binding(3) var depthTexture: texture_2d<f32>;

const PI: f32 = 3.141592653589793;

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  let position = positions[index];
  var out: VertexOut;
  out.position = vec4<f32>(position, 0.0, 1.0);
  out.uv = position * 0.5 + vec2<f32>(0.5, 0.5);
  return out;
}

fn sourceFisheyeUv(direction: vec3<f32>, center: vec3<f32>, thetaMax: f32) -> vec4<f32> {
  let source = normalize(direction);
  let centerDot = clamp(dot(source, center), -1.0, 1.0);
  let theta = acos(centerDot);
  let radial = theta / max(thetaMax, 0.0001);
  if (radial > 1.0001) {
    return vec4<f32>(0.5, 0.5, radial, 0.0);
  }
  var local = vec2<f32>(0.0);
  if (theta > 0.000001) {
    let tangent = normalize(source - center * centerDot);
    let sourceRight = vec3<f32>(1.0, 0.0, 0.0);
    let sourceUp = vec3<f32>(0.0, 0.0, 1.0);
    local = vec2<f32>(dot(tangent, sourceRight), dot(tangent, sourceUp));
  }
  return vec4<f32>(0.5 + local.x * 0.5 * radial, 0.5 - local.y * 0.5 * radial, radial, 1.0);
}

fn boundaryFraction(x: f32, y: f32) -> f32 {
  let clampedX = clamp(x, -1.0, 1.0);
  let clampedY = clamp(y, -1.0, 1.0);
  let top = abs(clampedY - 1.0);
  let right = abs(clampedX - 1.0);
  let bottom = abs(clampedY + 1.0);
  let left = abs(clampedX + 1.0);
  var distance = 0.0;
  if (top <= right && top <= bottom && top <= left) {
    distance = clampedX + 1.0;
  } else if (right <= bottom && right <= left) {
    distance = 2.0 + (1.0 - clampedY);
  } else if (bottom <= left) {
    distance = 4.0 + (1.0 - clampedX);
  } else {
    distance = 6.0 + (clampedY + 1.0);
  }
  return fract(distance / 8.0);
}

fn boundaryPoint(fraction: f32) -> vec2<f32> {
  let distance = fract(fraction) * 8.0;
  if (distance <= 2.0) {
    return vec2<f32>(distance - 1.0, 1.0);
  }
  if (distance <= 4.0) {
    return vec2<f32>(1.0, 1.0 - (distance - 2.0));
  }
  if (distance <= 6.0) {
    return vec2<f32>(1.0 - (distance - 4.0), -1.0);
  }
  return vec2<f32>(-1.0, -1.0 + (distance - 6.0));
}

fn caveCarrierUv(direction: vec3<f32>) -> vec4<f32> {
  let dir = normalize(direction);
  let horizontal = max(length(dir.xz), 0.000001);
  let angle = atan2(dir.x, dir.z);
  let wallX = select(2.0 * sign(sin(angle)), 2.0 * tan(angle), abs(sin(angle)) > abs(cos(angle)));
  let wallZ = select(2.0 / max(abs(cos(angle)), 0.000001) * cos(angle), 2.0 * sign(cos(angle)), abs(sin(angle)) > abs(cos(angle)));
  let wallPoint = vec2<f32>(clamp(wallX, -2.0, 2.0), clamp(wallZ, -2.0, 2.0));
  let horizontalDistance = length(wallPoint);
  let bottom = -2.0;
  let top = 2.0;
  let floorBand = clamp(uniforms.depthOptions.w, 0.18, 0.72);
  let elevation = atan2(dir.y, horizontal);
  let floorBoundaryElevation = atan2(bottom, max(horizontalDistance, 0.000001));
  var rho = 1.0;
  var perimeter = boundaryFraction(wallPoint.x / 2.0, wallPoint.y / 2.0);
  if (elevation >= floorBoundaryElevation - 0.0001) {
    let y = horizontalDistance * (dir.y / horizontal);
    if (y < bottom - 0.0001 || y > top + 0.0001) {
      return vec4<f32>(0.5, 0.5, 1.0, 0.0);
    }
    rho = floorBand + clamp((y - bottom) / max(top - bottom, 0.000001), 0.0, 1.0) * (1.0 - floorBand);
  } else {
    let t = bottom / min(dir.y, -0.000001);
    let floorPoint = dir.xz * t;
    let boundaryDistance = max(max(abs(floorPoint.x) / 2.0, abs(floorPoint.y) / 2.0), 0.000001);
    let boundary = floorPoint / boundaryDistance;
    perimeter = boundaryFraction(boundary.x / 2.0, boundary.y / 2.0);
    rho = clamp(length(floorPoint) / max(length(boundary), 0.000001), 0.0, 1.0) * floorBand;
  }
  let boundary = boundaryPoint(perimeter);
  return vec4<f32>(0.5 + boundary.x * rho * 0.5, 0.5 - boundary.y * rho * 0.5, rho, 1.0);
}

fn sourceUv(direction: vec3<f32>) -> vec4<f32> {
  let mode = uniforms.options.z;
  if (mode > 2.5) {
    return caveCarrierUv(direction);
  }
  if (mode > 1.5) {
    return sourceFisheyeUv(direction, vec3<f32>(0.0, -1.0, 0.0), PI * 0.5);
  }
  if (mode > 0.5) {
    return sourceFisheyeUv(direction, vec3<f32>(0.0, 1.0, 0.0), PI * 23.0 / 36.0);
  }
  return sourceFisheyeUv(direction, vec3<f32>(0.0, 1.0, 0.0), PI * 0.5);
}

fn depthFarFactor(depthRgb: vec3<f32>) -> f32 {
  let luma = dot(depthRgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  return select(luma, 1.0 - luma, uniforms.depthOptions.z > 0.5);
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4<f32> {
  let ndc = vec2<f32>(in.uv.x * 2.0 - 1.0, 1.0 - in.uv.y * 2.0);
  let tanHalf = uniforms.options.x;
  let aspect = uniforms.options.y;
  let mode = uniforms.options.w;
  let ray = normalize(
    uniforms.forward.xyz +
    uniforms.right.xyz * ndc.x * tanHalf * aspect +
    uniforms.up.xyz * ndc.y * tanHalf
  );
  let uvValid = sourceUv(ray);
  let valid = uvValid.w;
  let uv = clamp(uvValid.xy, vec2<f32>(0.0), vec2<f32>(1.0));
  let color = textureSample(sourceTexture, linearSampler, uv).rgb;
  let depthColor = textureSample(depthTexture, linearSampler, uv).rgb;
  let depthFactor = depthFarFactor(depthColor);
  let travel = length(uniforms.position.xyz);
  let confidence = valid * clamp(0.92 - travel * 0.22 - abs(uvValid.z - 0.72) * 0.1, 0.08, 1.0);
  if (mode < 0.5) {
    return vec4<f32>(mix(vec3<f32>(0.0), color, valid), 1.0);
  }
  if (mode < 1.5) {
    return vec4<f32>(vec3<f32>(depthFactor * valid), 1.0);
  }
  if (mode < 2.5) {
    return vec4<f32>(vec3<f32>(valid), 1.0);
  }
  if (mode < 3.5) {
    return vec4<f32>(vec3<f32>(1.0 - valid), 1.0);
  }
  return vec4<f32>(vec3<f32>(confidence), 1.0);
}
`;

export async function renderRgbdProxyViews(input: RgbdProxyRenderInput): Promise<RgbdProxyRenderOutput> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    throw new Error("WebGPU is required for RGBD proxy rendering.");
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter was found for RGBD proxy rendering.");
  const device = await adapter.requestDevice();
  const format = navigator.gpu.getPreferredCanvasFormat();
  const width = Math.max(128, Math.round(input.width));
  const height = Math.max(128, Math.round(input.height));
  const sourceTexture = createTextureFromCanvas(device, input.sourceCanvas);
  const depthTexture = createTextureFromCanvas(device, input.depthCanvas);
  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
  const uniformBuffer = device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: device.createShaderModule({ code: SHADER }), entryPoint: "vertexMain" },
    fragment: { module: device.createShaderModule({ code: SHADER }), entryPoint: "fragmentMain", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: sampler },
      { binding: 2, resource: sourceTexture.createView() },
      { binding: 3, resource: depthTexture.createView() },
    ],
  });

  const canvases = {
    rgb: createCanvas(width, height),
    depthPreview: createCanvas(width, height),
    knownMask: createCanvas(width, height),
    disocclusionMask: createCanvas(width, height),
    confidencePreview: createCanvas(width, height),
  };
  await renderToCanvas(device, pipeline, bindGroup, uniformBuffer, canvases.rgb, format, input, 0);
  await renderToCanvas(device, pipeline, bindGroup, uniformBuffer, canvases.depthPreview, format, input, 1);
  await renderToCanvas(device, pipeline, bindGroup, uniformBuffer, canvases.knownMask, format, input, 2);
  await renderToCanvas(device, pipeline, bindGroup, uniformBuffer, canvases.disocclusionMask, format, input, 3);
  await renderToCanvas(device, pipeline, bindGroup, uniformBuffer, canvases.confidencePreview, format, input, 4);
  sourceTexture.destroy();
  depthTexture.destroy();
  const blobs = {
    rgb: await canvasToBlob(canvases.rgb, "image/png"),
    depthPreview: await canvasToBlob(canvases.depthPreview, "image/png"),
    knownMask: await canvasToBlob(canvases.knownMask, "image/png"),
    disocclusionMask: await canvasToBlob(canvases.disocclusionMask, "image/png"),
    confidencePreview: await canvasToBlob(canvases.confidencePreview, "image/png"),
  };
  const now = new Date().toISOString();
  const artifact: RgbdProxyArtifact = {
    id: `proxy-${input.keyframeId}`,
    keyframeId: input.keyframeId,
    label: `Proxy view ${input.keyframeId}`,
    status: "ready",
    pose: input.pose,
    projectionProfile: input.projectionProfile,
    createdAt: now,
    updatedAt: now,
    rgb: mediaRef(blobs.rgb, `RGBD proxy view ${input.keyframeId}`),
    depthPreview: mediaRef(blobs.depthPreview, `Depth preview ${input.keyframeId}`),
    knownMask: mediaRef(blobs.knownMask, `Known-pixel mask ${input.keyframeId}`),
    disocclusionMask: mediaRef(blobs.disocclusionMask, `Disocclusion mask ${input.keyframeId}`),
    confidencePreview: mediaRef(blobs.confidencePreview, `Confidence preview ${input.keyframeId}`),
    warnings: ["Proxy render is a camera-conditioned guide from the current RGBD scene, not a final reconstruction."],
  };
  return { artifact, canvases, blobs };
}

function createTextureFromCanvas(device: GPUDevice, canvas: HTMLCanvasElement): GPUTexture {
  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  const texture = device.createTexture({
    size: { width, height },
    format: "rgba8unorm",
    usage: externalImageTextureUsage(),
  });
  device.queue.copyExternalImageToTexture({ source: canvas }, { texture }, [width, height]);
  return texture;
}

async function renderToCanvas(
  device: GPUDevice,
  pipeline: GPURenderPipeline,
  bindGroup: GPUBindGroup,
  uniformBuffer: GPUBuffer,
  canvas: HTMLCanvasElement,
  format: GPUTextureFormat,
  input: RgbdProxyRenderInput,
  outputMode: number,
): Promise<void> {
  const context = canvas.getContext("webgpu");
  if (!context) throw new Error("Could not create RGBD proxy WebGPU canvas context.");
  context.configure({ device, format, alphaMode: "opaque", usage: GPUTextureUsage.RENDER_ATTACHMENT });
  device.queue.writeBuffer(uniformBuffer, 0, uniforms(input, outputMode));
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
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3);
  pass.end();
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
}

function uniforms(input: RgbdProxyRenderInput, outputMode: number): Float32Array {
  const basis = cameraBasisFromPose(input.pose);
  const data = new Float32Array(24);
  data.set([...basis.right, 0], 0);
  data.set([...basis.up, 0], 4);
  data.set([...basis.forward, 0], 8);
  data.set([...basis.position, 0], 12);
  data.set([
    Math.tan((basis.fovDegrees * Math.PI) / 360),
    Math.max(0.001, input.width / Math.max(1, input.height)),
    projectionModeIndex(input.projectionProfile),
    outputMode,
  ], 16);
  data.set([1, 24, 0, normalizeSourceInnerGuideSplit(input.innerGuideSplit)], 20);
  return data;
}

function projectionModeIndex(profile: SourceProjectionMode): number {
  if (profile === "zenith-230") return 1;
  if (profile === "nadir-180") return 2;
  if (profile === "cave-270") return 3;
  return 0;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function mediaRef(blob: Blob, name: string) {
  return {
    kind: "image" as const,
    url: URL.createObjectURL(blob),
    name,
    mime: blob.type || "image/png",
    alt: name,
  };
}
