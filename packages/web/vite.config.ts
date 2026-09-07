import { defineConfig } from "vite";

/**
 * packages/web 的 Vite 配置（issue #8）。
 * - base "./"：产物用相对路径，GitHub Pages 子路径（/<repo>/）与本地 file:// / preview 都能跑；
 * - target es2020：与 tsconfig 一致，不引入 polyfill；
 * - 无插件、无框架：首屏 JS ≤ 60 KB gzip（docs/execution-brief.md §4.5），原生 DOM 预期 < 10 KB。
 * public/ 原样拷进 dist/：public/data/ 是 scripts/build-data.mjs 的产物目录（不入库，CI 每次重建）。
 */
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    reportCompressedSize: true,
  },
});
