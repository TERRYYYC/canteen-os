import { sniffImage } from './endpoints/image.js';
import type { ImageInfo } from './endpoints/image.js';

/** Structural validation, without a pixel decoder: require complete image containers. */
export function inspectImage(bytes: Uint8Array): ImageInfo | null {
  const info = sniffImage(bytes);
  if (!info) return null;
  const valid = info.ext === 'png' ? completePng(bytes)
    : info.ext === 'jpg' ? completeJpeg(bytes) : completeWebp(bytes);
  return valid ? info : null;
}

function uint32(b: Uint8Array, offset: number, little = false): number {
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(offset, little);
}
function tag(b: Uint8Array, offset: number): string {
  return String.fromCharCode(...b.subarray(offset, offset + 4));
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function completePng(b: Uint8Array): boolean {
  let i = 8;
  let data = false;
  while (i + 12 <= b.length) {
    const size = uint32(b, i);
    const end = i + 12 + size;
    if (end > b.length) return false;
    const kind = tag(b, i + 4);
    if (i === 8 ? kind !== 'IHDR' || size !== 13 : kind === 'IHDR') return false;
    if (crc32(b.subarray(i + 4, end - 4)) !== uint32(b, end - 4)) return false;
    if (kind === 'IDAT' && size > 0) data = true;
    if (kind === 'IEND') return size === 0 && data && end === b.length;
    i = end;
  }
  return false;
}
function completeJpeg(b: Uint8Array): boolean {
  let i = 2;
  let scan = false;
  let imageData = false;
  while (i < b.length) {
    if (b[i] !== 0xff) {
      if (!scan) return false;
      imageData = true;
      i++;
      continue;
    }
    while (b[i] === 0xff) i++;
    if (i >= b.length) return false;
    const marker = b[i++] as number;
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
      if (!scan) return false;
      imageData = true;
      continue;
    }
    if (marker === 0xd9) return scan && imageData && i === b.length;
    if (marker === 0xd8 || i + 2 > b.length) return false;
    const size = (b[i] as number) * 256 + (b[i + 1] as number);
    if (size < 2 || i + size > b.length) return false;
    if (marker === 0xda) scan = true;
    i += size;
  }
  return false;
}
function completeWebp(b: Uint8Array): boolean {
  if (uint32(b, 4, true) + 8 !== b.length) return false;
  let i = 12;
  let imageData = false;
  while (i + 8 <= b.length) {
    const kind = tag(b, i);
    const size = uint32(b, i + 4, true);
    const end = i + 8 + size + (size % 2);
    if (end > b.length) return false;
    if ((kind === 'VP8 ' && size >= 10) || (kind === 'VP8L' && size >= 5) || (kind === 'ANMF' && size > 16)) imageData = true;
    i = end;
  }
  return imageData && i === b.length;
}
