import { randomUUID, createHash } from 'node:crypto';
import { constants, lstatSync, mkdirSync, readFileSync } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fail } from './errors.mjs';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function imageType(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR') return { extension: 'png', mime: 'image/png' };
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { extension: 'jpg', mime: 'image/jpeg' };
  if (bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16))) return { extension: 'webp', mime: 'image/webp' };
  fail(415, 'UNSUPPORTED_IMAGE', '请上传 JPEG、PNG 或 WebP 图片。');
}

export function localAssetPath(uploadsDir, asset) {
  if (asset.storage !== 'local' || !/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(asset.object_key ?? '')) fail(404, 'ASSET_NOT_FOUND', '图片不存在。');
  return join(uploadsDir, asset.object_key);
}

export function assertAssetReady(uploadsDir, asset) {
  if (!asset || asset.status !== 'ready' || !['external', 'local'].includes(asset.storage)) fail(422, 'ASSET_NOT_READY', '素材不存在或尚未就绪。');
  if (asset.storage === 'local') {
    let info;
    try { info = lstatSync(localAssetPath(uploadsDir, asset)); } catch { fail(422, 'ASSET_NOT_READY', '素材文件尚未就绪。'); }
    if (!info.isFile() || info.isSymbolicLink() || info.size !== asset.byte_size) fail(422, 'ASSET_NOT_READY', '素材文件尚未就绪。');
  }
}

export function assetUrl(asset) {
  return asset.storage === 'external' ? asset.external_url : `/api/v1/assets/${asset.id}/content`;
}

export async function receiveImage(request, uploadsDir) {
  if (!request.isMultipart()) fail(415, 'MULTIPART_REQUIRED', '图片上传需要 multipart/form-data。');
  let bytes, seen = false;
  // Consume the entire envelope before creating any permanent file. This also
  // detects a second file, unexpected fields and a missing multipart terminator.
  try {
    for await (const part of request.parts({ limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 1 } })) {
      if (part.type !== 'file' || part.fieldname !== 'file' || seen) fail(400, 'INVALID_UPLOAD', '请使用 file 字段上传一张图片。');
      seen = true;
      bytes = await part.toBuffer();
      if (part.file.truncated) fail(413, 'PAYLOAD_TOO_LARGE', '图片不能超过 8MiB。');
    }
  } catch (error) {
    // Busboy/Dicer exposes these input parse failures as plain Error, unlike
    // multipart's typed limit errors. Classify only known parser failures;
    // never turn filesystem or unexpected internal failures into client errors.
    if (error.code === 'ERR_STREAM_PREMATURE_CLOSE'
      || ['Multipart: Boundary not found', 'Unexpected end of multipart data', 'The needle cannot be an empty String/Buffer.', 'The needle cannot have a length bigger than 256.'].includes(error.message)
      || /^(Part|Preamble) terminated early due to unexpected end of multipart data$/.test(error.message)) {
      fail(400, 'INVALID_MULTIPART', '上传数据不完整或 multipart 格式不正确。');
    }
    throw error;
  }
  if (!bytes?.length) fail(400, 'EMPTY_UPLOAD', '图片文件不能为空。');
  const type = imageType(bytes);
  const id = randomUUID();
  const objectKey = `${id}.${type.extension}`;
  mkdirSync(uploadsDir, { recursive: true, mode: 0o700 });
  const pendingPath = join(uploadsDir, `.${id}.pending`);
  const finalPath = join(uploadsDir, objectKey);
  let moved = false;
  try {
    const file = await open(pendingPath, 'wx', 0o600);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    await rename(pendingPath, finalPath);
    moved = true;
    const dir = await open(uploadsDir, constants.O_RDONLY);
    try { await dir.sync(); } finally { await dir.close(); }
    return { id, kind: 'image', storage: 'local', object_key: objectKey, status: 'ready', sha256: createHash('sha256').update(bytes).digest('hex'), mime_type: type.mime, byte_size: bytes.length, finalPath };
  } catch (error) {
    await unlink(moved ? finalPath : pendingPath).catch(() => {});
    throw error;
  }
}

export function readImage(uploadsDir, asset) {
  const path = localAssetPath(uploadsDir, asset);
  assertAssetReady(uploadsDir, asset);
  try {
    // Never follow a substituted symlink. All filenames come from the server.
    return readFileSync(path, { flag: constants.O_RDONLY | constants.O_NOFOLLOW });
  } catch { fail(404, 'ASSET_NOT_FOUND', '图片文件不存在。'); }
}
