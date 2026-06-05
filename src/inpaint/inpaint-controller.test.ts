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

  it("sends green guide fill inside the source circle, black outside, and preserves plate pixels", () => {
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

    expect(pixelAt(white.pixels, 100, 50, 50)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(mask.pixels, 100, 50, 50)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(white.pixels, 100, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(mask.pixels, 100, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(white.pixels, 100, 50, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(white.pixels, 100, 50, 25)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(white.pixels, 100, 50, 33)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(white.pixels, 100, 70, 50)).toEqual([10, 20, 30, 255]);
    expect(pixelAt(mask.pixels, 100, 70, 50)).toEqual([0, 0, 0, 255]);
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
