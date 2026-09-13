---
feature_ids: [team-meals]
topics: [acceptance, browser, client-worker, T01-T09]
doc_kind: test-plan
created: 2026-09-11
status: remaining-production-paths-preparing
---

# 页面组合验收入口

## 2026-09-13：发布、二维码与 production SW 的剩余检查准备

本轮按调度恢复原 Q，基线固定 `4b1e5e13a82bd5a2437f95df20aaf49f77f8996f`；原 `890cefd / d9565a4` 及下方全部旅程证据继承。当前新增内容是 **Q 隔离执行工具和准备验证，不是这些剩余原生场景已经通过**。产品源码只读，D 负责页面、C 负责 PWA，CI 原任务负责 workflow/配置；现有 4277/4278 样本、旧服务保护及 D 4275 保持。

| 剩余项 | 已定位的入口 / 精确缺口 | 最小执行办法 |
|---|---|---|
| 正式二维码与打印 | 正式 `packages/web/scripts/gen-qr.mjs` 导出 main，输出 public/qr/{prep,purchase,menu}.png 和 index.json；package.json prebuild 已调用它，SITE_URL 优先于 homepage。原 Q page-server 直接调 Vite 且只复制 data/icons，没有运行生成器或复制 qr，故其缺图是测试构建准备缺项，不能据此说产品没有生成器 | 新隔离构建显式调用原 main，SITE_URL 指向自己的 /canteen/，正式 PNG 随 public 进入 dist。接着独立解码三张 PNG；真实页面读取三图后点打印，检查 A4 三码、三语与导航/提示条是否进入打印布局。尚未用正常页面/打印预览签收 |
| 发布按钮→实际 Worker→本次 run→公共版 | 页面 admin/publish 已通过实际 client 调 POST /publish、GET /publish/:id；Worker 按 request_id 对应 run-name 认领。已有 D 页面 fixture 拦截前端 fetch，原 Q runBuild CLI 绕开按钮，二者都不能证明完整组合 | 新 Q adapter 只在独立 origin 模拟 GitHub dispatch/runs/jobs 和本地托管切换；真正 Worker 不替换。run 保存固定提交，先正式 runBuild + QR + 原 Vite 配置生成完整 dist/SW，全部成功后才切换服务目录；失败保留旧目录。真实按钮/进度/公共页面原生链待执行；远端 L2 不计入 |
| 实际 production SW | 原4277/4278有 worker-src none，只覆盖在线；C既有真实SW和页面状态证据可继承，不能复用禁用SW环境宣布离线通过 | 新 origin /canteen/ 使用原 index/src/vite 配置、正式 producer 输出及每版新 sw.js；测试诊断页在 scope 外，读取真实 registration.active/waiting、应用 controller 和 CacheStorage 正文，按钮调用真实 registration.update()，不覆盖 navigator。A/B 含可见资料和测试像素变化；新 origin 离线通过断开该本地应用请求模拟，需注明 navigator.onLine 本身未改 |
| 最小新增 SW 原生组合 | 首次接管后离线 Menu/Prep、已读同版图和未读图；真实 dirty 更新拒绝/显式弃稿一次 reload；saving / unknown（含离页 owner）不能强刷，核实后再更新 | 复用真实 Worker 数据保存及 hold/drop ACK 控制；分别记录客户端状态、实际 controller、等待SW、缓存正文和页面资料版本。C旧源未变的其他 clean/外部接管组合继承，不全量重复。D/C新固定集成头到达后只按差异确认 |
| 真远端完整链 | Q 没有独立远端 Worker/测试环境的可用输入 | 主调度负责只读盘点与环境输入；本地模拟 dispatch、运行状态和目录切换不得充作 GitHub/Cloudflare 发布或 L2 结果 |

新增 Q 文件：`workflow-publication-fixture.mjs`、`workflow-publication.test.mjs`、`workflow-page-server.mjs`（均位于 packages/web/test/e2e/team-meals）。旧 page-server 与 local-publication-fixture 未改；原 publish/rollback guard 逐字保留。新服务器继续禁止 rollback，新控制带本机 Host/Origin 与显式控制头；所有模拟外部请求只进 FakeRepo，没有真实远端请求或 Git remote。

准备测试已实际执行 **2/2 通过**：真实 Worker Save→dispatch→精确runId→queued→完整产物成功→新公共版本；缺引用后的另一run失败且旧公共目录不变；正式二维码三个512×512产物与目标URL一致；A/B可见资料、实际图像字节和新sw.js均改变。第二项为控制生成的A/B准备，不是原生SW验收。首次RED为新模块尚未实现；第一次构建另暴露macOS临时目录实路径问题，规范化路径并在临时根使用原配置后通过，失败日志保留。日志 `/private/tmp/rcq-workflow-red.log`、`/private/tmp/rcq-workflow-build-root-red.log`、`/private/tmp/rcq-workflow-green.log`。

新入口执行命令（必须先编译当前固定 Worker；启动前核对空闲端口并通过同一 managed launcher 托管）：

```sh
RCQ_FIXED_PRODUCTION=4b1e5e13a82bd5a2437f95df20aaf49f77f8996f RCQ_WORKFLOW_PORT=4279 RCQ_CACHE_DIAGNOSTICS=1 node packages/web/test/e2e/team-meals/workflow-page-server.mjs
```

输出会给出 /canteen/ 实际应用、/__q/diagnostics（scope外）和单份执行账本路径。此处只声明准备工具的针对性验证；二维码独立解码/打印、真实发布按钮及上述真实SW组合仍需各自的新原生证据。

## 2026-09-13 追加：固定候选 4b1e5e1 差异验证通过

**本轮列明的差异验证通过，未发现阻断本地人工验收的问题。** 原多清单辨识症状在本次新旧两单样本中未再现；这是 Q 对固定候选的真实 client→Worker 与页面验证，不替代 D 尚在进行的非作者审查或整体产品批准。按调度授权，仅消费 `4b1e5e13a82bd5a2437f95df20aaf49f77f8996f`（packages tree `88c692b92359a42bad85c4106645ee0c3627c863`），Q 集成及运行头为 `d9565a49c1271fcc20651c476b5925f713cb2e22`。下方 `68258e9 / c2f2b3a` 已完成的旅程原样继承，不重做保存结果未知、发布或其他未变路径。

复用原 Q 工具，没有改产品源码或新增回执包。先编译新 Worker，再启动新 origin；64 份实际运行 Web 源及 30 份 Worker 源匹配固定候选，新索引由该 Worker 实际返回 decisionCounts，未接旧缓存接口。工具参数名 RCQ_APPROVED_PRODUCTION 在本轮只用作已指定候选的逐字校验，不代表审查批准。专用 Chrome 复用原 Q 标签，仅导航至 Q 新隔离端口；自然视口 1119×866，未操作用户其他标签、IAB 或 D 4275。

新入口：[候选采购索引](http://127.0.0.1:4278/#/purchase)、[候选 Prep](http://127.0.0.1:4278/#/prep/2026-09-13)。收口实查 **running / launchd，PID 47124**，租约至 **2026-09-13 07:08:36 UTC（基辅 10:08:36）**，cwd 为本 Q 工作树。原 4277 同时仍 running / launchd、PID 27748，原租约 06:28:43 UTC 保持；没有重启原实例。

### 隔离重建与本轮原生动作

在新临时 Git `/var/folders/hj/blv37f392c722542z06qry0m0000gn/T/rcq-local-publication-TPotbR` 重放冻结账本的 4 次原保存：新账本第 1–4 条**只是测试数据重建，不算新原生 Save**。4 次响应、提交与 blob 全部等于原件，恢复头仍为 `ffaaa84ac2e1815d11134510725cd8ba3ff83183`，10 个原文件记录逐字一致；独立本地构建恢复公共版 `577baf4ef1392d9840aea28defda3876d6542d74`，公共文件也与原件逐字一致。新 runtime `/private/var/folders/hj/blv37f392c722542z06qry0m0000gn/T/rcq-page-browser-eUrZpK` 与原运行目录分开。

| 增量检查 | 实际结果 |
|---|---|
| 从真实索引找回原判断 | 第 5 条实际 GET /shopping-lists 返回原单 **待核对 1／待买 1／已有 2／已买 1**，页面显示同样摘要；原单编号为 shop-2026-09-12-be92ee96 |
| 相同范围继续原单 | 从可读计划入口取消 9/12，仅选 9/13 午餐；页面出现相同范围旧单摘要、“继续这份清单”和“新建另一份清单”。实际点继续后打开原单，计数 1／1／2／1、保存禁用，没有 POST |
| 明确另建并保存 | 返回同范围选择后明确点另建，生成独立 ID shop-2026-09-12-6301e70d，全待核对 5／0／0／0。第 15 条原生 Save 用 If-None-Match: *，成功提交 `0c3346b51bc4ee6c7938710df0e5e9aaf7f7ab02`；没有覆盖原单 |
| 保存四类判断并重开 | 新单将油设已有、蛋设待买并已买、番茄设待买，盐和葱待核对。第 16 条原生 Save 的 If-Match 等于首次 ACK blob；成功提交 `7a2d400709a1dcfe12290824e75c142942fce530`，新 blob `fc116fb79bd8c207c1aea2a5cefe1b3abc13205f`。离开、reload 索引后为 **2／1／1／1**，再按该摘要重开仍相同；已买没有计入待买 |
| 同范围两单可分别找回 | reload 后服务端同时显示两份日期、餐次、材料数相同的卡片，各有判断摘要和稳定完整编号；按 1／1／2／1 找回原单，原 blob 仍是 `b679665a6cad860b90e3dae72c720995d982f82e`。本轮没有第三单，也不外推全部分页或错误边界 |
| Prep 前置与完整资料 | 9/13 首屏出现番茄，实测标题 y≈351.7 CSS px。5 项原量 7500 g／75 pcs／75 g／250 g／500 ml、3 个完整原步骤及各自视频片段都保留；配方来源展开后仍为原基准 50、计划份数未录和演示未核验声明。没有将原量说成实际需求 |
| 空时机及缺资料 | 前一天仍显示空任务、3 项时机未录及查看全部，完整步骤不受筛选影响；点查看全部恢复 5 项原料。9/12 缺资料菜的待完善、缺配料、缺做法提示及对应补齐链接均可见 |

新账本共 28 条 Worker 请求，其中 **4 条基础设施重建 + 24 条本轮原生请求；本轮原生 Save 仅第 15、16 条，全部实际响应 200**，另有 3 次公共 GET。7 次真实索引响应逐项与响应 commit 对应的 Git 保存内容独立计算核对，计数总和均等于 5、skipped=0、无下一页。新旧两单 selection 相同；basis revision 分别为原计划保存版 577baf4 与创建时最新私有版 ffaaa84，两版计划内容完全相同。

最终数据差异仅新增 `data/shopping-lists/shop-2026-09-12-6301e70d.json`；其余原 10 文件、原采购单与公共输出全部逐字保持。原 4277 当前仍为 ffaaa84，26 条请求与旧冻结账本完全相同；旧证据索引内全部原件 SHA256 重新核对一致。没有远端 Git、发布/回退、菜谱人工核验或 PWA 更新动作。页面仍受原测试 CSP 的 SW 注册限制，本轮只验在线路径。

证据：[增量断言](/Users/terry/.codex/visualizations/2026/09/10/01a08d74-9915-7191-ba9f-3177c587e52a/daily-delta-4b1/verification.json)、[冻结账本](/Users/terry/.codex/visualizations/2026/09/10/01a08d74-9915-7191-ba9f-3177c587e52a/daily-delta-4b1/ledger-at-completion.json)、[重建核对](/Users/terry/.codex/visualizations/2026/09/10/01a08d74-9915-7191-ba9f-3177c587e52a/daily-delta-4b1/restoration-verification.json)、[16 组原始截图与 DOM 索引](/Users/terry/.codex/visualizations/2026/09/10/01a08d74-9915-7191-ba9f-3177c587e52a/daily-delta-4b1/artifact-index.json)。账本 SHA256 `a062584369d946f5a7b7af58871c378d6ddf048711f05d6dfe6bb6543d5e99d8`。原始执行脚本、Worker 构建日志和两个托管状态同目录保存；没有全量重跑或将上游审查算作本轮执行。

## 2026-09-13：固定 68258e9 的本地单清单原生旅程已验证，多清单问题未关闭

**下列单清单旅程通过，不能宣布完整日用验收通过。** 原体验审查已在固定 `68258e9389028873c633a4ae50fe05181519e883` 的 D 预览确认：三份同日同范围清单都显示同样日期、材料数和餐次，展开范围后仍无法辨认哪一份已有判断。影响是无法可靠找到应继续的旧清单；最小修正为真实、稳定的辨识信息和已保存判断摘要，并在同范围新建前可确认旧单。[原复验报告](/Users/terry/Documents/Codex/2026-09-12/canteen-human-usage-audit/outputs/retest-20260913/CanteenOS-修复后复验.md)。这是消费的独立发现，Q 仅创建一份清单，未在 Q 样本复现三单歧义。调度已交 D 修复；Q 保持固定输入，收到新获批版本后只追加该差异验证，继承未变步骤。

Q 集成提交 `9c598dc1d6e0d9017f23626dcfa7edfc4010d892` 消费 D 文档头 `c4adebb6727988cfcb7d257d0b67d23fa92bc435`，产品源码匹配 `68258e9`；原非作者 14 项回执哈希已核验。运行 Q 头 `621f06c7ef15af589f30d9b6d00f6f784c1cce74` 只追加 tree blob size 测试适配（先红 skipped=1，后 3/3 绿）。64 份实际运行 Web 源及 30 份当前 Worker 源均与批准产品逐字一致；Worker 已从当前源码编译，不重跑未变底层全套。Q 未修改产品源码。

受托管入口：[已保存采购单](http://127.0.0.1:4277/#/purchase/shop-2026-09-12-be92ee96)、[Plan](http://127.0.0.1:4277/#/admin/plan/team-week)。收口时实查 `running / launchd`，PID 27748，租约到 **2026-09-13 06:28:43 UTC**（Europe/Kiev 09:28:43）。cwd 为本 Q 工作树；受管记录 `/private/tmp/rcq-native-682-managed/`。专用 Chrome 标签已保留给用户；D 4275 与其样本保持原状。

本次在 Chrome 中文、深色界面按真实入口执行，初始自然视口 1119×866，没有覆盖浏览器尺寸或操作 IAB。23 张原始截图的实际像素尺寸为 1119×866 或 1104×854。浏览器返回 JPEG，最初误用的 png 扩展名已改为 jpg，23 张图的字节与最初哈希全部相同，未缩放或重编码。

| 实际原生步骤 | 结果与可核对证据 |
|---|---|
| Plan 加排、日期与空份数 | 选 9/13 午餐并加番茄炒蛋演示菜，份数留空；真实 Save 为账本第 3 条。整份计划 3 餐全部未写 plannedServings，固定版本回读一致；截图 01–03 |
| Save 与公开读取分开 | Save 后 Menu 仍只有 9/12；随后明确执行既有独立本地 runBuild，参数为实际保存 SHA `577baf4ef1392d9840aea28defda3876d6542d74`。正常 reload 后 Menu 出现 9/13、番茄炒蛋及“计划份数：未录”；截图 04–05 |
| 可读入口、创建与判断保存 | Plan 的“建立采购清单”自动带入 9/13 午餐，未手输 ID。生成 5 项全 check 后明确保存；再将油设 available、蛋设 buy 并 bought、番茄设 buy，保存后为待确认 2／待采购 1／已有 1／已买 1；截图 06–09，账本第 9、10 条 |
| 离开、重开、详情往返 | 离开后进入采购、reload，服务端入口仍显示“2026-09-13 · 5 项材料 · 1 餐次”，打开同一单且判断保留、无未保存修改。点番茄详情，再经原返回链接回同单，判断保持。返回链接测量中心命中自身，没有遮挡；截图 10–13、12-return-geometry.json |
| Prep 同日同资料 | 选 9/13，原菜谱基准 50 份、5 项原始用量与 3 个原步骤可见，计划份数仍未录。原始用量依次为番茄 7500 g、蛋 75 pcs、盐 75 g、葱 250 g、油 500 ml；不将其当作本次计划需求量；截图 14、16 |
| 空时机恢复 | “前一天”显示没有已录任务，并明确 3 项准备时机未录、完整做法不受筛选影响；点“查看全部”恢复 5 项食材原值；截图 15–16 |
| 缺资料与补齐入口 | 9/12 的待完善演示菜明确缺配料/步骤，展开后有漏项提醒；点“查看/补齐资料”进入对应菜谱编辑表单，源读取成功且未修改。没有保存菜谱；截图 17–19，账本第 18 条 |
| 保存结果未知与恢复 | 将盐改为已有后，测试层仅丢掉真实 Save 的 ACK（第 21 条，Worker 已 200 保存）。页面保留待确认 1／待采购 1／已有 2／已买 1，禁用再保存并提供“核实保存结果”。点击一次触发第 22、23 条双读取，恢复“清单已保存”，没有重复 POST；正常 reload 后第 24 条仍一致；截图 20–23 |
| 同范围多清单辨识 | **未关闭。** 上述单清单入口检查不覆盖独立报告的三单歧义；本轮不将此项标绿，也不消费尚未批准的 D 浮动修复 |

冻结账本共 **26 条 Worker 请求（全部实际响应 200，其中第 21 条 ACK 被测试层丢弃）、4 次原生 Save、7 次公共 GET**。强条件头链及创建 If-None-Match 已逐项核对；丢 ACK 后仅读取，没有重交。最终私有保存头为 `ffaaa84ac2e1815d11134510725cd8ba3ff83183`，公共版本及采购 basis 仍为计划保存版 `577baf4ef1392d9840aea28defda3876d6542d74`，采购 selection 始终是 team-week / 9 月 13 日 / 午餐。后续只保存采购判断，私有头与公共头不同符合本次操作；同版计划内容完全一致。本地 Git 数据仅改变该计划与该采购单两个文件，菜谱和食材原件未改。

原始材料：[截图及 DOM 目录](/Users/terry/.codex/visualizations/2026/09/10/01a08d74-9915-7191-ba9f-3177c587e52a/daily-native-682)、[断言结果](/Users/terry/.codex/visualizations/2026/09/10/01a08d74-9915-7191-ba9f-3177c587e52a/daily-native-682/verification.json)、[冻结账本](/Users/terry/.codex/visualizations/2026/09/10/01a08d74-9915-7191-ba9f-3177c587e52a/daily-native-682/ledger-at-completion.json)、[原件字节索引](/Users/terry/.codex/visualizations/2026/09/10/01a08d74-9915-7191-ba9f-3177c587e52a/daily-native-682/artifact-index.json)、[最终重开截图](/Users/terry/.codex/visualizations/2026/09/10/01a08d74-9915-7191-ba9f-3177c587e52a/daily-native-682/23-shopping-recovered-reopened.jpg)。冻结账本 SHA256 为 `fb5ada9c4a7fc09063a34d91ca1d9d086b49335bbfe89ce55359ef298365f57f`；目录还保留正式公共输出、源哈希、本地构建原始输出和针对性测试红绿日志。这些是 Q 的本次执行与核对，不冒充第二次原生走查或新的独立审查回执。

本地生成不等于产品发布按钮、远端 GitHub/Cloudflare 发布或 PWA 更新。本轮没有调用 publish/rollback，既有测试保护保持。Chrome 控制台实见夹具 CSP 拒绝 SW 注册；工具的只读 DOM 环境不提供 navigator，未将那次观察工具异常说成 controller=null 或产品失败。返回链接取坐标工具曾超时、首次坐标点击落在链接上沿之外，后以实测中心完成返回；细节原样记于 tool-observations.json。演示菜谱及 BV1example888 继续明确未人工核验，不能据此宣称厨房可用。

## 2026-09-12：本地公开资料更新已准备，完整页面走查待固定 D 修复版

**本轮只完成 Q 的隔离数据链准备。不能据此宣布日常使用体验修复、完整旅程、人工菜谱核验或发布按钮通过。** 基线为 Q `22eacbab0f182bec2ea510e5e018e6b6cee0af90`；任务依据是调度 `9db20a7` 顶部和[日常使用体验审查](/Users/terry/Documents/Codex/2026-09-12/canteen-human-usage-audit/outputs/CanteenOS-日常使用体验审查.md)。本轮没有消费 D 浮动源码，没有操作其 4275 预览。下方 9 月 11 日的有界批准仍是历史证据，不覆盖本次新增工具。

### 最小产物与实际断点

- [独立夹具](../../../packages/web/test/e2e/team-meals/local-publication-fixture.mjs)：复用 GitHub FakeRepo 路由，但 blob、tree、commit 在新建临时 Git 中真实保存；Worker 成功移动分支后同步临时 HEAD。保存响应、同版读取与正式构建使用同一个真实的**本地**提交 SHA。没有配置 Git remote。
- [原页面服务](../../../packages/web/test/e2e/team-meals/page-server.mjs)：仅显式 `RCQ_LOCAL_PUBLICATION=1` 才使用新夹具、挂载正式构建输出和 `/__local-publication` 测试入口。默认旧夹具不变，`page-fixture.mjs` 与基线逐字相同，原 `/worker/publish`、`/worker/rollback` 拦截断言完整保留。
- [独立更新命令](../../../packages/web/test/e2e/team-meals/local-publication-update.mjs)：必须给出刚才实际保存的完整 SHA；若 HEAD 已变化，返回 409，要求重新核对。匹配后只调用正式 `runBuild({target:'team-meals',commit:savedRevision,write:true})`。构建有阻断问题时返回 422，旧公共文件不变；成功后真实页面的 `/data/build.json` 和 `/data/team-meals/team-week.json` 直接读取新输出。
- [三项针对性检查](../../../packages/web/test/e2e/team-meals/local-publication.test.mjs)：真实 Worker 保存、正式 producer、正式 published reader、采购判断往返及恢复；不驱动浏览器，不算原生页面验收。

**两处不能外推的转移：** 该独立命令不调用产品“发布”按钮、不产生 GitHub Actions/Cloudflare 发布或 workflow 记录，因此后台发布状态仍不能被伪装成远端成功。正式数据构建也不会重新生成 `sw.js`；新夹具响应使用 `worker-src 'none'` 阻止注册，要求使用没有现存 controller 的新隔离 origin。本模式只覆盖在线读取更新，不能证明 PWA 接管、离线或新版本提示。产品源码及 PWA 配置未改。

样本来自已冻结 golden 的 `tomato-egg-stir-fry`、其 5 项食材和原技法，保留原配料、步骤、用量、置信度、`status`、视频 provenance；仅在菜名和介绍三语标出**演示／未核验**。`BV1example888` 仍为原占位来源，没有改成 manual/人工核验，也没有放入其他菜的照片。另由 Q 明确录入一个缺食材/步骤的 draft 演示菜 `needs-details`，用于可恢复提示检查。计划为 9 月 12–13 日，初始两行份数全部未录。正式构建接受此输入并给出 12 条 warning；这不是配方完整或厨房可用证明。

### 可复用操作

在 Q 工作树运行；下面固定 `6bb1ce9` **仅用于本次准备验证**。新一轮原生验收须先按调度消费新的获批完整 D 提交，再把 approved 参数替换为该明确版本。服务会逐一核验当前 Web 源与批准源一致，不能靠填一个标签绕过。

```sh
cd /Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-acceptance
export PATH=/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin:$PATH
npm --prefix packages/worker run build
node --test packages/web/test/e2e/team-meals/local-publication.test.mjs
RCQ_LOCAL_PUBLICATION=1 RCQ_PAGE_PORT=0 RCQ_APPROVED_PRODUCTION=6bb1ce916c9b4117b6e03db23a78a5d0b9724a10 node packages/web/test/e2e/team-meals/page-server.mjs
```

服务输出随机 loopback URL、源哈希清单、临时 Git 和 evidence 路径。受限环境需要运行工具批准本机监听/连接；不使用 D 的 4275。后续一次实际走查按以下顺序操作，新增结果仍更新本文：

1. 在新的隔离浏览器 origin 打开真实 Plan，确认没有旧 SW controller；记录获批源、语言/视口、样本演示标记及未录份数。
2. 在页面加排 9 月 13 日番茄炒蛋，份数留空并实际保存；从真实响应/账本记录保存 SHA。先确认公开 Menu 仍显示旧安排，不能把 Save 当作公开资料已更新。
3. Q 在独立终端执行 `node packages/web/test/e2e/team-meals/local-publication-update.mjs http://127.0.0.1:实际端口/ 实际保存的40位SHA`。这是测试操作者的本地构建步骤，**不是普通用户完成产品发布的证据**。检查返回的 `kind: local-generation-only`、`publicRevision`、issues，以及公共 GET 字节哈希。
4. 通过正常页面重新加载读取 Menu，核对新日期/菜品/空份数与保存内容；不能只看 CLI 200 或测试直接读取 JSON。
5. 从获批页面的排菜/采购入口按可读名称找到同一清单，保存人工判断、离开并重新打开；检查判断及 basis 保留，再从当前清单进入/返回详情。自动检查只证明数据往返，尚不证明入口可发现、返回连续性。
6. 打开对应日期 Prep，核对同版食材和步骤；缺资料菜应保留可理解提醒和补齐入口，空时机筛选可恢复“全部”。至少再用旧测试控制 `drop-next` 验证一次保存结果不明后的实际页面恢复；本轮未执行这段新原生走查。

每次运行的 `evidence/ledger.json` 包含 Worker 条件头/响应、保存 HEAD、独立构建尝试、当前公开 revision 和公共 GET 哈希；精确源字节保留在临时 Git。服务退出后不会自动删除这些临时证据。不要把该账本当作 GitHub 线上历史或原生截图。

### 本次实际证据

| 检查 | 结果与边界 |
|---|---|
| Node 20.20.2 构建 | Worker build（含 core 编译和 validator 生成）通过，生成文件没有源码 diff；未跑未变的 core/Worker 全套测试 |
| 新工具测试 | 3/3 通过。保存后旧公开版保持；显式构建后正式 reader 接受同一 SHA；留空份数保留；采购创建→番茄判断 buy→保存→重开保持 basis；采购保存不隐式更新公共资料 |
| 失败与恢复 | 保存 missing-dish 后正式构建 422，全部旧输出哈希不变；旧锁保存 409、HEAD 不变；用最新锁修正再构建成功。过期构建 checkpoint 返回 409；二进制 blob 字节保持；workflow dispatch 被夹具拒绝 |
| 实际 loopback HTTP | 临时端口 **53288**，实际 main 构建包和首个 JS 可 GET；58 份 Web 源匹配既有批准 `6bb1ce9`。真实 HTTP Save + CLI 更新 + 公共 GET 成功；4 条 Worker 路径记录中含 2 次保护探针，不算 4 次业务操作；4 次公共 GET。未打开旧 UI 重做验收 |
| 旧保护 | `/worker/publish` 与 `/worker/rollback` 两次 HTTP 探针均返回旧断言 500，未转给 Worker；缺测试控制头 403；公共文件缺失 404，不回落到启动时旧数据 |
| 版本链 | 初始本地 Git/public `8f1bf509b35526856b6d211243017b66ca9e5ccf` → Save `577baf4ef1392d9840aea28defda3876d6542d74`（公共仍为初始版）→ 独立构建/public 同为 `577baf4ef1392d9840aea28defda3876d6542d74`。HTTP 新投影 SHA256 `d4031643ac3a4584cd778a746bd6c188b2e98e42e383b6215b6234730094ee49` |

原始临时日志：[编译](/private/tmp/rcq-local-publication-build.log)、[3项测试](/private/tmp/rcq-local-publication-green.log)、[HTTP检查](/private/tmp/rcq-local-publication-http-green.log)、[HTTP结果](/private/tmp/rcq-local-publication-http-result.json)。实际服务证据在 [/private/var/folders/hj/blv37f392c722542z06qry0m0000gn/T/rcq-page-browser-3K6DX0/evidence](/private/var/folders/hj/blv37f392c722542z06qry0m0000gn/T/rcq-page-browser-3K6DX0/evidence)。这些是临时执行原件，未新增回执包。最初 RED 为新模块尚未实现的 import 失败；首次监听/连接另因 sandbox EPERM 失败，日志原样保留，经本机限定批准后成功，均不是产品缺陷复现。

Q 临时服务已停止（退出 130），没有启动或接触 D 共享服务。自检范围为测试基础设施：行为风险由三项检查和 HTTP 实用覆盖，写入仅临时数据；未改产品安全、外部契约或不可逆操作。Architecture cell 沿用调度的 Q 测试归属，Map delta 为 none；没有产品 UI/设计稿改动，本仓也无 Clowder 的通用 gate 脚本，不将其伪报为通过。diff 检查通过，改动仅 Q 工具和本文。当前交付是可复用准备工具及列明自证，尚未经新的独立审查；等待调度给出固定获批 D 修复版后，再做上面的真实页面旅程和体验验收。

## 2026-09-11 历史：已完成的有界页面组合验收

**列明的本地执行与继承检查已完成并获独立复核；两项发现均已本地闭合。未覆盖项不算通过，本文不宣称全产品、L2或用户视觉签收。**

本轮调度明确授权恢复 Q；准备文件中“Q idle”的旧状态被此次固定版本派工取代。原始验收输入由 `feda0ad68b68a050dc35f579e04b811ec690edf8` 快进到预算元数据修正 `842b778bd352c0dba8921584ce142d94665e5ca2`，当时生产 packages tree 为 `dce6d72208652c80d2aa5b40865bef4a56732226`，等于已审 `7920496e06996eedac6e08e862fa097453ed9462` / 生产 `734e295edbfa03b360e0052a782f8b5c6f0c980c`。不采用旧预算工具的 df992 标签。后续 Q 测试提交会改变 packages tree，不能冒称该完整 tree 仍等于生产输入。

当前集成生产输入为已审导入修复 `6bb1ce916c9b4117b6e03db23a78a5d0b9724a10`（完整交付fa6），包括先前已闭合的复制修复5049。新原生执行源9084的58份Web源与6bb逐字一致；C/core/Worker/main/冻结输入未改，沿用原本已审证据。仅复测受影响的Plan/Import及保存边界，不把历史检查改称新执行。

原始验收来源：设计工作区 `docs/design/reference-v3/STANDARD-DATA-AND-ACCEPTANCE.md`，本轮读取并核验 SHA256 `6aaff3f33b65aad6f6952297abae9dd2dafef379bcc0fa64066c07f5300f0352`。这里只映射既定 T01–T09，不增加业务范围。

## 执行路径

实际 `main.ts` + 原页面 + 正式 C API/editor → 本地 HTTP 转发 → 真实 B `worker.fetch` → 既有 GitHub FakeRepo。公开资料由正式 `runBuild(target:team-meals)` 生成。固定时间 2026-09-10T00:00:00.000Z；临时 fixture Git 的作者/日期固定，映射到 FakeRepo 时核验内容/blob。模型后续写入 revision 不冒充真实 GitHub 历史。

| 编号 | 本轮具体动作 / 断言 | 继承证据及不重做边界 | 结果 |
|---|---|---|---|
| T01 | 原日筛选四餐/空v3、追加周筛选三餐已审；6bb真实11保留、原2/空值、raw13.7排序、无数量保留、显式7/清空、增删、日筛选整份七餐保存并回读 | Worker/Core/夹具旧固定回归继承；6bb扩展auth/404/unknown/conflict等为D原非作者组合测试，非新增Q原生 | **列明本地检查通过；Q-UI-T01-02获原v2_review对1a0668批准并闭合** |
| T02 | 四候选全部可见；tomato两来源，tomato-other同名独立；salt适量、oil缺包装存在；可点来源菜品 | 本轮复跑Q64的独立来源/数值断言 | 本地已执行通过 |
| T03 | draft、缺基准、未录成分实际可见；已有候选仍保留完整性限制；缺引用补充负例2/2 | 实际Worker保存发dangling-ref警告；正式producer按missing-dish/ingredient阻止发布且旧输出字节不变；负例未装到浏览器公共数据 | 本地已执行通过 |
| T04 | 真实保存范围→全check创建→buy/available/bought；元数据rebase保留判断；改份数rebase先保存check+previous，再单独确认保存；其他知识/PO字节不变 | 实际52条handler流水及7个捕获断言；本轮另复跑正式client/handler5/5 | 本地已执行通过 |
| T05 | 页面v3原值/空值与强条件头正确；本轮Worker team118/118（含禁止降级、并发、回退隔离） | 本地真实handler+FakeRepo，不是GitHub/Cloudflare往返；没有浏览器/远端回退 | 本地已执行通过 |
| T06 | A同版材料/菜谱/技法字段与红图，当前B另入口且可返回A；B basis详情/蓝图另验证；技法owner=data/techniques.json、index=1 | C published reader源码等于已审3dd9；自动64项reader/update检查本轮重跑；公共图是1×1合法像素夹具，非设计图签收 | 本地已执行通过 |
| T07 | 原双客户端旧锁409、unknown双读、超时/短ACK保后续稿已审；6bb新增真实保存六行期间导入第七行，迟到ACK后七行仍dirty，下一明确Save才保存第七行；raw跨三语保留 | 原C保存/离线/更新证据有界继承；导入auth/unknown/conflict扩展消费D独立组合证据，非新原生操作 | **列明本地检查通过；导入边界随T01-02独立批准闭合** |
| T08 | 六主页面×三语×双尺寸36组及actual innerWidth；冲突三语；缺项/旧版；原生复制在获批5049追加复测三语成功/回退/未应用B仍复制A；导航无顾客入口 | 离线/部署交错原生继承3dd9独立原件；no-SW只消费现有自动/预算边界，未新做原生no-SW；新复制控制面板横溢出另记，截图非用户签收 | **本地通过；Q-UI-T08-01 已经原 v2_review 对810df70追加批准并闭合**；旧RED原件保留 |
| T09 | unknown份数/qty保持未录；盐为原适量；部分来源未知不出总需求；缺包装仍在候选；原配方300g/20ml与参考区分 | 本轮Core103/103、Q64/64含独立黄金和部分数值语义；不把未知字段变零或适量 | 本地已执行通过 |

## 证据纪律

以实际 DOM、截图、客户端请求/条件头、真实 Worker 响应、内存仓文件差异和正式构建产物哈希形成证据。测试准备失败原样留档；产品缺陷保留 RED 并交调度指定原 owner，Q 不改生产代码。最终逐格填写实际执行与继承来源，固定提交交原非作者 v2_review。

本轮是 L1/browser 本地验收，不代表 Cloudflare/GitHub 真实往返、L2、部署、完整用户走查或视觉签收。外层 `.DS_Store` / `.poc-venv` 为既有文件，已报调度并保持原状。

实际操作、请求编号、日志命令与继承来源见 [842执行记录](page-run-842.md)。两个RED及其修复前证据保持独立；当前本地闭合来自后续修复原生复测和独立批准，没有改写旧失败。

原 v2_review 已有界 APPROVE 固定 `4813ebb2cb57330554f793a60d9d7d7ea09fa405` 的证据准确性，没有关闭两项产品 RED。周筛选追加见 [原生周保存](page-additional-842/README.md)；获批复制修复的原始 lunch-only 重放见 [5049复制追加](page-repair-5049/README.md)，均不属于该 4813 审核范围。

随后同一原 reviewer 对 `810df706519c92622d4706b03c69484ba2fb9911` 有界 APPROVE，覆盖复制追加及周筛选追加；复制问题见 [Q-UI-T08-01闭合记录](Q-UI-T08-01-closure.md)。封存目录 README 的 pending 状态是送审当时快照，未改写；本矩阵和闭合记录反映后续状态。

导入新原生GREEN与11请求账本见 [6bb追加记录](page-repair-6bb/README.md)。原v2_review最终对 `1a0668ef4eb985d908f3fc44348bd9a2d9008595` APPROVE，支持T01/T07本地闭合及本矩阵的执行/继承/未覆盖区分；见 [Q-UI-T01-02闭合记录](Q-UI-T01-02-closure.md)和[正式回执](review-receipts/import-1a0668e/report.md)。截图、捕获断言、重放请求和交叠测试套件不相加为独立E2E次数。

## 最终执行与继承范围

| 证据层 | 固定来源与本地结论 | 不增加的覆盖 |
|---|---|---|
| Q原页面旅程 | 842生产输入、4813证据及独立回执；六主页面36组三语/双尺寸，52请求、真实引用/图片/强锁/rebase/unknown等 | 原始copy/import RED由后续单独闭合；并非36次端到端用户走查 |
| Q周筛选与复制修复 | 810独立APPROVE；周追加4请求，原午餐三语native/fallback/A-after-B；复制闭合 | 控制面板整页溢出如实保留，不证明整体视觉合格 |
| Q导入修复 | 1a0668独立APPROVE；新11请求、六次成功导入、原11及raw/增删/空值/迟到ACK和七行回读 | reviewer重放非第二次原生；不增加auth/unknown/conflict原生场景 |
| D生产与组合边界 | 原plan_review批准6bb/full fa6：Web539、额外6、type/core、44预算；58Q源与批准生产一致 | 不把已消费的上游检查说成本轮Q重跑；HTTP Plan59887/60000余113，预算未放宽 |
| C离线与更新 | 原3dd9已审published离线A/B/刷新；原7f3已审更新同意与unknown保护；源不变，原842曾跑相应自动检查 | 本轮没有新原生offline/no-SW/SW更新矩阵，不能外推所有路由或图片淘汰后仍离线可用 |

## 尚未覆盖或尚未签收

- 真实GitHub/Cloudflare往返和真实历史、L2，以及部署/发布/远端回退；此任务没有执行这些动作。
- 新一轮原生离线、无SW、更新的完整设备/浏览器组合；这里只继承上面明确列出的固定检查。
- 完整厨房用户走查、实际食谱/照片验收、视觉签收；自动断言、尺寸截图与1×1合法图片夹具不能代替人类签收。
- 未列入这次主页面旅程的QR、legacy或所有其他后台路线，不因44路由体积预算通过而自动获得用户交互验收。

本任务的本地证据、两项缺陷复测及独立复核已收口。上述未覆盖事项保持可见，需在其各自授权环境和用户走查中另行处理。
