import { afterEach, describe, expect, it, vi } from "vitest";
import { createInpaintHandoffCanvases } from "./inpaint-handoff.js";

type FakeImageData = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

class FakeCanvas {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;

  constructor(width = 0, height = 0, pixels: number[] | Uint8ClampedArray = []) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8ClampedArray(pixels);
  }

  getContext() {
    return {
      getImageData: (_x: number, _y: number, width: number, height: number): FakeImageData => ({
        width,
        height,
        data: new Uint8ClampedArray(this.pixels),
      }),
      createImageData: (width: number, height: number): FakeImageData => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      }),
      putImageData: (image: FakeImageData) => {
        this.width = image.width;
        this.height = image.height;
        this.pixels = new Uint8ClampedArray(image.data);
      },
    };
  }
}

describe("createInpaintHandoffCanvases", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends semantic dome guide fill inside the source circle, black outside, and preserves plate pixels", () => {
    vi.stubGlobal("document", {
      createElement: (tagName: string) => {
        if (tagName !== "canvas") throw new Error(`Unexpected element: ${tagName}`);
        return new FakeCanvas();
      },
    });
    const pixels = new Uint8ClampedArray(100 * 100 * 4);
    setPixel(pixels, 100, 70, 50, [10, 20, 30, 255]);
    const source = new FakeCanvas(100, 100, pixels);

    const handoff = createInpaintHandoffCanvases(source as unknown as HTMLCanvasElement, {
      sourceProjectionMode: "zenith-180",
    });
    const white = handoff.white as unknown as FakeCanvas;
    const mask = handoff.mask as unknown as FakeCanvas;

    expect(pixelAt(white.pixels, 100, 50, 50)).toEqual([0, 222, 255, 255]);
    expect(pixelAt(mask.pixels, 100, 50, 50)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(white.pixels, 100, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(mask.pixels, 100, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(white.pixels, 100, 50, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(white.pixels, 100, 50, 35)).toEqual([0, 222, 255, 255]);
    expect(pixelAt(white.pixels, 100, 50, 25)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(white.pixels, 100, 50, 33)).toEqual([0, 0, 0, 255]);
    let sampledHorizonZone = false;
    for (let y = 42; y <= 58; y += 1) {
      for (let x = 76; x <= 84; x += 1) {
        const pixel = pixelAt(white.pixels, 100, x, y);
        sampledHorizonZone ||= pixel[1] > 230 && pixel[2] > 120 && pixel[2] < 210;
      }
    }
    expect(sampledHorizonZone).toBe(true);
    expect(pixelAt(white.pixels, 100, 70, 50)).toEqual([10, 20, 30, 255]);
    expect(pixelAt(mask.pixels, 100, 70, 50)).toEqual([0, 0, 0, 255]);
  });

  it("separates zenith 230 sky, horizon, and lower-world annulus guide fill", () => {
    vi.stubGlobal("document", {
      createElement: (tagName: string) => {
        if (tagName !== "canvas") throw new Error(`Unexpected element: ${tagName}`);
        return new FakeCanvas();
      },
    });
    const source = new FakeCanvas(100, 100, new Uint8ClampedArray(100 * 100 * 4));

    const handoff = createInpaintHandoffCanvases(source as unknown as HTMLCanvasElement, {
      sourceProjectionMode: "zenith-230",
    });
    const white = handoff.white as unknown as FakeCanvas;

    let sampledSkyZone = false;
    let sampledHorizonZone = false;
    let sampledFloorZone = false;
    for (let y = 6; y <= 20; y += 1) {
      for (let x = 42; x <= 58; x += 1) {
        const pixel = pixelAt(white.pixels, 100, x, y);
        sampledFloorZone ||= pixel[1] > 200 && pixel[2] < 80;
      }
    }
    for (let y = 42; y <= 58; y += 1) {
      for (let x = 42; x <= 58; x += 1) {
        const pixel = pixelAt(white.pixels, 100, x, y);
        sampledSkyZone ||= pixel[1] > 120 && pixel[2] > 180;
      }
    }
    for (let y = 42; y <= 58; y += 1) {
      for (let x = 76; x <= 84; x += 1) {
        const pixel = pixelAt(white.pixels, 100, x, y);
        sampledHorizonZone ||= pixel[1] > 230 && pixel[2] > 120 && pixel[2] < 210;
      }
    }
    expect(sampledSkyZone).toBe(true);
    expect(sampledHorizonZone).toBe(true);
    expect(sampledFloorZone).toBe(true);
  });

  it("keeps nadir floor in the center and marks a horizon allowance rim", () => {
    vi.stubGlobal("document", {
      createElement: (tagName: string) => {
        if (tagName !== "canvas") throw new Error(`Unexpected element: ${tagName}`);
        return new FakeCanvas();
      },
    });
    const source = new FakeCanvas(100, 100, new Uint8ClampedArray(100 * 100 * 4));

    const handoff = createInpaintHandoffCanvases(source as unknown as HTMLCanvasElement, {
      sourceProjectionMode: "nadir-180",
    });
    const white = handoff.white as unknown as FakeCanvas;

    expect(pixelAt(white.pixels, 100, 50, 50)).toEqual([0, 255, 0, 255]);
    let sampledHorizonRim = false;
    for (let y = 2; y <= 8; y += 1) {
      for (let x = 42; x <= 58; x += 1) {
        const pixel = pixelAt(white.pixels, 100, x, y);
        sampledHorizonRim ||= pixel[1] > 220 && pixel[2] > 120 && pixel[2] < 210;
      }
    }
    expect(sampledHorizonRim).toBe(true);
  });

  it("uses the full square as the CAVE 270 continuity carrier", () => {
    vi.stubGlobal("document", {
      createElement: (tagName: string) => {
        if (tagName !== "canvas") throw new Error(`Unexpected element: ${tagName}`);
        return new FakeCanvas();
      },
    });
    const source = new FakeCanvas(100, 100, new Uint8ClampedArray(100 * 100 * 4));

    const handoff = createInpaintHandoffCanvases(source as unknown as HTMLCanvasElement, {
      sourceProjectionMode: "cave-270",
    });
    const white = handoff.white as unknown as FakeCanvas;
    const mask = handoff.mask as unknown as FakeCanvas;

    expect(pixelAt(mask.pixels, 100, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(mask.pixels, 100, 50, 50)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(white.pixels, 100, 50, 25)).toEqual([0, 0, 0, 255]);
    let sampledWallZone = false;
    for (let y = 10; y <= 20; y += 1) {
      for (let x = 55; x <= 70; x += 1) {
        const wallGuide = pixelAt(white.pixels, 100, x, y);
        sampledWallZone ||= wallGuide[1] > 80 && wallGuide[1] < 255 && wallGuide[2] > 180;
      }
    }
    expect(sampledWallZone).toBe(true);
  });
});

function setPixel(data: Uint8ClampedArray, width: number, x: number, y: number, rgba: [number, number, number, number]) {
  const index = (y * width + x) * 4;
  data[index] = rgba[0];
  data[index + 1] = rgba[1];
  data[index + 2] = rgba[2];
  data[index + 3] = rgba[3];
}

function pixelAt(data: Uint8ClampedArray, width: number, x: number, y: number): [number, number, number, number] {
  const index = (y * width + x) * 4;
  return [data[index], data[index + 1], data[index + 2], data[index + 3]];
}
