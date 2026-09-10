/**
 * 路径白名单（ADR-0007 §8 第 1 层，按契约 §7.1 / D-18 拆成三条互不重叠的正则）。
 *
 * ADR 原文那条示意正则有三处对不上（图片分组在 .json 之前 → 图片路径永远匹配不上；
 * [a-z0-9] 开头比 common.schema.json 的 Id ^[a-z][a-z0-9-]*$ 松；不允许执行简报 §1.7
 * 的平铺图片路径），契约 §7.1 已判「#19 写实现时不能照拄」。这里用 D-18 的三条。
 *
 * 含 ..、绝对路径、以及任何 schemas/ packages/ scripts/ .github/ 根目录文件的写入请求
 * 一律 400 bad_path，且**不记录请求体**（worker 从来不记请求体，见 index.ts 的 log）。
 */

/** 实体：data/<ingredients|dishes|menu-plans>/<id>.json */
export const ENTITY_PATH_RE = /^data\/(ingredients|dishes|menu-plans|shopping-lists)\/[a-z][a-z0-9-]*\.json$/;

/** 图片：data/<ingredients|dishes>/<id>[/images]/<name>.<jpg|png|webp> */
export const IMAGE_PATH_RE =
  /^data\/(ingredients|dishes)\/[a-z][a-z0-9-]*(\/images)?\/[a-z][a-z0-9-]*\.(jpg|png|webp)$/;

/** 单文件：data/techniques.json（白名单里有，但 v0.3 没有端点写它）。 */
export const SINGLE_FILE_PATH_RE = /^data\/techniques\.json$/;

/** common.schema.json#/$defs/Id */
export const ID_RE = /^[a-z][a-z0-9-]*$/;

/** 短 sha 或全长 sha（契约 §1.6）。 */
export const SHA_RE = /^[0-9a-f]{7,40}$/;

export function isWritablePath(path: string): boolean {
  if (path.includes("..") || path.startsWith("/") || path.includes("\\")) return false;
  return ENTITY_PATH_RE.test(path) || IMAGE_PATH_RE.test(path) || SINGLE_FILE_PATH_RE.test(path);
}

/** 空白与控制字符：路径参数里出现就当穿越处理。 */
const SUSPICIOUS_CHARS = /[\x00- \x7f]/;

/**
 * 路径参数长得像穿越（含斜杠、反斜杠、..、%、:、空白或控制字符）→ bad_path（T-18）；
 * 只是形状不合 Id（如大写、下划线）→ bad_id（T-14）。
 * 契约给了两个 code 但没说边界怎么划，这条规则是本实现的判定（见交付说明）。
 */
export function looksLikeTraversal(raw: string): boolean {
  if (raw.includes("/") || raw.includes("\\") || raw.includes("..") || raw.includes("%")) return true;
  if (raw.includes(":")) return true;
  return SUSPICIOUS_CHARS.test(raw);
}

export type SourceKind = "plan" | "ingredient" | "dish" | "shopping-list";

const KIND_DIR: Record<SourceKind, string> = {
  plan: "menu-plans",
  ingredient: "ingredients",
  dish: "dishes",
  "shopping-list": "shopping-lists",
};

export function isSourceKind(value: string): value is SourceKind {
  return value === "plan" || value === "ingredient" || value === "dish" || value === "shopping-list";
}

export function entityPath(kind: SourceKind, id: string): string {
  return `data/${KIND_DIR[kind]}/${id}.json`;
}
