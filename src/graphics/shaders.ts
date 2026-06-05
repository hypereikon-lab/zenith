// @ts-check

export const domeShaderCode = /* wgsl */ `
struct Uniforms {
  mvp: mat4x4<f32>,
  fisheyeScale: vec2<f32>,
  rotation: f32,
  exposure: f32,
  overlayOpacity: f32,
  mirror: f32,
  domeTilt: f32,
  cutaway: f32,
  showRings: f32,
  showSpokes: f32,
  showHorizon: f32,
  showZenith: f32,
  showSourceCircle: f32,
  shellShade: f32,
  sourceCenterTheta: vec4<f32>,
  sourceRight: vec4<f32>,
  sourceUp: vec4<f32>,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) world: vec3<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var domeSampler: sampler;
@group(0) @binding(2) var domeTexture: texture_2d<f32>;

const PI: f32 = 3.141592653589793;
const HALF_PI: f32 = 1.5707963267948966;

fn rotateX(v: vec3<f32>, angle: f32) -> vec3<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec3<f32>(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}

fn gridLine(value: f32, interval: f32, widthFactor: f32) -> f32 {
  let dist = abs(fract(value / interval + 0.5) - 0.5) * interval;
  let width = max(fwidth(value) * widthFactor, 0.0015);
  return 1.0 - smoothstep(0.0, width, dist);
}

fn sourceDirectionFromPhysical(physicalDir: vec3<f32>) -> vec3<f32> {
  let dir = normalize(rotateX(physicalDir, uniforms.domeTilt));
  let theta = acos(clamp(dir.y, -1.0, 1.0));
  let sinTheta = sin(theta);
  var azimuth = atan2(dir.x, dir.z);
  if (uniforms.mirror > 0.5) {
    azimuth = -azimuth;
  }
  azimuth = azimuth + uniforms.rotation;
  return normalize(vec3<f32>(sinTheta * sin(azimuth), cos(theta), sinTheta * cos(azimuth)));
}

fn physicalDirectionFromSource(sourceDir: vec3<f32>) -> vec3<f32> {
  let source = normalize(sourceDir);
  let theta = acos(clamp(source.y, -1.0, 1.0));
  let sinTheta = sin(theta);
  var azimuth = atan2(source.x, source.z) - uniforms.rotation;
  if (uniforms.mirror > 0.5) {
    azimuth = -azimuth;
  }
  let tilted = vec3<f32>(sinTheta * sin(azimuth), cos(theta), sinTheta * cos(azimuth));
  return normalize(rotateX(tilted, -uniforms.domeTilt));
}

@vertex
fn vertexMain(@location(0) position: vec3<f32>) -> VertexOut {
  let physical = physicalDirectionFromSource(position);
  var out: VertexOut;
  out.position = uniforms.mvp * vec4<f32>(physical, 1.0);
  out.world = physical;
  return out;
}

fn sourceSample(sourceDir: vec3<f32>) -> vec3<f32> {
  let center = normalize(uniforms.sourceCenterTheta.xyz);
  let thetaMax = max(uniforms.sourceCenterTheta.w, 0.0001);
  let centerDot = clamp(dot(sourceDir, center), -1.0, 1.0);
  let theta = acos(centerDot);
  let radial = theta / thetaMax;
  var local = vec2<f32>(0.0, 0.0);
  if (theta > 0.000001) {
    let tangent = normalize(sourceDir - center * centerDot);
    local = vec2<f32>(dot(tangent, uniforms.sourceRight.xyz), dot(tangent, uniforms.sourceUp.xyz));
  }
  let uv = vec2<f32>(0.5, 0.5) +
    vec2<f32>(local.x * uniforms.fisheyeScale.x, -local.y * uniforms.fisheyeScale.y) * radial;
  return vec3<f32>(uv, select(0.0, 1.0, radial <= 1.0001));
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4<f32> {
  let physicalDir = normalize(in.world);
  if (uniforms.cutaway > 0.5 && physicalDir.x < -0.025) {
    discard;
  }

  let sourceDir = sourceDirectionFromPhysical(physicalDir);
  let sample = sourceSample(sourceDir);
  var color = textureSample(domeTexture, domeSampler, clamp(sample.xy, vec2<f32>(0.0), vec2<f32>(1.0))).rgb * uniforms.exposure;
  color = select(vec3<f32>(0.0), color, sample.z > 0.5);
  let shell = mix(1.0, 0.66 + 0.34 * smoothstep(0.0, 1.0, physicalDir.y), uniforms.shellShade);
  color = color * shell;

  let center = normalize(uniforms.sourceCenterTheta.xyz);
  let theta = acos(clamp(dot(sourceDir, center), -1.0, 1.0));
  var azimuth = 0.0;
  if (theta > 0.000001) {
    let tangent = normalize(sourceDir - center * clamp(dot(sourceDir, center), -1.0, 1.0));
    azimuth = atan2(dot(tangent, uniforms.sourceRight.xyz), dot(tangent, uniforms.sourceUp.xyz));
  }
  let latitude = gridLine(theta, PI / 12.0, 1.5) * 0.58 * uniforms.showRings;
  let longitude = gridLine(azimuth, PI / 12.0, 1.5) * 0.48 * uniforms.showSpokes;
  let horizon = (1.0 - smoothstep(0.004, 0.018 + fwidth(theta) * 3.0, abs(theta - HALF_PI))) * uniforms.showHorizon;
  let zenith = (1.0 - smoothstep(0.0, 0.028 + fwidth(theta) * 2.0, theta)) * uniforms.showZenith;
  let overlay = clamp(max(max(max(latitude, longitude), horizon), zenith) * uniforms.overlayOpacity, 0.0, 0.82);
  color = mix(color, vec3<f32>(0.78, 0.96, 1.0), overlay);
  color = color + vec3<f32>(0.08, 0.12, 0.13) * horizon * uniforms.shellShade;

  return vec4<f32>(color, 1.0);
}
`;

export const flatShaderCode = /* wgsl */ `
struct Uniforms {
  mvp: mat4x4<f32>,
  fisheyeScale: vec2<f32>,
  rotation: f32,
  exposure: f32,
  overlayOpacity: f32,
  mirror: f32,
  domeTilt: f32,
  cutaway: f32,
  showRings: f32,
  showSpokes: f32,
  showHorizon: f32,
  showZenith: f32,
  showSourceCircle: f32,
  shellShade: f32,
  sourceCenterTheta: vec4<f32>,
  sourceRight: vec4<f32>,
  sourceUp: vec4<f32>,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var domeSampler: sampler;
@group(0) @binding(2) var domeTexture: texture_2d<f32>;

const PI: f32 = 3.141592653589793;
const HALF_PI: f32 = 1.5707963267948966;

fn rotate2d(value: vec2<f32>, angle: f32) -> vec2<f32> {
  let s = sin(angle);
  let c = cos(angle);
  return vec2<f32>(
    value.x * c - value.y * s,
    value.x * s + value.y * c
  );
}

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
  var out: VertexOut;
  let position = positions[index];
  out.position = vec4<f32>(position, 0.0, 1.0);
  out.uv = vec2<f32>(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
  return out;
}

fn lineAt(value: f32, interval: f32, widthFactor: f32) -> f32 {
  let dist = abs(fract(value / interval + 0.5) - 0.5) * interval;
  let width = max(fwidth(value) * widthFactor, 0.0015);
  return 1.0 - smoothstep(0.0, width, dist);
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4<f32> {
  let fisheyeScale = max(uniforms.fisheyeScale, vec2<f32>(0.0001));
  let normalized = (in.uv - vec2<f32>(0.5, 0.5)) / fisheyeScale;
  let radius = length(normalized);
  let insideMask = step(radius, 1.0);
  let rotatedSample = rotate2d(normalized, uniforms.rotation);
  let sampleUv = vec2<f32>(0.5, 0.5) + rotatedSample * fisheyeScale;
  let sampledColor = textureSample(domeTexture, domeSampler, sampleUv).rgb * uniforms.exposure;
  var color = select(sampledColor, vec3<f32>(0.0, 0.0, 0.0), radius > 1.0);
  let theta = clamp(radius, 0.0, 1.0) * max(uniforms.sourceCenterTheta.w, 0.0001);
  let angle = atan2(normalized.x, -normalized.y) + uniforms.rotation;

  let ring = lineAt(theta, PI / 12.0, 1.4) * insideMask * uniforms.showRings;
  let spoke = lineAt(angle, PI / 12.0, 1.4) * insideMask * uniforms.showSpokes;
  let horizon = (1.0 - smoothstep(0.002, 0.01 + fwidth(theta) * 2.0, abs(theta - HALF_PI))) * insideMask * uniforms.showHorizon;
  let sourceCircle = (1.0 - smoothstep(0.002, 0.012 + fwidth(radius) * 2.0, abs(radius - 1.0))) * insideMask * uniforms.showSourceCircle;
  let overlay = clamp(max(max(max(ring * 0.4, spoke * 0.38), horizon), sourceCircle) * uniforms.overlayOpacity, 0.0, 0.82);
  color = mix(color, vec3<f32>(0.78, 0.96, 1.0), overlay);
  return vec4<f32>(color, 1.0);
}
`;

export const caveShaderCode = /* wgsl */ `
struct Uniforms {
  mvp: mat4x4<f32>,
  fisheyeScale: vec2<f32>,
  rotation: f32,
  exposure: f32,
  overlayOpacity: f32,
  mirror: f32,
  domeTilt: f32,
  cutaway: f32,
  showRings: f32,
  showSpokes: f32,
  showHorizon: f32,
  showZenith: f32,
  showSourceCircle: f32,
  shellShade: f32,
  sourceCenterTheta: vec4<f32>,
  sourceRight: vec4<f32>,
  sourceUp: vec4<f32>,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) faceUv: vec2<f32>,
  @location(2) face: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var domeSampler: sampler;
@group(0) @binding(2) var domeTexture: texture_2d<f32>;

const PI: f32 = 3.141592653589793;
const HALF_PI: f32 = 1.5707963267948966;

@vertex
fn vertexMain(@location(0) position: vec3<f32>, @location(1) faceUv: vec2<f32>, @location(2) face: f32) -> VertexOut {
  var out: VertexOut;
  out.position = uniforms.mvp * vec4<f32>(position, 1.0);
  out.world = position;
  out.faceUv = faceUv;
  out.face = face;
  return out;
}

fn rotateX(v: vec3<f32>, angle: f32) -> vec3<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec3<f32>(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}

fn gridLine(value: f32, interval: f32, widthFactor: f32) -> f32 {
  let dist = abs(fract(value / interval + 0.5) - 0.5) * interval;
  let width = max(fwidth(value) * widthFactor, 0.0015);
  return 1.0 - smoothstep(0.0, width, dist);
}

fn edgeLine(value: f32) -> f32 {
  let dist = min(abs(value), abs(1.0 - value));
  let width = max(fwidth(value) * 2.0, 0.002);
  return 1.0 - smoothstep(0.0, width, dist);
}

fn sourceDirectionFromPhysical(physicalDir: vec3<f32>) -> vec3<f32> {
  let dir = normalize(rotateX(physicalDir, uniforms.domeTilt));
  let theta = acos(clamp(dir.y, -1.0, 1.0));
  let sinTheta = sin(theta);
  var azimuth = atan2(dir.x, dir.z);
  if (uniforms.mirror > 0.5) {
    azimuth = -azimuth;
  }
  azimuth = azimuth + uniforms.rotation;
  return normalize(vec3<f32>(sinTheta * sin(azimuth), cos(theta), sinTheta * cos(azimuth)));
}

fn sourceSample(sourceDir: vec3<f32>) -> vec3<f32> {
  let center = normalize(uniforms.sourceCenterTheta.xyz);
  let thetaMax = max(uniforms.sourceCenterTheta.w, 0.0001);
  let centerDot = clamp(dot(sourceDir, center), -1.0, 1.0);
  let theta = acos(centerDot);
  let radial = theta / thetaMax;
  var local = vec2<f32>(0.0, 0.0);
  if (theta > 0.000001) {
    let tangent = normalize(sourceDir - center * centerDot);
    local = vec2<f32>(dot(tangent, uniforms.sourceRight.xyz), dot(tangent, uniforms.sourceUp.xyz));
  }
  let uv = vec2<f32>(0.5, 0.5) +
    vec2<f32>(local.x * uniforms.fisheyeScale.x, -local.y * uniforms.fisheyeScale.y) * radial;
  return vec3<f32>(uv, select(0.0, 1.0, radial <= 1.0001));
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4<f32> {
  let physicalDir = normalize(in.world);
  let sourceDir = sourceDirectionFromPhysical(physicalDir);
  let sample = sourceSample(sourceDir);
  let sampledColor = textureSample(domeTexture, domeSampler, clamp(sample.xy, vec2<f32>(0.0), vec2<f32>(1.0))).rgb *
    uniforms.exposure;
  var color = select(vec3<f32>(0.006, 0.008, 0.009), sampledColor, sample.z > 0.5);

  let heightShade = 0.78 + 0.22 * smoothstep(-2.0, 2.0, in.world.y);
  let floorShade = select(1.0, 0.86, in.face > 3.5);
  color = color * mix(1.0, heightShade * floorShade, uniforms.shellShade);

  let faceGrid = max(gridLine(in.faceUv.x, 0.25, 1.35), gridLine(in.faceUv.y, 0.25, 1.35)) * 0.28;
  let faceEdge = max(edgeLine(in.faceUv.x), edgeLine(in.faceUv.y));
  let horizon = (1.0 - smoothstep(0.004, 0.018 + fwidth(dot(sourceDir, vec3<f32>(0.0, 1.0, 0.0))) * 3.0, abs(sourceDir.y))) *
    uniforms.showHorizon;
  let overlay = clamp(max(max(faceGrid * uniforms.showSpokes, faceEdge), horizon * 0.42) * uniforms.overlayOpacity, 0.0, 0.82);
  color = mix(color, vec3<f32>(0.78, 0.96, 1.0), overlay);

  return vec4<f32>(color, 1.0);
}
`;

export const roomShaderCode = /* wgsl */ `
struct RoomUniforms {
  mvp: mat4x4<f32>,
  floorOpacity: f32,
  gridOpacity: f32,
  radius: f32,
  _pad0: f32,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) floor: vec2<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: RoomUniforms;

@vertex
fn vertexMain(@location(0) position: vec3<f32>) -> VertexOut {
  var out: VertexOut;
  out.position = uniforms.mvp * vec4<f32>(position, 1.0);
  out.floor = position.xz;
  return out;
}

fn gridLine(value: f32, interval: f32, widthFactor: f32) -> f32 {
  let dist = abs(fract(value / interval + 0.5) - 0.5) * interval;
  let width = max(fwidth(value) * widthFactor, 0.0015);
  return 1.0 - smoothstep(0.0, width, dist);
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4<f32> {
  let radius = length(in.floor);
  let fade = 1.0 - smoothstep(0.72, 1.0, radius);
  let grid = max(gridLine(in.floor.x, 0.12, 1.4), gridLine(in.floor.y, 0.12, 1.4)) * fade;
  let rim = 1.0 - smoothstep(0.008, 0.028 + fwidth(radius) * 2.0, abs(radius - 1.0));
  let base = vec3<f32>(0.015, 0.019, 0.021);
  let gridColor = vec3<f32>(0.33, 0.58, 0.62) * grid * uniforms.gridOpacity;
  let rimColor = vec3<f32>(0.42, 0.78, 0.82) * rim * uniforms.floorOpacity;
  let color = base + (gridColor + rimColor) * uniforms.floorOpacity;
  return vec4<f32>(color, 1.0);
}
`;
