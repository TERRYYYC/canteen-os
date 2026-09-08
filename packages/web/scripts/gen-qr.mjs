#!/usr/bin/env node
/**
 * gen-qr.mjs — 构建期为三张单入口生成二维码 PNG（执行简报 §3 v0.2「三个页面各一个二维码生成」；issue #14）。
 *
 *   node scripts/gen-qr.mjs                       # 写 public/qr/{prep,purchase,menu}.png + public/qr/index.json
 *   SITE_URL=https://host/path/ node scripts/gen-qr.mjs   # 换域名：只需设环境变量，不改代码
 *
 * 由 package.json 的 "prebuild" 钩住：`pnpm -C packages/web build` 会先跑本脚本，产物随 public/ 原样进 dist/。
 * 产物不入库（.gitignore：packages/web/public/qr/*，只留 .gitkeep），CI 每次重建。
 *
 * 站点 URL 来源（不写死；优先级从高到低，都没有 → exit 1）：
 *   1. 环境变量 SITE_URL
 *   2. packages/web/package.json 的 "homepage" 字段
 *   末尾没有 "/" 时补上；页面地址 = new URL("#/<route>", siteUrl).href（hash 路由，src/router.ts）。
 *
 * 码本身不烧标签（纯码，贴哪都行）；中/乌/英标签写在 index.json，/qr 打印页（src/pages/qr.ts）负责排版与用法说明。
 *
 * index.json：{ siteUrl, generatedAt, items: [{ route, url, png, label: { uk, zh, en } }] }
 *   png 相对站点根（"qr/prep.png"），页面用 import.meta.env.BASE_URL + png 取。
 *
 * PNG：512×512、margin 2（模块）、纠错 M、深色 #171B19 / 浅色 #FFFFFF（tokens.css 的 --ink / --surface 浅色值；
 *   PNG 不随主题变，深色界面里当白色贴纸看）。依赖 qrcode（MIT，仅 devDependency，只在 node 端跑）。
 *
 * 纯 Node ≥ 20，ESM。导出 resolveSiteUrl / ROUTES / main 便于复用。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, "..");
const OUT_DIR = path.join(WEB_ROOT, "public", "qr");

/** 三张单入口（与 src/router.ts 的 hash 路由一致）；label 与 src/i18n.ts 的 drawer.* 同义 */
export const ROUTES = [
  { route: "prep", label: { uk: "Підготовка", zh: "备料单", en: "Prep" } },
  { route: "purchase", label: { uk: "Закупівля", zh: "采购单", en: "Purchasing" } },
  { route: "menu", label: { uk: "Меню", zh: "菜单", en: "Menu" } },
];

const PNG_OPTS = {
  type: "png",
  width: 512,
  margin: 2,
  errorCorrectionLevel: "M",
  color: { dark: "#171B19", light: "#FFFFFF" },
};

/**
 * 站点 URL：env.SITE_URL → package.json.homepage → 抛错。返回值一定以 "/" 结尾且是合法 http(s) URL。
 * @param {{ env?: NodeJS.ProcessEnv, pkgPath?: string }} [opts]
 */
export function resolveSiteUrl(opts = {}) {
  const env = opts.env ?? process.env;
  const pkgPath = opts.pkgPath ?? path.join(WEB_ROOT, "package.json");
  let raw = (env.SITE_URL ?? "").trim();
  let source = "SITE_URL";
  if (!raw) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    raw = typeof pkg.homepage === "string" ? pkg.homepage.trim() : "";
    source = `${path.relative(process.cwd(), pkgPath) || "package.json"} "homepage"`;
  }
  if (!raw) {
    throw new Error("站点 URL 未配置：设环境变量 SITE_URL，或在 packages/web/package.json 里填 \"homepage\"");
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`站点 URL 不合法（${source}）：${raw}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`站点 URL 必须是 http(s)（${source}）：${raw}`);
  }
  if (url.hash || url.search) {
    throw new Error(`站点 URL 不能带 ?query 或 #hash（${source}）：${raw}`);
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return { siteUrl: url.href, source };
}

/** 页面地址：hash 路由，与 src/router.ts 的 hrefOf 一致 */
export function pageUrl(siteUrl, route) {
  return new URL(`#/${route}`, siteUrl).href;
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, outDir?: string, now?: Date, log?: (s: string) => void }} [opts]
 */
export async function main(opts = {}) {
  const outDir = opts.outDir ?? OUT_DIR;
  const log = opts.log ?? ((s) => console.log(s));
  const { siteUrl, source } = resolveSiteUrl({ env: opts.env });
  const generatedAt = (opts.now ?? new Date()).toISOString();

  mkdirSync(outDir, { recursive: true });
  const items = [];
  for (const { route, label } of ROUTES) {
    const url = pageUrl(siteUrl, route);
    const file = path.join(outDir, `${route}.png`);
    await QRCode.toFile(file, url, PNG_OPTS);
    items.push({ route, url, png: `qr/${route}.png`, label });
    log(`已写入 ${path.relative(process.cwd(), file)}  ←  ${url}`);
  }
  const index = { siteUrl, generatedAt, items };
  const indexFile = path.join(outDir, "index.json");
  writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`);
  log(`已写入 ${path.relative(process.cwd(), indexFile)}  （站点 URL 来自 ${source}）`);
  return index;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`gen-qr: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
