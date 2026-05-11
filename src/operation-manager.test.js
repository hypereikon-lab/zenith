import { describe, expect, test } from "vitest";
import { OperationManager, StaleOperationError, isStaleOperationError } from "./operation-manager.js";

describe("OperationManager", () => {
  test("supersedes older operations in the same scope", () => {
    const manager = new OperationManager();
    const first = manager.start("runway", "source-a");
    const second = manager.start("runway", "source-a");

    expect(first.signal.aborted).toBe(true);
    expect(manager.isCurrent(first)).toBe(false);
    expect(manager.isCurrent(second)).toBe(true);
  });

  test("rejects completion when the source fingerprint changed", () => {
    const manager = new OperationManager();
    const token = manager.start("task", "source-a");

    expect(() => manager.assertCurrent(token, "source-b")).toThrow(StaleOperationError);
    expect(isStaleOperationError(token.signal.reason)).toBe(false);
  });

  test("finish only clears the matching active operation", () => {
    const manager = new OperationManager();
    const first = manager.start("inpaint", "a");
    const second = manager.start("inpaint", "b");

    manager.finish(first);
    expect(manager.isCurrent(second)).toBe(true);

    manager.finish(second);
    expect(manager.isCurrent(second)).toBe(false);
  });
});
