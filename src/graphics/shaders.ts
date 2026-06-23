export { caveShaderCode, domeShaderCode, flatShaderCode } from "./projection-preview-shaders.js";

// Legacy compatibility export. Static search shows no active app import; keep it
// quarantined here until a dedicated dead-code removal slice can drop it safely.
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
