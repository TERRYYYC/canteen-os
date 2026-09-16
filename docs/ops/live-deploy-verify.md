运维 · 怎么确认「线上跑的就是这个 commit」
=========================================

**问题**：合完一个 PR、Pages 部署完之后，要回答一句「https://terryyyc.github.io/canteen-os/
上现在跑的，是不是我刚验过的那份」。直接去抓 `sw.js` 和 `data/build.json` 看着最省事，
但有两个坑会让这个判断整个反过来——2026-09-16 的调度轮次里，差一点就据此发出
「线上不是我验过的那份」的假警报。

## 1. 坑一：抓取工具可能吞掉破缓存用的查询串

agent 侧的网页抓取工具（以及任何带自己缓存层的 HTTP 代理）不保证按原样发请求。
2026-09-16 09:0x 实测：请求 `…/sw.js?t=<时间戳>`，工具把查询串**吞掉**，
回来的是它自己缓存里一份**更早的部署产物**：

| 判据 | 抓取工具回的（陈旧） | 浏览器里真实取到的 |
| --- | --- | --- |
| `publication-manifest` 的 `maxEntries` | `4` | `2` |
| `""===e.search` 守卫（issue #114） | 无 | 有 |
| index.html 引的入口脚本 | `assets/index-NQBtxLQy.js` | `assets/index-BEMbfCkK.js` |

同一时刻 `data/build.json` 却回的是当前 commit（`aee1974`）——**两份文件新旧不一致，
而且陈旧的那份自身结构完整、长度接近，肉眼分不出来**。按它下结论，就是一轮白跑。

> 表里前两行是 **#110 方案 B 之前**的指纹：那之后 `publication-manifest` 运行时缓存与
> `""===e.search` 守卫都不存在了（`build.json` 回到 precache）。判断新旧仍然照用第 3 行——
> 入口脚本文件名——它不依赖任何一版的路由结构。

## 2. 坑二：precache 条目数不是指纹

两次构建之间条目数经常一模一样（只是内容 hash 变了）。**别拿条数当同一性判据**，
要比就比 `index.html` 里引的那个入口脚本文件名，它每次构建都随内容变。

## 3. 可信的做法：让页面自己去取

在浏览器里打开站点，然后在页面上下文里 `fetch`，显式 `cache: 'no-store'`，
这样绕开的是 HTTP 缓存与抓取工具的缓存两层（Service Worker 那层对 `sw.js` 本身不拦）：

```js
const bust = Date.now();
const sw = await (await fetch('./sw.js?nocache=' + bust, {cache: 'no-store'})).text();
const bj = await (await fetch('./data/build.json?nocache=' + bust, {cache: 'no-store'})).json();
({
  commit: bj.commit,
  manifestPrecached: /"data\/build\.json"/.test(sw),  // issue #110 方案 B：清单必须在 precache 里
  entryScript: sw.match(/assets\/index-[\w-]+\.js/)?.[0],
  precacheCount: (sw.match(/\{url:"/g) || []).length,
});
```

## 4. 一次完整核对查四条，缺一条都不算数

1. `data/build.json` 的 `commit` == 当前 `main` 的 HEAD。
2. `sw.js` 里那几处关键片段与本地构建产物一致：`data/build.json` **在** precache 清单里、且带
   一个随内容变的 `revision`（issue #110 方案 B；在那之前这条是反过来的）。
3. precache 里的入口脚本 == 线上 `index.html` 实际引用的那个文件名。
4. `caches` 里的自洽：precache 中 `build.json` 的 `commit` == 同一份 precache 里投影
   `week-41.json` 的 `sourceRevision`。方案 B 之后这两份来自同一次 activate，**结构上就该永远相等**；
   一旦不等，说明 precache 被手工动过或换版被打断，装过应用的客户端会撞 `revision_mismatch`
   （见 issue #110 / #114）。

人工在手机／电脑浏览器地址栏里用 `?t=` 破缓存仍然有效，见
[`docs/field-test/week-43/ops-checklist.md`](../field-test/week-43/ops-checklist.md) §3.1；
本文针对的是 agent 用工具抓取这条路径。
