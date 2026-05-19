import { HALF_PI, TAU } from "../projection.js";

type GeometryBuffers = { vertices: Float32Array; indices: Uint32Array };

export function buildDomeGeometry(quality: number): GeometryBuffers {
  const rings = [64, 112, 176][quality] ?? 112;
  const segments = [128, 224, 352][quality] ?? 224;
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let ring = 0; ring <= rings; ring += 1) {
    const theta = (ring / rings) * HALF_PI;
    const sinTheta = Math.sin(theta);
    const y = Math.cos(theta);

    for (let segment = 0; segment <= segments; segment += 1) {
      const phi = (segment / segments) * TAU;
      vertices.push(sinTheta * Math.sin(phi), y, sinTheta * Math.cos(phi));
    }
  }

  for (let ring = 0; ring < rings; ring += 1) {
    const row = ring * (segments + 1);
    const nextRow = (ring + 1) * (segments + 1);

    for (let segment = 0; segment < segments; segment += 1) {
      const a = row + segment;
      const b = row + segment + 1;
      const c = nextRow + segment;
      const d = nextRow + segment + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  };
}

export function buildRoomGeometry(segments = 160): GeometryBuffers {
  const vertices = [0, 0, 0];
  const indices: number[] = [];

  for (let segment = 0; segment <= segments; segment += 1) {
    const angle = (segment / segments) * TAU;
    vertices.push(Math.sin(angle), 0, Math.cos(angle));
  }

  for (let segment = 1; segment <= segments; segment += 1) {
    indices.push(0, segment, segment + 1);
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  };
}
