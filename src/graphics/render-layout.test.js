import { describe, expect, test } from "vitest";
import { containRect, getCssLayout, getRenderLayout, reviewSafeLeft } from "./render-layout.js";

const options = {
  viewMode: "split",
  sourceWidth: 2048,
  sourceHeight: 2048,
  panelHidden: false,
  canvasClientWidth: 1200,
  dpr: 2,
};

describe("render layout", () => {
  test("reserves side panel space only on wide visible panels", () => {
    expect(reviewSafeLeft(2400, options)).toBe(768);
    expect(reviewSafeLeft(2400, { ...options, panelHidden: true })).toBe(0);
    expect(reviewSafeLeft(1600, { ...options, canvasClientWidth: 800 })).toBe(0);
  });

  test("builds matching split layout in device and css pixels", () => {
    const render = getRenderLayout(2400, 1200, options);
    expect(render.fullRect).toEqual({ x: 0, y: 0, width: 2400, height: 1200 });
    expect(render.flatRect.width).toBe(render.flatRect.height);
    expect(render.domeRect.x).toBe(render.splitX);

    const css = getCssLayout(1200, 600, options);
    expect(css.flatRect.width).toBe(css.flatRect.height);
    expect(css.domePane.x).toBe(css.splitX);
    expect(Math.abs(css.splitX * options.dpr - render.splitX)).toBeLessThanOrEqual(1);
  });

  test("contains source aspect with padding", () => {
    expect(containRect({ x: 10, y: 20, width: 400, height: 200 }, 2, 20)).toEqual({
      x: 50,
      y: 40,
      width: 320,
      height: 160,
    });
  });
});
