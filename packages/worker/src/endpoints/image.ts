/**
 * POST /image/:kind/:id（契约 §1.0 + §9.1，判断题 ① 已由 owner 拍板走 A：压缩放浏览器）。
 *
 * worker **不做任何像素处理**（Workers 没有图像库）。它只做三件事：
 *   1. Content-Length / 实际字节数 ≤ 200 KB，否则 413（「绕过前端直接 POST 大图会被 413 挡掉
 *      而不是被压缩；这正是想要的行为」—— ADR-0007 §9 逐字）；
 *   2. magic bytes ∈ jpg / png / webp；
 *   3. 尺寸头能解析出来（解析不了 → 400）。
 *
 * license 是 ImageRef 的 schema 必填项，随请求头带：X-Image-License / X-Image-Author /
 * X-Image-Source-Url；文件名走 X-Image-Name（缺省 cover）。
 */
import type { Ctx } from "../context.js";
import { githubClient } from "../context.js";
import { fail, validationFailure } from "../http.js";
import { ID_RE, IMAGE_PATH_RE, looksLikeTraversal } from "../paths.js";
import { commitSingleFile } from "../write.js";

export const IMAGE_MAX_BYTES = 200 * 1024;

const KINDS = new Set(["ingredients", "dishes"]);

export interface ImageInfo {
  ext: "jpg" | "png" | "webp";
  width: number;
  height: number;
}

export function sniffImage(bytes: Uint8Array): ImageInfo | null {
  const png = readPng(bytes);
  if (png) return png;
  const jpg = readJpeg(bytes);
  if (jpg) return jpg;
  return readWebp(bytes);
}

function u32be(b: Uint8Array, i: number): number {
  return (
    ((b[i] as number) << 24) | ((b[i + 1] as number) << 16) | ((b[i + 2] as number) << 8) | (b[i + 3] as number)
  );
}

function u16be(b: Uint8Array, i: number): number {
  return ((b[i] as number) << 8) | (b[i + 1] as number);
}

function u24le(b: Uint8Array, i: number): number {
  return (b[i] as number) | ((b[i + 1] as number) << 8) | ((b[i + 2] as number) << 16);
}

function readPng(b: Uint8Array): ImageInfo | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24) return null;
  for (let i = 0; i < sig.length; i++) if (b[i] !== sig[i]) return null;
  // IHDR 必须是第一个 chunk：长度(4) 类型(4) 之后就是宽高。
  if (!(b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52)) return null;
  const width = u32be(b, 16);
  const height = u32be(b, 20);
  if (width <= 0 || height <= 0) return null;
  return { ext: "png", width, height };
}

function readJpeg(b: Uint8Array): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1] as number;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return null; // 到了压缩数据还没见到 SOF
    const length = u16be(b, i + 2);
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = u16be(b, i + 5);
      const width = u16be(b, i + 7);
      if (width <= 0 || height <= 0) return null;
      return { ext: "jpg", width, height };
    }
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

function readWebp(b: Uint8Array): ImageInfo | null {
  if (b.length < 30) return null;
  const tag = (i: number, s: string): boolean => {
    for (let k = 0; k < s.length; k++) if (b[i + k] !== s.charCodeAt(k)) return false;
    return true;
  };
  if (!tag(0, "RIFF") || !tag(8, "WEBP")) return null;
  if (tag(12, "VP8X")) {
    return { ext: "webp", width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  }
  if (tag(12, "VP8L")) {
    if (b[20] !== 0x2f) return null;
    const bits = (b[21] as number) | ((b[22] as number) << 8) | ((b[23] as number) << 16) | ((b[24] as number) << 24);
    return { ext: "webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (tag(12, "VP8 ")) {
    // 关键帧起始码 9d 01 2a，之后是 14 位宽高（小端）。
    if (!(b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a)) return null;
    const width = (((b[27] as number) << 8) | (b[26] as number)) & 0x3fff;
    const height = (((b[29] as number) << 8) | (b[28] as number)) & 0x3fff;
    if (width <= 0 || height <= 0) return null;
    return { ext: "webp", width, height };
  }
  return null;
}

export async function handleImage(ctx: Ctx): Promise<unknown> {
  const kind = ctx.params.kind ?? "";
  const id = ctx.params.id ?? "";
  if (looksLikeTraversal(kind) || looksLikeTraversal(id)) throw fail("bad_path");
  if (!KINDS.has(kind)) throw fail("bad_id", { message: "只能传 ingredients / dishes" });
  if (!ID_RE.test(id)) throw fail("bad_id");

  const bytes = ctx.rawBody ?? new Uint8Array(0);
  if (bytes.length === 0) throw fail("bad_image", { message: "没收到图片内容" });
  if (bytes.length > IMAGE_MAX_BYTES) throw fail("too_large");

  const info = sniffImage(bytes);
  if (!info) throw fail("bad_image", { message: "只认 jpg / png / webp，且要能读出尺寸" });

  const license = (ctx.request.headers.get("X-Image-License") ?? "").trim();
  if (license.length === 0) {
    throw validationFailure([{ path: "/license", code: "required", message: "这项必须填：license" }]);
  }
  const author = (ctx.request.headers.get("X-Image-Author") ?? "").trim();
  const sourceUrl = (ctx.request.headers.get("X-Image-Source-Url") ?? "").trim();

  const name = (ctx.request.headers.get("X-Image-Name") ?? "cover").trim();
  if (!ID_RE.test(name)) throw fail("bad_id", { message: "图片名只能用小写字母、数字和短横线" });

  const path = `data/${kind}/${id}/images/${name}.${info.ext}`;
  if (!IMAGE_PATH_RE.test(path)) throw fail("bad_path");

  const gh = githubClient(ctx);
  const outcome = await commitSingleFile(gh, {
    path,
    bytes,
    subject: (exists) => `data(${kind}): ${exists ? "换图" : "加图"} ${id}/${name}.${info.ext}`,
    role: ctx.role,
    endpoint: ctx.endpointConcrete,
    ifMatch: null,
  });

  const image: Record<string, string> = { src: path, license };
  if (author) image.author = author;
  if (sourceUrl) image.sourceUrl = sourceUrl;

  return {
    ok: true,
    commit: outcome.commit,
    blobSha: outcome.blobSha,
    unchanged: outcome.unchanged,
    warnings: ctx.warnings,
    image,
    width: info.width,
    height: info.height,
    bytes: bytes.length,
  };
}
