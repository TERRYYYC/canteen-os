# Changelog

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；版本号对应 `docs/plan-for-terry.md` 的里程碑（v0.1 → v1.0）。每个版本收尾时由 owner 补一段，内容是"能用了什么 / 坏了什么 / 没做什么"，不是 commit 列表。

## [Unreleased] — v0.1 收尾工程（目标 2026-09-13）

见 `.github/backlog/round-1.json` 里程碑 `v0.1 收尾工程`：最后一批可选字段、`build-data.mjs`、`translate.mjs` + lock、渲染器补齐、types 生成或一致性检查；门 A（确认真实厨房）。

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
