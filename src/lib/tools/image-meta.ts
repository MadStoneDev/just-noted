// Read an image's pixel dimensions from its header bytes (spec §8.3 og:image).
// Pure and testable. Handles the formats OG cards use — PNG, JPEG, GIF, WebP —
// and recognises SVG (vector, no fixed pixel size). Returns null if it can't
// determine dimensions from the bytes it was given.

export interface ImageDimensions {
  width: number;
  height: number;
  format: "png" | "jpeg" | "gif" | "webp" | "svg";
}

export function imageDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 4) return null;

  // PNG: \x89PNG\r\n\x1a\n, IHDR width/height are big-endian at offset 16/20.
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: "png" };
  }

  // GIF: "GIF87a"/"GIF89a", width/height little-endian at offset 6/8.
  if (buf.length >= 10 && buf.toString("ascii", 0, 3) === "GIF") {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), format: "gif" };
  }

  // JPEG: starts FFD8; scan segments for a Start-Of-Frame marker.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const dims = jpegDimensions(buf);
    if (dims) return { ...dims, format: "jpeg" };
    return null;
  }

  // WebP: "RIFF"...."WEBP" then a VP8 / VP8L / VP8X chunk.
  if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const dims = webpDimensions(buf);
    if (dims) return { ...dims, format: "webp" };
    return null;
  }

  // SVG: text; treat as a vector image (dimension checks don't apply).
  const head = buf.toString("utf8", 0, Math.min(buf.length, 256)).trimStart().toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg")) {
    const text = buf.toString("utf8", 0, Math.min(buf.length, 2048));
    const w = text.match(/\bwidth\s*=\s*["']?\s*(\d+(?:\.\d+)?)/i);
    const h = text.match(/\bheight\s*=\s*["']?\s*(\d+(?:\.\d+)?)/i);
    return { width: w ? Math.round(Number(w[1])) : 0, height: h ? Math.round(Number(h[1])) : 0, format: "svg" };
  }

  return null;
}

function jpegDimensions(buf: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    // SOF0–SOF3, SOF5–SOF7, SOF9–SOF11, SOF13–SOF15 carry the dimensions.
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      return { width, height };
    }
    // Standalone markers (no length): RSTn, SOI, EOI, TEM.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

function webpDimensions(buf: Buffer): { width: number; height: number } | null {
  const fourcc = buf.toString("ascii", 12, 16);
  if (fourcc === "VP8X") {
    // 24-bit little-endian (value - 1) at offsets 24 (width) and 27 (height).
    const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return { width, height };
  }
  if (fourcc === "VP8 ") {
    // Lossy: 14-bit dimensions at offset 26/28 after the start code.
    if (buf.length < 30) return null;
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }
  if (fourcc === "VP8L") {
    // Lossless: 14-bit each, packed after the 0x2f signature byte at offset 20.
    if (buf.length < 25 || buf[20] !== 0x2f) return null;
    const b = buf.readUInt32LE(21);
    const width = (b & 0x3fff) + 1;
    const height = ((b >> 14) & 0x3fff) + 1;
    return { width, height };
  }
  return null;
}
