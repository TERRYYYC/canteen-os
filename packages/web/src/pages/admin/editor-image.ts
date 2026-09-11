/** Original image algorithm, loaded only for a selected file. */
export const IMAGE_MAX_EDGE = 1280;
export const IMAGE_MAX_BYTES = 200 * 1024;

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
}

/** 质量递减序列；全都超限就把边长再乘 0.8 重来，直到最长边 < 320 才放弃 */
const JPEG_QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45];
const MIN_EDGE = 320;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image-decode"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

/**
 * 算法：
 *   1. 用 <img> 解码（浏览器会按 EXIF 方向摆正，naturalWidth/Height 就是摆正后的尺寸）；打不开 → 抛错；
 *   2. 原文件本来就 ≤ maxBytes、最长边 ≤ maxEdge、且是 jpg / png / webp → 原样返回，不重编码；
 *   3. scale = min(1, maxEdge / 最长边)，canvas 垫白后缩放绘制，按 JPEG_QUALITIES 逐档编码，第一个 ≤ maxBytes 的就是结果；
 *   4. 五档都超 → scale ×= 0.8 回到第 3 步；最长边缩到 < 320 还不行 → 返回 null（界面提示「这张照片太大，换一张或裁小一点」）。
 */
export async function compressImage(file: Blob, limits: { maxEdge: number; maxBytes: number } = { maxEdge: IMAGE_MAX_EDGE, maxBytes: IMAGE_MAX_BYTES }): Promise<CompressedImage | null> {
  const img = await loadImage(file);
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;
  if (!w0 || !h0) throw new Error("image-decode");
  if (file.size <= limits.maxBytes && Math.max(w0, h0) <= limits.maxEdge && /^image\/(jpeg|png|webp)$/.test(file.type)) {
    return { blob: file, width: w0, height: h0 };
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  let scale = Math.min(1, limits.maxEdge / Math.max(w0, h0));
  for (;;) {
    const w = Math.max(1, Math.round(w0 * scale));
    const hh = Math.max(1, Math.round(h0 * scale));
    canvas.width = w;
    canvas.height = hh;
    ctx.fillStyle = "#fff"; // PNG 透明底转 JPEG 时垫白，不然是黑的
    ctx.fillRect(0, 0, w, hh);
    ctx.drawImage(img, 0, 0, w, hh);
    for (const q of JPEG_QUALITIES) {
      const blob = await canvasToBlob(canvas, "image/jpeg", q);
      if (blob && blob.size <= limits.maxBytes) return { blob, width: w, height: hh };
    }
    scale *= 0.8;
    if (Math.max(w0, h0) * scale < MIN_EDGE) return null;
  }
}
