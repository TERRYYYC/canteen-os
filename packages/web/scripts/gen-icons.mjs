#!/usr/bin/env node
/**
 * 构建期生成 PWA 图标 PNG（issue #12）：public/icons/{icon-192,icon-512,icon-maskable-192,icon-maskable-512,apple-touch-icon}.png
 * 几何与 public/icons/icon.svg / icon-maskable.svg 完全一致（都照 src/styles.css 的 .corner：44×44 · 圆角 13 · 格 8×8 · gap 4 · 圆角 3 / 外角 6）。
 * 零依赖：自己栅格化（每像素 4×4 超采样）+ 用 node:zlib 写 PNG。PNG 是产物（.gitignore），SVG 入库；`pnpm -C packages/web build` 的 prebuild 会先跑本脚本。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
const INK = [0x17, 0x1b, 0x19];
const BG = [0xf2, 0xf4, 0xf1];
const UNITS = 44;
const SS = 4; // 每像素 4×4 超采样

/** 四角各自半径的圆角矩形（tl, tr, br, bl）；相邻两角半径之和超过边长时按 CSS 规则等比缩小 */
function roundedRect(x, y, w, h, radii) {
  const [TL, TR, BR, BL] = radii;
  const f = Math.min(1, w / (TL + TR), h / (TR + BR), w / (BR + BL), h / (BL + TL));
  const [tl, tr, br, bl] = [TL * f, TR * f, BR * f, BL * f];
  return (px, py) => {
    if (px < x || py < y || px > x + w || py > y + h) return false;
    const corner = (cx, cy, r) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
    if (px < x + tl && py < y + tl) return corner(x + tl, y + tl, tl);
    if (px > x + w - tr && py < y + tr) return corner(x + w - tr, y + tr, tr);
    if (px > x + w - br && py > y + h - br) return corner(x + w - br, y + h - br, br);
    if (px < x + bl && py > y + h - bl) return corner(x + bl, y + h - bl, bl);
    return true;
  };
}

const cells = [
  roundedRect(12, 12, 8, 8, [6, 3, 3, 3]),
  roundedRect(24, 12, 8, 8, [3, 6, 3, 3]),
  roundedRect(12, 24, 8, 8, [3, 3, 3, 6]),
  roundedRect(24, 24, 8, 8, [3, 3, 6, 3]),
];
const bgRounded = roundedRect(0, 0, UNITS, UNITS, [13, 13, 13, 13]);
const bgFull = () => true;

function render(size, maskable) {
  const bgShape = maskable ? bgFull : bgRounded;
  const rgba = Buffer.alloc(size * size * 4);
  const scale = UNITS / size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = (px + (sx + 0.5) / SS) * scale;
          const uy = (py + (sy + 0.5) / SS) * scale;
          if (cells.some((c) => c(ux, uy))) { r += BG[0]; g += BG[1]; b += BG[2]; a += 1; }
          else if (bgShape(ux, uy)) { r += INK[0]; g += INK[1]; b += INK[2]; a += 1; }
        }
      }
      const o = (py * size + px) * 4;
      if (a > 0) {
        rgba[o] = Math.round(r / a);
        rgba[o + 1] = Math.round(g / a);
        rgba[o + 2] = Math.round(b / a);
        rgba[o + 3] = Math.round((a / (SS * SS)) * 255);
      }
    }
  }
  return rgba;
}

// ---- PNG 编码（8-bit RGBA，filter 0）----
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const JOBS = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-192.png", 192, true],
  ["icon-maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, true],
];
mkdirSync(OUT, { recursive: true });
for (const [name, size, maskable] of JOBS) {
  const buf = png(size, render(size, maskable));
  writeFileSync(join(OUT, name), buf);
  console.log(`已写入 public/icons/${name}  ${size}×${size}  ${buf.length} bytes`);
}
