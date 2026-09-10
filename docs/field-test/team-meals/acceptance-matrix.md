---
feature_ids: []
topics: [team-meals, acceptance, fixtures, revision, shopping-list, api]
doc_kind: acceptance-matrix
created: 2026-09-11
status: format-checked-semantics-not-executed
contract_commit: 8448d49525da02c2e3fceb65167c8cedb3d6df11
fixture_commit: 3d9f2aac7fb3f76225d315e34ec5aad7d00dcf96
format_schema_commit: c9131559b8c703a3a8f3b823bc93c2acb3dd879c
format_input_commit: 2c9c7e1a70b0749afbccad5020c05b0fb915293f
format_execution_head: e26ee915c06d90f11de96aca31d9b2fb2fbf8b66
format_recorded_at: 2026-09-10T23:05:50Z
---

# T01–T09 小团队餐食验收矩阵

本表依据调度已独立核查并冻结的 A0：
`8448d49525da02c2e3fceb65167c8cedb3d6df11:docs/specs/team-meals-contract.md`。
编写时逐字读取 `git show` 的该对象；Q 工作区 HEAD 为
`3d9f2aac7fb3f76225d315e34ec5aad7d00dcf96`，分支为
`codex/team-meals-acceptance`。A0 原文件仍带待独立检查状态文字；本表的冻结依据是调度本次派工，
不修改历史合同。后续正式 A1 样本格式检查见下文；它不表示 A1 全部功能、A2、Worker 或页面验收完成。

目标为“每天吃什么 → 全部已录食材/调料 → 本次人工判断 → 同版材料与来源菜品”。
T 编号继承设计草稿的主流程；格式、状态、API 和失败行为以以上 A0 为准。
不验收顾客业务、供餐统计、库存流水、完整归档平台或永久菜单行 ID。
本文包含测试计划及已执行的有限格式结果；执行者记录实现 commit，非作者另行审查，本文不是批准记录。

## 输入与证据边界

所有输入必须保留来源 commit、固定时间、实体格式及预期失败层。
既有样本按 [manifest](../../../test/fixtures/contracts/manifest.json) 的 base/overlay 组合，
使用 [fixture 指南](../../../test/fixtures/contracts/README.md) 的临时目录物化入口；
不得把 overlay 当完整数据根，不得往生产仓或已有 data 目录物化。

| 输入代号 | 精确路径 / 准备状态 | 使用边界 |
|---|---|---|
| V2-G | [valid/golden/data/menu-plans/week-41.json](../../../test/fixtures/contracts/valid/golden/data/menu-plans/week-41.json) 及同根 dishes、ingredients、techniques、PO | 字节来源 `1fdaf7bf78264199ce87c80d20a4d37976cf05f2`；480 份固定兼容输入，不能用生产新菜单覆盖 |
| V2-B | [valid/boundaries/data/menu-plans/team-week.json](../../../test/fixtures/contracts/valid/boundaries/data/menu-plans/team-week.json)；[first-dish](../../../test/fixtures/contracts/valid/boundaries/data/dishes/first-dish.json)、[second-dish](../../../test/fixtures/contracts/valid/boundaries/data/dishes/second-dish.json)、[name-only](../../../test/fixtures/contracts/valid/boundaries/data/dishes/name-only.json) | 共享 tomato/salt、适量盐、缺包装油、无基准份数、同名 tomato-other、名称草稿；显式测试份数 2 不是未知值默认数；`source=example` 仅用于本地测试，不能据此声称正式发布成功 |
| V2-N | `test/fixtures/contracts/invalid/{v2-missing-servings,unknown-qty,quantity-missing-value,empty-components,dish-step-n,invalid-date,bad-json,missing-dish,missing-ingredient,missing-technique,on-hand-object,pcs-with-yield}/data/` | 既有 v2 格式/引用负例，具体首个失败层以 manifest 为准；v3 省略 qty 需独立新例，不能把 v2 负例改称合法 |
| V2-A | [valid/local-image/data/ingredients/tomato.json](../../../test/fixtures/contracts/valid/local-image/data/ingredients/tomato.json)；`test/fixtures/contracts/invalid/{missing-image,missing-license,missing-attribution,disallowed-license,clip-order,video-without-source}/data/` | 本地合成图和素材负例；例子 URL 不表示视频、外链字节或实际许可已核实 |
| V3/S1 | RC-Q 主任务已准备 [pending-a1/manifest.json](../../../test/fixtures/contracts/pending-a1/manifest.json) 登记的 19 份样本及 [README](../../../test/fixtures/contracts/pending-a1/README.md)；例如 `test/fixtures/contracts/pending-a1/valid/{menu-plan-v3,empty-menu-plan-v3,dish-v3,shopping-list-v1,shopping-decisions-v1,empty-shopping-list-v1}.json` | 目录仍名 pending-a1；本次正式格式比较 19/19 符合 expectedFormatValid，basis/previous 语义未验。invalid/ 为格式负例，semantic/duplicate-ingredient.json 仅格式被接受，语义拒绝未执行。真实 A/B revision 对、需求变化及端点故障输入仍待实现 owner 准备 |

新样本固定时钟沿用 `2026-09-10T00:00:00.000Z`；原 PO 的
`2026-10-03T00:00:00.000Z` 字节保持不变。用于真实 revision/basis 的值必须来自隔离测试仓
实际完整 commit；不能把时钟、假 SHA、分支名、`local` 或脏工作区 HEAD 标签当已保存资料。
不同 revision 必须各自加载 inputs；未录图片与有引用但图片丢失分开记录。
pending-a1 清单内的完整 `3d9f2aac7fb3f76225d315e34ec5aad7d00dcf96` 仅作格式 token；
样本目录不是该 commit 的生产 data，未证明 Worker basis、ancestry 或 previous 的真实历史。
不得发送到任何真实端点；HTTP mock 必须显式注入匹配 inputs，真实 L2 必须先使用隔离仓实际提交。

| 证据层 | 本矩阵全部 T 用例当前状态 | 进入执行的前提 |
|---|---|---|
| F：正式 fixture 格式 | **19/19 预期与实际吻合：7 接受、12 拒绝**，仅下节所列样本及固定 A1；既有 v2 检查另见 [v2 证据](fixture-evidence.md) | 本次只调用正式 validateEntity；refs/assets、跨字段/候选语义与全部 T 场景并未因此通过 |
| L：正式本地实现 | **待 A2 / RC-B（含 B2）/ RC-C，页面另待 RC-D** | 固定实现 commit 的纯函数、构建、端点和会话测试；新行为先 red 后 green |
| M：mock 交互 | **待执行** | 页面接线及依赖已由 owner 登记；mock 仅替代网络，不替代收集/估算算法 |
| R：真实 L2 | **未确认环境可用，未执行** | [环境缺口](l2-environment.md)：隔离仓、专用受限凭据、隔离 Worker 端点及可运行测试入口；不得改用生产写入 |
| U：浏览器 / 人工 | **zh/en/uk × 393×852、1440×900 均未运行** | RC-C/RC-D 接线固定后，六组合截图、动作与网络/存储证据；厨房走查另记 |

下表每行的 `F/L/M/R/U` 指以上分层状态；F 只记录 19 份输入的格式比较，T01–T09 完整场景均未执行、无一行标记通过。
不适用的层也须在实际执行时说明原因，
不能用原型或 mock 结果填入正式本地/真实 L2 栏。

## 已执行的 A1 正式格式检查

RC-Q 的 `golden_math` 在 `codex/team-meals-acceptance-next`、HEAD
`e26ee915c06d90f11de96aca31d9b2fb2fbf8b66` 实际执行；schema/API 来自已审核的 RC-A
`c9131559b8c703a3a8f3b823bc93c2acb3dd879c`，该提交与执行 HEAD 的 schemas 及
scripts/validate-schemas.mjs 无差异。样本目录最近提交为
`2c9c7e1a70b0749afbccad5020c05b0fb915293f`；manifest 内 sourceCommit 是样本来源记录，
不是本次校验器版本。

执行方式：`node --input-type=module` 导入
`scripts/validate-schemas.mjs:createSchemaValidators`，调用 `createSchemaValidators()`，
读取 pending-a1/manifest.json 的全部 cases，逐项将实际 JSON 与 manifest.kind 传给
`validateEntity(kind, value)`，比较返回 valid 与 expectedFormatValid，输出实际 schema/errors；
任一不符则设退出码 1。本次退出码 0，输出汇总为
`{"total":19,"matches":19,"formatAccepted":7,"formatRejected":12}`。
plan/dish 正例实际选择 menu-plan-v3.schema.json/dish-v3.schema.json；清单选择 shopping-list.schema.json。

以下文件路径均相对 `test/fixtures/contracts/pending-a1/`；拒绝栏保留实际 instancePath 与主 keyword，
条件规则可能同时返回 `if`。表中“接受”严格指 schema 格式，未执行 semantic admission。

| 文件 / 数量 | 实际结果（全部与预期吻合） | 实际错误定位 |
|---|---|---|
| valid/menu-plan-v3.json、valid/dish-v3.json、valid/empty-menu-plan-v3.json、valid/shopping-list-v1.json、valid/shopping-decisions-v1.json、valid/empty-shopping-list-v1.json（6） | 格式接受 | 无 |
| semantic/duplicate-ingredient.json（1） | 格式接受；重复 ingredientRef 的语义拒绝仍待 A2/B2 | 无 |
| invalid/zero-servings.json | 拒绝 | /meals/0/plannedServings · minimum |
| invalid/null-servings.json | 拒绝 | /meals/0/plannedServings · type |
| invalid/null-qty.json | 拒绝 | /components/0/qty · type |
| invalid/missing-quantity-value.json | 拒绝 | /components/0/qty · required、if |
| invalid/dish-steps-n.json | 拒绝 | /steps/0 · additionalProperties |
| invalid/check-bought.json | 拒绝 | /items/0/decision · const；/items/0 · if |
| invalid/available-bought-false.json | 拒绝 | /items/0/decision · const；/items/0 · if |
| invalid/branch-as-revision.json | 拒绝 | /basis/sourceRevision · pattern |
| invalid/duplicate-selection.json | 拒绝 | /basis/selection · uniqueItems |
| invalid/previous-on-confirmed.json | 拒绝 | /items/0/decision · const；/items/0 · if |
| invalid/previous-check-bought.json | 拒绝 | /items/0/previous/decision · const；/items/0/previous · if |
| invalid/persisted-name.json | 拒绝 | /items/0 · additionalProperties |

本次没有调用 A2 收集、去重、basis/history、reconcile 或 estimates，也没有调用 B2 端点、mock、
浏览器或真实 L2。ShoppingList 的 sourceRevision 仍只是格式 token；合法 previous 的结构不证明
真实历史，合法空清单不证明该 revision 的候选确实为空。19 份输入的结果不覆盖全部 T01–T09，
也不覆盖其未包含的升级、条件写、日期范围关系、资产与真实往返行为。

## 主流程矩阵

| ID / 输入类别 | 动作与边界 | 必须观察的不变量与预期失败 | 负责 owner / 证据 |
|---|---|---|---|
| T01 排菜与空计划；V2-G、V2-N、V3/S1 菜单组 | 新建 v3 按日期/餐次/菜品排菜而不填份数；编辑已有 200 份，切日/周范围后保存整份计划；测 0/null/非法日期、dateRange 反向或不覆盖 meals。逐餐删除到最后一餐：先条件保存 v3 `meals:[]`，再 GET 重读其真实 revision，最后以它复核旧清单。选择已存在计划中的空日期/餐次。 | INV-1/4/5/7：不补 1/baseServings，已有数值/次序保持；v2 缺份数或空 meals 仍拒绝，v3 省略合法但非法填写拒绝。空计划保留 plan/dateRange，collection/estimates items 均空，budgetStatus=not-applicable；已知空范围为 complete/resolved/unverified。清单允许 items:[]，basis.selection 仍至少一个唯一元组；被移除 buy/bought 项只在差异中保留旧参考，提示取消排菜不撤销已购买，不能仅停在本地空稿。 | RC-A 格式/A2；RC-B 保存；RC-C 会话；RC-D 菜单页；RC-Q 验收。F/L/M/R/U |
| T02 全引用收集；V2-B、V3/S1 重复来源组 | 同餐两菜共享材料，跨日再次出现；增加重复菜/重复配料、重复 selection，并含 main、seasoning、to-taste、缺 qty/包装/baseServings、draft/archived、同名不同 ID。 | INV-7/9：候选按 ingredientRef 稳定排序，同 ID 一行且全部 sources 保留；同名不同 ID 不合并。重复 selection 排序去重不放大量，原始重复来源作为多重集合保留；source 的 mealIndex/componentIndex 只定位当前 revision。三维 coverage 独立，不能因为有候选、active 或 refs 都可解便宣称真实配方完整。数量不足不删候选、不用旧 numeric 筛选结果替代收集。 | RC-A A2；RC-C 接线；RC-D 清单/详情；RC-Q。F/L/M/R/U |
| T03 缺项与覆盖；V2-B、V2-N、V3/S1 缺引用组 | 分别组合缺 plan、缺 dish、未录 components、缺 ingredient、缺 prep/step technique、draft/archived 与另一道正常非空候选菜；对比已知空范围；读只预览与正式构建分别执行。 | INV-1/7/9：缺 plan/dish/未录成分令 enumeration=incomplete；任一已遇 plan/dish/ingredient/technique 引用缺失令 references=unresolved；recipeCompleteness 始终 unverified。单独缺 ingredient 仍保留 ID/sources，enumeration 可 complete；未录 components 不等同空计划。问题带精确来源索引；缺包装属于估算问题。清单缺 plan→422 basis_unavailable；悬空材料可 check，变 buy/available/bought→422 unresolved_reference；其他可解析材料可人工判断。team 缺成分/draft/缺基准为 warning；坏 refs/schema/example 引用是正式 `--check` 非零的 blocking，预览可以明确显示缺项。 | RC-A 格式/A2/构建；RC-B 保存约束；RC-C/RC-D 缺项呈现；RC-Q。F/L/M/R/U |
| T04 本次人工判断与复核；V3/S1 清单/需求变化组 | 条件创建全 check；逐项 check→buy/available，buy 标/撤 bought，再改回 check/available。测试排序/语种/图文更新与真正换菜、改日期/范围、加空餐范围、qty、份数、baseServings、margin、baseUnit/pcsToGram/yield、隐藏来源问题修复。执行换基线、二次变更和移除/新增材料。 | INV-3/4/5/10：只写对应 ShoppingList，Ingredient/onHand/Dish/PO 字节不变；bought（含 false）仅 buy 合法，previous 仅当前 check 可有且非递归，其 bought 也仅 previous.decision=buy 合法。新项 check；真正需求/范围变化→check、删除 bought、保存唯一最近人工判断 previous；再次变化不嵌套/伪造 previous；人工确认清 previous。相同需求保留 decision/bought/previous；纯排序/翻译/图片/包装价格/stock 展示更新不清判断，onHand 不自动推出 available。basis+items 原子替换；换基线只接 reconcile 精确结果，同次抢标 available/bought→409 review_required，另次受锁保存才可确认。伪造 previous、候选遗漏/多项/重复、ID 不符按 A0 拒绝；移除项不在新待买/已买集合，不声称既有购买已撤销。 | RC-A normalize/reconcile/decision；RC-B 原子写；RC-C 会话；RC-D 清单页；RC-Q。F/L/M/R/U |
| T05 双读升级、防降级与回退；V2-G、V2-N、V3/S1 升级组 | v2→v3 显式升级；二次升级；旧 Dish 无 schemaVersion 的兼容读取。用最新 If-Match 把 v3 写回 v2；rollback 到旧格式、缺少已升级文件的树、非祖先 revision；与清单进度更新并发。 | INV-1/2/3/5：升级深拷贝、幂等、仅显式改版本，保留真实份数/qty/数组次序/缺省，不批量迁移生产；旧严格 numerical 入口不得直接接 v3。最新锁也不能许可降级，POST 或 rollback→409 format_downgrade 且零写入；不能用删除后旧格式重建绕过。rollback 只恢复 A0 允许的知识资料路径，保留最新 shopping-lists/PO/其它 data 字节，重试从新 H 重校验；成功新 commit、非 force、[skip ci]、不自动发布。旧 basis 仍读原 revision；旧 Worker/代码部署不是有效数据回退。 | RC-A 版本/适配；RC-B 保存/rollback；RC-C/RC-D 展示与恢复；RC-Q。F/L/M/R/U |
| T06 同版资料与图片；V2-A、V3/S1 revision A/B 组 | 用 A 清单打开每项材料/调料及全部来源菜，B 改名/三语/图/包装/步骤；在 source/catalog/asset 分别注入不可达/非法 revision、坏 JSON/schema、缺图、外链、逃逸路径/符号链接、坏 owner/pointer，触发迟到响应。 | INV-6/7：projection 保留真实 Quantity、role、包装/供应商、ImageRef、clip、provenance/confidence/技法；缺项不补值、不按名字替换。A 资料只能配 A 图；成功 commit/X-Source-Revision 精确对应 A；原始 ImageRef 不能当已验证 bytes。asset 只按 A0 owner/pointer 读取允许 data 路径，外链→422 external_asset_unpinned，缺失/非法本地图→422 asset_unavailable；读坏源→422 invalid_source，不当 404；catalog 截断 fail-closed。所有失败无 main/当前图 fallback，详细 HTTP 条件见下表；B 资料若单独展示须明确版本，不与 A 混合。 | RC-A 投影/构建资产；RC-B 读取/asset；RC-C 缓存；RC-D 详情；RC-Q。F/L/M/R/U |
| T07 条件保存与编辑竞态；V3/S1 API/会话组 | 双客户端同 ID 创建/同 blob 更新；同内容错锁；缺条件头、双头、weak/list/* 更新锁；保存中再编辑/切页/切语；建 tree/commit/ref 故障与 ref 竞争；提交成功但响应丢失；basis 或 previous 历史不可读。 | INV-4/5/6：双创建最多一成功，过期锁→409 conflict；缺头→428，非法形状→400；不撤锁强写。每次尝试固定 H，ref 竞争重读 H 后重新验证 ancestry/锁/语义，最多两次后 409。故障读取只能全旧或全新 basis/items；晚 success 只清同一 generation，较新编辑仍 dirty。冲突留稿；响应不明先 GET 对比实际结果，不能盲重试。旧 basis 不可读→422 basis_unavailable，不能拿 main 猜旧需求或清判断后强存。保存、发布上线、mock 本地状态分别呈现，不声称已有完整归档能力。 | RC-B 条件写/故障/并发；RC-C 会话与模式；RC-D 状态呈现；RC-Q。F/L/M/R/U |
| T08 三语、尺寸、离线与导出；V2-A、V3/S1 revision/会话组 | 每个 zh/en/uk × 393×852、1440×900 组合跑排菜→候选→材料/来源详情→判断→换范围；复制/已有导出入口检查实际内容；离线重开、有/无 SW、A/B 部署交错与晚到请求；区分真实/mock。 | INV-3/6/7/9：语言不改 ID、basis、判断；缓存键含 revision 和身份，旧响应不串页/串清单；离线显示实际可用版本及未同步状态。待确认、缺项和来源语义不能在导出丢失，不把缺量记零或待确认记已买；数字/文字安全显示，长乌语与触控可用。无顾客/反馈/订单/报告入口；未接真实写入不称同步成功。实际截图、网络/缓存记录和导出 bytes 留证，原型 9 项通过不顶替本行。 | RC-C 模式/字典/缓存；RC-D 页面；RC-Q 浏览器与独立验收；RC-CI 部署依赖。F/L/M/R/U |
| T09 可选估算与未知量；V2-G/V2-B/V2-N、V3/S1 估算组 | 同材料混合已知/未知 qty、to-taste、缺份数/baseServings/包装、单位不兼容、draft；缺菜/成分隐藏来源；多 plan；缺价格/混币种；所有库存覆盖；解析仅菜名或未知量，重复计算并比对原输入字节。 | INV-1/7/8/9：v3 缺 qty 保留未知；已有真 to-taste 才保留适量；0/null/空对象/自动 1/baseServings 拒绝，解析不自动 active。同材料任一来源不可算→unavailable 且无 lines/局部总量、金额或包数；隐藏材料问题使全部估算 unavailable；多 plan→multiple-plans，引用清单仍可用。单 plan 完整来源仅内存适配原 core，不写回假份数；complete 的 lines 可 []（库存足够），候选仍在且不自动 available。缺价可留包数，budgetStatus 仅全部候选 complete、实际采购行均有金额且单币种才 complete，其余 incomplete；空范围 not-applicable。原黄金 480/500/200 总额 1525.50/1554/688，200 份盐无采购行但候选仍有；不把参考估价称消耗/供餐/浪费。 | RC-A 解析适配/A2/legacy；RC-C 数据接线；RC-D 数量参考；RC-Q 数值独立核查。F/L/M/R/U |

## 共用 API 对抗条件（T01/T03–T08）

T04 还需成对验证需求等价边界：g/kg、ml/l 等价，省略 margin 与 1.1 等价，省略 yield 与 1 等价；
plannedServings 和 baseServings 分别变化，即使比例不变仍须复核。缺 plan/dish/未录成分等
全局未知上下文变化时，所有存续材料需复核，不能只重置新出现的材料。

仅使用 A0 已定义端点：`POST /plan/:planId`、`POST /dish/:id`、
`POST /dish/:id/draft`、`POST /shopping-list/:id`、
`GET /source/:kind/:id?revision=<fullSha>`、`GET /catalog?revision=<fullSha>`、
`GET /asset?revision=<fullSha>&owner=<entityPath>&pointer=<jsonPointer>`。
rollback 按已存在端点与 A0 语义验证，本文不新增路由、选择器或未来 DOM。
成功体沿用 `{ok:true,commit,blobSha,unchanged,warnings}`；错误体为
`{ok:false,errors:[{path,code,message}]}`，客户端按 code 本地化并保留 path。

| 条件 / 检查入口 | 预期 HTTP/code 与证据 |
|---|---|
| Bearer 缺失/无效；角色无权限 | 401 unauthorized / 403 forbidden，鉴权优先，不泄露文件是否存在；plan/dish 为 chef/admin，清单写与三类读取为 chef/buyer/admin |
| 新建无 `If-None-Match: *`；更新无 `If-Match: <blobSha>` | 428 precondition_required；允许 If-Match 一对双引号，不能读后无条件写；CORS 允许 If-None-Match |
| 双条件头；更新锁为列表、weak ETag、*、空值 | 400 invalid_precondition；过期 blob、并发双创建或同内容错锁仍 409 conflict |
| 未知版本、附加字段、非法 Quantity/日期；selection 重复、ID/文件名不匹配 | 400 schema keyword / invalid_selection，具体错误 path 与实际 A1 schema/语义层记录；不能尝试哪个版本 validator 能通过就接受哪个 |
| source/catalog/asset/rollback 的 revision 非小写 40 位完整 SHA | 400 invalid_revision；清单 basis 字段可由 schema pattern 拒绝；测试短 SHA、分支名、local、非法字符，不把占位解释为保存版本 |
| source/catalog/asset/rollback revision 不存在、非 H 祖先或不在受控仓历史 | 422 revision_unavailable；新 basis、旧 basis、每项 previous.basis 相同问题→422 basis_unavailable。分别攻击每个入口/每种 basis，resolveCommit 成功但 ancestry 不过也必须拒绝 |
| 不给普通读取 revision；请求内多次子读取；写 ref 竞争重试 | 每请求一次解析配置受控分支 head H，省略参数的全部子读固定 H；显式 revision 响应 commit 精确相等。写新尝试重取 H，重校验全部条件/语义/ancestry，不混两个 head；非 force ref，最多两次后 409 |
| 已授权、有效 revision 中目标文件确实不存在；坏 JSON/schema；catalog 超过上限 | 仅真实缺文件→404 not_found；坏已存源→422 invalid_source，catalog 不静默跳过或截断成功；所有情况无 latest fallback |
| 请求超限/限流/上游权限、网络、超时 | 413 too_large / 429 rate_limited / 实际授权错误或 502 upstream_error；不得把上游失败误报 not_found、revision_unavailable 或 basis_unavailable |
| 清单初次创建非全 check；遗漏/多出/重复候选；悬空材料人工确认 | 创建必须精确等于 createShoppingList；结构/selection 类按 schema 或 invalid_selection 拒绝；悬空材料 buy/available/bought→422 unresolved_reference。不能靠客户端传入实体补洞；不硬指定 A0 未细分的 schema keyword |
| basis 改变后直接确认；伪造 previous；旧基线不能读 | 非 reconcile 精确结果→409 review_required 并返回待复核 ingredientRef；旧基线不可读→422 basis_unavailable。basis 不变仅允许状态转换与合法保留/清除 previous；服务器核验旧判断，拒绝虚构 |
| asset owner/pointer/路径 | owner 仅 `data/(ingredients|dishes)/<id>.json` 或 `data/techniques.json`；pointer 仅 A0 ImageRef 位置且下标在该 revision 存在。实体相对路径从 owner 目录解，显式 data/ 从根解；绝对路径、.. 逃逸、符号链接/不批准图片→422 asset_unavailable；不接受任意 URL 代理 |
| asset 本地丢失、A 图被 B 替换、remote src | 本地丢失/非法→422 asset_unavailable；remote→422 external_asset_unpinned，只保留原始来源/标 external-unpinned，不补当前图。成功必须真实 bytes+Content-Type+X-Source-Revision；CORS 暴露后者，缓存包含完整 revision/owner/pointer，客户端再隔离身份 |
| v3→v2（含省略 Dish 版本）或回退删除/降级已升级文件 | 即使最新锁也 409 format_downgrade，整体零写入；回退不动清单/PO/非允许路径，并发时保留最新清单 |

## 构建分流与证据记录

RC-A 实现、RC-CI 后续接线，RC-Q 独立验收：

- 显式 `--target legacy-numeric|team-meals`，默认 legacy 保留旧严格行为；legacy 遇 v3
  输入/引用 Dish→unsupported-format，不能 NaN 或自动切换模式。`--compare-snapshots` 只用于
  固定黄金 root；数值 oracle 为 [golden-expectations.json](../../../test/fixtures/contracts/golden-expectations.json)，
  手算依据为 [fixture-evidence.md](fixture-evidence.md)，不能从引擎重生全部 expected。
- team 输出 `team-meals/<planId>.json` 的同版全引用投影及独立 estimates；build.json 标明
  target/projectionVersion，保留 builtAt/commit/plans；不把 ShoppingList 塞入 purchase JSON。
  缺份数/qty/base/包装/价格、draft/archived、未录成分、已知空范围为 warning；坏 refs、schema、
  example 引用及缺失/非法本地图阻断正式发布。warning 随投影保留，不称配方完整。
- 正式 commit 必须对应实际输入字节；无 Git/脏 data 仅显式 preview 且不给 saved sourceRevision。
  team 图像使用 `assets/<sourceRevision>/<repoRelativePath>` 的同版字节；外链未固化不嵌当前图。
  静态新 head 投影不能给旧 basis 清单补资料；旧清单经 Worker 固定版本读取。

每次实际执行至少记录：T/A0 对抗编号、输入 fixture 与 SHA256/源 commit、实现 commit、
固定时间、命令或浏览器动作、期望与实际、错误 path/code、证据层、结果/未执行原因、执行者和
独立 reviewer。真实 L2 另记录隔离仓/端点身份、请求条件头（不含密钥）、输入/返回 commit/blobSha、
回读 JSON/资产 revision、并发/故障结果；上线另有 build/run 证据，不能只记录保存响应。
所有 UI 组合分别留语言、尺寸、截图、导出内容与 dirty/冲突/离线状态，不猜未来选择器。

当前已完成本文准备及上述 19 份样本的正式格式比较；T01–T09 场景、A2/RC-B（含 B2）/RC-C/RC-D
实现、mock、真实 L2 和六组浏览器均待执行，不以格式结果外推通过。
环境缺口由调度/RC-B 处理，不阻塞 RC-Q fixture 工作，也不以生产写入、自动建令牌或部署补齐。
