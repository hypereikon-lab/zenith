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
  sourceCarrierSplit: f32,
  sourceCarrierHorizon: f32,
  sourceCenterTheta: vec4<f32>,
  sourceRight: vec4<f32>,
  sourceUp: vec4<f32>,
  showCaveMask: f32,
  cameraPosX: f32,
  cameraPosY: f32,
  cameraPosZ: f32,
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

fn physicalRadiusToCarrierRadius(physicalRadius: f32, thetaMax: f32) -> f32 {
  let split = clamp(uniforms.sourceCarrierSplit, 0.18, 0.72);
  let horizon = clamp(HALF_PI / max(thetaMax, 0.0001), 0.0001, 1.0);
  let semanticPhysical = clamp(horizon * 0.5, 0.0001, max(horizon - 0.0001, 0.0001));
  let carrierHorizon = select(1.0, clamp(uniforms.sourceCarrierHorizon, split + 0.0001, 0.9999), horizon < 0.999);
  let radius = clamp(physicalRadius, 0.0, 1.0);
  if (radius <= semanticPhysical) {
    return (radius / max(semanticPhysical, 0.0001)) * split;
  }
  if (radius <= horizon) {
    return split + ((radius - semanticPhysical) / max(horizon - semanticPhysical, 0.0001)) * (carrierHorizon - split);
  }
  return carrierHorizon + ((radius - horizon) / max(1.0 - horizon, 0.0001)) * (1.0 - carrierHorizon);
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
  let physicalRadial = theta / thetaMax;
  let radial = physicalRadiusToCarrierRadius(physicalRadial, thetaMax);
  var local = vec2<f32>(0.0, 0.0);
  if (theta > 0.000001) {
    let tangent = normalize(sourceDir - center * centerDot);
    local = vec2<f32>(dot(tangent, uniforms.sourceRight.xyz), dot(tangent, uniforms.sourceUp.xyz));
  }
  let uv = vec2<f32>(0.5, 0.5) +
    vec2<f32>(local.x * uniforms.fisheyeScale.x, -local.y * uniforms.fisheyeScale.y) * radial;
  return vec3<f32>(uv, select(0.0, 1.0, physicalRadial <= 1.0001));
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4<f32> {
  if (uniforms.showCaveMask > 0.5) {
    let px = u32(in.position.x);
    let py = u32(in.position.y);
    let cx = px % 2u;
    let cy = py % 2u;
    let isFirstPixel = cx == 0u && cy == 0u;
    if (uniforms.showCaveMask > 1.5) {
      if (isFirstPixel) {
        discard;
      }
    } else {
      if (!isFirstPixel) {
        discard;
      }
    }
  }

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
  let thetaMax = max(uniforms.sourceCenterTheta.w, 0.0001);
  let split = clamp(uniforms.sourceCarrierSplit, 0.18, 0.72);
  let horizon = clamp(HALF_PI / thetaMax, 0.0001, 1.0);
  let semanticPhysical = clamp(horizon * 0.5, 0.0001, max(horizon - 0.0001, 0.0001));

  let centerLine = (1.0 - smoothstep(0.0, 0.022 + fwidth(theta) * 2.0, theta)) * uniforms.showZenith;
  let splitLine = (1.0 - smoothstep(0.002, 0.012 + fwidth(theta) * 2.0, abs(theta - semanticPhysical * thetaMax))) * uniforms.showHorizon;
  let horizonLine = (1.0 - smoothstep(0.002, 0.012 + fwidth(theta) * 2.0, abs(theta - horizon * thetaMax))) * uniforms.showHorizon;
  let boundaryLine = (1.0 - smoothstep(0.002, 0.012 + fwidth(theta) * 2.0, abs(theta - thetaMax))) * uniforms.showSourceCircle;

  let rings = max(
    max(
      (1.0 - smoothstep(0.002, 0.012 + fwidth(theta) * 2.0, abs(theta - semanticPhysical * 0.5 * thetaMax))) * uniforms.showRings,
      (1.0 - smoothstep(0.002, 0.012 + fwidth(theta) * 2.0, abs(theta - mix(semanticPhysical, horizon, 0.5) * thetaMax))) * uniforms.showRings
    ),
    (1.0 - smoothstep(0.002, 0.012 + fwidth(theta) * 2.0, abs(theta - mix(horizon, 1.0, 0.5) * thetaMax))) * uniforms.showRings
  ) * 0.44;

  let spokes = gridLine(azimuth, PI / 12.0, 1.35) * uniforms.showSpokes * 0.42;

  let overlay = clamp(max(max(max(max(max(centerLine, splitLine), horizonLine), boundaryLine), rings), spokes) * uniforms.overlayOpacity, 0.0, 0.82);
  color = mix(color, vec3<f32>(0.78, 0.96, 1.0), overlay);
  color = color + vec3<f32>(0.08, 0.12, 0.13) * horizonLine * uniforms.shellShade;

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
  sourceCarrierSplit: f32,
  sourceCarrierHorizon: f32,
  sourceCenterTheta: vec4<f32>,
  sourceRight: vec4<f32>,
  sourceUp: vec4<f32>,
  showCaveMask: f32,
  cameraPosX: f32,
  cameraPosY: f32,
  cameraPosZ: f32,
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

fn caveCarrierRho(uv: vec2<f32>) -> f32 {
  let local = abs((uv - vec2<f32>(0.5)) * 2.0);
  return max(local.x, local.y);
}

fn caveCarrierRayAngle(uv: vec2<f32>) -> f32 {
  let local = (uv - vec2<f32>(0.5)) * vec2<f32>(2.0, -2.0);
  return atan2(local.x, local.y);
}

fn carrierRadiusToPhysicalRadius(carrierRadius: f32, thetaMax: f32) -> f32 {
  let split = clamp(uniforms.sourceCarrierSplit, 0.18, 0.72);
  let horizon = clamp(HALF_PI / max(thetaMax, 0.0001), 0.0001, 1.0);
  let semanticPhysical = clamp(horizon * 0.5, 0.0001, max(horizon - 0.0001, 0.0001));
  let carrierHorizon = select(1.0, clamp(uniforms.sourceCarrierHorizon, split + 0.0001, 0.9999), horizon < 0.999);
  let radius = clamp(carrierRadius, 0.0, 1.0);
  if (radius <= split) {
    return (radius / max(split, 0.0001)) * semanticPhysical;
  }
  if (radius <= carrierHorizon) {
    return semanticPhysical + ((radius - split) / max(carrierHorizon - split, 0.0001)) * (horizon - semanticPhysical);
  }
  return horizon + ((radius - carrierHorizon) / max(1.0 - carrierHorizon, 0.0001)) * (1.0 - horizon);
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4<f32> {
  if (uniforms.sourceCenterTheta.w < 0.0) {
    let sampledColor = textureSample(domeTexture, domeSampler, in.uv).rgb * uniforms.exposure;
    var color = sampledColor;
    let rho = caveCarrierRho(in.uv);
    let floorBand = abs(uniforms.sourceCenterTheta.w);
    let horizonBand = clamp(uniforms.sourceCarrierHorizon, floorBand + 0.0001, 0.9999);
    let rayAngle = caveCarrierRayAngle(in.uv);
    let center = (1.0 - smoothstep(0.0, 0.018 + fwidth(rho) * 2.0, rho)) * uniforms.showZenith;
    let floorSeam = (1.0 - smoothstep(0.002, 0.012 + fwidth(rho) * 2.0, abs(rho - floorBand))) * uniforms.showHorizon;
    let eyeHorizon = (1.0 - smoothstep(0.002, 0.012 + fwidth(rho) * 2.0, abs(rho - horizonBand))) * uniforms.showHorizon;
    let boundary = (1.0 - smoothstep(0.002, 0.012 + fwidth(rho) * 2.0, abs(rho - 1.0))) * uniforms.showSourceCircle;
    let wallMask = smoothstep(floorBand + 0.015, floorBand + 0.055, rho);
    let rings = max(
      (1.0 - smoothstep(0.002, 0.012 + fwidth(rho) * 2.0, abs(rho - mix(floorBand, horizonBand, 0.5)))) * uniforms.showRings,
      (1.0 - smoothstep(0.002, 0.012 + fwidth(rho) * 2.0, abs(rho - mix(horizonBand, 1.0, 0.5)))) * uniforms.showRings
    ) * 0.44;
    let spokes = lineAt(rayAngle, PI / 6.0, 1.35) * wallMask * uniforms.showSpokes * 0.42;
    let overlay = clamp(max(max(max(max(max(center, floorSeam), eyeHorizon), boundary), rings), spokes) * uniforms.overlayOpacity, 0.0, 0.82);
    color = mix(color, vec3<f32>(0.78, 0.96, 1.0), overlay);
    return vec4<f32>(color, 1.0);
  }

  let fisheyeScale = max(uniforms.fisheyeScale, vec2<f32>(0.0001));
  let normalized = (in.uv - vec2<f32>(0.5, 0.5)) / fisheyeScale;
  let radius = length(normalized);
  let insideMask = step(radius, 1.0);
  let rotatedSample = rotate2d(normalized, uniforms.rotation);
  let sampleUv = vec2<f32>(0.5, 0.5) + rotatedSample * fisheyeScale;
  let sampledColor = textureSample(domeTexture, domeSampler, sampleUv).rgb * uniforms.exposure;
  var color = select(sampledColor, vec3<f32>(0.0, 0.0, 0.0), radius > 1.0);
  let theta = carrierRadiusToPhysicalRadius(radius, max(uniforms.sourceCenterTheta.w, 0.0001)) *
    max(uniforms.sourceCenterTheta.w, 0.0001);
  let angle = atan2(normalized.x, -normalized.y) + uniforms.rotation;

  let split = clamp(uniforms.sourceCarrierSplit, 0.18, 0.72);
  let splitLine = (1.0 - smoothstep(0.002, 0.012 + fwidth(radius) * 2.0, abs(radius - split))) * insideMask * uniforms.showHorizon;

  let ring = lineAt(theta, PI / 12.0, 1.4) * insideMask * uniforms.showRings;
  let spoke = lineAt(angle, PI / 12.0, 1.4) * insideMask * uniforms.showSpokes;
  let horizon = (1.0 - smoothstep(0.002, 0.01 + fwidth(theta) * 2.0, abs(theta - HALF_PI))) * insideMask * uniforms.showHorizon;
  let sourceCircle = (1.0 - smoothstep(0.002, 0.012 + fwidth(radius) * 2.0, abs(radius - 1.0))) * insideMask * uniforms.showSourceCircle;
  let overlay = clamp(max(max(max(max(ring * 0.4, spoke * 0.38), horizon), sourceCircle), splitLine) * uniforms.overlayOpacity, 0.0, 0.82);
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
  sourceCarrierSplit: f32,
  sourceCarrierHorizon: f32,
  sourceCenterTheta: vec4<f32>,
  sourceRight: vec4<f32>,
  sourceUp: vec4<f32>,
  showCaveMask: f32,
  cameraPosX: f32,
  cameraPosY: f32,
  cameraPosZ: f32,
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

fn physicalRadiusToCarrierRadius(physicalRadius: f32, thetaMax: f32) -> f32 {
  let split = clamp(uniforms.sourceCarrierSplit, 0.18, 0.72);
  let horizon = clamp(HALF_PI / max(thetaMax, 0.0001), 0.0001, 1.0);
  let semanticPhysical = clamp(horizon * 0.5, 0.0001, max(horizon - 0.0001, 0.0001));
  let carrierHorizon = select(1.0, clamp(uniforms.sourceCarrierHorizon, split + 0.0001, 0.9999), horizon < 0.999);
  let radius = clamp(physicalRadius, 0.0, 1.0);
  if (radius <= semanticPhysical) {
    return (radius / max(semanticPhysical, 0.0001)) * split;
  }
  if (radius <= horizon) {
    return split + ((radius - semanticPhysical) / max(horizon - semanticPhysical, 0.0001)) * (carrierHorizon - split);
  }
  return carrierHorizon + ((radius - horizon) / max(1.0 - horizon, 0.0001)) * (1.0 - carrierHorizon);
}

fn caveWallPointFromPerimeterAngle(angle: f32) -> vec2<f32> {
  let halfWidth = 2.0;
  let halfDepth = 2.0;
  let perimeter = 16.0;
  let raw = (angle / (2.0 * PI)) * perimeter + halfWidth;
  let wrapped = raw - floor(raw / perimeter) * perimeter;
  if (wrapped <= 4.0) {
    return vec2<f32>(wrapped - halfWidth, halfDepth);
  }
  if (wrapped <= 8.0) {
    return vec2<f32>(halfWidth, halfDepth - (wrapped - 4.0));
  }
  if (wrapped <= 12.0) {
    return vec2<f32>(halfWidth - (wrapped - 8.0), -halfDepth);
  }
  return vec2<f32>(-halfWidth, -halfDepth + (wrapped - 12.0));
}

fn caveFloorBoundaryPointForRay(xz: vec2<f32>) -> vec2<f32> {
  let halfSize = vec2<f32>(2.0, 2.0);
  let scaleX = select(999999.0, halfSize.x / abs(xz.x), abs(xz.x) > 0.000001);
  let scaleZ = select(999999.0, halfSize.y / abs(xz.y), abs(xz.y) > 0.000001);
  return xz * min(scaleX, scaleZ);
}

fn caveWallPerimeterAngleFromBoundary(boundary: vec2<f32>) -> f32 {
  let halfWidth = 2.0;
  let halfDepth = 2.0;
  var distance = 0.0;
  if (abs(boundary.y - halfDepth) <= 0.0001) {
    distance = boundary.x + halfWidth;
  } else if (abs(boundary.x - halfWidth) <= 0.0001) {
    distance = 4.0 + (halfDepth - boundary.y);
  } else if (abs(boundary.y + halfDepth) <= 0.0001) {
    distance = 8.0 + (halfWidth - boundary.x);
  } else {
    distance = 12.0 + (boundary.y + halfDepth);
  }
  return ((distance - halfWidth) / 16.0) * 2.0 * PI;
}

fn caveFloorContinuityDirection(point: vec3<f32>) -> vec3<f32> {
  let distance = length(point.xz);
  if (distance <= 0.000001) {
    return vec3<f32>(0.0, -1.0, 0.0);
  }
  let boundary = caveFloorBoundaryPointForRay(point.xz);
  let angle = caveWallPerimeterAngleFromBoundary(boundary);
  let boundaryDistance = max(length(boundary), 0.000001);
  let boundaryElevation = atan2(-2.0, boundaryDistance);
  let radiusFraction = clamp(distance / boundaryDistance, 0.0, 1.0);
  let elevation = -HALF_PI + radiusFraction * (boundaryElevation + HALF_PI);
  let cosElevation = cos(elevation);
  return normalize(vec3<f32>(sin(angle) * cosElevation, sin(elevation), cos(angle) * cosElevation));
}

fn caveSurfacePointFromContinuityDirection(direction: vec3<f32>) -> vec3<f32> {
  let dir = normalize(direction);
  let bottom = -2.0;
  let top = 2.0;
  let angle = atan2(dir.x, dir.z);
  let wallPoint = caveWallPointFromPerimeterAngle(angle);
  let horizontalDistance = max(length(wallPoint), 0.000001);
  let horizontalLength = max(length(dir.xz), 0.000001);
  let elevation = atan2(dir.y, horizontalLength);
  let boundaryElevation = atan2(bottom, horizontalDistance);
  if (elevation >= boundaryElevation - 0.0001) {
    let y = clamp(horizontalDistance * (dir.y / horizontalLength), bottom, top);
    return vec3<f32>(wallPoint.x, y, wallPoint.y);
  }
  let denominator = max(boundaryElevation + HALF_PI, 0.000001);
  let radiusFraction = clamp((elevation + HALF_PI) / denominator, 0.0, 1.0);
  return vec3<f32>(wallPoint.x * radiusFraction, bottom, wallPoint.y * radiusFraction);
}

fn caveWallPerimeterFractionFromPoint(point: vec3<f32>) -> f32 {
  let halfWidth = 2.0;
  let halfDepth = 2.0;
  var distance = 0.0;
  if (abs(point.z - halfDepth) <= 0.0001) {
    distance = point.x + halfWidth;
  } else if (abs(point.x - halfWidth) <= 0.0001) {
    distance = 4.0 + (halfDepth - point.z);
  } else if (abs(point.z + halfDepth) <= 0.0001) {
    distance = 8.0 + (halfWidth - point.x);
  } else {
    distance = 12.0 + (point.z + halfDepth);
  }
  return clamp(distance / 16.0, 0.0, 1.0);
}

fn rectangleBoundaryPoint(fraction: f32) -> vec2<f32> {
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

fn caveCarrierUvFromSurfacePoint(point: vec3<f32>) -> vec2<f32> {
  let floorBand = abs(uniforms.sourceCenterTheta.w);
  let horizonBand = clamp(uniforms.sourceCarrierHorizon, floorBand + 0.0001, 0.9999);
  let bottom = -2.0;
  var rho = floorBand;
  var perimeterFraction = 0.125;
  if (abs(point.y - bottom) <= 0.0001) {
    let distance = length(point.xz);
    if (distance <= 0.000001) {
      return vec2<f32>(0.5);
    }
    let boundary = caveFloorBoundaryPointForRay(point.xz);
    perimeterFraction = caveWallPerimeterAngleFromBoundary(boundary) / (2.0 * PI) + 0.125;
    let boundaryDistance = max(length(boundary), 0.000001);
    rho = floorBand * clamp(distance / boundaryDistance, 0.0, 1.0);
  } else {
    perimeterFraction = caveWallPerimeterFractionFromPoint(point);
    let wallT = clamp((point.y - bottom) / 4.0, 0.0, 1.0);
    if (wallT <= 0.5) {
      rho = floorBand + (wallT / 0.5) * (horizonBand - floorBand);
    } else {
      rho = horizonBand + ((wallT - 0.5) / 0.5) * (1.0 - horizonBand);
    }
  }
  let boundaryPoint = rectangleBoundaryPoint(perimeterFraction);
  return vec2<f32>(0.5 + boundaryPoint.x * rho * 0.5, 0.5 - boundaryPoint.y * rho * 0.5);
}

fn caveCarrierSourceSample(sourceDir: vec3<f32>) -> vec3<f32> {
  let point = caveSurfacePointFromContinuityDirection(sourceDir);
  let uv = caveCarrierUvFromSurfacePoint(point);
  return vec3<f32>(uv, 1.0);
}

fn continuityPhysicalDirectionFromCavePoint(point: vec3<f32>, faceUv: vec2<f32>, face: f32) -> vec3<f32> {
  if (face > 3.5) {
    return caveFloorContinuityDirection(point);
  }
  let faceIndex = clamp(floor(face + 0.5), 0.0, 3.0);
  let perimeterU = (faceIndex + clamp(faceUv.x, 0.0, 1.0)) * 0.25;
  let angle = (perimeterU - 0.125) * 2.0 * PI;
  let horizontalDistance = max(length(point.xz), 0.000001);
  let elevation = atan2(point.y, horizontalDistance);
  let cosElevation = cos(elevation);
  return normalize(vec3<f32>(sin(angle) * cosElevation, sin(elevation), cos(angle) * cosElevation));
}

fn sourceSample(sourceDir: vec3<f32>) -> vec3<f32> {
  if (uniforms.sourceCenterTheta.w < 0.0) {
    return caveCarrierSourceSample(sourceDir);
  }

  let center = normalize(uniforms.sourceCenterTheta.xyz);
  let thetaMax = max(uniforms.sourceCenterTheta.w, 0.0001);
  let centerDot = clamp(dot(sourceDir, center), -1.0, 1.0);
  let theta = acos(centerDot);
  let physicalRadial = theta / thetaMax;
  let radial = physicalRadiusToCarrierRadius(physicalRadial, thetaMax);
  var local = vec2<f32>(0.0, 0.0);
  if (theta > 0.000001) {
    let tangent = normalize(sourceDir - center * centerDot);
    local = vec2<f32>(dot(tangent, uniforms.sourceRight.xyz), dot(tangent, uniforms.sourceUp.xyz));
  }
  let uv = vec2<f32>(0.5, 0.5) +
    vec2<f32>(local.x * uniforms.fisheyeScale.x, -local.y * uniforms.fisheyeScale.y) * radial;
  return vec3<f32>(uv, select(0.0, 1.0, physicalRadial <= 1.0001));
}

fn getFaceNormal(face: f32) -> vec3<f32> {
  let faceIndex = clamp(floor(face + 0.5), 0.0, 4.0);
  if (faceIndex == 0.0) {
    return vec3<f32>(0.0, 0.0, -1.0);
  } else if (faceIndex == 1.0) {
    return vec3<f32>(-1.0, 0.0, 0.0);
  } else if (faceIndex == 2.0) {
    return vec3<f32>(0.0, 0.0, 1.0);
  } else if (faceIndex == 3.0) {
    return vec3<f32>(1.0, 0.0, 0.0);
  } else {
    return vec3<f32>(0.0, 1.0, 0.0);
  }
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4<f32> {
  if (uniforms.showCaveMask > 0.5) {
    let cameraPos = vec3<f32>(uniforms.cameraPosX, uniforms.cameraPosY, uniforms.cameraPosZ);
    let viewDir = normalize(in.world - cameraPos);
    let normal = getFaceNormal(in.face);
    if (dot(viewDir, normal) > 0.0) {
      let px = u32(in.position.x);
      let py = u32(in.position.y);
      let cx = px % 2u;
      let cy = py % 2u;
      let isFirstPixel = cx == 0u && cy == 0u;
      if (uniforms.showCaveMask > 1.5) {
        if (isFirstPixel) {
          discard;
        }
      } else {
        if (!isFirstPixel) {
          discard;
        }
      }
    }
  }

  let continuityPhysicalDir = continuityPhysicalDirectionFromCavePoint(in.world, in.faceUv, in.face);
  let sourceDir = sourceDirectionFromPhysical(continuityPhysicalDir);
  let sample = sourceSample(sourceDir);
  let sampledColor = textureSample(domeTexture, domeSampler, clamp(sample.xy, vec2<f32>(0.0), vec2<f32>(1.0))).rgb *
    uniforms.exposure;
  var color = select(vec3<f32>(0.006, 0.008, 0.009), sampledColor, sample.z > 0.5);

  let heightShade = 0.78 + 0.22 * smoothstep(-2.0, 2.0, in.world.y);
  let floorShade = select(1.0, 0.86, in.face > 3.5);
  color = color * mix(1.0, heightShade * floorShade, uniforms.shellShade);

  let yVal = in.world.y;
  let boundaryPt = caveFloorBoundaryPointForRay(in.world.xz);
  let boundaryDistance = max(length(boundaryPt), 0.000001);
  let rhoFloorVal = clamp(length(in.world.xz) / boundaryDistance, 0.0, 1.0);
  let rayAngle = caveWallPerimeterAngleFromBoundary(boundaryPt);

  let fwidthY = fwidth(yVal);
  let fwidthRhoFloor = fwidth(rhoFloorVal);

  let floorBand = abs(uniforms.sourceCenterTheta.w);
  let bottom = -2.0;

  var center = 0.0;
  var floorSeam = 0.0;
  var eyeHorizon = 0.0;
  var boundary = 0.0;
  var rings = 0.0;

  if (in.face > 3.5) {
    center = (1.0 - smoothstep(0.0, 0.018 + fwidthRhoFloor * 2.0, rhoFloorVal)) * uniforms.showZenith;
    floorSeam = (1.0 - smoothstep(0.002, 0.012 + fwidthRhoFloor * 2.0, abs(rhoFloorVal - 1.0))) * uniforms.showHorizon;
    rings = (1.0 - smoothstep(0.002, 0.012 + fwidthRhoFloor * 2.0, abs(rhoFloorVal - 0.5))) * uniforms.showRings * 0.44;
  } else {
    floorSeam = (1.0 - smoothstep(0.002, 0.012 + fwidthY * 2.0, abs(yVal - (-2.0)))) * uniforms.showHorizon;
    eyeHorizon = (1.0 - smoothstep(0.002, 0.012 + fwidthY * 2.0, abs(yVal - 0.0))) * uniforms.showHorizon;
    boundary = (1.0 - smoothstep(0.002, 0.012 + fwidthY * 2.0, abs(yVal - 2.0))) * uniforms.showSourceCircle;

    let ringBelow = (1.0 - smoothstep(0.002, 0.012 + fwidthY * 2.0, abs(yVal - (-1.0)))) * uniforms.showRings;
    let ringAbove = (1.0 - smoothstep(0.002, 0.012 + fwidthY * 2.0, abs(yVal - 1.0))) * uniforms.showRings;
    rings = max(ringBelow, ringAbove) * 0.44;
  }

  // Draw spokes
  let spokes = gridLine(rayAngle, PI / 6.0, 1.35) * select(0.0, 1.0, in.face <= 3.5) * uniforms.showSpokes * 0.42;

  let faceEdge = max(edgeLine(in.faceUv.x), edgeLine(in.faceUv.y)) * 0.35; // keep subtle face boundary lines

  let overlay = clamp(max(max(max(max(max(max(center, floorSeam), eyeHorizon), boundary), rings), spokes), faceEdge) * uniforms.overlayOpacity, 0.0, 0.82);
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
