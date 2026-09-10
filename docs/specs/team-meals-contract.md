---
feature_ids: []
topics: [team-meals, schema, core, shopping-list, revision, api]
doc_kind: implementation-contract
created: 2026-09-11
status: A0-pending-independent-check
---

# 小团队餐食终态合同

本合同服务“每天吃什么 → 全部已录食材/调料引用 → 本次人工 check/buy/available → 同版材料和来源菜品”。份数为可选估算输入。依据用户 2026-09-11 派工和 [ADR-0008](../adr/0008-team-meals-contract.md)；技术 A0 需调度独立核查，用户已定范围不重新审批。本文件描述终态要求，不表示 API、页面或真实环境已实现。

基线 `1fdaf7bf78264199ce87c80d20a4d37976cf05f2`。四份输入为设计工作区的未提交草稿，未复制到本分支，也不是已批准实现：

| 设计工作区相对路径 | SHA256 |
|---|---|
| feature-specs/2026-09-10-data-hld.md | ab0e68deb104872c2d5f55ae09ef666a567c1de1226390a6976e808f310c22ad |
| feature-specs/2026-09-10-reference-v3-integration.md | a887edc526c6a7eeb0bc80f582c456e19c0dc8284a83820fd25d55b95e24dd9c |
| docs/design/reference-v3/SCREEN-CONTRACTS.md | e05d43554181c4ebed52269d7f20cafd8b35d4d687e56c8ae52b127684ce3652 |
| docs/design/reference-v3/STANDARD-DATA-AND-ACCEPTANCE.md | 6aaff3f33b65aad6f6952297abae9dd2dafef379bcc0fa64066c07f5300f0352 |

原始工作区绝对路径在调度计划；本仓库不把本机路径作为运行时输入。PR #91 仅为 draft 视觉提案；顾客、订单、反馈、报告、库存流水、供餐统计、完整归档平台和永久菜单行 ID 不在范围内。

## 1. 格式与类型

JSON Schema draft 2020-12 是持久格式事实源。已有 `menu-plan.schema.json`、`dish.schema.json`、Ingredient/Technique/PO v2 语义不放宽。新增独立 `menu-plan-v3.schema.json`、`dish-v3.schema.json`、`shopping-list.schema.json`；按实体 kind 和显式版本选择校验器，未知版本报错，不能尝试“哪个通过就算哪个”。旧 Dish 缺 schemaVersion 仍按 v2 读取。

| 实体 / 类型 | 必填与变化 | 保留 |
|---|---|---|
| MenuPlan / MenuPlanMeal | 旧 `schemaVersion:"2"`；每行 plannedServings 整数 ≥1，meals ≥1 | 原校验、默认 margin 计算语义及真实数值 |
| MenuPlanV3 / MenuPlanMealV3 | `schemaVersion:"3"`、meals 数组（允许 []）；每行 date、mealType、dishRef 必填，plannedServings 可省略但填写仍为整数 ≥1 | name、dateRange、margin、serviceWindow 与 v2 相同；无 ID/状态新增 |
| Dish / DishComponent | 旧 schemaVersion 可省略或为 `"2"`；name 必填；已填 component 的 ingredientRef、qty 均必填 | 旧 Quantity 条件、prep、steps、来源、状态 |
| DishV3 / DishComponentV3 | `schemaVersion:"3"`、name 必填；components 可省略但若出现仍 ≥1；每项 ingredientRef 必填，qty 可省略 | 其余字段/约束与 v2 相同；qty 一旦出现必须是合法 Quantity |
| AnyMenuPlan / AnyDish | `MenuPlan | MenuPlanV3` / `Dish | DishV3` | 仅新引用/投影入口使用；不把旧严格类型改成可选 |
| ShoppingList | `shoppingListVersion:"1"`、id、basis、items 必填 | 独立于 PurchaseOrder；路径 `data/shopping-lists/<id>.json`，id 必须等于文件名 |

MenuPlanV3 的 dateRange 若存在须 start ≤ end 且包含所有 meals 日期；API/core 语义检查负责跨字段关系。v3 允许持久保存 meals:[]，表示已取消全部安排；若有 dateRange 仍保留其范围且 start ≤ end。v2 仍至少一行。ShoppingSelection 可选择存在计划中的空日期/餐次；空计划的投影保留计划/dateRange，collection.items 与 estimates.items 均为空，budgetStatus=not-applicable；清单 items:[] 合法。删除最后一餐必须先保存并重读真实空计划，再以该 revision 复核旧清单，不能只停在本地空稿。所有对象 additionalProperties:false。Id 使用现有小写 kebab-case；日期使用真实日历 date format；sourceRevision 是小写 40 位十六进制完整 commit，不接受分支名、短 SHA、local 或工作副本占位。

```ts
interface ShoppingSelection { menuPlanRef: Id; date: string; mealType: MealType }
interface ShoppingBasis { sourceRevision: string; selection: ShoppingSelection[] } // ≥1，唯一元组
// bought 只在 decision=buy 时允许；缺省/false 均表示未标已买。
type ShoppingDecision = "check" | "buy" | "available";
interface ShoppingPrevious { basis: ShoppingBasis; decision: ShoppingDecision; bought?: boolean }
interface ShoppingItem {
  ingredientRef: Id;
  decision: ShoppingDecision;
  bought?: boolean;
  previous?: ShoppingPrevious; // 最多一份旧判断，非递归；仅当前 check 行可有
}
interface ShoppingList {
  shoppingListVersion: "1";
  id: Id;
  basis: ShoppingBasis;
  items: ShoppingItem[]; // 可空；每个 ingredientRef 仅一次
}
```

Schema 校验结构、日期、枚举、唯一 selection 全对象；语义校验再拒绝重复 ingredientRef、不在候选集的行、遗漏候选、ID 路径不符。previous 的 bought 也仅允许 decision=buy。previous 由服务端复核结果产生/核验，不接受客户端虚构；check→人工判断后移除 previous。持久文件不存名称、图片、来源数组、估算、覆盖计数、过期标记、时间戳或另造需求摘要。

DishV3 缺 qty 表示未知；`{unit:"to-taste"}` 仅保留来源确实写适量的事实。禁止缺量补零、空对象、null、1/baseServings，禁止解析器自动把草稿标 active。已有 core parse-plan-text 返回的无份数结果直接用于显式 v3 适配，无需第二套解析器。

## 2. 双读、升级与禁止降级

1. 读端先部署 AnyMenuPlan/AnyDish 与版本分流，旧 v2 文件字节不变。升级函数 `upgradeMenuPlan(plan)`、`upgradeDish(dish)` 深拷贝并仅显式改 schemaVersion；每个已有份数/qty、未知字段缺省及原数组次序原样保留，幂等且不修改调用者输入。
2. 新建菜单使用 v3；已有 v2 用户明确保存到新流程时可升级。v2 编辑器仍可保存 v2 到尚未升级的文件；任何 v2 缺份数请求仍失败。Dish 只在需要未知 qty 或显式升级时写 v3，不批量迁移生产知识库。
3. 已有 v3 MenuPlan/Dish 不得被 v2（含省略 Dish.schemaVersion）覆盖。检查当前受保护 blob 后再检查版本，最新 If-Match 也不能许可降级；返回 409 `format_downgrade`。删除已升级文件后重建旧格式也不属于允许 API。
4. 旧数值函数只接收旧严格类型；新格式不能直接穿透至 expand/buildPrepSheet/buildMenuSheet。估算适配只能在内存中证明必需字段齐全后构造旧类型，不能把这种数值输入写回资料。
5. 发布前需具备读新/旧、保存防降级、回退隔离和新构建目标全部能力；A schema/core 测试通过不表示 B/C 已接线。部署旧 Worker 或旧代码不能作为新资料的有效 rollback 方式。

## 3. 纯引用收集与需求语义

公共入口位于 `packages/core/src/team-meals.ts`，由 `index.ts` 导出。输入已通过对应 schema；生产持久输入在读取固定 revision 后形成 `TeamMealInputs { menuPlans:Record<Id,AnyMenuPlan>, dishes:Record<Id,AnyDish>, ingredients:Record<Id,Ingredient>, techniques:Technique[] }`。纯函数不得读磁盘/网络/时钟。

`collectIngredientReferences(inputs, selection)` 返回 `{items,issues,coverage:{enumeration:"complete"|"incomplete",references:"resolved"|"unresolved",recipeCompleteness:"unverified"}}`。这三个维度不互相推出：

- enumeration 表示是否能遍历所有选中来源；missing-plan、missing-dish、components-unrecorded 任一存在则 incomplete，即使另有非空候选也不变。
- references 表示所有已遇引用能否解析；missing-plan/dish/ingredient/technique 任一存在则 unresolved。missing-ingredient 仍保留其 ID 和 sources，枚举可以 complete，但 references 必须 unresolved。
- recipeCompleteness 固定 unverified，表示从未由本合同证明真实配方完整；不能由 active、非空数组或 enumeration complete 推出人工确认。
- 已知空计划/已知未安排餐次是可完整遍历的空集合（enumeration complete、references resolved、仍 recipeCompleteness unverified）；明确缺成分的菜则 enumeration incomplete，不能混成同一种空。

- items 按 ingredientRef 稳定排序；每项 `{ingredientRef, sources}`，所有 components 引用均进入候选，包括 seasoning、to-taste、缺 qty、缺包装、缺 baseServings、draft/archived。不存在的 ingredientRef 仍保留其 ID；同名不同 ID 不合并。
- 每个来源 `{menuPlanRef,date,mealType,dishRef,mealIndex,componentIndex,plannedServings?,baseServings?,qty?}`。索引只定位当前固定输入；重复菜/重复配料均保留来源，不当重复错误删除。selection 元组排序去重后遍历，防重复选中同餐倍增需求。
- issues 使用 `{code,menuPlanRef?,date?,mealType?,dishRef?,ingredientRef?,mealIndex?,componentIndex?,techniqueRef?}`；代码为 `missing-plan | empty-selection | missing-dish | missing-ingredient | components-unrecorded | dish-not-active | missing-technique`。techniqueRef 同时检查配料 prep 和 steps。
- 成分未录、坏引用、draft/archived 的问题独立于非空候选；active 与所有 ref 可解析也只能证明已录引用被收集，不能证明真实配方无漏录。此次不新增“配方已完整”的持久确认字段。
- reference 问题保留精确定位；数量问题另由估算结果返回，不因缺包装在引用问题列表里虚构缺材料。

`normalizeDemand(inputs, selection)` 返回可稳定比较的 `{selection, ingredients}`，不是持久记录。selection 是唯一、排序后的全部日期/餐次/plan 元组；扩大到空餐也属于范围变化。每个 ingredient 的 demand 是排序后的来源多重集合，保留重复次数而不含数组索引：

- 元组含 menuPlanRef/date/mealType/dishRef、plannedServings 或缺省标记、baseServings 或缺省标记、qty 或 unknown/to-taste 标记、实际 margin（省略等于旧默认 1.1）、dish 是否解析/status（省略按 draft）、ingredient 是否解析。
- qty 的 g/kg、ml/l 统一为 g/ml；其它单位保持原值；没有依据不把 pcs 换重量。plannedServings 与 baseServings 分别比较，即使比例相等，真实输入改变也需复核。
- 食材需求参数含 baseUnit、pcsToGram、yield（缺省与计算默认 1 等价）。改变这些或来源数量必须复核，禁止因为 ingredientRef 相同就继承。
- 不含名字、描述、翻译、图片/许可、步骤文本、prep 展示字段、supplier、包装、价格、trackStock/onHand；这些资料更新显示新基线资料，不宣称需求变了。人工 available 不由 onHand 推断。纯排序和语种变化不得清判断。
- 全局无法解析计划/菜品、成分未录等可能隐藏材料的问题也进入规范化上下文；它们变化时所有存续材料需复核，避免在未知来源修复后误留旧结论。

`reconcileShoppingList(previous, previousInputs, nextBasis, nextInputs)` 返回 `{list, added, removed, reviewRequired, retained}`。两份输入必须分别来自自己的 sourceRevision；调用方不可提供 main 代替历史输入。输出 list 的 id/version 保留、basis 更新，items 与新候选集准确相等。

- 新材料 check；需求相同且 selection 相同保留原 decision/bought/previous；来源版本本身变更不清判断。
- 需求或范围变化：存续项变 check、删除 bought；原非 check 判断写 previous={旧 basis,decision,bought?}。已有 check+previous 在再次变化时保留该唯一最近人工判断，不嵌套、不伪造当前 check 为旧人工确认。
- 移除项退出 items 和当前待买/已买集合，出现在 removed 返回值中（带原判断）；存储历史仍可从旧 Git blob 读取。移除前为 buy 或 bought 的项必须展示原判断/已买参考并提示“不在新菜单中；取消排菜不撤销既有购买”。不留永久 tombstone，不声称购买已撤销。
- `createShoppingList(id,basis,inputs)` 返回全 check。`applyShoppingDecision(list,ingredientRef,decision,bought?)` 校验合法转换、深拷贝、不改 basis/资料。相同输入重复执行结果相同。

## 4. 可选估算与同版投影

`estimateShoppingList(inputs, selection, at)` 使用 collect 的完整候选集先判断每个材料所有来源是否可算。返回 `{items,budgetStatus}`；每项 `{ingredientRef,status:"complete"|"unavailable",reasons,lines}`，lines 仅 complete 时存在（可为 []，代表原引擎计算无需购买）。reasons 为稳定代码并带来源地址：`multiple-plans | missing-planned-servings | missing-base-servings | missing-qty | to-taste | dish-not-active | missing-dish | missing-ingredient | components-unrecorded | missing-purchase | unit-conversion-missing | engine-issue`。

先完整检查再调用旧 core：同材料任一来源未知/适量/不支持转换时不返回该材料已知部分的总量、金额或包装。未知菜品/成分可能隐藏任意材料时全部估算 unavailable。为避免不同计划 margin 的聚合改公式，本版多 plan selection 的数量参考统一 unavailable/multiple-plans，引用与人工清单照常可用。单 plan 将满足完整性条件的全部来源保留，再以内存适配接原 expand/renderPurchaseOrders；禁止页面重写公式。旧 core 原始数字不改。

budgetStatus 仅在全部候选 complete、每个实际采购行有 amount 且单一币种时为 complete；其它为 incomplete（空范围为 not-applicable）。缺价仍可显示包数，不能显示完整预算；不得从采购量/价格推算实际供餐、消耗或浪费。此次不提供跨计划预算或自动购买量。

`projectTeamMeals(inputs,basis)` 返回 `{projectionVersion:"1",sourceRevision,selection,menuPlans,dishes,ingredients,techniques,collection}`；仅包含选中计划、引用菜、全部配料及所需技法，保留原 JSON 字段、Quantity、图片 ImageRef、clip 和来源。缺项由 collection.issues 表达，不按同名替换。该纯投影中的 ImageRef 原始地址是资料，不代表图片字节已解析。

图片处理属于构建/读取适配：使用 `{sourceRevision,ownerPath,jsonPointer,src}` 定位；相对路径以该实体文件目录为基准，显式 `data/` 前缀从仓库根解析。规范化后仅允许 data 内已批准图片，禁止 `..` 逃逸/绝对路径/符号链接。任何 revision 的 JSON 不得配当前同路径图片。remote URL 只能作为原始来源展示；没有保留字节/可验证不可变资源时在同版模式标 `external-unpinned`，不声称可回放同版图。

## 5. Worker API（RC-B 实现）

沿用 Bearer 角色授权、请求大小、限流、错误体 `{ok:false,errors:[{path,code,message}]}` 与成功 `{ok:true,commit,blobSha,unchanged,warnings}`。错误 message 是 API 文案而非持久实体字段；客户端按 code 本地化并保留 path。所有新/扩展查询错误禁止回退 main。

**统一版本解析器：** 每个请求只解析一次配置的受控分支 head H。所有显式 revision——清单新 basis、旧 basis、各项 previous.basis、source/catalog/asset 的 revision、rollback target——必须解析为完整 commit，且经 ancestry 验证为 H 本身或 H 的祖先；仅 resolveCommit 成功不够。不存在/非祖先/不在本仓受控历史的 SHA 在读端和 rollback 返回 422 revision_unavailable，在清单验证返回 422 basis_unavailable。格式非法返回 400 invalid_revision（清单字段仍可由 schema pattern 报错）；上游权限、网络或超时不得映射成不存在，使用真实授权错误或 502 upstream_error。无 latest fallback。省略 revision 的普通读取使用该 H，后续全部子读取固定 H。写入因 ref 竞争重试时，新尝试重新取得 H 并重新验证 ancestry、条件锁及全部语义，不能混用两次 head。


| 路由 | 权限 / 精确行为 |
|---|---|
| POST /plan/:planId | chef/admin；v2/v3 双写，受下述必需条件头与降级检查保护 |
| POST /dish/:id 与 /dish/:id/draft | chef/admin；v2/v3 双写和降级保护；draft 入口仍强制 draft |
| POST /shopping-list/:id | chef/buyer/admin；只写对应 JSON；body 是整个 ShoppingList，不是 PO，不写 Ingredient/Dish |
| GET /source/:kind/:id?revision=<fullSha> | 三角色；kind 新增 shopping-list；原 plan/dish/ingredient 保留。省略 revision 先解析一次当前 head；指定值必须完整 SHA，响应 commit 精确等于该值。读坏 JSON/schema 报错，不当不存在 |
| GET /catalog?revision=<fullSha> | 三角色；所有 entities、techniques、供应商、翻译状态来自同一 commit。schema/JSON 坏项不再静默跳过；超过上限 fail-closed |
| GET /asset?revision=<fullSha>&owner=<entityPath>&pointer=<jsonPointer> | 三角色；server 在指定 revision 读取 owner 的 ImageRef 并解析允许路径，禁止客户端指定任意 URL 代理。成功为真实图片 bytes + Content-Type + X-Source-Revision；失败为标准 JSON；无当前图兜底 |

资产 owner 只允许 `data/(ingredients|dishes)/<id>.json` 或 `data/techniques.json`；pointer 只接受 schema 中 ImageRef 的 /image、/components/<n>/prep/image、/steps/<n>/image、技术词表 /<n>/image；n 必须为该 revision 中真实存在的非负数组下标。查询 CORS 暴露 X-Source-Revision；缓存键包含完整 revision、owner、pointer。旧 ImageRef 中 remote src 在此接口返回 422 external_asset_unpinned，非代理。

**条件头：** 新建必须 `If-None-Match: *`；更新必须 `If-Match: <blobSha>`（允许一对双引号，拒绝列表、weak ETag、*、空值）。两头同时出现返回 400 invalid_precondition；未提供必需条件返回 428 precondition_required。CORS 加入 If-None-Match。过期 blob/并发双创建返回 409 conflict（与现客户端习惯一致），不使用读后无条件写。所有新 plan/dish 及 shopping 写入按此执行；Ingredient 原写入不在本变更范围。

**清单原子提交：** 读取 head H，核查目标 blob/不存在条件、所有 sourceRevision 是否可达配置仓库受控分支的历史，读取该版本 inputs，校验 selection 所有 plan 存在且格式合法；计算候选/需求。Git tree+commit 的 parent 必须 H，非 force 更新 ref。并发落后时在新 head 重新跑全部条件与语义检查，不能只重试写内容；上限两次后 409。同 ID 两个新建只一方成功，不能覆盖；响应丢失先 GET 重读比较，不用无锁重试。

- 创建内容必须等于 createShoppingList 的全 check 结果，不能用第一次创建伪造已确认项；后续人工判断再写。
- basis 不变：服务端确保候选精确相等，只允许 decision/bought 转移；previous 只能保留或在人工确认时清除。
- basis 改变：仅接受 reconcileShoppingList 的精确结果，409 review_required 返回需复核 ingredientRef 列表；重算与换基线作为一次保存，不能在同次请求把受影响项重新标 available/bought。用户看到新资料后另次受锁保存确认。
- 旧基线不可读取时返回 422 basis_unavailable，不以当前资料猜旧需求，不清空原判断强写。sourceRevision 不要求当前 head：清单可明确保留已保存的旧输入；“是否需要更新”由显式同版比较得出。
- 固定 basis 内坏 dish/ingredient/technique refs、未录成分可保留 check 与缺项，不伪造实体。悬空 Ingredient 项禁止变 buy/available/bought（422 unresolved_reference）；其他可解析材料可人工判断，不代表整配方完整。缺 plan 为无有效基线，拒绝持久清单。

| HTTP/code | 触发条件 |
|---|---|
| 400 schema keyword / invalid_selection / invalid_precondition / invalid_revision | 结构非法、selection 重复或 ID 不匹配、条件头形状、revision 非完整 SHA |
| 401 unauthorized / 403 forbidden | 未授权/无该动作权限；不泄露资料存在性 |
| 404 not_found | 已授权有效 revision 中目标文件确实不存在 |
| 409 conflict / format_downgrade / review_required | 并发条件失败 / 降级 / 换基线未用复核结果 |
| 422 basis_unavailable / revision_unavailable | 历史不可达/无法解析清单基线；指定 commit 无法解析，无 latest fallback |
| 422 unresolved_reference / invalid_source / asset_unavailable / external_asset_unpinned | 人工确认坏材料引用 / 已存源文件格式不合法 / 同版图片缺失或非法 / 外链未固化 |
| 428 precondition_required | 新建/更新缺必需头 |
| 413 too_large / 429 rate_limited / 502 upstream_error | 保留现有运行错误；upstream 超时不得误报 not_found |

## 6. 回退与构建准入

RC-B 的 rollback target 也采用 §5 统一 resolver，要求完整 SHA 且为本次 H 可达祖先；将整树替换改成受控知识资料回退；允许恢复 `data/ingredients/**`、`data/dishes/**`、`data/menu-plans/**`、`data/techniques.json`、`data/translations.lock.json`。保留当前 `data/shopping-lists/**`、`data/purchase-orders/**` 以及任何不在允许集的 data 路径（包含未来快照）；不能顺便删新文件。

在同一 H 上构造候选树并校验格式、引用和升级保护。任何当前 v3 MenuPlan/Dish 在目标中缺失或更旧，整个回退返回 409 format_downgrade，保持零写入；不自动补份数/qty。成功仍是新 commit、非 force、[skip ci]，不自动发布。并发清单写入与 rollback 争用时重读 H，保留最新清单字节。旧 basis 的资料不会因 rollback 改变。

构建增加显式 `--target legacy-numeric|team-meals`，默认 legacy-numeric 保留现有行为；不根据某条资料缺失自动切模式。

- legacy-numeric：旧三张单和 issues/pending 严格检查继续；v3 输入或所引用的 v3 Dish 返回 unsupported-format，不崩溃/NaN。`--compare-snapshots` 仅用于该目标和固定黄金 root。
- team-meals：每份计划输出 `team-meals/<planId>.json` 同版投影、全引用问题、独立 estimates；不把旧 PrepSheet/MenuSheet 当主投影，也不把新清单塞 purchase JSON。build.json 增 `target:"team-meals"` 和 projectionVersion，保留 builtAt/commit/plans。
- 缺份数、qty、基准、包装、价格、draft/archived、成分未录、空选中范围是可展示 warning，不能阻止已录引用发布；坏 plan/dish/ingredient/technique 引用、非法 schema、示例菜引用、缺失/非法本地图片为 blocking error。warning 必须跟随投影，不能显示“配方完整”。
- 只读工作预览可显示 blocking 缺项；正式 team `--check` 返回非零，发布不输出成功。固定 commit 要对应实际输入字节：无 Git/脏 data 只可显式 preview 且不得给 saved sourceRevision；正式构建不能用 HEAD 标签伪装修改工作副本。
- team 资产采用版本路径 `assets/<sourceRevision>/<repoRelativePath>`，写入同版文件字节；映射保留原 ImageRef 与 owner/pointer。外链标 external-unpinned，无本地字节时不嵌当前外链图片。
- ShoppingList 的 basis 可能早于构建 commit：不能用这次 head Catalog 给历史清单补资料。静态 team 投影只对应本次计划 revision；可变清单通过 Worker 的 source/basis/catalog/asset 读同版。清单永久封存不是本期依赖。
- CI owner 分别接生产 team-meals 检查与固定黄金 legacy 检查；A 不修改 workflow/依赖清单。共享黄金样本唯一 owner 为 RC-Q；A 仅将 engine/sheets/build/translate 测试切到固定输入，不能改 expected 来适配正常生产菜单变化。

## 7. 状态 × 事件与不变量

| 对象 / 唯一 lifecycle owner | 当前 × 事件 | 结果 / 旁路限制 |
|---|---|---|
| MenuPlan/Dish 格式 / B 持久化、A 格式 | v2 × 显式升级 | v3 保留所有真实值；任何旧写入/rollback 不得降级 |
| 编辑会话 / C | clean × 编辑；dirty × 保存 | dirty；saving 记录提交 generation 和 blobSha |
| 编辑会话 / C | saving × 再编辑/晚到 success | 保存提交版结果；只有 generation 未变才 clean，否则仍 dirty |
| 编辑会话 / C | saving × 409/网络不明 | 保留本地稿；冲突或待核实；GET 查真实结果再决定重试 |
| ShoppingList / B | 不存在 × 条件创建 | 全 check，候选精确相等；双创建只能一份成功 |
| ShoppingList / B | check/buy/available × 人工选状态 | 写所选状态，非 buy 删除 bought，人工确认删除 previous |
| ShoppingList / B | buy × 标已买/撤销已买 | buy+bought:true / buy+bought:false；不更改知识库 |
| ShoppingList / B + A 纯比较 | 已有基线 × 同需求重算 | 保留判断；basis+items 原子替换 |
| ShoppingList / B + A 纯比较 | 已有基线 × 需求/范围变更 | 受影响 check+previous；移除项只出差异，不在新待买集合 |
| 同版读取/缓存 / B 服务端、C 会话 | revision A × 取详情/语言切换 | A 实体和 A 图；缓存键含版本/身份；任何失败不读 B 填补 |
| 投影/估算 / A | 合法输入 × build/collect/estimate | 纯函数；缺量不删除材料、不造总量；数字仅原 core |
| 回退 / B | head H × 恢复目标 | 新知识 commit，保留最新清单；禁止删除/降级 v3 文件 |

| 不变量 | 可测方式 |
|---|---|
| INV-1 未知保持未知，旧值逐字段保留 | v2/v3 schema 交叉、升级深相等、parser 无份数 |
| INV-2 任意写入/rollback 不降级 | 最新锁+旧版本仍 409；回退旧树不写 |
| INV-3 判断只属于本次清单 | 对比 Ingredient/onHand/Dish/PO 字节 |
| INV-4 basis/items 同一原子 blob | 故障注入建 tree/commit/ref，读取只能全旧/全新 |
| INV-5 创建和更新条件不绕过 | 并行新建、陈旧锁、缺头、重试后重校验 |
| INV-6 资料与图片同版 | A/B 不同实体/图、离线缓存、迟到响应 |
| INV-7 所有已录引用/来源保留 | 多菜/同名不同 ID/重复来源/to-taste/缺 qty/缺包装 |
| INV-8 部分可算不冒充总量/预算 | 同材料已知+未知、混币种/缺价、全库存覆盖 |
| INV-9 收集和 active 不当完整确认 | 空 components 草稿、非空草稿、active 无完整性字段 |
| INV-10 沿用判断只看真实需求 | 排序/翻译/图片不清；换菜/范围/用量/缺项上下文变化清 |

## 8. 对抗测试矩阵与交付顺序

| 用例 / 对应验收 | 输入/攻击 | 预期证据 / owner |
|---|---|---|
| A01 / T01,T05,INV-1 | v2 无份数；v3 无份数/0/null；旧 200 份升级 | 旧拒绝、新缺省合法、非法填写拒绝、200 原样；删除最后一餐→保存/重读 meals:[]→清单 reconcile removed（buy/bought 参考与不撤销购买提示）/ A,B,Q |
| A02 / T03,T09,INV-1 | v2 component 无 qty；v3 无 qty/to-taste/null/steps.n | 显式新格式才可未知，非法 qty/步骤仍拒绝 / A,Q |
| A03 / T02,T03,INV-7,9 | 多菜、调料、重名 ID、缺引用、draft、重复配料 | 一个材料全部来源和问题可定位；缺菜/未录成分+其他非空候选时 enumeration incomplete；坏材料保留 ID 且 references unresolved / A,Q |
| A04 / T04,INV-3,10 | 排序/图片/翻译；换菜/日期/范围/qty/baseServings/margin/yield | 前三保留、需求变化 check+previous、移除不复活 / A,B |
| A05 / T09,INV-8 | 已知+未知来源、to-taste、缺包装/缺价/混币种 | 不输出伪总量；旧数字不变 / A,Q |
| A06 / T04,T07,INV-4,5 | 双创建、双更新、同内容但错锁、建提交后断网、ref 竞争 | 一方成功/冲突；重读结果，永不无锁重试 / B,C |
| A07 / T05,INV-2 | 最新 If-Match v3→v2；rollback 旧/缺 v3 | 409，写入次数 0，清单字节不变 / B |
| A08 / T04,T07,INV-4 | rebase 半提交、伪造 previous、basis 改后直接 available | 拒绝不一致结果；一次仅全新/全旧；后次人工确认 / B |
| A09 / T06,T08,INV-6 | A JSON+B 图、revision 不可读、外链变化、路径逃逸、JSON 损坏 | 明确错误/缺失，无当前 fallback；非法发布阻断 / A,B,C |
| A10 / T07,T08 | saving 再编辑、切页切语、晚 success、离线重开 | 新输入仍 dirty，版本/判断不串，mock 无共享承诺 / C,D |
| A11 / C01,C03,C04 | 固定黄金 480；首餐 200→220；库存足够及 minPacks | 番茄 19→20 件；原全单 1525.50；适量原处理保留 / A,Q |
| A12 / T03,T06,T09 | team 缺包装/基准；legacy 同输入；生产改变 week-41 | team warning 可发布，legacy 严格，黄金独立固定 / A,CI |
| A13 / INV-5,6 | source/catalog/asset 每个读入口、rollback target、清单新旧/previous basis 分别传非祖先/不存在 SHA、非法 SHA，并注入上游超时/权限错误；catalog 截断 | 统一 resolver：非祖先/不存在→revision_unavailable（清单 basis_unavailable），非法格式→invalid_revision/schema；上游失败不误报不存在；鉴权优先；无 latest fallback / B |
| A14 / T05,T07 | rollback 与清单购买进度写并发 | ref 重试保留最新清单且不降级 / B |

A0：本合同+一篇新 scope ADR 提交供调度独立核查。A1：schema 红灯→新 schema→types/checker→消费 RC-Q 样本→模块文档。A2：纯引用/规范化/复核/估算/投影行为先红后绿，再构建分流和固定黄金消费。文件边界以调度任务表为准；A 不实现 B/C，不编辑 shared fixture。每部分独立提交、可审阅 PR，不合并 main。

验证命令由本仓 package.json/现有测试核实：`node scripts/validate-schemas.mjs`、`python3 scripts/local-validate.py`、`node scripts/check-types-vs-schema.mjs`、`npm --prefix packages/core test`、`node --test scripts/check-types-vs-schema.test.mjs scripts/build-data.test.mjs scripts/translate.test.mjs`、`git diff --check`。新行为保留针对当前 commit 的红/绿日志；旧黄金手算独立核查。A0 纯文档运行 diff/引用校验，不虚报新测试已过。

Architecture cell：调度文件唯一 owner 表；Map delta：none，无新架构地图。前端验证：Yes，由 C/D/Q 执行 zh/en/uk × 393×852、1440×900；本 A 的 unit/build 结果不能代替浏览器、真实 API 或厨房走查。

### 正式 Ajv 校验可复用入口（A owner，Q 消费）

`scripts/validate-schemas.mjs` 导出 `createSchemaValidators({schemaDir})`、`validateData({root,dataDir?,schemaDir?})`、`main(argv?)`。root 默认为脚本仓库根；dataDir 默认 root/data，schemaDir 默认 root/schemas，均支持绝对路径。createSchemaValidators 返回 `{validateEntity(kind,value)}`；kind 为 ingredient/dish/plan/purchase-order/techniques/shopping-list，返回 `{valid,schema,errors:[{instancePath,keyword,message,params}]}`；未知版本 valid:false，不靠松散 union 漏过。

validateData 返回 `{passed,failed,total,results}`，results 每项 `{file,schema,valid,errors}`，file 为绝对路径；坏 JSON/缺必需文件也作为失败结果，import 不打印、不 exit、不读默认数据。此入口只负责完整正式格式，不声称做完 refs/asset。main 保留原 CLI PASS/FAIL 摘要与成功 0/失败 1，只有文件直接执行时设置退出码。Q 以实际正式 schemaDir 和其固定 fixture 的 root/dataDir 调用，不另造第三套 schema 校验器。A1 先测试 import 无副作用、可换 root、旧格式失败、版本选择、非法 JSON，再实现。

## 9. 技术决议与待验

版本、未知 qty 策略、清单最小字段、来源索引、需求比较、强制条件头、固定 revision、同版资产错误和回退保护在本 A0 给出具体决议，等待独立技术核查。没有待用户重新批准的产品方向。

真实隔离仓、凭据、Worker 部署尚待 B/Q 核实；T04/T05/T07 的真实保存/并发/回退未验。A0 不是 A1/A2 完成声明。任何 schema 注册、包清单或 CI 变更交调度指定 owner；若实施细节需要改变本共享合同，先给调度提交 diff 与影响，不让下游猜接口。
