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
