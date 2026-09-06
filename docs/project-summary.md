# CanteenOS 项目总结（2026-09-07 · 设计收尾，开工前快照）

> **English summary.** CanteenOS is an open-source knowledge base for one concrete job: *a Chinese chef with a Ukrainian prep cook cooks Chinese food abroad and buys the right ingredients.* One knowledge base (`data/`, one JSON file per entity, in git) produces three sheets a day — a prep list for the helper (uk, with cut photos), a purchase order for the buyer (grouped by supplier, rounded to pack sizes, WeChat-shareable), and a menu for guests (zh/en/uk side by side) — plus a chef back office to plan the week and publish. Cooking videos are the input channel. Status on 2026-09-07: design closed (v2 scope, 5 entities, engine implemented with 23 hand-verified tests, hi-fi screens for 5 front + 7 back-office screens, research done), no web app yet. Round 1 (v0.1 → v1.0, 2026-09-07 → 10-30) ends with one real kitchen using it for one week. Plan: `docs/plan-for-terry.md`; agent brief: `docs/execution-brief.md`; backlog: `.github/backlog/round-1.json`.

---

## 1. 一句话

**让一个中国师傅带着乌克兰帮厨，在海外稳定做出中餐，并且买对料。**

一个知识库，每天出三张单：备料单（帮厨）、采购单（采购员）、菜单（顾客）；师傅在后台排菜单、按发布。视频是知识库的输入通道。三语（中/英/乌）是前提不是功能。允许不完整——一道菜只有名字也能导入，缺什么显示成待办。

## 2. 从"食堂全链路系统"到"一个师傅的三张单"

2026-09-05 之前的设计是通用食堂 ERP：9 个实体、点餐评分报告、供应商主数据、量纲三元组、视频中间包、PO 五态。9/5–9/6 的八场景调研和跨 agent 评审把它收窄成现在的样子（ADR-0006）：

| 砍掉 | 换成 |
|---|---|
| 供应商主数据 + SKU | 食材上的 `purchase{supplier 字符串, 包装, 起订, 上次价}` |
| 量纲规则实体（版本链、生效期、三层优先级） | 食材上一个 `pcsToGram`；g↔kg、ml↔l 是常量 |
| dishpack 中间包 + schema.org JSON-LD | 视频 skill 直出 `dish.json` + `images/`，git PR 即复核 |
| PO 五态状态机 | 采购单 = 引擎输出快照，每行带推导 trace |
| 点餐 / 评分 / 报告 / 多租户 / 小程序 | 推迟 |
| 分阶段损耗模型 | `yield` 一个数字（仅重量类食材）+ `margin` 备量系数（所有食材） |

新增的东西只有一类：**给帮厨的**——技法词表（刀工 / 加热 / 预处理，三语，闭集）、每个配料的备菜规格（切法、大小、备注、照片、提前多久）、视频里"被切的那几秒"截成的照片。

## 3. 现状（2026-09-07，全部经核实）

| 项 | 状态 | 证据 |
|---|---|---|
| 数据模型 | 5 实体 + common，`schemaVersion: "2"` | `schemas/`，`python3 scripts/local-validate.py` 14/14 |
| 知识库种子 | 9 食材（含 4 调料）、32 技法、番茄炒蛋、第 41 周菜单、2 张采购单快照 | `data/` |
| 采购引擎 | 实现 + 三个渲染器 + readiness，纯函数 | `packages/core`，`node --test` 23/23 |
| 黄金数字 | 480 份番茄炒蛋 → ¥1,525.50（绿源 ¥1,339.50 + 宏达 ¥186.00），逐行手算 | `data/purchase-orders/`，ADR-0006 §3 修正备注 |
| 真人测试材料 | 微信格式采购单 ×2、乌语备料单、操作指南 | `docs/field-test/week-41/` |
| 视频 skill | 契约 + 命令行；真实视频契约验证过（agent 扮演引擎），自动化待 API key | `skills/video-recipe-ingest/`，`docs/research/poc-video-001.md` |
| 高保真 | 前台 5 屏（目录角标、备料单 A/B/C、采购单、菜单列表 + 详情）、后台 7 屏 | `docs/design/screens-v2.html`、`backoffice-v1.html` |
| 调研 | 开源格局 + 八场景，结论已转化为 ADR，不再新增 | `docs/research/` |
| 网页 / 后台 / 自动翻译 / 部署 | **无** | 第一轮的内容 |

一次纠错值得记住：引擎最初把"pcs 不套 yield"写成"pcs 不套 yield 也不乘 margin"，并锁进黄金测试。评审发现后修正（鸡蛋 720 → 792 → 5 箱）。教训进了 ADR-0006 和执行简报：**黄金测试锁的是写下来的数字，每行必须手算后再锁。**

## 4. 产品形态

不做 app。一个网址，扫码打开，加到主屏幕即离线可用（Expirenza 的做法）。

```
帮厨   /prep      今天切什么、切成什么样、切多少（uk，有图，按"早上 / 出餐前"分组）
采购员 /purchase  本周按供应商买什么，每行可展开"为什么是这个数"，一键复制微信文本
顾客   /menu      一周日期条，菜品行（三语并列 + 成分句 + ≈克重 + 过敏原），点开详情
师傅   /admin     工作台 · 排菜单（周视图 / 粘贴导入 / 采购单预览）· 加菜 · 新食材 · 发布 / 回退 · 二维码
```

写入通道：静态后台页 → 一个云函数（拿仓库 token）→ 提交 JSON 到 git → CI 校验、机翻缺失的 en/uk、构建期跑引擎、部署静态站。师傅拿到的是带钥匙的链接，不需要 GitHub 账号。无后端数据库，无登录。

## 5. 第一轮：四个版本，八周，收在一个真实的星期

| 版本 | 日期 | 交付 | 完成定义（摘） |
|---|---|---|---|
| v0.1 收尾工程 | 9/7–9/13 | 最后一批可选字段、`build-data.mjs`、`translate.mjs` + lock、渲染器补齐；**确认真实厨房（门 A）** | 脚本从 data/ 出三份 JSON，数字与快照一致 |
| v0.2 三张单上屏 | 9/14–9/27 | Vite 静态站三页 + 目录角标 + PWA 离线 + push 即部署 + 二维码 | 网址可开；断网可开上一版；push 到更新无人工 |
| v0.3 师傅后台 | 9/28–10/11 | ADR-0007 写入通道、Worker、/admin 工作台 / 排菜单 / 粘贴导入 / 新食材 / 手动加菜 / 发布回退 | Terry 一周没碰 JSON；采购员自助复制 |
| v0.4 真实数据 | 10/12–10/18 | Wikidata 种子、≥60 食材、≥10 道真实菜到"能教"、词表补齐、测试周材料；**门 B** | 帮厨看过 uk；师傅称过 10 道菜 |
| 真实厨房周 | 10/19–10/25 | 代码冻结，只修 P0，每日日志 | — |
| v1.0 | 10/26–10/30 | 修最痛三个；**门 C**；tag | 帮厨 5 天自己开 /prep；缺料做不出的菜 = 0；生鲜多买 < 20% |

铁律：日期最多滑一周，再滑就砍范围；收尾前三天只修不加；每版一篇 ADR 上限；周末不合并。

任务已拆成 38 个 issue（`.github/backlog/round-1.json`，`node scripts/create-issues.mjs` 同步到 GitHub），每个带完成定义、涉及文件、依赖和分支名；每个里程碑一个跟踪 issue；并行派工按 `scripts/backlog-waves.mjs` 算出的波次（`operating-model.md`）。

## 6. 诚实清单

**已验证**：schema ↔ data 一致性；引擎数字（手算）；乌语备料单和微信采购单能从真实数据生成；视频 → dish.json 契约装得下真实视频。

**未验证**：Gemini / Qwen 真实 API 调用；乌克兰语 ASR 质量；师傅是否愿意按 50 份称重（第一轮最大不确定性）；帮厨是否看得懂机翻的乌语技法名；采购员是否接受"按上次价估算"。后四项只能在厨房里验，这就是第一轮的设计。

**第一轮明确不做**：帮厨勾选、采购员改包数、登录、后端数据库、评分、报告、小程序、第二个厨房、视频导入界面（命令行先顶着）。

## 7. 仓库导航

| 内容 | 路径 |
|---|---|
| 给 Terry 的计划（节奏、门、每周动作） | [plan-for-terry.md](plan-for-terry.md) |
| 给 agent 的执行简报（冻结事项、任务、规则、接口契约） | [execution-brief.md](execution-brief.md) |
| 工作模式（调度 thread + 子 thread 并行） | [operating-model.md](operating-model.md) |
| 目标对齐与演进 | [roadmap-v2.md](roadmap-v2.md) |
| 高保真 | [design/](design/) |
| 决策记录 | [adr/](adr/)（0001–0006；0007 写入通道待写） |
| 数据模型 | [../schemas/](../schemas/) |
| 知识库 | [../data/](../data/) |
| 引擎 | [../packages/core/](../packages/core/) |
| 视频 skill | [../skills/video-recipe-ingest/](../skills/video-recipe-ingest/) |
| 真人测试材料 | [field-test/](field-test/) |
| 调研（只读） | [research/](research/) |
| issue 清单与同步脚本 | [../.github/backlog/round-1.json](../.github/backlog/round-1.json)、[../scripts/create-issues.mjs](../scripts/create-issues.mjs) |

---

*本文为 2026-09-07 快照，取代 2026-09-05 版。仓库为 private；对外分享需 owner 邀请或转 public。*
