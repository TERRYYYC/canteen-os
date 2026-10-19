---
feature_ids: [knowledge-base]
topics: [legacy-import, sqlite, evidence]
doc_kind: runbook
created: 2026-09-19
updated: 2026-10-19
---

> 本说明记录旧 Git 资料的专用导入合同；文中的固定 revision/样本数量是历史示例，不代表当前知识库或部署数量。主应用采用行为以[当前合同](../../../docs/current-contract.md)为准。

# CanteenOS 知识资料迁入 SQLite

本轮只接知识管理。新库写入不改变旧 Git 菜单、备料、采购或发布版本。001迁移未变，002新增导入证据/身份映射与知识目录。现有同名菜谱保留，不按名称查找或覆盖。

## CLI

要求 Node 24.18+，SQLite实际版本>=3.51.3。输入是固定旧Git revision导出的 `data` 目录，revision由导出流程验证；CLI会保存所读字节及其hash，不凭一个CLI参数证明这些字节属于远端Git。

先看清单（不打开数据库）：

```sh
node scripts/import-legacy.mjs --source /path/to/export/data --revision f455c876ab8ffcaa535dbd96b80308105b5238a2 --namespace canteen-remote-test
```

备份后应用：

```sh
node scripts/import-legacy.mjs --source /path/to/export/data --revision f455c876ab8ffcaa535dbd96b80308105b5238a2 --namespace canteen-remote-test --db /path/to/data/knowledge.sqlite --uploads /path/to/data/uploads --apply
```

也可使用 `npm run import:legacy -- ...`。库存和采购信息仅随原文归档，不作为新系统当前库存激活。

清单模式只读文件与基础结构，所有引用/菜谱校验在原子apply中完成。首次apply自动执行缺失的增量迁移，然后用一个短 `BEGIN IMMEDIATE` 事务完成食材、技法、菜谱、来源、媒体记录、历史快照和导入回执。应用迁移本身是独立事务：导入失败不会撤销已经成功的002迁移，但不会留下半份业务资料。

远程部署建议停止应用、做完整备份、部署新版本并迁移、执行导入、重跑验证，再启动服务。CLI亦可在兼容的新版服务运行时通过SQLite写锁工作，但不应与旧版应用并存迁移。关闭服务不要求关闭或改动旧CanteenOS数据head。

### 核对输入清单

在只读清单模式核对所选固定 revision 的实际知识文件、材料/技法引用和图片。菜单不导入知识实体；保留在原导出 archive 中。运行产生的 manifest 与计数留在仓外，不将旧部署内容或私人记录写进公开文档。

旧资料若标为演示/未核验，保留其原始状态、来源与已明确的数量，不转换成人工确认结论，也不给其他菜默认同样份数。已有 SQLite 菜谱不因名称相同被覆盖。

## 可重复与冲突规则

- 同namespace、同revision、同知识文件/媒体manifest重跑，返回初次 `importId/recipeId/version` 与 `replayed:true`，不新增或改版本。
- 即使导入菜后来已经人工改成v2，重跑仍不覆盖它；初次回执里的version=1表示导入结果，并非当前版本。
- 同revision字节不同，409 `LEGACY_SOURCE_CHANGED`。
- 同namespace新revision，409 `LEGACY_NEW_REVISION_REQUIRES_REVIEW`。本阶段不做自动增量覆盖。显式审查与合并是后续工作，不通过换namespace偷偷解决冲突。
- 每个namespace+kind+旧ID有唯一映射；dish、ingredient、technique身份分开。行/步骤UUID及其原JSON Pointer记入证据并进入快照。
- 任意约束、缺引用、无损数量转换失败都会回滚本次业务写入。进程内错误会清除本次新增媒体；硬崩溃仍可能留下未引用文件，与既有上传流程相同，不能宣称文件系统与数据库具备跨介质原子事务。

## 数据保真

`legacy_files.raw_bytes` 是原UTF-8 JSON字节BLOB，另有源路径、SHA-256和Git blob SHA。图像按源路径校验读取、复制到不可变媒体键；manifest保存其hash。源revision和namespace用于定位，而不是拿UUID冒充旧Git SHA。

解析数量使用 JSON.parse reviver 的原词法context，不先把浮点数转成近似字符串。精确十进制保持最多40字符；指数可以精确展开，超长/零/不明确数值拒绝。没有qty→unknown，旧to-taste枚举→to_taste，且证据仍保存原枚举；不编造“来源原句”。

日常recipe包含原三语、配料名称与调料角色、数值/单位、步骤、可显示的prep三语文字，以及视频片段。prep文字由已录技法名、size、timing标签、note组成；**完整原prep/confidence/provenance/技法关联**在只读legacy证据中保留，普通编辑不会改写原证据。

原active/draft、machine/human翻译状态不转换成人工核验结论。图像license/author/sourceUrl保留为媒体rights并进入完整历史；不默认标own。食材/技法图片也在各自知识目录与证据里保留。外链仅登记，不抓取、下载或证明可播放。

## 新读接口

### GET `/api/v1/ingredients?q=&cursor=&limit=`

```json
{
  "items":[{
    "id":"uuid", "name":{"zh":"盐"}, "aliases":[], "role":"seasoning",
    "legacy":{"namespace":"canteen-remote-test","legacyId":"salt","sourceRevision":"40hex","path":"data/ingredients/salt.json","pointer":"","sha256":"64hex","gitBlobSha":"40hex"},
    "original":{"schemaVersion":"2","name":{"zh":"盐"},"baseUnit":"g","trackStock":true}
  }],
  "nextCursor":null
}
```

可选`externalId/image`。original是旧原对象，包含当时采购/库存配置，UI须标旧来源资料，不能当成实时库存。

### GET `/api/v1/techniques?q=&cursor=&limit=`

`{items:[{id,kind,name,note?,image?,legacy,original}],nextCursor}`。kind为cut/heat/pretreat。

以上两接口仅允许q/cursor/limit，q最多200字符，limit默认100、范围1–100。cursor是服务返回的不透明base64url字符串；按id稳定翻页，游标绑定目录及查询条件。错误参数返回400。

### GET `/api/v1/recipes/:id/legacy`

```json
{
  "recipeId":"uuid", "version":1,
  "evidence":{
    "schemaVersion":"canteen-legacy-evidence-v1",
    "source":{"namespace":"canteen-remote-test","legacyId":"old-id","sourceRevision":"40hex","revision":"40hex","importId":"uuid","path":"data/dishes/old-id.json","pointer":"","sha256":"64hex","gitBlobSha":"40hex"},
    "original":{}, "rawText":"原始JSON文本",
    "ingredients":[{"id":"uuid","legacyId":"salt","original":{},"rawText":"原始食材JSON","source":{}}],
    "techniques":[{"id":"uuid","legacyId":"stir-fry","original":{},"source":{}}],
    "rows":{"ingredients":[{"id":"uuid","pointer":"/components/0"}],"steps":[{"id":"uuid","pointer":"/steps/0"}]},
    "assets":[], "warnings":[{"code":"LEGACY_UNVERIFIED","message":"…"}]
  }
}
```

普通新建菜谱为 `evidence:null`。evidence同样在GET detail及每次保存的完整历史快照顶层 `legacy` 内；查看旧版本直接读取该历史legacy，不拼接最新目录。此字段是只读证据，不放进recipe PUT。

媒体public DTO和快照media增加可选 `rights:{license?,author?,sourceUrl?}`、`sha256`、`external`。新资料来源的metadata也进入sourceRecords快照。旧字段和recipe写合同保持兼容。

## 验证与运维

`npm test` 包含新集成验证：同名保留、原字节/高精度数值、缺量、三语、prep/clip、人工编辑后重放、新revision拒绝、失败回滚和媒体清理、许可历史、分页、备份恢复及CLI软链入口。补充执行 `npm run typecheck`、`npm run build`。

备份脚本002起把六张新表计数纳入manifest，Online Backup本身复制完整数据库。旧001备份仍可由新工具验证/恢复；恢复后由应用迁移到002。不要仅备份核心十张表或重新初始化业务库。
