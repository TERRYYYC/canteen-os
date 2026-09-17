# 高保真设计稿（UI 事实源）

用浏览器直接打开 `.html`。单文件、无外部依赖（字体走 Google Fonts，无网时回退系统字体），截图来自 `docs/research/poc-video-001/` 的真实视频截帧，数据来自 `data/`（番茄炒蛋、第 41 周、200 份）。右上角可切换内容语言（乌 / 中 / 英）。

| 文件 | 内容 | 状态 |
|---|---|---|
| [`reference-v3/index.html`](reference-v3/index.html) | 按 2026-09-10 用户绿色参考图的十屏交互原型：三语、知识库、视频/文件草稿导入、菜单采购、点菜反馈与报告；[运行与边界](reference-v3/README.md) | **设计提案**；独立保留，不替换下面的已接受设计或生产范围 |
| [`screens-v2.html`](screens-v2.html) | 前台 5 屏：左上角目录角标 + 抽屉；备料单 `/prep` A 清单式 / B 图卡式 / C 按时间分组；采购单 `/purchase`；菜单 `/menu` 列表 + 详情（参照 Expirenza 骨架） | **定稿**（2026-09-07，Terry 接受） |
| [`backoffice-v1.html`](backoffice-v1.html) | 后台 7 屏：工作台、排菜单周视图、粘贴导入、贴视频链接 + 进度、复核、新食材、发布 / 回退 / 二维码；页尾是写入通道架构 | **定稿**（2026-09-07） |
| [`screens-v1.html`](screens-v1.html) | 前台第一版（无目录角标，菜单未参照 Expirenza） | 已取代，仅供对照 |

## 实现时的取舍（已定）

- 备料单：**A 做主界面，B 做点开后的详情，C 的时间分组做成 A 顶部的筛选 chip**。
- 菜单：借 Expirenza 的日期条 / 菜品行 / 详情抽屉 / 过敏原行；不借价格强调、收藏、促销轮播；加三语并列和"成分"一栏。
- 目录角标：所有页面左上同一位置；抽屉底部固定显示数据更新时间与离线状态。
- 语言下拉在右上角，只切内容语言。

## 设计 token

`screens-v2.html` 的 `:root` / dark 三态即 `packages/web/src/tokens.css` 的来源：`--bg --surface --surface-2 --ink --muted --line --accent --warn --ok`，字体 Golos Text（UI）+ Bitter（标题）+ Noto Sans SC（中文回退）。不得引入 UI 框架与 CSS 框架（`docs/execution-brief.md` §7）。

## 改稿规则

设计稿是 UI 事实源。实现与设计稿不一致时，先改设计稿（新增 `screens-v3.html` 或在 v2 上改并在本表记录日期），再改代码；反过来不行。
