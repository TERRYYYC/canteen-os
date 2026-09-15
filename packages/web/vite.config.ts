import { version } from "./package.json";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * packages/web 的 Vite 配置（issue #8 脚手架 + issue #12 PWA）。
 * - base "./"：产物用相对路径，GitHub Pages 子路径（/<repo>/）与本地 file:// / preview 都能跑；
 * - target es2020：与 tsconfig 一致，不引入 polyfill；
 * - 无 UI 框架：首屏 JS ≤ 60 KB gzip（docs/execution-brief.md §4.5），原生 DOM 预期 < 10 KB。
 * public/ 原样拷进 dist/：public/data/ 是 scripts/build-data.mjs 的产物目录（不入库，CI 每次重建）。
 *
 * PWA（vite-plugin-pwa，MIT，内含 Workbox）：
 * - registerType "prompt" + injectRegister false：不自动刷新；src/pwa.ts 自己用 virtual:pwa-register 注册，
 *   有新 SW 在等待时页面顶部出「有新版本，点此刷新」，用户点了才 skipWaiting → reload；
 * - 预缓存 = 应用壳（js/css/html/webmanifest/图标）+ public/data/ 下全部 JSON（当前周三张单）。
 *   build.json 不在其中：它是新鲜度探针，走下面的 NetworkFirst（issue #98）；
 * - 运行时：图片 CacheFirst（300 张 / 30 天，docs/research/v2/scenario-g §已知坑 4）；Google Fonts 的 css 与字体文件
 *   StaleWhileRevalidate（断网时用上次的字体，没有就按 tokens.css 回退栈走系统字体）；
 * - navigateFallback index.html：hash 路由只有一个入口，离线时任何导航都回到壳；
 * - scope / start_url 都是相对路径（"./"），跟 base 一致，部署在子路径下 SW 作用域仍正确。
 * - clientsClaim true：首次安装后当前页立刻受控（抽屉底部「离线副本已保存」靠 navigator.serviceWorker.controller 判断）；
 *   skipWaiting false：更新一定等用户点刷新。
 */
export default defineConfig({
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    target: "es2020",
    reportCompressedSize: true,
  },
  plugins: [
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      scope: "./",
      // 图标（含 apple-touch-icon.png）已被下面 globPatterns 的 svg/png 覆盖；关掉插件的自动加入，避免同一 URL 重复进 precache 清单
      includeManifestIcons: false,
      manifest: {
        name: "CanteenOS",
        short_name: "CanteenOS",
        description: "Підготовка · Закупівля · Меню",
        lang: "uk",
        display: "standalone",
        start_url: "./#/prep",
        scope: "./",
        theme_color: "#F2F4F1",
        background_color: "#F2F4F1",
        icons: [
          { src: "icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
          { src: "icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // manifest.webmanifest 由插件自己加进清单，不放进 glob（否则同一 URL 出现两次）
        globPatterns: ["**/*.{js,css,html,svg,png}", "data/**/*.json"],
        // 数据目录里将来的菜品/食材图片不进预缓存（只 precache 应用壳），走下面的运行时 CacheFirst
        // data/build.json 是「线上换版没有」的唯一探针（运维清单 §3.1/§5）：precache 走 cache-first，
        // 装过应用的客户端会一直返回旧副本，探针永远失真 → 移出预缓存，改走下面的 NetworkFirst（issue #98）
        globIgnores: ["data/**/*.{png,svg,jpg,jpeg,webp,avif,gif}", "data/build.json"],
        navigateFallback: "index.html",
        clientsClaim: true,
        skipWaiting: false,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // data/build.json：先走网络拿真值，3 秒超时或离线时回落到上次成功的响应，
            // §4 第 1 条（断网能看上次打开的内容）不受影响。必须排在下面的规则之前（issue #98）。
            urlPattern: ({ request, url, sameOrigin }) => {
              if (request.method !== "GET" || !sameOrigin) return false;
              // Scope-anchored like the published-assets rule: /other/data/build.json is a different file.
              return url.pathname === new URL(
                "data/build.json",
                (self as unknown as { registration: { scope: string } }).registration.scope,
              ).pathname;
            },
            method: "GET",
            handler: "NetworkFirst",
            options: {
              cacheName: "publication-manifest",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 4 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Published assets use fetch (empty destination). Workbox serializes this callback into the SW.
            urlPattern: ({ request, url, sameOrigin }) => {
              if (request.method !== "GET" || !sameOrigin) return false;
              const assetRoot = new URL(
                "data/assets/",
                (self as unknown as { registration: { scope: string } }).registration.scope,
              ).pathname;
              // Keep the browser's encoded path intact; never decode it to locate another resource.
              return url.pathname.startsWith(assetRoot)
                && /^[0-9a-f]{40}\/.+$/.test(url.pathname.slice(assetRoot.length));
            },
            method: "GET",
            handler: "CacheFirst",
            options: {
              cacheName: "published-assets",
              expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-css",
              expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-files",
              expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
