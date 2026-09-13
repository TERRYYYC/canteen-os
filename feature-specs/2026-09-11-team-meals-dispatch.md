---
feature_ids: []
topics: [canteen-os, team-meals, dispatch, contracts, acceptance]
doc_kind: implementation-dispatch
created: 2026-09-11
status: active
---

# 小团队餐食改造调度

**目标（2026-09-12 纠正）：** 将绿色 Reference v3 的视觉、导航和信息层级接入真实应用，服务小团队“每天吃什么 → 全部已录食材与调料 → 人工确认哪些需要买 → 查看同版材料和来源菜品”。份数可选。原始用户要求是“高保真 + 页面契约 + 标准数据 + 验收用例”；业务收缩没有撤销高保真目标。

**主调度任务：** `01a08d6d-be28-7142-ad8e-3f964658d3f4`。规划、核查、独立 review 在这里；实现和测试在独立任务。设计任务 `01a08a59-54c5-7122-8004-c737b2dd80ca` 保留设计用途，不自动回传工程进度。

**验收：** 同时满足“目标视觉对齐”和“T01–T09 行为通过”，两者分别记录，功能通过不能替代整体完成。视觉依据是 `canteen-os-design@2f890d8f182d02e8ed4acb55a865e8aa086416dd` 的 `docs/design/reference-v3/`，按下文适配小团队行为。C01–C12 保留兼容回归。没有顾客订单、履约、实际供餐统计、顾客反馈、经营报告、完整归档平台或永久菜单行 ID 迁移。

**架构：** 延续 JSON、schema、core 和受控 GitHub 写入。新增引用收集和 ShoppingList 合同；数量引擎仍是唯一估算入口。Architecture cell：本仓无 ownership map，以本文件的文件负责人表为准；Map delta：none，不新建架构地图。

**当前阶段：** 用户已于 2026-09-13 明确同意审查通过后合并，并要求更新版本信息。现由原 CI 任务唯一负责最终集成和版本实现，调度核对审查/验证后执行 PR 合入与预发布记录；真实 Worker/隔离环境和实际菜谱仍未提供，不将代码合入等同于这些条件完成。

## 2026-09-12 高保真更新（本轮唯一状态入口）

### 当前：已获准合并并更新版本（2026-09-13 10:15 UTC）

用户原话：**“如果已经完成review，我这里同意合并 但是需要做到版本信息等内容的更新。”** 该明确新授权解除下方历史记录中的本地整合、推送/PR及自行合并限制；以覆盖最终内容的独立审查和适用验证通过为前提。本轮可以整合、推送、创建并合并本次 PR，更新对应版本记录；不据此创建真实 Worker 凭据或用生产数据做试写。

- **版本：** 已确认远端最新预发布为 `v0.3.0-alpha`；下一版使用 `0.3.0-alpha.1`。根/三包清单、CHANGELOG、README中英现状、project-summary及应用抽屉版本显示同步，历史发布段落保留。应用版本来自单一包元数据，独立于资料的更新时间/commit，保持三语与现有编辑/PWA保护。
- **唯一实现 owner：** 原 CI 任务 `01a08d84-b626-75f2-a4f2-057cb5f4b4a9` 在独立 worktree / `codex/team-meals-final` 整合 D `27581cf`（产品 `6c0657c`）、CI `dc6f484`（配置 `563e08b`）、Q `3a2df80`。先核实祖先和实际冲突；保留各原工作树、测试资料及浏览器，不额外创建任务或 agent 树。版本显示所需 shell/Vite/类型和相关测试仅作最小范围授权。
- **审查与验证：** 已审内容按文件/语义连续性继承；原非作者只补真实冲突、版本显示及当前文档差异。冻结实质内容后执行本仓现有 CI 对应的跨包检查一次；不虚构本仓不存在的 `pnpm gate`、不重复旧浏览器矩阵，不在审查后提交回执文档制造续审循环。新版本展示以针对性检查和一次真实页面观察核验。
- **合入与发布：** 调度于10:15 UTC只读确认 main仍为 `1503074751c65d4a1d1d2ef3d834ad850e4559e6`。本次最终 PR 独立于仍开放的设计#91和旧夹具#92。合并会触发现有 Pages工作流；当前没有配置Worker地址时，发布为准确标示的只读模式。新tag/GitHub预发布记录绑定实际合并提交，保留真实环境/菜谱未验边界，等待真实工作流终态后再报告上线结果。

下方是本轮合并授权前的固定候选和实测证据，限制性措辞为当时历史事实。

### 前一轮：完成全部剩余项（2026-09-13 05:47 UTC 接续）

用户明确要求继续完成所有未完成内容。原任务继续，已通过的原生旅程继承；调度维护本节及 backlog，不新建任务或 agent 树。当前 UI、CI 和验收工具分别保留固定提交；本地跨分支集成因自动审批拒绝而暂停，不能将独立候选误称为统一交付版。

| 剩余项 | 当前事实与完成条件 |
|---|---|
| 界面与文案 | D 的 `1d83fbb10e3c980b41e64ef34fbe82905b559b84` 完成菜单提示、详情授权、计划状态、采购/Prep 密度、返回触控、空新菜 dirty、选填份数和开发文案。原非作者已 APPROVE；相关 271 项及备注增量 55 项、类型和两配置体积检查通过。UX 已独立确认主要信息层级、完整备注/步骤、原采购判断及 44×44 返回；Chrome 已独立看到未保存离开确认，取消后的控制/清理受工具审批限制；食材视频文案和 QR 团队三语保留 D 原生证据，Q另完成 QR 页面/打印，不把它们称为 UX 本人完整复验。 |
| QR 生成与打印 | Q 从正式生成器的三张 512×512 PNG 独立解码出正确地址，真实打印为一页三图三语，但发现底部导航进入纸面。D 固定修正 `6c0657c560754bea0123c522a5dc8ae9a8cc2216` 仅改 qr.css 的打印隐藏选择器及对应测试；16/16、类型/diff 通过，原非作者已 APPROVE，无开放代码 P1/P2；Q 已对原6c静态输出在4282独立原生复验，一页三图三语、完整地址保留，应用导航消失，取消打印。此输出码指向现有正式 Pages，不能说明新版已部署；Q早先f26码则为本地目标。 |
| PWA 与离线更新 | Q 固定 `f26db15`、集成 `b55cf90` 的真实生产 SW/Chrome 已完成：断开应用服务后重载菜单/备料与已读同版图片；未读图明确未载入；A/B 图片正文按 commit 隔离；dirty 拒绝/明确丢弃一次更新；saving/unknown 原页与离页不能强刷，核实只回读、不重复 POST。1d83 和打印 CSS 没有修改该生命周期。C 的 `7405631` 仅封存准备范围，无新增产品修改。 |
| 发布按钮和本地运行链 | Q 真实页面实际 Save 后公共值保持 37；实际 POST /publish 经真实 Worker 认领 run 8100，queued→success，完整 producer/QR/Vite 成功后公共目录切至 `3f49e0b77c3f1931956bc7cd1f3af4bfeaf5fc57`，更新后显示 39。GitHub dispatch/runs/jobs、托管和运行时间是本地模型，未执行远端 L2。 |
| 发布配置 | CI `563e08b00026542d04bcc06ee8fc4a970e5041e5` 已获原非作者固定 SHA approved，无开放 P1/P2。仅 workflow、.env.example、原 ops 文档和配置测试四文件；仓库 Secret 保护校验前输入，合法公开 Worker 地址才交 Vite，空值准确标为只读；非法值不回显。34/34 配置接线及原 16 项发布映射通过，三种 Vite 配置编译证据保留；未实际设 Secret/触发 Actions。实际发布命令也已 GREEN：Node20.20.2/pnpm9.15.0、只清除临时副本旧QR与dist、唯一SITE_URL，直接执行原 `pnpm -C packages/web build` 自动运行 prebuild，三PNG/index新生成并进入dist，8份实际文件哈希由调度再次核对一致；首次运行即通过，无接线修改。 |
| 真实部署与菜谱 | 只读核实 Pages 存在，远端 main `1503074751c65d4a1d1d2ef3d834ad850e4559e6`，9/11 Build & Deploy 成功；仅 github-pages 环境，仓库 Actions 变量/secret 名单为空，常见本机 Wrangler 配置目录未发现。当前仅占位视频演示菜谱。已询问用户实际菜谱位置及既有 Worker/测试仓地址，尚无回复；不能声明实际厨房可用或完整可写上线。 |

**直接核验与证据边界：** 调度逐字比较 4275 实际 64 Web + 30 Worker 源与 `1d83fbb`，94/94 一致；packages tree `53dcab9c6e2ce73af50b850e6433da20706c0316`。托管 PID 89360，租期至 `2026-09-13T14:10:05.773Z`，原 18 记录及保存状态保留。Q 当前证据头 `3a2df80c8b66da8a414ae62ab1d68b868bf37b9d`，唯一入口仍为 `docs/field-test/team-meals/page-integration-matrix.md` 顶部；调度实核 99 份原件哈希与大小全匹配，冻结账本 SHA256 `dc14757a496d282156cb8088783388538fd579f7ff0bee65555b8301c4b07aa6`。账本共 49 请求，29 条 JSON 200、20 条旧图片代理错误保留；原生 POST 仅 14/22/34 三次 Save 和 41 一次 publish。Q 误读初始 about:blank 的 SW 容器及把 PNG 当 JSON 两个工具问题已独立红绿/原生修正，4281 首文档直接接管、PNG 字节一致；不把工具异常改写为产品失败，也不声称原 49 请求全成功。

**待确认的具体操作：** 自动审批拒绝向 D 下发“将已审 CI 563e08b 并入 UI 分支”的指令，理由是原“不得自行合并”也涵盖本地合并。未重试或改用 cherry-pick/文件拼装；UI/CI 分支独立保留，其他验证继续。原已有推送/创建 PR 外发审批限制也保持，本轮尚未创建新 PR、推送、设置远端配置、合入 main 或部署。已完成独立代码审查、主要体验及打印，现向用户交付具体 SHA、证据和最终集成/PR 范围再确认，不在审批前调用生产默认 Worker。

**协调与已知限制：** UX 当前 IAB 新标签 9 在未保存的临时菜名离开操作后控制超时；视口已恢复，标签清理未确认。其独立 Chrome 标签已实际出现离开确认，但取消后控制再次超时，06:29 的 Chrome 原生应用访问在等待审批；不把此工具限制算作产品失败。D 保持 4275 固定 1d83。D 已从原6c正式构建输出提供只读静态预览 `http://127.0.0.1:4282/#/qr`（至08:34 UTC），Q已在自有标签完成打印；不触碰UX表单或整合分支。4275继续保持1d83，独立6c只新增打印隐藏规则。远端基线只读比较：已知上游 `1fdaf7b` 到 main `1503074` 仅两提交、两文档（docs/field-test/log.md、docs/ops/sandbox-headless-chromium.md）；这不是三方合入结果。

**发布命令证据：** `/private/tmp/canteen-qr-command-3j4_9d64/validation.json`（SHA256 `1cf7d1311ae7195d77aca13873f2340d4120c91393742731a88b404e223d3fd3`）及原 `red.log`。执行06:46:39.589–06:46:42.105 UTC，生成06:46:40.209 UTC，目标为本次唯一测试地址。red仅初始目录/日志标签，首次执行没有失败；不记作额外修复，也不推定真实Actions已执行。

**已备妥的最终审批范围：** UI 产品 `6c0657c`（打印结论记录头 `27581cf517bba25cc796dcb84dd96373d27d84f1`）、CI配置 `563e08b`（最终说明 `dc6f484ea39c5c46eb4be1a37f5cd7479d99ffb1`）、Q 工具与原生证据 `3a2df80`。拟在 `TERRYYYC/canteen-os` 的 `codex/team-meals-final` 分支整合这些现有已审产品/配置和验收工具，保留历史并处理必要的文档差异，针对实际集成差异完成检查后推送该分支、创建待审 PR；main 保留人工审批，真实 Worker/凭据/部署仍另需具体环境。当前只准备这一范围，未执行被拒操作。PR 主题为“小团队餐食管理：接通高保真页面、采购判断与同版资料”，说明以完整小团队流程、视觉修正、真实本地保存/发布/离线证据及未完成远端条件为主，不把原测试资料称为生产菜谱。


### 前一轮：可开始本地手动测试（基辅 2026-09-13，UTC 09-12 23:22）

用户要求“对准最终目标开始进行任务”。本轮已沿原 Reference v3 和小团队“排菜 → 看菜单 → 人工确认采购 → 查看原配方备料”的目标完成修正及独立验证。固定产品 **`4b1e5e13a82bd5a2437f95df20aaf49f77f8996f`**，packages tree `88c692b92359a42bad85c4106645ee0c3627c863`，D 文档头 `7bbfe22`。本节是当前状态；下方旧失败记录和历史阶段不改写为新版本实测。

**本地入口：** [当前菜单](http://preview.localhost:4275/#/menu)、[备料](http://preview.localhost:4275/#/prep/2026-09-10)、[采购](http://preview.localhost:4275/#/purchase)。原 18 份数据及保存状态保留。调度直接逐字比对 64 个运行 Web 源和 30 个 Worker 源与固定 Git 一致，并核实托管 PID 44305、有效期至 2026-09-13 06:58:46 UTC。D 和原体验审查均已结束浏览器操作，临时视口已恢复。

**R1 已关闭：同范围旧单可辨识、可正确续用。** 原体验审查从采购入口按真实待核对 2 / 待买 0 / 已有 1 / 已买 1 找到原单，不用输入编号；同范围 Continue 保留油已买、盐已有。明确另建产生独立未保存草稿 4 / 0 / 0 / 0，未改动原单。对应 Q 独立保存试验也通过，见下一段。

**R2 已关闭：备料工作内容前置且原资料保留。** 原体验审查在 393×852、scrollY=0 实测番茄 300 g 位于 y=391.89，盐“适量”也在首屏；300 g / 适量 / 20 ml、完整记录步骤、原备注、其他语言和来源版本均可读。空时机解释及 View all 恢复成功，缺做法的补齐入口实点进入对应菜品编辑页且未修改。原复验报告仍为唯一体验入口：`/Users/terry/Documents/Codex/2026-09-12/canteen-human-usage-audit/outputs/retest-20260913/CanteenOS-修复后复验.md`。旧 `68258e9` 失败正文保留。4275 复验末尾无新写请求，HEAD 仍为 `47a18f67c26f554da9e0b6a7ce985708f49ff22e`。

**Q 数据及页面验证通过：** Q 固定 `890cefd`，运行集成 `d9565a4`，仅追加 4b1e5e1 变化；原 `68258e9 / c2f2b3a` 的留空份数保存、本地正式生成后菜单更新、单清单保存/重开、详情返回、缺资料恢复及丢 ACK 核实旅程继承。新轮实际 Save 仅第 15/16 条，分别有 create-only 与正确 If-Match，均返回 200；新单 2 / 1 / 1 / 1、原单 1 / 1 / 2 / 1 与七次真实索引一致，已买未重复计入待买。Prep 原五项用量、三段步骤和空时机恢复保留。调度独立读冻结账本并比较前后文件，确认只新增一份采购单，原十份记录逐份未变；原 4277 和旧冻结证据也保留。Q 唯一详细入口为 `canteen-os-team-acceptance/docs/field-test/team-meals/page-integration-matrix.md` 顶部；增量账本 SHA256 `a062584369d946f5a7b7af58871c378d6ddf048711f05d6dfe6bb6543d5e99d8`，原生操作证据归 Q，不当成体验审查者的操作。

**代码与构建证据：** 原非作者 `/root/plan_review` 固定 4b1e5e1 的代码结论 APPROVE，无未关闭代码 P1/P2；独立 112 项相关检查、5 项状态探针及类型/编译通过。调度直接读 `/private/tmp/canteen-daily-choice-review-4b1e5e1/CODE-REVIEW.md`。该 reviewer 原生浏览器不可用，未把作者截图当作独立原生操作；独立原生责任已由上述原体验审查完成。作者原两种配置的 44 项体积检查通过，非作者消费其结果；不宣称新一轮独立构建或完整 PWA 认证。

**交付边界与下一步：** 现在可开始完整本地手动测试。菜单/详情/计划的主要结构已对照原高保真，最后两项日常体验阻断关闭；部分卡片密度、较小返回触控区域与次要文案仍属非阻断打磨。当前预览使用明确标示的未核验演示资料，用户尚未提供真实菜谱位置，不能据此承诺实际下厨。原本地 runBuild 不等于产品发布按钮、远端 GitHub/Cloudflare 发布或 PWA 更新；二维码生成/打印亦未认证。保留这些真实边界，不把局部测试数或任务状态当作生产完整。没有新建任务/agent、全量重跑、回执包、合并、推送或部署。

以下为初次问题及修复过程，当前完成状态见表：

用户在本调度任务要求“继续任务”。已读取独立任务“审查餐食管理的日常使用体验”（`01a095b5-888f-79b0-8b17-d666e5200a92`）完整报告及证据索引：`/Users/terry/Documents/Codex/2026-09-12/canteen-human-usage-audit/outputs/CanteenOS-日常使用体验审查.md`。其 1280×720 只读浏览器走查核对运行副本匹配 D 产品 `11c8a98`；报告的保存提交、发布、手机实机和离线部分仍未验证。

既有 D 交付头 `7f824a2`、固定产品 `11c8a98` 的 165 项相关测试、44 组体积检查和局部独立批准保留；它们不覆盖下列整站体验缺口。原 D 任务 `01a08db7-43f3-7952-adb5-75106389e557` 已收到继续实施指令。调度只维护本节，实施在既有 checkpoint 中给出代码与复验证据，修复后回原体验审查任务复验，不新建实施任务或回执包。

| 项目 | 本轮完成条件 | 当前责任与状态 |
|---|---|---|
| 保存遮挡 | 菜谱、食材及同类编辑页的主要动作位于导航上方；鼠标命中、键盘和手机视口可操作 | D 已修；原体验审查手机/桌面命中、键盘与返回实测通过，Q 实际保存另有证据 |
| 备料与技术输出 | 用当前语言、菜名/材料名、日期、影响和可行下一步呈现问题；普通流程不显示原始 JSON/内部编号/裸布尔值；保留缺资料告警及准确来源 | 4b1e5e1 已补齐 S04 层级，原体验审查 R2 首屏/步骤/缺项/恢复通过；原技术内容外露修复继承 |
| 采购连续性 | 从计划带入范围并生成内部 ID；普通人可找到本次/最近清单；详情返回当前清单；本机历史不能冒充服务器全量清单 | 4b1e5e1 的 R1 原体验实测关闭；Q 独立另建、保存、重开与原单隔离验证通过 |
| 一致状态与入口 | 计划范围取数一致；无待发布改动、无发布记录、线上未知分别表达；空筛选有解释/恢复；未开放入口和不可用按钮不误导 | D 已修并关闭切计划复用旧快照问题；原体验审查六组复验中的状态/恢复检查通过 |
| 样本诚实性 | 明示图名与测试配方的边界；为流程走查使用信息一致的既有样本；未经人工确认不得声称厨房可用 | D 已明示不完整测试配方；Q 使用一致的演示/未核验番茄炒蛋，真实菜谱人工核验仍缺 |
| 独立完整走查 | 排菜保存→本地正式生成器更新公开资料后查看→找到采购清单并保存判断→重开→备料；覆盖留空份数、缺资料与保存失败恢复；本地生成模型不等于远端真发布 | Q 完整原生旅程及固定新版差异通过；原体验审查独立关闭 R1/R2，当前可交本地手动测试 |

本轮明确补入 D 的受影响 admin/home、publish、菜谱/食材编辑页、prep、二维码等页面呈现与页面级动作。共享 API、认证、会话、路由语义、core/Worker 保持只读；不得硬编码某个样本计划修口径。实现者发现必需跨界变更时先记录最小方案，其余工作继续。原预览租期已到；D 负责按既有托管方式保留样本并恢复预览，重新核实版本和到期时间前不承诺链接可用。

已核查两项验收边界：仓库仅有的番茄炒蛋仍含示例视频来源，已异步询问用户实际菜谱位置，界面修复继续；原 Q 的 `page-server.mjs` 明确禁止 publish/rollback 且仅启动时生成公开资料，故恢复原 Q 任务 `01a08d74-9915-7191-ba9f-3177c587e52a`，仅补隔离本地正式生成器往返测试，不放开旧预览保护、不对外发布、不操作 D 的共享样本。Q 的准备状态仍在原验收矩阵入口，不增加交接包。

**最小接口增授：** 调度已核验现有 `GET /catalog` 和 TeamMealsApi 不包含计划/采购清单索引，原 B/C 任务当前均 completed/notLoaded。D 可独占增加受原认证和 read 桶保护的“已保存采购清单”只读索引、前端对应方法/类型及必要测试；发现结果须有准确的数量/部分结果/错误边界，打开仍走原校验读取。不得变更 schema、写入端点、If-Match、来源版本语义或认证实现；公开计划优先消费既有 manifest。此项是上一段只读约束的明确例外，超出该最小边界才再报方案。Q 的既有 e2e server/fixture 由 Q 独占。预览已由调度独立核对 running/launchd、HTTP 200，租期至 `2026-09-13T02:21:25.533Z`；此时仍为修复前版本。

### 前一轮目标与排菜检查点（历史，当前状态以上节为准）

用户经独立复盘任务明确授权“基于你的计划，回复你之前的thread 开展update 的任务”。本轮由原 RC-D 实施，原 RC-Q 和必要的原非作者 reviewer 验证产品变化，调度对完整体验负责。不开新的实施任务，不为状态同步新增独立审查，不复制历史回执包。

**原始目标核验：** 设计任务 `01a08a59-54c5-7122-8004-c737b2dd80ca` 原始记录 2026-09-10 第 10 行明确高保真接入，第 553 行仅收缩业务范围，第 787 行授权设计/调度分线。复盘及证据索引位于 `/Users/terry/Documents/Codex/2026-09-11/canteen-delivery-retrospective/outputs/`。原 D0 中 `screens-v2 + backoffice-v1` 的视觉依据被本轮明确替换，旧稿仅作行为兼容史料，不再覆盖新版外观目标。

| 项目 | 本轮明确要求 |
|---|---|
| 视觉来源 | 设计工作树固定 `2f890d8` 的 Reference v3；先 S08 / `[data-screen="plan"]`，再 S02 菜单、S09 采购、必要的 S03/材料详情。设计工作树未提交文件只读保留 |
| 必须对齐 | 绿色主色与浅色背景、清晰的无衬线字号层级、紧凑日期/餐次选择、图文菜品行、主要动作位置、核心导航的组织与激活状态；不能仅换颜色 |
| 允许且必须的适配 | 份数可以未录；不突出人数/总份数，不默认补 1；真实范围和已有保存保护继续使用；采购围绕人工判断，不照搬自动预算/库存；原型工具栏、假手机状态栏和顾客模块不进入产品 |
| 第一张真实页面 | 在实际 main/router/Plan/API 路径中运行，可选日期、加菜/编辑/留空份数、找到保存及采购入口；不能用独立静态原型替代。明确固定样本与 API 模式，优先使用原预览能力 |
| 对照方式 | 首次中文 393×852，同语言、尺寸、尽量同菜品和条数；桌面 1440×900及 en/uk 长文随后做受影响抽样；记录真实剩余差异而非还原百分比 |
| 推进顺序 | D 修正现有 D0 中视觉依据并实施排菜；调度看到可点击实页并与绿色稿对照，方向吻合再扩大到菜单/采购/详情；有实质偏差立即纠正，不等待全部工程细节收口 |
| 验证边界 | 只测变化关联行为、黄金路径和至少一个失败/未保存状态；公共视觉改动抽样兄弟页。未改的底层模块不重审、不全量重跑；发生回归再扩大 |
| 资料与代码归属 | D 保留既有页面/CSS范围，并可复制来源清楚的图标/静态视觉资源；本轮临时增授 `src/shell.ts` 的导航/呈现及必要本地化、对应壳测试，原 C 保持只读。API、编辑会话、认证、路由语义、core/Worker不改；如必须改这些边界先报具体最小变更 |
| 状态及成本 | 本节维护可见进度；backlog 仅保存阶段及负责人指针。开始 2026-09-12 07:30 UTC，首个可见检查点最迟 08:30 UTC；账号共享周用量读取为 22%，同窗口新增约10个百分点或连续60分钟无可见成果即重判价值，不重置额度 |

**当前结果（首屏已展示并复查）：** 原D已将排菜实现固定为 `19fcb00`，单一检查点为 `docs/field-test/team-meals-pages/green-v3-plan/checkpoint.md`（完整交付头 `0c9caca`）；记录34/34相关测试、两次本地保存及三语/尺寸抽样。调度在07:53 UTC前展示第一张真实页面，并已独立复查稳定地址 `http://preview.localhost:4275/#/admin/plan/team-week`：3图菜品、绿色日期栏、顶部导入、20px边距、底部导航及保存/采购首屏清楚；选9/11时新增摘要同步9/11，未编辑或保存用户资料。开发预览使用实际main/C客户端/Worker与本地FakeRepo，PWA生产配置未改，不计作离线/更新认证。托管状态08:16 UTC核实running/launchd，16:05 UTC到期；旧127.0.0.1地址的缓存文档不再作为本轮验收依据。稳定截图：`/Users/terry/.codex/visualizations/2026/09/10/01a08d6d-be28-7142-ad8e-3f964658d3f4/green-update-20260912/stable-actual-plan-zh-mobile.jpg`。排菜视觉方向通过，原非作者代码审查及最终生产包检查仍待结果；D已获准继续菜单/采购/必要详情，整体高保真尚未完成。账号周用量同一窗口曾读22%→24%；08:12返回的窗口reset时间已变化，不能继续拼接增量。后续常规状态仅更新本节，不同步旧专题核验文件。

## 已核实的基线

- 实际 Git 主仓：`/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os`。本地 main 为 `95f23f2fb0eb5fde9187c24f9354f8aa19cb0bdf`，有既有改动，不切换、不覆盖。
- GitHub main 与本地 origin/main：`1fdaf7bf78264199ce87c80d20a4d37976cf05f2`，2026-09-11 通过 GitHub API/CLI 核实。
- 设计 worktree：`/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-design`，`codex/reference-hifi@2f890d8f182d02e8ed4acb55a865e8aa086416dd`。
- [PR #91](https://github.com/TERRYYYC/canteen-os/pull/91) 为 OPEN、draft、未合并，仅修改设计文件，不构成最终视觉批准。
- 首次核查时 GitHub 开放实施 issue 为 0、开放 PR 只有 #91；后续 Q 已建立固定 v2 样本 draft PR #92，未合并。旧 #27/#68/#69 已关闭，关闭原因是 not_planned，不能证明真实 Worker 和隔离测试环境就绪。
- 外层 `/Users/terry/Desktop/coding/chief-master` 解析到 `/Users/terry/Desktop/coding`，无可解析 HEAD，禁止在外层初始化或提交。
- 本调度文件位于从真实 Git 仓 main 基线创建的独立 `codex/team-meals-dispatch` worktree。这里仅维护调度文档与 backlog；既有根目录 `.DS_Store`、`.poc-venv` 不处理。

四份未提交设计稿须从设计 worktree 绝对路径读取；在新分支不会自动出现。以下 SHA256 已逐一核实，后续变动需记录，不能默默换输入：

| 相对设计 worktree 路径 | SHA256 |
|---|---|
| feature-specs/2026-09-10-data-hld.md | ab0e68deb104872c2d5f55ae09ef666a567c1de1226390a6976e808f310c22ad |
| feature-specs/2026-09-10-reference-v3-integration.md | a887edc526c6a7eeb0bc80f582c456e19c0dc8284a83820fd25d55b95e24dd9c |
| docs/design/reference-v3/SCREEN-CONTRACTS.md | e05d43554181c4ebed52269d7f20cafd8b35d4d687e56c8ae52b127684ce3652 |
| docs/design/reference-v3/STANDARD-DATA-AND-ACCEPTANCE.md | 6aaff3f33b65aad6f6952297abae9dd2dafef379bcc0fa64066c07f5300f0352 |

## 现状差异与首波

1. MenuPlan v2 仍强制份数，Dish component 仍强制 qty。新格式需要显式版本/双读/禁止降级合同；不补 1/baseServings，不伪造适量。原 core 文本解析器已能返回无份数结果，须修消费与保存准入，不重复造解析器。
2. expand 过滤非 active、缺基准份数及适量项目，MenuSheet 还去调料；新清单必须直接遍历全部 components 引用。收齐已录引用不证明真实配方没有漏录。
3. 现 Worker 缺 If-Match 时可覆盖；Source/Catalog 没有指定 revision 的读取合同；整 data 回退会影响未来清单。新 ShoppingList 必须有原子创建、强制冲突锁、同版读取和回退隔离。
4. 现测试使用 FakeRepo，页面未配置 Worker 地址时走 mock。mock 通过不能算真实写入完成。隔离测试仓及凭据能力由验收任务只读核实，缺环境单独登记。

| 工作包 | 唯一负责人 / 文件边界 | 依赖与交付 |
|---|---|---|
| RC-A 契约、schema、core | 实现任务 A：schemas/**；packages/core/**（含其测试）；scripts/{validate-schemas.mjs,local-validate.py,check-types-vs-schema.mjs,build-data.mjs,build-data.test.mjs,translate.test.mjs,verify-team-image.mjs,verify-team-image.test.mjs}；新增 scope ADR 与 docs/specs/team-meals-contract.md、相关模块契约说明 | A0 先交终态契约及状态表供调度独立审查；A1 schema/types；A2 引用收集、判断适用性纯函数和构建分流。每个可审阅部分分 PR，保留原数值回归。T01–T05/T06/T09 的基础层 |
| RC-Q 共享样本与验收准备 | 测试任务 Q：test/fixtures/contracts/**；scripts/validate-contract-fixtures{,.test}.mjs；docs/field-test/team-meals/**；后续 packages/web/test/e2e/team-meals/** | 可先准备 v2 黄金与边界样本、验证正式 schema/ref/asset、查真实环境；A0 固定后补新格式样本。不得改 core/worker/Web 业务、CI、包清单或锁文件。测试作者不能独立批准自己的测试 PR |
| RC-B 清单保存与同版资料 | 已派唯一 Worker owner：packages/worker/** 与其 tests（排除包清单/锁文件）；受控资料/图片读取、ShoppingList 保存、plan 降级保护、rollback/publish 准入 | 消费 A 的具体合同，T04–T07；接口测试与真实往返分别记录。绝不对生产 data 做写入测试 |
| RC-C Web 共用接线 | 单一 owner：packages/web/src/api/**、admin/{store,kit,token,edit-session}.ts、{router,i18n,data,types,main,shell,pwa,dom}.ts；新增 src/view-models/**；packages/web/test/** 排除 Q 的 test/e2e/team-meals/** 与 D 的 test/team-meals-pages*；docs/field-test/team-meals-web-shared/** | 从 reviewed A1 c913155 起；C1 先做条件请求、同版缓存和共享编辑会话，A2/B2 审查固定后 C2 接 core/实际接口。全部 pages/**、CSS/theme、包清单/锁文件只读。页面内部旧保存逻辑必须由后续页面 owner 显式接入，不把 C1 当作页面风险已修 |
| RC-D 页面 | 唯一页面 owner：packages/web/src/pages/** 与 src/{styles.css,tokens.css,theme.ts}；新增 test/team-meals-pages*、docs/design/team-meals-pages/**、docs/field-test/team-meals-pages/**；共享 API/store/router/i18n/main/data/view-models 与 Q E2E 只读 | 从已审 C1 5b8bdd50 起，先排菜/采购/材料详情，再必要 menu/prep/Dish 编辑适配；设计稿先于对应实现。C2/真实 API/新 build 按固定结果接线。T01–T09、zh/en/uk×393×852和1440×900真实浏览器；不移入旧顾客流程 |
| RC-CI | 已指派依赖与持续验证任务：.github/workflows/**、包清单/锁文件；新增 scripts/prepare-team-image-tools.mjs 及对应测试、scripts/team-meals-ci-wiring.test.mjs、scripts/team-meals-pwa-assets.test.mjs；packages/web/vite.config.ts（仅下述已确认发布资产缓存缺口），确需时 root.gitignore | 先接 Worker core 依赖；供给白名单图片解码工具，Q/A 固定黄金与生产目标分流后接线；不改业务校验或 expected。新增 Vite 配置范围仅是已确认的 fetch 图片离线缓存，业务 reader/PWA 生命周期仍归 C |
| 调度 | 本任务：feature-specs/2026-09-11-team-meals-dispatch.md、.github/backlog/team-meals.json、docs/dispatch/team-meals/** | 派工、状态、风险、审查，不写功能实现或测试 |

RC-A/Q 为首波独立任务；RC-B 仅在 A0 合同得到独立审查后启动实现；页面必须等待共用接口固定。上述 RC 为调度编号，GitHub issue 另行登记。跨包关联改动依照合同顺序拆成可审阅 PR，不把多个包交给多人抢写。各业务 owner 的目录授权均排除包清单和锁文件，统一归 RC-CI。所有任务从真实仓库建立各自 worktree，使用 `codex/` 分支；保存项目入口仅用于本地定位，不让 app 对外层未初始化仓自动建 worktree。

## 有状态对象普查和合同检查点

| 对象 / lifecycle owner | 事件与转移 | 不变量与对抗验证 |
|---|---|---|
| MenuPlan / A 格式、B 持久化、C 编辑会话 | 旧 v2 读→新格式显式保存；dirty→saving→saved 或 conflict；保存中再编辑保持 dirty；超时先重读 | INV-1 旧值原样保留，未知不补值；INV-2 最新 If-Match 也不允许降级；并发、迟到响应、rollback 旧格式均测试 |
| ShoppingList / B 持久化、A 需求比较、C 会话 | 新建全 check；同一需求复算保留判断；变化需求转 check 并保留旧判断参考；移除材料退出当前待买集合；冲突保留本地稿 | INV-3 判断只写本次清单；INV-4 basis 与 items 一次原子保存；INV-5 同 ID 双新建仅一方成功；网络不明重读、双写、更新基线一半失败、旁路回退均测试 |
| 同版资料 / B 读取、A 构建、C 缓存 | 明确 sourceRevision 的菜单/菜谱/食材/图片→只读投影；当前资料另入口；不可读显示缺失 | INV-6 不跨 revision 静默补资料/图片；部署响应交错、A JSON+B 图片、离线缓存错版均测试 |
| 候选与数值参考 / A | 从固定输入纯计算；缺引用/未录成分保留问题；可选计算独立状态 | INV-7 全部已录引用收集，来源可定位；INV-8 部分已知不冒充总需求；INV-9 非空/active 不当人工确认依据 |

不另外持久化可由纯函数算出的候选、来源、覆盖计数或失效状态。来源地址可用固定 revision 内 mealIndex/componentIndex；判断能否沿用须比较规范化需求，不能只比较索引或整仓 commit。排序、翻译、图片变化不自动清判断，换菜/范围/配料需求变化必须复核。移除材料曾为 buy/bought 时保留旧判断参考并显示移除提示；取消排菜不表示撤销已发生的购买。A0 明确最小持久字段、API 条件头、错误码、双格式准入与测试矩阵；这些是技术收敛，不重问已经明确的产品范围。

## 验证与审查

已从实际 package.json 核实：`node scripts/validate-schemas.mjs`、`python3 scripts/local-validate.py`、`node scripts/check-types-vs-schema.mjs`、`npm --prefix packages/core test`、`npm --prefix packages/worker test`、`npm --prefix packages/web test`、`node --test scripts/*.test.mjs`、`pnpm -C packages/web typecheck`、`pnpm -C packages/web build`。无已配置 formatter，不猜 pnpm check/biome。文档/补丁使用 `git diff --check`。

只读核查已完成，未在此调度任务开发或运行新功能测试。实现任务先保留相应红灯，再交目标绿灯与 commit；调度复跑或交独立验收任务复核。来源/状态变更和 API 必须覆盖上表不变量，不能以测试数量替代行为证据。前端验证：Yes，zh/en/uk × 393×852、1440×900；保留主流程及缺项/冲突/旧版状态。

真实往返须有隔离测试仓和专用受限凭据。暂未确认环境；不读取或输出密钥、不新建生产凭据，不对生产菜单做试写。未知结果保留待验，不以旧任务 CLOSED 或 mock 保存提示判成功。

每份交付记录 issue、branch、base/head commit、允许文件、执行命令及摘要、截图/日志、mock 或真实模式、未覆盖项和非作者 reviewer。作者可自测，不自审。调度写的合同/调度变更另请独立 reviewer。仅交付可审阅 PR，不自行合并。

服务使用任务独立端口，设计 4178、应用预览建议 4179/4180 起；不用 3003/3004，不连接 Redis 6399，本项目无需 Redis。

## 调度记录

- 独立审查：本调度任务子代理 `/root/dispatch_review` 已只读审查初稿，未发现阻断项；两条非阻断澄清（包清单归属、移出材料旧购买参考）已落实。初审时 A0 具体合同待审，现已在 8448d495 闭合。
- RC-A 已创建：任务 `01a08d74-7e94-78d0-94ad-296fe706ad76`，创建标题“实现小团队菜单与采购核心契约”。
- RC-Q 已创建：任务 `01a08d74-9915-7191-ba9f-3177c587e52a`，创建标题“建立餐食改造共享样本与验收”。
- 两任务均已回报从已核实 main SHA 建立各自 worktree，分别为 `canteen-os-team-contracts` 与 `canteen-os-team-acceptance`，原工作区未动。
- RC-Q 请求可配置 root/dataDir/schemaDir 的正式 Ajv 共享校验入口，已派回 RC-A 的脚本所有权范围；Q 只在新脚本消费，不抢改现入口。
- A0 初稿 `e5c45c3` 经非作者审查发现三项 P2；修订 `8448d49525da02c2e3fceb65167c8cedb3d6df11` 已核查闭合，具体记录见 `docs/dispatch/team-meals/A0-review.md`。解锁 A1 和 Q 新格式准备，不把 docs 通过计为实现通过。
- RC-B 已创建：任务 `01a08d80-6619-70e1-b8b1-87c1804b8d17`，创建标题“实现采购清单保存与同版资料接口”。从 A0 修订提交建立自己的 worktree；先做条件写/版本读取基础，清单接线等 A1/A2 实际代码固定提交。
- 旧 #27/#68/#69 的 GitHub state_reason 均由调度独立查证为 not_planned；不能据 CLOSED 声称部署/真实测试已完成。RC-Q 正在记录 L2 环境缺口，当前不对生产试写。
- Q 固定 v2 fixture `3d9f2aa` 已经调度独立快照复跑：32/32 测试、黄金 5 行 0 差异、15 个 JSON 与基线逐字节一致；Q 非作者 `v2_review` 已回报 APPROVE，见 `docs/dispatch/team-meals/Q-v2-verification.md`。
- RC-CI 已创建：任务 `01a08d84-b626-75f2-a4f2-057cb5f4b4a9`，创建标题“接入餐食改造依赖与持续验证”。唯一认领包清单/锁文件/CI；先解决 B 提出的 Worker core 依赖声明，再等 A/Q 实际产物接线 CI。
- GitHub issue 发布被自动审批拒绝，理由为工作包内容外发授权未明确。两条正文保存于 `docs/dispatch/team-meals/RC-A-issue-draft.md`、`RC-Q-issue-draft.md`，已向用户询问。未创建 issue，未通过其他工具重试；本地派工继续。首次失败发生在 RC-A 创建前，RC-Q 创建未执行。
- A1 最终格式提交 c9131559b8c703a3a8f3b823bc93c2acb3dd879c 已获非作者 APPROVE；调度核对差异及 Q 黄金祖先后发给 B/Q/CI。A2 core 候选 ca44989d 另在审查，构建 target/同版资产另交；不混算为整项完成。
- B1 修复提交 865be4c30a094e8874c43067f2b6db034a4c7057 已获非作者 APPROVE；调度独立代理已完成固定快照复跑，244 个 blob 匹配，135/135、typecheck 和 validators 通过。该 SHA 的已提交 red 日志空白另已交作者清理，不称全部检查绿；该检查点仅覆盖本地基础层，不能替代 B2 或真实往返。见 docs/dispatch/team-meals/B1-verification.md。
- RC-C 的公共文件范围已登记。先交 API/状态接口供页面消费；当前 plan/dish 页面仍自持保存逻辑，须由页面 owner 接入后才可验收迟到响应、冲突和超时恢复。既有类型不可用断言伪装为兼容 v3；允许建立明确的新读取边界，并为旧消费者保留可解释的兼容保护。
- RC-C 已创建：任务 `01a08d94-5d2e-7162-8f34-689ed87e391e`，创建标题“统一餐食前端接口与编辑会话”。已回报从 c913155 建立指定干净 worktree，四份设计摘要匹配；C0 的新 TeamMealsApi 与旧严格格式保护方案接受，C1 进行中。
- CI 包接线 11e761fe → 15d117df 已获非作者批准，调度核对固定差异后放行本地消费。发送远程推送/创建 draft PR 指令时自动审批再次拒绝，理由是仓库及具体内容外发授权不足；已就精确提交与目标请求用户批准。尚未推送或建 PR，不绕过，本地任务继续。
- 本轮 RC-C 派工与两个技术收口经非作者 dispatch_review 复核，无派工阻断。A2 core 候选 ca44989d 的独立实现审查另为 REQUEST_CHANGES，共四项 P2，A 正在红绿修复；所有下游继续等待新的固定批准版本。
- A2 纯 core 四项修订已在 ad1f427ae8d7ffc6841bfd2e51c279d2c90381d2 获非作者批准；调度核对实际修订及 A1 祖先后放行 B/C/Q/CI。core 87/87、移走临时 production data 后既有脚本 23/23、黄金零差异；新 build target 仍单独待审。
- Q 新格式 4878a8679b00baade5468fb2df4907fecb2a4f0a 已获非作者批准，调度固定 archive 实际复跑 19/19 格式预期及 56/56 测试；见 docs/dispatch/team-meals/Q-A1-verification.md。格式接受不等于真实基线或重复项语义接受，外发对象仍停在本地。
- 构建审查发现截断图片、失败写盘混版和缺价格 warning 问题，A 正在修。CI 评估 sharp 时发现必需 libvips 许可不在 execution-brief.md 第17行的肯定式白名单内；暂不安装或提交，先评估符合白名单的完整解码组合，不放宽图片验收，也不阻塞已审纯 core 的消费。
- RC-C 的 C1 候选为 5975ba4dce5a4cfcbeb465c7276b10dfc6d1e2ba，作者报告 Web 70/70、typecheck/build 和共享模块 mock 浏览器 smoke 通过，非作者 review 待结论；未声称页面接入完成。调度指出语言重绘与 open 清未决 operation 的指令歧义，交当前 reviewer 核对。
- C 的一次分支推送依据原派工授权且独立自动审批通过，在暂停消息送达前已完成。调度只读 GitHub API 确认远端 codex/team-meals-web-shared 为 5975ba4d；没有 PR 或 main 写入。分支保留，后续远程操作暂停；不能记录“从未外发”，也不把它当 CI 被拒操作的替代执行。
- C1 的 5975ba4d 独立审查为 REQUEST_CHANGES：open 清未决保存、异常订阅可阻断 token 清除、新旧 API 当前缓存不联动三项 P2。C 正在红绿修订并交原 reviewer；该远端候选未获批准，页面接入继续等待新的固定批准版本。
- C1 三项修订在 1575f2b4768938c0efcc8a9c5db7c9c25096c738 获非作者批准；5b8bdd50 只追加交接文档。调度对固定 archive 实跑 core build、Web82/82、typecheck、生成数据和 Web build 通过，源码与已审实现一致。可以启动独占页面文件的 D；C 继续公共 view-model 接线，页面不抢写共享文件。
- Q 本阶段已交已审 A1/A2 样本及覆盖摘要，工具状态为 idle，暂不启动后续集成。因此新页面任务使用释放的执行槽位，仍保持同时执行子任务最多五个；Q 集成阶段待上游固定结果并重新核对并行数量。
- D 已建立任务 01a08db7-43f3-7952-adb5-75106389e557，创建标题“接入排菜采购与同版资料页面”；工作区/5b8起点和设计摘要已由D核实。D向C直发消息被自动审批拒绝为接收方授权未明确；直发及该被拒正文的绕行转发停止。D继续消费按原始派工交付的固定上游契约，不因此伪造缺少接口。
- C2a目标契约固定2b8d98e5d6f29439f189632ea93152590a26a79b已由调度读取并交D，实施与独立review另待；不能把契约交付称代码完成。
- B2修订32e674cd9bdc9f565cd1cfff263aa1f8c4367cde已获非作者批准，a75250c仅三文档追加；调度固定archive复跑259/259、typecheck、validators通过。B阶段完成且工具状态idle，Q据此使用释放槽位做C1真实client与B2真实handler组合验证，只有GitHub外网由替身提供；仍是L1，不是L2或页面E2E。
- 图片路线收敛为A负责原始容器规范检查、官方工具/既有白名单库负责完整像素解码，CI只供给固定依赖/工具。官方mux会重建单帧，不能替代原画布/ANMF边界验证；全部组合仍待完整回归与非作者审查。sharp许可例外未获用户答复，不作为当前路线的授权。
- C2a 531aa266ab0368257c7522867a5cdcb6b477fc5d 获原非作者 c1_review APPROVE；首次 confirmed-create 的宽松 mock 与已提交日志空白问题均闭合。99381cd3 为三份交接文档追加，调度实际验证 Web 差异为空、固定区间 diff-check 通过，已放行 D。作者与审查者记录 Web102/core87/Q64/typecheck/build、额外六探针和浏览器 mock 流程；本调度本轮未再复跑，不称 HTTP/页面/L2 已验。
- Q 从 afc3289 新建 codex/team-meals-api-integration，合入已审 C1/B2 得到 8e87f915；首轮真实 C1 client/editor→真实 B2 handler→GitHub FakeRepo 的五项组合测试通过，待固定提交和独立审查。安装器签名源不可达与业务验证分开记录，不把已有依赖成功运行称为新安装成功。
- CI 图片工具供应提交 67b05fb7cf155f8adff3e20563c14a4ae7896f5d 已固定，尚待非作者审查，未给 A 消费。作者实际 Node20/macOS 联网及离线编译、供应10/全脚本42/publish16检查通过；普通读取不下载，两条工作流保留原 step 名且安装失败立即停止。Linux 未实际执行，供应通过亦不替代 A 的原始容器及完整像素验收。
- D 的 D0、详情和 Dish 编辑设计由调度读取；计划页作者报告目标8项及浏览器 mock 生命周期通过。调度已查看中文手机、乌克兰语桌面截图，给出面向用户的冲突比较和简短版本显示反馈；flow-mobile-uk 图实际为中文初始态，已要求修正命名/证明范围，不将其算作 uk unknown 场景证据。页面固定提交及非作者审查另待。
- CI67b05fb 随后获独立 package_review exact-SHA approved，无 P1/P2；调度核对本地独立回执与实际固定差异后正式放行 A。供应不再阻塞本地集成，Linux 仍未执行。Q 组合测试候选 e721132b 已送非作者审查，CI 先准备显式深层测试发现接线，未提前消费未审代码。
- A 原审查者复现 pngjs 异步解码仍会误接受缺 zlib 校验尾和多解压扫描行的 PNG。调度批准 Node 内置 zlib 的有界完整流与扫描行几何检查，不写像素/熵解码器。调度另核对 [PNG3 §11.2.3](https://www.w3.org/TR/png-3/#11IDAT)：最终 IDAT 的未使用尾字节应被解码器忽略，不能无条件要求所有 IDAT 字节均被 zlib 消费；已交 A 固定兼容正例。JPEG 冗余熵字节容忍性精确披露，不能声称逐压缩字节严格规范通过。此项完整构建仍待修复及复审。
- Q e721132b94ec63f58aae216f7817e26a7916ff64 随后获非作者 v2_review approved，无 P1/P2/P3。调度读取固定receipt、核对干净树与diff，再从archive以Node20.20.2独立重建Worker/core并运行组合5项全通过，见Q-client-worker-verification.md。已放行CI消费完整已审依赖历史、显式接入深层测试；不是clean-install、UI或L2通过声明。
- D报告计划页11910cde独立审查5项P2，当前1770524在修加载身份、迟到导入、catalog版本绑定、同值校验重绘和加载期间语言变化。published menu/prep 仍缺共享loader，调度读取C data.ts及A构建草稿后确认缺口，已在C原C2范围启动C2b接口合同；A最终产物shape/实现仍须固定批准，D可先做投影展示，不伪造发布成功。
- 本调度0553097独立复核发现backlog残留“供应pending”与67b已批准冲突，属P2。已按实际receipt修正A/CI当前字段，并将早期decoder探测明确标为历史，顺带将Q旧adapter状态对应到4878批准；无业务代码/测试变化，修订交原reviewer。
- D计划检查点247d6815865684236ce126cc82a1223a5132865f获非作者plan_review APPROVE，5项P2及R3早保存后续路径闭合；独立精确archive目标12/Web114、浏览器六场景及额外跨source/离页返回通过。调度读回执和固定diff，见D-plan-verification；其余页面在途，不扩为D整体批准。
- A构建代码06f52b409696311465a85c2229deed09bb47127a与最终文档交接8cff8538f36557203b28d1021419370b563ff1e8均获原非作者批准；168脚本与图片反例通过，06..8cff仅模块文档。调度真实隔离Git/Node20独立运行core/toolcheck/teamcheck/临时output/固定golden全部通过，manifest/projection版本一致；该真实data无图片，不冒充图片反例重跑。见A-build-verification，已正式放行C/CI。
- C2b设计709a5c2及修订c432c8a由调度读取核对并交D。修订明确reader/controllerchange重读与整页reload区别，更新须保护全部文档的dirty/saving/unknown，插件reload及计时器不能绕过；无持久草稿平台扩张。A8cff的精确wire/路径/时间/四样例问题已收口，C现可在原共享所有权内实现loader和更新保护；页面仍等其固定批准实现。
- CI的Q接线db45710f9568d4689a7596e21139cc99e14eb955获非作者package_review批准，调度核对local receipt、五文件delta和diff。原step/job名保持，显式发现Q五项且先构建Worker；这是Q接线批准。A8cff现已放行进入下一独立提交：翻译commit之后捕获一次真实HEAD，team check/output共用，黄金独立固定root/time；不执行外发/上传/部署或提前声称Linux通过。
- D导入迁移暴露共享store只支持MenuPlan类型。C独占修改9e744ec696a6f3baed8dedfb860adc8615de4f68仅扩大五处类型到AnyMenuPlan，调度非作者逐行核对runtime不变/no casts/diff-check后接受窄类型改动供D迁移；C旧页面五处类型错误明确保留并交D，不称当前整树编译通过。见C-store-type-review。
- D实际粘贴2.5得到3，调度确认唯一core parser的takeServings使用Math.round(Number(raw))。A在已审8cff之后承接独立小修：先红例、保留原文、无效明确份数结构化拒绝，不四舍五入、不偷偷变成未填、不由D再写parser；合法整数与真正未知保持，既有0份兼容差异另列。该问题不撤销已审build，C/CI/其它页面继续。
- 本记录按具体检查点区分已审实现、作者报告、待审工作及真实环境缺口；整体 T01–T09 与真实写入仍未完成。

- CI 最终本地接线 `41afcd09001d87f2882848849db97fe5aa8c0db2` 获原非作者精确批准；调度核对五文件差异、完整祖先、模块源及独立真实 gate/output proof，已放行本地集成。检查和产出共用一次实际提交，固定黄金独立；见 `docs/dispatch/team-meals/CI-final-build-verification.md`。CI 本阶段 idle，Linux 外部 CI、PWA 和 L2 未冒领。
- C 的辅助状态合同 `a175d876d829fdffacf11a7813b33523d8ba557a` 为单文档 52 行，调度读取并核对固定差异后交 D。稳定 provider 将页面 raw 图片/内联缓冲及辅助上传纳入同一更新保护；dirty/busy/unknown 不能卸载，晚到事件使弃稿确认失效。合同批准不等于共享实现、Dish 修复或 PWA 验证通过。
- D 的 `782b60fbd6deb29a397f9fde632dca0f82b1afa7` 采购/同版详情/计划本地预览增量获原非作者批准，精确 archive 目标19/Web143、实际浏览器主流程/详情18/额外15探针通过；调度读回执与固定差异，见 `docs/dispatch/team-meals/D-shopping-verification.md`。批准排除父提交 Dish 的三项 P2、后续 store 和浮动页面，不能据此放行整个分支。
- 随后调度实际读取 Vite 配置确认：data 图片不预缓存，而通用图片规则仅匹配 destination=image；C 的 fetch→Blob 不命中。复查原 T08/C11 未要求安装即下载全部图，正式授权 CI 唯一修改 `packages/web/vite.config.ts` 并新增 `scripts/team-meals-pwa-assets.test.mjs`：限定同源、当前 SW scope、带完整小写 SHA 的 data/assets 路径、GET/200、有界 CacheFirst；原规则保持。这是 41afcd 之后的新独立检查点，原 CI 接线批准不延伸于此。C 另负责真实 SW 的同版/离线组合验证；未读或被淘汰资产诚实不可用。
- A 文本解析修复 `24d7359b8d478ee816e8e187599478e1420aa693` 获原非作者精确批准；调度直接读取原审查任务 final、固定三文件差异和日志，正式释放 D。core103及额外1231检查通过，见 `docs/dispatch/team-meals/A-parser-verification.md`；D直接数值字段的原文精度旁路仍是另一待修项，不被此批准覆盖。
- CI 最小发布资产缓存 `0ae16a964d9164c3b296595d96f2833939a075d4` 获精确独立批准，调度核对三文件及回执后释放 C。生成SW12/scripts201/Web82/typecheck通过；真实CacheStorage及A/B离线仍由C验证，见 `docs/dispatch/team-meals/CI-pwa-assets-verification.md`。A/CI本轮交付后idle。
- D Home/Import `b45d403` 实际浏览器独立审查两项P2：无效新输入后的旧按钮状态恢复、跨认证继续消费旧共享draft/undo。调度读取原报告与共享store，I-R1和字段精度归D，I-R2统一归C；禁止D再造第二套跨页面认证map。C固定 `98dbafc1c8003d3992f0df0e58e6f0c19c19e3a0` 40行bound-store合同已读取分发：四个页面在有效render绑定并捕获handle，旧handle失效；裸导出明确failclosed，需D迁移，尚非实现批准。
- C更新身份的登录前缀问题由调度对main→admin/token→coverage→PWA展示链发现；C以纯合成值红绿验证并在 `d681aeea370166f8ddbe89f538914938589fa8c6` 固定去凭据合同。实现仍属未审C2b，不声称发生过真实凭据泄露。
- D 冻结菜单/备料 presenter 修复 `d02e7178dc0f56e7407d67eceb54cb41d90b1307` 获精确独立批准，MP-R1局部空态闭合；22/191与实际Chrome12+14通过。只批准presenter，不批准公共C2b接线或未审父Dish；原red/WIP日志30行尾空白不称全diff干净，见 `docs/dispatch/team-meals/D-menu-prep-verification.md`。
- C按已读98db合同将最小共享实现固定 `bb68658ae86c037a41f21e9aa3299ccd6588d89d` 供原reviewer独立审查，尚未放行D。D的I-R1/字段精度修复 `d891713` 亦为候选；Dish原三项闭合后新D-R4仍待修。
- 发布页面的终态缺口已由调度对照Worker实证：mapProgress拥有runCompleted却未返回，failure/timeout/unmapped不能证明结束。现授权B在原Worker所有权内补最小只读终态合同并独立红绿/审查，再由C补客户端类型、D按已知同runId消费。此项保留旧step/status映射，不扩大为无runId关联或自动重发平台，不执行真实发布/回退；原B2批准不撤销。

- B发布终态实现 `225a931ad8fb55a54959a9da1cf340de8efff88a` 获原非作者精确批准，交付 `f1cecfee7ca8e762002864b67ceb945364c79150` 仅文档追加；调度直接读原审查任务final及固定源码/合同并放行C/D。独立Node20发布36及类型/validators通过，作者全Worker279；见B-publish-terminal-verification。B回到idle，C/D接线仍待验。
- D `d89171314c4b56aac982a94fcb932a649358d8cf` 的I-R1及Import/Plan精确人数输入、`d5f05f98847bbac31d05c5c5457fb8c7fb4ee1b1` 的Dish D-R4均获原非作者有界批准。调度直接读原报告，分别含实际浏览器23+12/3177独立oracle与5+11+5反馈生命周期证据；见D-input-feedback-verification。I-R2及完整页面/C2b不在批准中。
- C最小共享实现bb68658原独立审查两项P2：摘要间接观察认证并清状态、异常空路径段绕过去凭据。修复 `7191d631c289347a0ddc2bfe538745045184e5d5` 仍待复审；调度已读固定43行pure peek接口补充并交D三处C1适配器。共享真实SW离线/更新作者证据为暂定，须在修复后固定重验，不计整体完成。
- 调度另直接对照D当前publish auth失效会changeOperation(null)与C辅助provider固定identity无认证绑定，确认旧未决操作保护/新账号隐私口径缺口。最小统一aux认证合同交C唯一owner补定，D保留真实未决元数据；不由auth事件、超时或未知dispose假造完成，不扩展持久化平台。

- C共享 `d8bb56875e927a08627f480473895bdbd5c75a21` 获原非作者有界APPROVE，R1/R2全部关闭，调度直接读报告/固定差异后立即释放D四页store/purepeek迁移。独立共享123、Chrome12、畸形288+合法编码24通过；五处旧D类型错误仍明列。新增aux认证合同、published/main/PWA不在批准中，见C-shared-auth-verification。
- D Ingredient `c4952b38043f908f68c3417b7ef2cbfcff93eda1` 原审查两P2（连续新建复用旧owner、已知upload409无恢复）由调度直接读报告确认，仍修复。Publish `7529c1f763442c225382b2b0e8967e3b4cf54106` 仅同身份owner/回包保护有界批准，独立浏览器也确认auth切换清pending的问题；B/C终态接线和统一aux退休未被此批准覆盖。
- 调度复读冻结T01–T09与C11，整理UI-integration-readiness.md区分已有局部证据与下一固定组合验收；Q仍idle，待C/D固定批准，不提前写业务替身或认领L2。调度51c3dab另获非作者APPROVE且无finding，回执已存档。

- D已在 `88125b62c0a33ee9af0eeeae186f830fd6fecf9a` 完整消费C d8；调度核对双亲与store/team-meals API/reload-safety对d8零diff，四页绑定/三adapter迁移和原I-R2组合正在进行。Plan未应用输入542f、Import原文/读文件cc504、Ingredient两P2修复4e24和Dish解码/翻译f4e3均仅固定候选，原reviewer结果另待。
- C发布终态兼容三文件 `65f6641bb3ca20b5e474d07e8903eaeb02e141c8` 获原非作者APPROVE；调度读报告/固定差异后释放D，独立API34和120合成GET通过。页面同runID/终态组合不在此批准中，见B-publish-terminal-verification的Web补充。
- C辅助认证合同在 `27867290bd6da40e06e7b6d28b886de9a073503f` 补齐同ownerId跨认证并存、票据completed不等于发布成功、旧coverage身份不进摘要。调度读固定合同后接受并交D；同提交三文件实现仍待非作者审查，作者130共享/六红绿例不冒充独立通过。旧异步初始化因认证失效后如何结束coverage阻断的组合恢复路径已交原owner核实。

- C辅助实现 `27867290bd6da40e06e7b6d28b886de9a073503f` 获原非作者APPROVE，5885只加合同两行且Web零diff，调度核对后正式释放D完整已审历史。独立共享130与旧初始化取消/新身份同页仍受保护探针通过；实际D票据/coverage/Publish路径另验。
- D Plan原输入542f、Import原文cc504和Ingredient两P2修复4e24均获各原非作者有界批准；调度直接读三个固定报告并按精确archive记录238/245/251各自Web套件及实际浏览器证据，不混作者浮动数量。I-R2和统一注册接线仍未闭合；见D-input-feedback-verification补充。
- C完整reader/data/main/PWA固定 `c7785a990c49e7dd28aaad690516893276b2620c` 送审，并在新SW站重跑最新源码链。调度另核对C1正常auth seal会注销reload provider，要求原reviewer实证pending/unknown是否误变clear及按全记录更新合同裁定；不把pure-inspect或aux批准延伸到此兄弟路径，仍不写新持久平台。

- D四页store绑定/三purepeek适配组合 `acd44750b0593f682fa14ecd16daeff898655078` 获原非作者有界APPROVE，I-R2正式闭合。调度直接读原报告、核对六页面文件与固定diff；独立目标98/Web290和Chrome15+6+13+6通过。该批准仍不覆盖正式aux/coverage/PWA；f4翻译后的短名/dup不同步P2由原报告实证，另在修复。
- PageCtx可选回调未进入此前5885是实际消费缺口；C从5885隔离官方类型提交 `873526e6c0ec29dde677a88fddc68208bdd28065`。调度作为非作者核对唯一types.ts的注释/可选method两行及parent/clean/diffcheck后批准释放D；无runtime/未审publication字段，不需要D断言或越界改共享类型。
- C完整reader/PWA的可变source/asset binding P2由作者修至98d9965，原reviewer暂遇服务容量故障，保持原审查上下文退避重试，未拿作者自测代替批准。C1正常auth seal兄弟路径仍在复现/修订。调度fa8697f另获无P1/P2批准；其一条P3及同类历史作者证据中的过时审批尾句已修正，当前审批只由对应review字段表述。

- C正常认证结束误清未知保存的路径由作者以真实Team API合成请求确认，修复 `28eb30f8c572a466215f82935bbfc54f8d9cb33b` 只保留已发送操作的非私有编号，并按原确定结果结束；调度读取19行固定合同后接受范围，完整实现仍待非作者批准。c778实际SW矩阵按该代码版本记录，28eb的新正常auth路径另加实际SW证据，不漂移为全在最新版本测试。
- 调度fe3eeda获无P1/P2批准，一条store合同状态P3已修；同时扫描C/D含pending的状态字段，清理I-R2、C65类型和278共享实现已放行后残留的早期等待状态。历史批准与作者运行记录保留其精确提交，当前未完成只指对应剩余组合范围。

- D `6f2e6d27b2a6c1a9b7aa6fa58e579916d8b69c13` 获原非作者有界批准，D-PENDING-R1当前短名/dup/保存目标不同步闭合；原六浏览器反例从3过变6过。`fa7bc8dc6bcd576065bc23b622e6118f1a17fe41` 发布终态页面另获有界批准，strict同run结束/认可结论区分及只读复核实测18+13+9通过；未关闭旧auth局部pending退休及正式aux/coverage。调度直接读两原报告，未复跑套件。
- D以5d5ff7f保留作者消费873最小PageCtx类型，调度核对types零diff；Plan/Import/Ingredient/Purchase实际aux接线仍是作者验证与冻结阶段，不能把已审共享层和若干目标绿灯当整条页面更新链批准。
- C完整共享 `bae6308799d937f675fa7a919879ed8c121b2d93` 获原非作者APPROVE：可变asset/source绑定及28的畸形409/非法commit ACK两P2全部关闭。Web154与真实API反例通过，真实SW证据按c778/28版本及未变源码消费，043的bae正常认证场景另记作者证据。调度直接读原报告和固定差异，已释放D；不扩为最终D页面/L2批准。
- C基础组合 `618e2a2c9899202d5da991e5d2e0ade99337a05e` 独立APPROVE，证实C共享等同bae、D页面/测试等同fa7、Worker等同B f1；Web317、完整typecheck零错、实际构建及publish36通过。五处历史D类型错误在该组合关闭，历史红灯日志空白保留。启动修订 `838973689f67c6189d10353e4bc9e9681c5603cc` 另获批准，只完成尚未调用D页面的loading自身coverage，原两红转绿且其他owner保护不变，独立Web320。最终交付 `4ebaa9410634e7850200037341b497a7b55773da` 与838生产src零差异，调度已用其替代413释放D。详情见C-shared-auth-verification。
- D Plan34ae、Import/Ingredient3812、Purchase213、Dish8a026的实际aux接线均获原非作者有界批准；Publish在76b498严格验证回退commit类型后原两浏览器反例转绿，PUB-AUX-R1关闭。调度完整读五份报告并核对父链/生产范围/固定diff，未复跑套件；见D-auxiliary-verification。Home/admin c215、正式published接线及最终整页组合仍待，Q保持idle，C待D完整固定批准输入后一次组合。
- D Home/admin `c2158e49e1f5591a44a594fd54a74ecb7858c500` 后续获原非作者APPROVE。调度读完整原报告并核对hash/两个生产文件；Node11+8、typecheck通过，实际浏览器由D作者代操作原reviewer固定fixture，reviewer读全部25+54断言后裁定，证据角色不混称。D组合3eb的共享Web/Worker对C4eb零差异、Home/admin blob与c215一致；正式published及实际main/PWA独立组合仍待。调度96b31c5也获独立APPROVE，无finding。
- 实际3eb team入口暴露全局抽屉仍标“顾客”、计划仍是禁用占位。调度直接核对viewText、C shell/i18n及冻结T08/SCREEN-CONTRACTS/D0，确认C所有权内的导航缺口，已重新启动C做最小team语义/既有计划入口修订；不造ID、不扩顾客产品。D报告原reviewer另列APP-MAIN-R1/P2，完整报告尚待；现有31项main及34项SW局部绿灯不外推T08。D继续published/SW，Q不提前启动。
- 固定3eb真实更新又得到Ingredient卸载保护最小三绿一红：认证后共享clear但旧私有raw仍取消beforeunload；调度读完整JSON和固定guard/auth链后接受D有界修复安排，不清真实未决票据。已发reload后原生取消的共享重试行为仅待隔离，未盲目另派C。调度另核对Ingredient/Dish两处保存ACK正则缺字符串判断，交D先页面复现再修；这是静态兄弟路径，不冒称运行时已证。Menu/Prep d316候选送审，作者388/51/27不代替批准。导航合同cc924全文已读并接受范围，实现仍待审；调度4f6d3ba另获无finding批准。
- C导航实现 `8bb39a3d11f281405d3da2c2f42be3091aa111ea` 获原非作者APPROVE；调度读完整报告及六文件固定差异，交付 `f6ac5761a31c1a2caa2d163d646dabc8b602321a` 只加两文档，packages零差异，已释放D。独立Web332、shell3/main8和实际team三语/auth/焦点/393乌语抽屉通过，作者完整三语两尺寸另记。APP-MAIN-R1待D最终组合核验闭合，不外推T08；D正式published视觉复核、四个重复beforeunload及ACK修订继续。调度6b49fed另获独立APPROVE，无finding。
- D正式Menu/Prep `d31661123b23bc2a80a9c8c613b1f9947d7c5665` 获非作者有界APPROVE。调度读完整原报告、核对三生产hash与5acd后续一致、逐项验证60份归档零差异，并抽看两张最终截图。独立51+9、浏览器27+17及reviewer逐张12图通过；IAB由D代操作、388全Web仅作者证据、不冒称实际main/SW/Worker。见D-public-entry-verification。剩余D退出/ACK修订及最终实际重载独立复验，Q不提前唤醒；调度54823d1另获无finding批准。
