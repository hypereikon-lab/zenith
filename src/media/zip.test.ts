import { describe, expect, test } from "vitest";
import { createStoredZip } from "./zip.js";

describe("stored zip creation", () => {
  test("writes local, central directory, and end records for a text entry", async () => {
    const zip = await createStoredZip([{ name: "hello.txt", data: "hello" }]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const text = new TextDecoder().decode(bytes);

    expect(readUint32(bytes, 0)).toBe(0x04034b50);
    expect(text).toContain("hello.txt");
    expect(text).toContain("hello");
    expect(findSignature(bytes, 0x02014b50)).toBeGreaterThan(0);
    expect(findSignature(bytes, 0x06054b50)).toBeGreaterThan(0);
  });
});

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function findSignature(bytes: Uint8Array, signature: number): number {
  for (let offset = 0; offset <= bytes.length - 4; offset += 1) {
    if (readUint32(bytes, offset) === signature) return offset;
  }
  return -1;
}
