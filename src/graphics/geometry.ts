import { HALF_PI, TAU } from "../projection.js";

type GeometryBuffers = { vertices: Float32Array; indices: Uint32Array };
type CaveGeometryBuffers = GeometryBuffers & { vertexStrideFloats: number };

export function buildDomeGeometry(quality: number, thetaStart = 0, thetaEnd = HALF_PI): GeometryBuffers {
  const rings = [64, 112, 176][quality] ?? 112;
  const segments = [128, 224, 352][quality] ?? 224;
  const vertices: number[] = [];
  const indices: number[] = [];
  const start = Math.max(0, Math.min(Math.PI, thetaStart));
  const end = Math.max(start, Math.min(Math.PI, thetaEnd));

  for (let ring = 0; ring <= rings; ring += 1) {
    const theta = start + (ring / rings) * (end - start);
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

export function buildCaveRoomGeometry(): CaveGeometryBuffers {
  const halfWidth = 2;
  const halfDepth = 2;
  const eyeHeight = 2;
  const bottom = -eyeHeight;
  const top = 2;
  const vertices: number[] = [];
  const indices: number[] = [];

  addFace(
    vertices,
    indices,
    [
      [-halfWidth, top, halfDepth],
      [halfWidth, top, halfDepth],
      [halfWidth, bottom, halfDepth],
      [-halfWidth, bottom, halfDepth],
    ],
    0,
  );
  addFace(
    vertices,
    indices,
    [
      [halfWidth, top, halfDepth],
      [halfWidth, top, -halfDepth],
      [halfWidth, bottom, -halfDepth],
      [halfWidth, bottom, halfDepth],
    ],
    1,
  );
  addFace(
    vertices,
    indices,
    [
      [halfWidth, top, -halfDepth],
      [-halfWidth, top, -halfDepth],
      [-halfWidth, bottom, -halfDepth],
      [halfWidth, bottom, -halfDepth],
    ],
    2,
  );
  addFace(
    vertices,
    indices,
    [
      [-halfWidth, top, -halfDepth],
      [-halfWidth, top, halfDepth],
      [-halfWidth, bottom, halfDepth],
      [-halfWidth, bottom, -halfDepth],
    ],
    3,
  );
  addFace(
    vertices,
    indices,
    [
      [-halfWidth, bottom, halfDepth],
      [halfWidth, bottom, halfDepth],
      [halfWidth, bottom, -halfDepth],
      [-halfWidth, bottom, -halfDepth],
    ],
    4,
  );

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
    vertexStrideFloats: 6,
  };
}

function addFace(vertices: number[], indices: number[], corners: number[][], faceIndex: number): void {
  const start = vertices.length / 6;
  const uvs = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  for (let index = 0; index < corners.length; index += 1) {
    const corner = corners[index];
    const uv = uvs[index];
    vertices.push(corner[0], corner[1], corner[2], uv[0], uv[1], faceIndex);
  }
  indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}
