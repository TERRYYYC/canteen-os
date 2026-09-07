# 工作模式：一个调度 thread 指挥多个子 thread 并行（2026-09-07）

> 这份文件回答"多个 AI agent 怎么同时干活而不撞车、不跑偏、不漂移"。它是 `docs/execution-brief.md` 的配套：简报说做什么、什么算完；本文说谁在什么时候做、怎么交接、怎么验收。GitHub issue 是唯一的任务队列，分支和 PR 是唯一的交付物，仓库里的文件是唯一的记忆。

---

## 1. 角色

| 角色 | 数量 | 职责 | 不做 |
|---|---|---|---|
| **Owner（Terry）** | 1 | 拍板、合并 PR、跑 `create-issues.mjs` 同步任务、做 owner:terry 的 issue（厨房、验收、门）、周一砍任务、周五看演示 | 不写代码，不改 JSON（v0.3 后） |
| **调度 thread（Helm）** | 1 | 每天：按波次派工、审 PR（跑命令核实，不读汇报）、维护 backlog JSON、写周五三行、守三道门与铁律 | 不自己写大块代码（≤ 30 行的修补除外），不同时开超过并行度上限的子 thread |
| **子 thread（Worker）** | 每波次 ≤ 5 | 领一个 issue → 开分支 → 做 → 自测 → 提 PR（四段式）→ 在 issue 上留一条"交付报告" → 结束 | 不跨 issue 改文件，不改 schema（除 v01-schema-fields），不新增 ADR，不合并自己的 PR |
| **核验 thread（Verifier）** | 按需 | 对涉及数字或黄金测试的 PR 独立手算一遍、对 UI PR 用设计稿逐屏比对、对 worker PR 跑集成测试 | 不改代码；只在 PR 上留核验结论 |

一个子 thread 只活一个 issue 的寿命；上下文小、目标单一、结束即弃。需要"记住"的东西写进 issue 评论或仓库文件，不留在 thread 里。

## 2. 一个 issue 的生命周期

```
backlog JSON ──create-issues.mjs──▶ GitHub issue（open，带 milestone / labels / Blocked by / 分支名）
      │
      ▼ 调度 thread 按波次派工：在 issue 上评论「派给 <thread 名>，预计 <日期>」并 assign
子 thread：
  1. 读：AGENTS.md → execution-brief.md → 本 issue → 涉及文件 → 设计稿对应屏
  2. 建分支（issue 里给的名字），只动"涉及文件"列出的范围；越界先在 issue 评论里问
  3. 做；本地跑 validate + 测试；UI 任务截图对照设计稿
  4. 提 PR（四段式：改了什么 / 怎么验证的 / 没做什么 / 手算算式），`Closes #n`
  5. 在 issue 上留交付报告（§4 格式），结束
      │
      ▼ 调度 thread 审：跑 PR 里写的命令 → 对照 issue 的 DoD 逐条打勾 → 涉及数字的转核验 thread
      │      不过 → 在 PR 上写"哪一条 DoD 没过、怎么复现"，同一个子 thread 或新开一个修
      │
      ▼ Owner 合并（Approve 后一键）；CI 绿；issue 自动关闭；跟踪 issue 的 checkbox 自动打勾
```

**合并权只在 Owner。** 调度 thread 只 Approve。这是防漂移的最后一道闸：任何东西进 main 都过了一双人眼。

## 3. 并行规则

1. **按波次派工，不按人头。** 同一波次里的 issue 互不依赖，可以同时开子 thread；下一波次要等上一波次**全部合并**才开。波次由 `node scripts/backlog-waves.mjs` 从 backlog 的 `blockedBy` 算出，不手排。
2. **并行度上限 5。** 超过 5 个子 thread 同时活着，调度 thread 审不过来，PR 会在队列里腐化。
3. **一个 package 同时只有一个子 thread 在改**（`packages/core` / `packages/web` / `packages/worker` / `schemas` / `data` / `.github`）。v0.2 的五个 web 页面是例外——它们改的是不同文件（`src/pages/prep.ts` 等），共用文件（router、tokens）由脚手架 issue 先定好、其他人只读。
4. **契约先行，mock 并行。** v0.3 的后台页面对着 `packages/web/src/api/mock.ts` 开发，worker 同时在另一个 thread 里做，最后一个 wire-up issue 接线。契约在 ADR-0007 与执行简报 §5，谁改契约谁负责通知另一边（在两个 issue 上都评论）。
5. **schema 只在 v0.1 的一个 issue 里改。** 之后到 v1.0 冻结；任何子 thread 发现"要加字段才能做"，停下来在 issue 评论里说，由调度 thread 决定是砍需求还是走新 ADR。
6. **冲突处理**：rebase 到 main 是子 thread 自己的事；两个 PR 改到同一文件由调度 thread 决定合并顺序，后合并的 rebase。

## 4. 交接格式（写在 issue 评论里，固定四行）

```
做了：<对应本 issue 的哪些 checkbox，一行一个>
验证：<命令 + 输出摘要 / 截图链接 / 网址>；黄金数字附算式
没做：<本 issue 范围内没做的 + 发现但不属于本 issue 的，各一行>
PR：#<n>  分支：<name>  预计审查时间：<小时>
```

调度 thread 的审查结论也固定格式：`DoD 1 ✓ / 2 ✓ / 3 ✗（复现：…）→ 打回` 或 `全部 ✓ → Approve，等 Owner 合并`。

## 5. 每日与每周节拍

**每天（调度 thread）**
- 早：看 GitHub 上 open 的 PR，按到达顺序审；看当前波次还有哪些 issue 没派，派出去
- 晚：更新 `docs/field-test/log.md` 的"今日"一段（≤ 3 行：合了什么、卡在哪、明天派什么）

**每周一（Owner + 调度）**：看本周清单 ≤ 5 项（= 当前波次），砍第 6 项以后的。
**每周五（Owner）**：看演示，必须真实数据；写三行进 `log.md`。
**周末**：不合并。

**版本收尾三天前**：只修不加；调度 thread 把跟踪 issue 里没打勾的项逐条标"本版砍 / 顺延"。

## 6. 第一轮的波次表（由 `backlog-waves.mjs --md` 生成，改 backlog 后重跑）

同一波次里的 agent 任务可同时开子 thread；下一波次等上一波次全部合并。
### v0.1 收尾工程（截止 2026-09-13，agent 并行度峰值 3）

| 波次 | agent 任务（可同时开） | Terry 任务 |
|---|---|---|
| 1 | v01-schema-fields schema：新增本轮准许的全部可选字段 _(schema)_<br>v01-translate scripts/translate.mjs：DeepL + 术语表 + translations.lock.json _(data)_ | v01-terry-kitchen 确认真实厨房与菜贩清单（门 A） |
| 2 | v01-types-gen types：从 schema 生成 TS 类型，或加 CI 一致性检查 _(core)_<br>v01-build-data scripts/build-data.mjs：data/ → 三张单 JSON + build.json _(core)_<br>v01-renderers 渲染器：备料单按 timing 分组、菜单成分句与 ≈克重、readiness 接入 _(core)_ | — |
| 3 | — | v01-release 收尾：tag v0.1、CHANGELOG、周五演示记录 |

### v0.2 三张单上屏（截止 2026-09-27，agent 并行度峰值 5）

| 波次 | agent 任务（可同时开） | Terry 任务 |
|---|---|---|
| 1 | v02-web-scaffold packages/web 脚手架：Vite + TS、tokens.css、字体、路由、目录角标抽屉 _(web)_<br>v02-deploy build-deploy.yml：push main → translate → build-data → vite build → Pages _(ci)_ | — |
| 2 | v02-prep /prep 备料单：A 列表 + B 详情 + timing 筛选 _(web)_<br>v02-purchase /purchase 采购单：按供应商分组、trace 展开、复制微信文本 _(web)_<br>v02-menu /menu 菜单：日期条、菜品行、详情抽屉（Expirenza 骨架） _(web)_<br>v02-pwa PWA：manifest、Workbox 离线缓存、新版本提示 _(web)_<br>v02-qr 二维码：构建期为三张单入口生成 PNG _(web)_ | — |
| 3 | v02-e2e Playwright 冒烟：三页可开、语言切换、复制按钮 _(web)_ | v02-terry-helper-test 帮厨看 /prep 5 分钟，记录第一句话 |
| 4 | — | v02-release 收尾：tag v0.2、CHANGELOG、周五演示 |

### v0.3 师傅后台（截止 2026-10-11，agent 并行度峰值 4）

| 波次 | agent 任务（可同时开） | Terry 任务 |
|---|---|---|
| 1 | v03-adr-0007 ADR-0007：写入通道（静态后台 → 云函数 → GitHub API）与链接令牌 _(docs)_<br>v03-secrets-scan CI 密钥扫描（gitleaks 或等价宽松协议工具） _(ci)_ | — |
| 2 | v03-worker packages/worker：写入端点、令牌校验、触发构建、回退、集成测试 _(worker)_<br>v03-admin-home /admin 工作台：六块 + 未发布计数 _(web)_ | — |
| 3 | v03-admin-plan /admin/plan 排菜单：周视图、±10 步进器、日/周/月、复制上周、采购单预览 _(web)_<br>v03-admin-import 粘贴导入：宽松解析器 + 逐行结果 + Excel/CSV 上传 _(web)_<br>v03-admin-ingredient /admin/ingredient/new 新食材：一屏填完、即时机翻、拍照/Wikidata 取图 _(web)_<br>v03-admin-publish /admin/publish 发布：改动列表、四步进度、回退、二维码页 _(web)_ | — |
| 4 | v03-admin-dish-manual /admin/dish/new 手动输入分支（视频分支占位） _(web)_ | — |
| 5 | v03-wire-up 后台接真实 worker：替换 mock，端到端 写入 → 发布 → 回退 _(web)_ | — |
| 6 | — | v03-terry-acceptance 亲自用后台排一周并发布；采购员自助复制<br>v03-release 收尾：tag v0.3、CHANGELOG、周五演示 |

### v0.4 真实数据（截止 2026-10-18，agent 并行度峰值 2）

| 波次 | agent 任务（可同时开） | Terry 任务 |
|---|---|---|
| 1 | v04-seed-wikidata scripts/seed-wikidata.py：按 QID 清单拉三语名 + 图 + 许可 _(data)_<br>v04-field-test-kit 测试周材料：操作指南、日志模板、二维码打印、P0 定义 _(docs)_ | — |
| 2 | v04-ingredients-60 食材 ≥ 60（含调料 ≥ 20），每个有采购规格 _(data)_ | — |
| 3 | — | v04-dishes-10 真实菜单 ≥ 10 道菜到“能教”：导入 + 师傅称重 + 切配照片 |
| 4 | v04-techniques techniques.json 补齐 10 道菜的技法；uk 由帮厨看一遍 _(data)_ | — |
| 5 | — | v04-gate-b [门 B] 测试周前检查清单 |

### v1.0 第一轮收尾（截止 2026-10-30，agent 并行度峰值 1）

| 波次 | agent 任务（可同时开） | Terry 任务 |
|---|---|---|
| 1 | — | v10-test-week 真实厨房周 10/19–25：代码冻结，每日日志 |
| 2 | v10-fix-top3 复盘：修测试周最痛的三个问题 _(-)_ | — |
| 3 | — | v10-gate-c [门 C] 第一轮退出标准核对 + tag v1.0 |

v0.3 的 web 页面在同一 package 里并行，靠"一页一文件 + 共用文件只读"避免冲突；v0.4 本质上是人的工作（称重、拍照、看乌语），agent 并行度低是正常的。

## 7. 子 thread 的开工提示词（调度 thread 复制粘贴，只改尖括号）

```
你是 CanteenOS 仓库的一个子 thread，只负责 issue #<n>「<title>」。
先读 AGENTS.md、docs/execution-brief.md、本 issue 全文、issue 里"涉及文件"列出的文件<，以及 docs/design/<file> 的第 <k> 屏>。
规则：只改"涉及文件"范围；不改 schema；不新增 ADR；不合并自己的 PR；不确定就在 issue 评论里问，不猜。
分支名：<branch>。完成定义以 issue 的"完成定义"为准，逐条自测。
提交 PR 用仓库模板（改了什么 / 怎么验证的 / 没做什么 / 手算算式），Closes #<n>。
结束前在 issue 上留四行交接（做了 / 验证 / 没做 / PR）。
```

## 8. 三个防漂移的机械动作

1. **改任务先改 JSON。** 任何人（含调度 thread）想加、删、改任务，改 `.github/backlog/round-1.json` 再跑 `create-issues.mjs`；直接在 GitHub 上建的 issue 视为临时，收尾时要么进 JSON 要么关掉。
2. **审查跑命令。** 调度 thread 审 PR 时必须复跑 PR 里写的验证命令，不接受"已测试"三个字；跑不出来就打回。
3. **每版一篇 ADR、每周五三行、每天日志三行。** 文档增量超过代码增量时，调度 thread 停下来问自己在干什么。

## 9. 沙箱里的 agent 怎么交付（不需要 Owner 当路由器）

沙箱对仓库目录禁止删除/重命名，所以 agent **不能在原地 commit，也不能 push**。绕法已验证可行：

```
子 thread：
  git clone <仓库路径> /tmp/wt-<slug>        # 克隆到沙箱可写区
  git checkout -b <branch>                    # issue 里给的分支名
  …改代码、跑校验、跑测试…
  git commit（作者 canteenos-agent）
  git bundle create /tmp/<slug>.bundle main..<branch>
  cp 到 <仓库>/.handoff/<slug>.bundle + 写 <slug>.json {issue, branch, title, body}
Owner（每波一次）：
  node scripts/land.mjs                       # fetch 分支 → push → gh pr create → issue 留言
  在 GitHub 上看 CI 与调度线的 Approve → 点合并
```

Owner 的介入被压到两个动作：跑一次 `land`，点合并。合并权保留在人手里是有意的（§2）。

调度 thread 自己有 subagent 能力时，§1 的"派工"就是直接开子 thread，不需要 Owner 转达；§10 的两个常驻 thread 可以合成一个。

**GitHub 连接器可用时（2026-09-07 起已打通）**：调度线不走 bundle，而是在 /tmp 克隆里核对后直接用连接器 `create_branch` + `push_files`（每个原始 commit 一次）推到 origin 同名分支、`create_pull_request` 开 PR、贴审查评论、按护栏 `merge_pull_request`；推完用 `git fetch` 对比远端分支与本地 bundle（`git diff` 必须为空）再开 PR。前提：GitHub App「Claude Github MCP Connector」已安装到本仓库（Settings → Applications → Installed GitHub Apps），否则写操作 403。`land.mjs` 保留为备用路径。

## 10. 两个常驻 thread 与它们之间的接口（当调度 thread 无 subagent 能力时适用）

除了一次性的子 thread，只有两个 thread 是常驻的。它们**不通过聊天互通**，只通过仓库文件：

| thread | 管什么 | 产出（写进仓库） | 不管什么 |
|---|---|---|---|
| **功能讨论区**（本轮首个 thread） | 做什么、不做什么、为什么；范围与优先级的争论；设计取舍；第二轮候选 | `.github/backlog/round-1.json` 的增删改、`docs/plan-for-terry.md` §7 不做清单、ADR 草案、`docs/design/` 改稿、`docs/round-2-backlog.md` | 派工、审 PR、催进度 |
| **调度线**（Owner 新开） | 谁在做什么、做到哪、卡在哪；按波次派工；审 PR（跑命令）；守日期与铁律 | issue 评论（派工 / 审查结论）、`docs/field-test/log.md` 每日三行、跟踪 issue 勾选、周五三行 | 决定范围；改 schema；写 ADR |

接口规则：
1. 讨论区改了 backlog JSON → Owner 跑 `create-issues.mjs` → 调度线在下一次派工时自然看到新 issue。调度线不改 JSON；它发现任务不合理，在 issue 评论里写"建议回讨论区"，Owner 带回来。
2. 调度线发现范围问题（"做这个要加字段"）→ 停下，issue 评论里写明，Owner 带回讨论区裁决。
3. 讨论区不直接命令子 thread。所有"去做"都经过 backlog → issue → 调度线。
4. 两个 thread 都以仓库 HEAD 为准。每次开工先 `git pull`（Owner）并读 `CHANGELOG.md` 顶部与 `docs/field-test/log.md` 末尾，不靠记忆。

### 调度线的开工提示词（Owner 新开对话时粘贴；2026-09-07 第二版，含 subagent 与 GitHub 连接器）

```
接手 CanteenOS 调度（Helm）。仓库 ~/Desktop/coding/chief-master/chief-master/canteen-os（GitHub TERRYYYC/canteen-os，private）。你的记忆里有工作方式（canteenos-helm-workflow）。

先做三件事：
1. 检查 GitHub 连接器：有没有 github 的 MCP 工具（create_branch / push_files / create_pull_request / merge_pull_request / add_issue_comment）。有 → 推分支、开 PR、评论、合并全由你走；没有 → 退回 .handoff bundle + 我跑 scripts/land.mjs 的备用路径，并把连接器的报错原文告诉我。
2. 读：AGENTS.md → docs/execution-brief.md → docs/operating-model.md → docs/plan-for-terry.md → CHANGELOG.md 顶部。跑 node scripts/backlog-waves.mjs --milestone v0.1。
3. 落地已审过的第一波：.handoff/schema-v01.{bundle,json} 与 .handoff/translate-v01.{bundle,json}（json 里有 issue、branch、title、PR 正文、审查结论）。在沙箱 /tmp 克隆里从 bundle 取出分支，用连接器把变更文件推到 origin 同名分支 → 开 PR → 把 review 贴成评论 → 在 issue #1 #4 留言 → CI 绿后按护栏合并（先 #1 再 #4）。工作树里还有未提交的基础设施改动（scripts/land.mjs、scripts/backlog-waves.mjs、.gitignore、package.json、docs/operating-model.md、.github/backlog/round-1.lock.json）——单独开一个 chore PR 一并合并。

之后按波次自动推进：第二波 #2 #3 #5 三个子 agent 并行（子 agent 在 /tmp 克隆里用 bash 改文件，不碰工作树）→ 你在干净克隆上复跑验证命令审查 → 推 → PR → CI → 合并 → 下一波。每波结束在 docs/field-test/log.md 追加三行（合了什么 / 卡在哪 / 明天派什么）。

合并护栏：只在 CI 绿且你复跑过验证命令后合并；schema、ADR、workflow（.github/workflows）三类改动只 Approve 不合并，等我点；每次合并在 issue 上留审查记录。不新增实体、不新增必填字段、每版最多一篇 ADR、周末不合并。
遇到范围问题（"要加字段才能做"）停下写在 issue 上，标"建议回讨论区"，不自己决定。
周一提醒我砍到 5 项、周五提醒我看演示。门 A（真实厨房）是我的任务 #6，提醒我。

不要让我跑命令、不要让我粘提示词；能自己做的都自己做，做不了的说清原因。
```
