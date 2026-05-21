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
  projectionMode: f32,
  customCurve: f32,
  cutaway: f32,
  showRings: f32,
  showSpokes: f32,
  showHorizon: f32,
  showZenith: f32,
  showSourceCircle: f32,
  shellShade: f32,
  fastMap: f32,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) domeMap: vec3<f32>,
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
fn vertexMain(@location(0) position: vec3<f32>) -> VertexOut {
  var out: VertexOut;
  out.position = uniforms.mvp * vec4<f32>(position, 1.0);
  out.world = position;
  let theta = acos(clamp(position.y, 0.0, 1.0));
  let radial = theta / HALF_PI;
  out.domeMap = vec3<f32>(position.x * radial, -position.z * radial, theta);
  return out;
}

fn rotateX(v: vec3<f32>, angle: f32) -> vec3<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec3<f32>(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}

fn projectionRadius(theta: f32) -> f32 {
  let normalized = clamp(theta / HALF_PI, 0.0, 1.0);
  if (uniforms.projectionMode < 0.5) {
    return normalized;
  }
  if (uniforms.projectionMode < 1.5) {
    return sin(theta * 0.5) / sin(HALF_PI * 0.5);
  }
  if (uniforms.projectionMode < 2.5) {
    return sin(theta);
  }
  if (uniforms.projectionMode < 3.5) {
    return tan(theta * 0.5);
  }
  return pow(normalized, max(uniforms.customCurve, 0.05));
}

fn gridLine(value: f32, interval: f32, widthFactor: f32) -> f32 {
  let dist = abs(fract(value / interval + 0.5) - 0.5) * interval;
  let width = max(fwidth(value) * widthFactor, 0.0015);
  return 1.0 - smoothstep(0.0, width, dist);
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4<f32> {
  let physicalDir = normalize(in.world);
  if (uniforms.cutaway > 0.5 && physicalDir.x < -0.025) {
    discard;
  }

  let useFastMap = uniforms.fastMap > 0.5;
  var theta: f32;
  var azimuth: f32;
  var uv: vec2<f32>;

  if (useFastMap) {
    theta = in.domeMap.z;
    let base = vec2<f32>(
      select(in.domeMap.x, -in.domeMap.x, uniforms.mirror > 0.5),
      in.domeMap.y
    );
    let c = cos(uniforms.rotation);
    let s = sin(uniforms.rotation);
    let rotated = vec2<f32>(base.x * c - base.y * s, base.x * s + base.y * c);
    uv = vec2<f32>(0.5, 0.5) + rotated * uniforms.fisheyeScale;
    azimuth = atan2(rotated.x, -rotated.y);
  } else {
    let dir = normalize(rotateX(physicalDir, uniforms.domeTilt));
    theta = acos(clamp(dir.y, 0.0, 1.0));
    azimuth = atan2(dir.x, dir.z);
    if (uniforms.mirror > 0.5) {
      azimuth = -azimuth;
    }
    azimuth = azimuth + uniforms.rotation;
    let radial = clamp(projectionRadius(theta), 0.0, 1.0);
    uv = vec2<f32>(0.5, 0.5) +
      vec2<f32>(sin(azimuth) * uniforms.fisheyeScale.x, -cos(azimuth) * uniforms.fisheyeScale.y) * radial;
  }

  var color = textureSample(domeTexture, domeSampler, uv).rgb * uniforms.exposure;
  let shell = mix(1.0, 0.66 + 0.34 * smoothstep(0.0, 1.0, physicalDir.y), uniforms.shellShade);
  color = color * shell;

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
  projectionMode: f32,
  customCurve: f32,
  cutaway: f32,
  showRings: f32,
  showSpokes: f32,
  showHorizon: f32,
  showZenith: f32,
  showSourceCircle: f32,
  shellShade: f32,
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

fn inverseProjectionRadius(radial: f32) -> f32 {
  let r = clamp(radial, 0.0, 1.0);
  if (uniforms.projectionMode < 0.5) {
    return r * HALF_PI;
  }
  if (uniforms.projectionMode < 1.5) {
    return 2.0 * asin(clamp(r * sin(HALF_PI * 0.5), 0.0, 1.0));
  }
  if (uniforms.projectionMode < 2.5) {
    return asin(clamp(r, 0.0, 1.0));
  }
  if (uniforms.projectionMode < 3.5) {
    return 2.0 * atan(r);
  }
  return pow(r, 1.0 / max(uniforms.customCurve, 0.05)) * HALF_PI;
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4<f32> {
  let normalized = vec2<f32>(
    (in.uv.x - 0.5) / max(uniforms.fisheyeScale.x, 0.0001),
    (in.uv.y - 0.5) / max(uniforms.fisheyeScale.y, 0.0001)
  );
  let radius = length(normalized);
  let insideMask = step(radius, 1.0);
  let sampleUv = rotate2d(in.uv - vec2<f32>(0.5, 0.5), uniforms.rotation) + vec2<f32>(0.5, 0.5);
  let sampledColor = textureSample(domeTexture, domeSampler, sampleUv).rgb * uniforms.exposure;
  var color = select(sampledColor, vec3<f32>(0.0, 0.0, 0.0), radius > 1.0);
  let theta = inverseProjectionRadius(radius);
  let angle = atan2(normalized.x, -normalized.y) + uniforms.rotation;

  let ring = lineAt(theta, HALF_PI / 6.0, 1.4) * insideMask * uniforms.showRings;
  let spoke = lineAt(angle, PI / 12.0, 1.4) * insideMask * uniforms.showSpokes;
  let sourceCircle = (1.0 - smoothstep(0.002, 0.012 + fwidth(radius) * 2.0, abs(radius - 1.0))) * insideMask * uniforms.showSourceCircle;
  let overlay = clamp(max(max(ring * 0.4, spoke * 0.38), sourceCircle) * uniforms.overlayOpacity, 0.0, 0.82);
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
