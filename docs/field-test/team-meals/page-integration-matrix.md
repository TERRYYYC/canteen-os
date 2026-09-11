---
feature_ids: [team-meals]
topics: [acceptance, browser, client-worker, T01-T09]
doc_kind: test-plan
created: 2026-09-11
status: locally-reviewed-with-explicit-boundaries
---

# 最终页面组合验收矩阵

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
