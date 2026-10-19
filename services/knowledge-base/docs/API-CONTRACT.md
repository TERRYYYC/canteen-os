---
feature_ids: [knowledge-base]
topics: [api, sqlite, compatibility]
doc_kind: api-contract
created: 2026-09-19
updated: 2026-10-19
---

> 本合同描述当前迁入服务的接口及兼容字段；产品侧来源确认和厨房核定在 app 外进行（[ADR-0011](../../../docs/adr/0011-recipe-review-outside-app.md)）。#182 的新用量/未知项字段尚未实现，不能从本合同推断已支持。

# M1 API合同（开发前冻结）

002知识管理增量合同见 [LEGACY-INTEGRATION.md](LEGACY-INTEGRATION.md)。新增GET `/ingredients`、`/techniques`、`/recipes/:id/legacy`；detail/history增加可选顶层 `legacy`，媒体可选rights/sha256/external。recipe写入body保持下列M1合同。

Recipe body使用contracts/import-batch.schema.json的$defs.recipe。title/description是{zh?,en?,uk?}，至少一种非空。数组ingredients/steps/sources/assets及tags省略时归空；baseServings省略时未知。完整PUT未带的可选字段清空。JSON Schema 2020-12用Ajv2020；同名允许、ID服务端UUID。

## 返回格式

- GET /api/v1/health → {ok:true,sqliteVersion,schemaVersion,releaseId}；不得返回磁盘路径、凭据或业务内容。
- GET /api/v1/recipes?q=&tag=&cursor=&limit= → {items:[{id,title,description?,tags,version,updatedAt,cover?}],nextCursor:null|string}，默认20最多100。`cover` 仅在当前版本关联了可用图片封面时返回，形状为 `{assetId,kind:"image",url,status}`；本地图片需经鉴权图片接口读取，外链仅代表已登记，不保证可访问。授权与来源信息请读取菜谱详情中该版本的 `media` 快照，列表不返回可能变化的素材元数据。搜索标题和配料名；稳定updated_at,id降序游标。
- GET /api/v1/recipes/:id → {id,version,recipe,createdAt,updatedAt,archivedAt:null|string,media:[{assetId,kind,url,status,role,stepId?,clip?}],sourceRecords:[{id,kind,title?,author?,url?,textContent?,assetId?,asset?}]}；ETag为"vN"。recipe.sources保存引用；sourceRecords保存此版本完整来源内容。
- POST /api/v1/recipes body=Recipe → 201，返回与GET detail同结构。
- PUT /api/v1/recipes/:id body=Recipe → 200，返回与GET detail同结构。
- POST /api/v1/recipes/:id/archive body={} → 200，归档并返回detail，默认列表隐藏归档项。
- GET /api/v1/recipes/:id/revisions → {items:[{version,createdAt}]}。
- GET /api/v1/recipes/:id/revisions/:version → 与detail相同的快照结构，createdAt为此版本保存时间；须带当时media与sourceRecords，不能读取当前字段冒充历史。
- GET /api/v1/recipes/:id/source-illustrations?version=N → `{recipeId,recipeVersion,candidateId,approvedCandidateVersion,illustrations:[{assetId,role,sourceStepId,caption?,rightsState:"pending"}],stepLinks:[{sourceStepId,recipeStepId|null}]}`。`N` 必须为唯一的正整数查询参数，且该菜谱历史版本必须存在；无关联的已批准候选时两个候选字段为 `null`、数组为空。只列出关联候选的内部原片参考图，`ingredient`/`finished` 的 `sourceStepId` 为 `null`；步骤仅在候选与指定历史版本的 ID 和文本都相同才关联。响应不带图片 URL、媒体路径、来源原文、音画转写或审核文本；下游 Worker 必须限制主厨/管理员访问，并单独鉴权图片字节。
- POST /api/v1/assets/upload multipart字段file → 201 {id,kind:"image",url,status:"ready"}。
- POST /api/v1/assets/external body={kind:"video"|"image",url:string} → 201 {id,kind,url,status:"ready",external:true}；ready仅表示已登记，不证明外链可用。
- GET /api/v1/assets/:id/content → 已保存的文件字节，正确Content-Type和nosniff；不读取客户端指定路径。
- POST /api/v1/sources body={kind:"web"|"video"|"text"|"file",title?,author?,url?,textContent?,assetId?} → 201 {id,...公开来源字段}。

## 写入条件

- 所有写请求带X-KB-Client:web或agent；菜谱create/update/archive另必带Idempotency-Key，update/archive另带If-Match:"vN"。
- 请求hash包含method/path/If-Match/规范化body。事务BEGIN IMMEDIATE之后先查回执：同键同hash原样重放（包括初次创建的201），同键不同hash409；然后核验版本、保存当前记录及完整快照、回执，再commit。SQL失败全部rollback。
- 缺Idempotency-Key或结构错误400；缺If-Match428；过期版本409；缺引用或跨菜谱步骤引用422；不存在404；DB忙503且可重试。错误统一{error:{code,message,details?}}。不泄露SQL、磁盘路径或堆栈。
- 同批配料/步骤ID重复要拒绝。前端用crypto.randomUUID为新增配料和步骤生成稳定ID。数字量value为十进制字符串，禁止转JS Number再存。
- 步骤素材role=step必须stepId，其他role没有stepId；clip仅适用于video且end>start。保留配料原文，source与asset必须存在且文件已ready。
- 调整顺序需SQLite可行的两阶段序号更新或一次有序替换，并正确处理被删除步骤的素材关系，不破坏其他菜谱。

## 前端流程

菜谱库 → 新建/详情编辑 → 保存。提供名称、简介、标签、可选人数、配料列表（含原文用量、四种amount.kind）、步骤、图片上传、视频URL登记、来源URL/原文。只填名称能保存；同名结果可并列。编辑冲突保留输入，并允许重新加载比较。只读旧版本有清楚标记。

照片先上传取得assetId，再保存菜谱关联；上传成功但菜谱保存失败，保留可重试状态。来源先POST /sources再关联sourceId。前端不把UUID和协议头放进正常表单。

字段或返回格式需要调整时，先与主调度和另一实现任务同步；不能各自猜测。

## UUID 表示约定

所有行 ID 和引用 ID 使用小写、36 字符、无前缀的标准 UUID（与 `crypto.randomUUID()` 一致）；大写或 `urn:uuid:` 表示返回 400。共享 JSON Schema 的 `format` 和 `pattern` 同时约束此规则。

## 菜谱格式 3：原方和食堂用量分开记，「没说清」带位置（ADR-0012，canteen-os#182）

字段定义在 `contracts/canteen-quantities.schema.json`，菜谱写入仍走 `import-batch.schema.json` 的 `$defs.recipe`。

### 菜谱修订

`recipeFormatVersion: "3"` 的菜谱：

- **食材行**（`$defs.ingredientV3`）没有 `amount`，改为下面四个可选字段：
  - `originalAmount`：原方用量原话，只显示。
  - `originalQty: {value, unit}`：从原话读出的数，只显示，不进计算。必须同时有 `originalAmount`。
  - `qty: {value, unit}`：食堂用量，采购、备料只用它。
  - `qtySource`：`qty` 的出处。`qty` 和 `qtySource` 必须同时出现。
- 其余行字段（`id`、`name`、`ingredientId`、`rawText`、`role`、`preparation`）照旧。
- `kitchenPrep` 多一个 `leadTime: {value, unit: "min"|"h"|"d"}`，即要提前多久。
- 菜谱顶层多一个 `unknowns[]`，见下文。

数量和出处的形状：

- `value` 是十进制字符串（同 `amount.value`，不转成数字存）。
- `unit` 只能是 CanteenOS 的单位：`g kg ml l pcs pack tbsp tsp pinch to-taste`。`to-taste` 不带 `value`，其他单位必须带。
- `qtySource`：
  - `{kind: "measured"|"specified", by, date}`：师傅实称或指定，写谁（`by`）、哪天（`date`，`YYYY-MM-DD`）。
  - `{kind: "rule", ruleId}`：按师傅规则，只写规则 id（小写字母、数字、短横线），不写 `by`、`date`。
  - `by` 在私有知识库里可以写真名。

`unknowns[]` 每条是 `{kind?, action?, stepId?, ingredientRowId?, text}`：

- `kind`：9 类闭集 `prep-ahead amount net-or-gross cut-size identity heat duration doneness other`。可以缺省，表示还没分类（K2）。
- `action`：只在 `kind` 是 `prep-ahead` 时出现，而且必须有：`marinate soak brine rest cool other`。
- `stepId`、`ingredientRowId`：必须指向本菜谱里的步骤、食材行，否则 422 `INVALID_UNKNOWN_REFERENCE`。两个都不带，就是整道菜的。
- `text`：原话，只给师傅和管理员看（ADR-0010）。
- 完全相同的两条返回 422 `DUPLICATE_UNKNOWN`；最多 200 条。
- 没有条目就不存这个字段，读接口也不返回（K5）。
- 修改时，「不带这个字段」和「写 `[]`」不一样：
  - 写 `[]`：删光，存成新版本（K7）。
  - 不带这个字段，而上一版有条目：409 `UNKNOWNS_REQUIRED`，什么都不存，`details.unknownCount` 是上一版的条数。这样不认识这个字段的客户端保存时，不会悄悄删掉它们。
  - 不带这个字段，上一版本来就没有：照常保存。
  - 同一个 Idempotency-Key 不能既代表「写 `[]`」又代表「不带」：后到的那个返回 409 `IDEMPOTENCY_KEY_REUSED`。

其他校验：

- 带了上面任何新字段，但 `recipeFormatVersion` 不是 `"3"`：400 `RECIPE_FORMAT_REQUIRED`。
- 格式 3 的行带 `amount`、缺出处、出处不全或单位不在列表里：400 `INVALID_RECIPE`。
- 版本只升不降（无 < 2 < 3）。降格式保存返回 409 `FORMAT_DOWNGRADE`，防止旧客户端丢掉新字段。

### 读接口和旧修订

- `GET /recipes/:id`、`GET /recipes/:id/revisions/:v` 原样返回保存时的修订文档：
  - 格式 3 的修订带上面的字段，没有条目时不带 `unknowns`。
  - 旧修订（一行一个 `amount`）不改写（ADR-0009）。回归测试用改动前代码写出的修订，逐字节比对读接口返回（`tests/fixtures/legacy-revisions.json`）。
- 已有菜谱补成格式 3，只会存成新修订号，旧修订号内容不变（K6）。
- 当前关系表 `recipe_ingredients` 的 `amount_*` 列只是投影，修订文档才是全文：
  - 格式 3 的行，`amount_*` 列放食堂用量：有数为 `exact`，`to-taste` 为 `to_taste`，没有为 `unknown`。
  - `amount_raw` 放原方原话。

### 导入器和收藏审核

`scripts/import-video-candidate.mjs`（`apps/api/video-candidate.mjs`）产出格式 3 候选：

- 用量：
  - `stated` 的原话，只在单位能无歧义对上时写 `originalQty`。可对上的有克/g、千克/公斤/kg、斤（×500 g）、两（×50 g）、毫升/ml、升/L、个/只。
  - 片、根、段、勺等只留 `originalAmount`。
  - `stated_imprecise` 只留原话；`not_stated` 两个都不写。
  - 绝不写 `qty`、`qtySource`。服务端也拒绝带食堂用量的候选：400 `INVALID_CANDIDATE`。
- 「没说清」：
  - 候选里每条可以是纯文字（旧解析，没有类别），也可以是 `{text, kind?, action?}`。
  - 整道菜的 `unresolved[]` 不带位置；食材的 `uncertainty`（可为一条或数组）带 `ingredientRowId`；步骤的 `unknowns[]` 带 `stepId`（K1）。
  - 给了类别就原样存，没给就空着（K2）。
  - 平铺的 `unresolved` 字符串照旧保留，给收件箱计数和旧读者用。
  - 导入结果多一个 `unknownCount`。
- 存为菜谱：`POST /favorites/candidates/:id/review` 原样把候选菜谱存成第 1 版，所以 `unknowns`、原方字段都带过去（K4）。旧的单一用量候选仍存成旧格式，`unresolved` 照旧在来源证据里。

### 标准食材

`contracts/standard-ingredient.schema.json` 加两个出处：

- `yieldSource`：净料率的出处，有它就必须有 `yield`。
- `pcsToGramSource`：每个多少克的出处，有它就必须有 `pcsToGram`。

形状同 `qtySource`。旧食材修订不变。

### 给 CanteenOS Worker（#181、#174）的对照

| 知识库（格式 3 修订） | dish-v3 / ingredient-v3 | 转换 |
|---|---|---|
| `ingredients[].originalAmount` | `components[].originalAmount` | 原样 |
| `ingredients[].originalQty` | `components[].originalQty` | `value` 字符串转数字 |
| `ingredients[].qty` | `components[].qty` | `value` 字符串转数字 |
| `ingredients[].qtySource` | `components[].qtySource` | `by` 一律写 `"chef"`，真名不出知识库 |
| `kitchenPrep.leadTime` | `prep.leadTime` | `value` 转数字 |
| `unknowns[].kind` / `action` | `unknowns[].kind` / `action` | 原样 |
| `unknowns[].stepId` / `ingredientRowId` | `stepIndex` / `componentIndex` | 行 ID 换成数组位置 |
| `unknowns[].text` | 无 | 不发布（ADR-0010） |
| 标准食材 `yieldSource` / `pcsToGramSource` | ingredient-v3 同名字段 | `by` 写 `"chef"` |

注意：

- 位置和类别都相同的几条，固定时合成一条（dish-v3 `uniqueItems`）。
- 没有 `kind` 的条目还没分类。怎么处理由 #174 定；建议拒绝固定，等 #184 分完类再固定。
- 旧格式修订没有这些字段，Worker 照旧处理。

### 迁移

不需要新迁移。新字段都在修订文档（JSON）里，旧库打开后不改任何行，`schemaVersion` 仍是 6。
