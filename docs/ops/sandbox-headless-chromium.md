# 在沙箱里跑 headless Chromium（截图与视觉验收）

> 2026-09-11 实测通过。写这篇的原因：`docs/field-test/log.md` 2026-09-10 那条把 v0.3 走样的根因
> 记成「沙箱装不了 Chromium（网络白名单挡 Playwright CDN），agent 从头到尾看不到自己做的东西长什么样」。
> **这条归因现在不成立了** —— CDN 可达，浏览器能下下来，卡住的只是一个系统库。下面是完整做法。

## 结论先说

| 项 | 结论 |
| --- | --- |
| `cdn.playwright.dev` | **可达**（`playwright install chromium-headless-shell` 能下完） |
| `playwright.azureedge.net` | 被代理挡（403 CONNECT）——不用它，新版 Playwright 默认走 cdn |
| 缺的系统库 | 只有 `libXdamage.so.1` 一个 |
| `apt-get install` | 不行：无 root（`no new privileges`），且 `ports.ubuntu.com`（arm64）被代理 403 |
| 解法 | 自己编一个 20 行的 stub 顶掉那 4 个符号 |
| CJK 字体 | 沙箱里有 Noto CJK，中文正常出字，不是豆腐块 |
| 外网 | `terryyyc.github.io` **不在白名单**（线上站点截不到）；本地 `pnpm build` + `python3 -m http.server` 截自己的产物没问题 |

## 步骤

### 1. 装浏览器

```bash
npx --yes playwright@1.56.0 install chromium-headless-shell
# 下载会成功；结尾报 "Host system is missing dependencies" 属正常，继续下一步
```

### 2. 补 `libXdamage.so.1`

Chromium 只引用了 4 个符号（`nm -D --undefined-only headless_shell | grep -i damage`）：
`XDamageQueryExtension` / `XDamageCreate` / `XDamageDestroy` / `XDamageSubtract`。
headless 模式下根本不连 X server，这些函数不会被调用，因此一个如实回答「本扩展不存在」
的 stub 足够，且语义安全。

```bash
mkdir -p ~/xstub && cd ~/xstub && cat > xdamage_stub.c <<'EOF'
#include <X11/Xlib.h>
typedef unsigned long Damage;
int XDamageQueryExtension(Display *dpy, int *event_base, int *error_base) {
    (void)dpy; if (event_base) *event_base = 0; if (error_base) *error_base = 0;
    return 0; /* False：扩展不可用 */
}
Damage XDamageCreate(Display *dpy, Drawable d, int level) { (void)dpy;(void)d;(void)level; return 0; }
void XDamageDestroy(Display *dpy, Damage damage) { (void)dpy;(void)damage; }
void XDamageSubtract(Display *dpy, Damage damage, unsigned long repair, unsigned long parts) {
    (void)dpy;(void)damage;(void)repair;(void)parts;
}
EOF
gcc -shared -fPIC -o libXdamage.so.1 xdamage_stub.c -lX11
```

### 3. 跑

```bash
export LD_LIBRARY_PATH=~/xstub
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1   # 否则 Playwright 自己的依赖体检会拦
node shot.mjs
```

`shot.mjs`（`npm i playwright-core@1.56.0`）：

```js
import { chromium } from 'playwright-core';
const b = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await p.goto('http://127.0.0.1:8787/#/prep', { waitUntil: 'load', timeout: 30000 });
await p.waitForTimeout(1800);
await p.screenshot({ path: 'prep.png', timeout: 30000 });
await b.close();
```

### 4. 截自己的构建产物

```bash
pnpm -C packages/core build && node scripts/build-data.mjs && pnpm -C packages/web build
cd packages/web/dist && python3 -m http.server 8787 &
# 路由：#/prep #/purchase #/menu #/admin #/qr
```

## 坑

1. **每次 bash 调用是独立进程**，后台起的 `http.server` 不会跨调用存活——起服务和截图必须写在**同一条命令**里。
2. **`page.screenshot` 会等 `document.fonts.ready`**。页面引用了取不到的外部字体时会卡满 30 s。要么把字体自托管，要么截图前覆盖 `document.fonts`。
3. **外网要走代理且代理要认证**。`chromium.launch({ proxy })` 必须把 `http_proxy` 里的用户名/口令拆出来（`decodeURIComponent`）单独传，只传 `server` 会 407。本地 `127.0.0.1` 不走代理，不用配。
4. **`build-data.mjs` 依赖 `packages/core/dist`**，先 `pnpm -C packages/core build`，否则 `dist/data/**` 是空的，前台看起来「没数据」是这个原因，不是页面 bug。

## 这件事为什么重要

视觉验收从此可以进派工单：agent 能在提 PR 之前把自己做的屏截出来，和 `docs/design/reference-v3/`
的原型并排看。v0.3 走样的直接原因就是这一步不存在——契约开头写着「本轮未读设计稿，版式一个像素都不规定」，
而没人能看见结果。下一轮派实现类任务时，**把「附本屏截图 + 与原型的差异清单」写成硬验收**。
