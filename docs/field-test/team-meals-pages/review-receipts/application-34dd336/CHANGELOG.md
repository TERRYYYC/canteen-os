# Changelog

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；版本号对应 `docs/plan-for-terry.md` 的里程碑（v0.1 → v1.0）。每个版本收尾时由 owner 补一段，内容是"能用了什么 / 坏了什么 / 没做什么"，不是 commit 列表。

## [Unreleased]

方向待定——见 0.3.0-alpha 的「Owner 实际使用后的判断」。

## [0.3.0-alpha] — 2026-09-10 · 打结版

> **这是一个打结点，不是里程碑收尾。** Owner 在真机上实际使用后对现状不满意，决定先把当前状态标记下来再重新考虑方向。v0.1 / v0.2 从未打过 tag，所以本 tag 覆盖的是 `v0.0.3` 之后到今天的全部内容。

**能用了什么**

- 前台三张单 `/prep` `/purchase` `/menu`（v0.2，#8–#14）：线上跑真数据（`week-41`），PWA 离线、二维码入口。
- 师傅后台 `/admin` 六屏（v0.3，#20–#25）：工作台、排菜单、粘贴导入 + CSV、新食材、手动加菜、发布。**演示模式**——写入走内存 mock，刷新即回初值；任意 43 位 base64url 令牌可进。
- `packages/worker`（#19）：全部端点实现 + 76 条单测；**未部署**。
- `api/client.ts` 真实 HTTP 客户端（#27 前置）：`VITE_WORKER_URL` 有值即切换；33 条单测。
- CI：schema 校验、core / scripts / worker / web 四套单测、前端构建、bot 越界守卫、gitleaks 密钥扫描；部署流水线 `--frozen-lockfile`。
- 数据到三张单的链路（v0.1）与 core 的菜单文本解析器（#83）。

**坏了什么 / 没做什么**

- **样子与设计稿不一致**：前后台都是照文字规格实现的，骨架对、细节走样——发布按钮描边而非实心、红点灰色、双标题头、餐次 chip 换行、文案改写；前台看起来"空"主要因为 `data/` 里一张照片都没有。
- **真机上一次都没验过**（沙箱无浏览器）：合计 295 条 jsdom / happy-dom 冒烟不等于手能操作。
- 没部署 worker（#68）、没跑 L2 集成测试（#69）、没有 Playwright 冒烟（#15）、xlsx 上传没做（本轮不加依赖）、配料行/步骤照片没做（多图路径未定）、Wikidata 取图是占位。
- `allergens` 空、食材 9 种、菜 1 道——真实数据是 v0.4 的活，没开始。

**Owner 实际使用后的判断**

> 「有很多 bug，但我从实际的使用发现并不喜欢。」——2026-09-10。具体不喜欢什么待 Owner 说明；在此之前**不再往这个方向加功能**。

## [0.1.0] — 2026-09-07 · v0.1 收尾工程

> **tag 未打**——`git tag v0.1` 归 Owner（#7）。本段是收尾复核结论，DoD 逐条核验见 #7 的评论。

`data/` 到三张单的整条链路打通了：改 `data/` 里的 JSON，跑一条命令就能出备料单、采购单、菜单三份 JSON，采购数字与既有快照逐行一致。**这一版还没有界面**——界面是 v0.2。

**能用了什么**

- `scripts/build-data.mjs`（#3 / PR #48）：读 `data/` → `expand` + 三个渲染器 + `readiness` → `packages/web/public/data/{prep,purchase,menu}/<planId>.json` 加一份 `build.json {builtAt, commit, plans[]}`。`--check` 只校验不写，`--compare-snapshots` 对着 `data/purchase-orders/` 快照逐行比。纯 Node，无框架依赖。
- `scripts/translate.mjs`（#4 / PR #45）：扫描全部 I18nString，缺 en/uk 的走 DeepL（glossary 由 `data/techniques.json` 自动生成），写 `data/translations.lock.json`（`path → {source_hash, status}`）。`status: human` 的永不被机翻覆盖，zh 变了只标 `stale` 提示人工。没有 API key 时不报错、只列缺失数——所以 CI 里能跑。
- 渲染器补齐（#5 / PR #47）：备料单按 `prep.timing` 分组（没有 timing 的归"早上"），调料归"备在手边"且不显示切配提示；菜单输出成分句（按配料顺序、去调料）和估算克重（`≈`，净重之和）；`readiness(dish)` 返回 `{canTeach, canPlan, canProcure, missing[]}` 并接进 build-data。
- schema 本轮准许的全部可选字段（#1 / PR #44）：`prep.timing` 枚举、图片对象统一成 `{src, license, author?, sourceUrl?}`、`dish.description`、`menu-plan.meals[].serviceWindow`、`provenance.source` 增加 `example`（构建时排除）。**做完即冻结到 v1.0**——没有新增实体、没有新增必填、没有删字段。
- types 与 schema 的一致性检查（#2 / PR #49）：选了 (b) 方案——保留手写 `types.ts`，加 `scripts/check-types-vs-schema.mjs` 在 CI 里比对字段名与必填集合。schema 改了而 types 没跟上，CI 必红。

**坏了什么**

- main 上的 CI 从 #1 起一直是红的：`pnpm/action-setup@v4` 的 `version: 9` 与根 `package.json` 的 `packageManager: pnpm@9.15.0` 冲突。9/7 由 #50 修掉，那是这个仓库第一次绿。
- **绿灯不等于跑过。** `packages/core` 的 `test` 脚本写成 `node --test "test/*.test.mjs"`，Node 20 不展开引号里的 glob——这个包的单测从来没通过自己的 npm 脚本真正跑起来过（`tsc` 有效，断言无效）。9/8 CI 第一次真跑单测才暴露，`1243fa4` 修掉。记在这里当教训：本轮之前所有"测试全绿"的说法，只有手工直接跑过的那些算数。
- agent 的沙箱构建环境 9/8 全天 `No space left on device`，当天所有改动退化成"读 diff 自证 + 让 CI 说话"，没有本地构建验证。

**没做什么**

- 没有任何界面——四个页面（/prep /purchase /menu /admin）是 v0.2 起。
- 没有写入通道、没有登录、没有后端数据库（v0.3 起，且只走静态后台 → 云函数 → GitHub API）。
- `allergens` 只从 ingredient 上可选的 `allergens` 字段读，没有该字段就是空数组；补真实数据是 v0.4 的事。
- 门 A（确认真实厨房、收集菜贩清单）是 Owner 侧的 #6，未完成——不阻塞 v0.1 的代码收尾，但阻塞 v0.4。

## [0.0.3] — 2026-09-07 · 设计收尾

设计阶段结束，开工前快照。

**定下来的**
- 目标：一个中国师傅带乌克兰帮厨在海外做中餐、买对料；一个知识库出三张单 + 师傅后台（`docs/roadmap-v2.md`、ADR-0006）。
- 产品形态：不做 app；一个网址四个页面（/prep /purchase /menu /admin），PWA 离线，扫码进入；无后端数据库、无登录；写入通道 = 静态后台 → 云函数 → GitHub API（ADR-0007 待写）。
- 高保真：前台 5 屏（目录角标抽屉、备料单 A/B/C、采购单、菜单列表 + 详情，菜单参照 Expirenza 骨架）、后台 7 屏（工作台、排菜单周视图、粘贴导入、贴视频链接、复核、新食材、发布/回退/二维码）— `docs/design/`。
- 节奏：v0.1 → v0.4 → 真实厨房周 → v1.0，2026-09-07 → 10-30；三道门；铁律见 `docs/plan-for-terry.md`。
- 执行：`docs/execution-brief.md`（冻结事项、任务、工程规则、接口契约）；38 个 issue 拆分在 `.github/backlog/round-1.json`，`scripts/create-issues.mjs` 幂等同步到 GitHub，`scripts/backlog-waves.mjs` 算并行波次。
- 工作模式：`docs/operating-model.md`——一个调度 thread 按波次派工、子 thread 一 issue 一生命周期、交接四行、审查跑命令、合并权只在 Owner。
- PRD 升 v0.3：四个角色四个页面、师傅后台进第一轮、§4.4 产品形态；`modules/knowledge-base.md` 编辑入口同步。

**已修**
- 引擎：margin 对 pcs 食材生效（鸡蛋 720 → 792 → 5 箱，合计 ¥1,525.50）；ADR-0006 加修正备注与"黄金数字必须手算"教训。
- `to-taste` 单位（适量）：采购跳过、备料单保留。
- 渲染器：调料不显示切配提示；en/uk 标点 ASCII 化。

**新增**
- 四种调料入库（糖、白醋、番茄酱、淀粉）；`docs/field-test/week-41/` 真人测试材料（微信采购单 ×2、乌语备料单、操作指南）。
- `CHANGELOG.md`（本文件）、`.github/ISSUE_TEMPLATE/task.yml`、PR 模板加"怎么验证 / 没做什么 / 手算"三段。

**标记为已取代**
- `docs/design/screens-v1.html`（保留供对照，以 v2 为准；见 `docs/design/README.md`）。

## [0.0.2] — 2026-09-06 · v2 收窄与引擎落地

- ADR-0006：实体 9 → 5，`examples/` → `data/`，删供应商 / 量纲 / 反馈 / dishpack / PO 状态机。
- 采购引擎实现 + 三个渲染器 + readiness，21 → 23 个测试；番茄炒蛋 480 份黄金测试。
- 视频 skill 直出 `dish.json` + `images/`；真实视频 POC（王刚番茄炒蛋，agent 扮演引擎），暴露 7 条契约缺口。
- v2 八场景调研（`docs/research/v2/`）与跨 agent 评审。

## [0.0.1] — 2026-09-05 · 脚手架

- spec-first 骨架：PRD、架构、5 篇 ADR、9 个 schema + 19 个样例、协作规范、CI。
- 视频解析 skill 契约（三引擎 + fixture）。
- 开源格局调研（约 40 个项目）。
