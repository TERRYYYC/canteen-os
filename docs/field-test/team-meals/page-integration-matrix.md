---
feature_ids: [team-meals]
topics: [acceptance, browser, client-worker, T01-T09]
doc_kind: test-plan
created: 2026-09-11
status: local-publication-prepared-awaiting-approved-ui
---

# 页面组合验收入口

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
