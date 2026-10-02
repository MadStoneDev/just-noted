import { describe, it, expect } from "vitest";
import { imageDimensions } from "./image-meta";

describe("imageDimensions (spec §8.3 og:image)", () => {
  it("reads PNG IHDR", () => {
    const b = Buffer.alloc(24);
    b.writeUInt32BE(0x89504e47, 0);
    b.writeUInt32BE(0x0d0a1a0a, 4);
    b.write("IHDR", 12, "ascii");
    b.writeUInt32BE(1200, 16);
    b.writeUInt32BE(630, 20);
    expect(imageDimensions(b)).toEqual({ width: 1200, height: 630, format: "png" });
  });
  it("reads GIF logical screen descriptor", () => {
    const b = Buffer.alloc(10);
    b.write("GIF89a", 0, "ascii");
    b.writeUInt16LE(800, 6);
    b.writeUInt16LE(418, 8);
    expect(imageDimensions(b)).toEqual({ width: 800, height: 418, format: "gif" });
  });
  it("reads JPEG SOF0", () => {
    const b = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x76, 0x04, 0xb0, 0x03, 0x01, 0x22]);
    // height = 0x0276 = 630, width = 0x04b0 = 1200
    expect(imageDimensions(b)).toEqual({ width: 1200, height: 630, format: "jpeg" });
  });
  it("reads WebP VP8X canvas size", () => {
    const b = Buffer.alloc(30);
    b.write("RIFF", 0, "ascii");
    b.write("WEBP", 8, "ascii");
    b.write("VP8X", 12, "ascii");
    const w = 1200 - 1, h = 630 - 1;
    b[24] = w & 0xff; b[25] = (w >> 8) & 0xff; b[26] = (w >> 16) & 0xff;
    b[27] = h & 0xff; b[28] = (h >> 8) & 0xff; b[29] = (h >> 16) & 0xff;
    expect(imageDimensions(b)).toEqual({ width: 1200, height: 630, format: "webp" });
  });
  it("recognises SVG and reads width/height attrs", () => {
    const b = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"></svg>`);
    expect(imageDimensions(b)).toEqual({ width: 1200, height: 630, format: "svg" });
  });
  it("returns null for non-images", () => {
    expect(imageDimensions(Buffer.from("not an image"))).toBeNull();
    expect(imageDimensions(Buffer.alloc(2))).toBeNull();
  });
});
