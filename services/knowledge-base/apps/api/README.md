---
feature_ids: []
topics: [canteen-os, favorites, candidate-illustrations]
doc_kind: api-runbook
created: 2026-10-01
---

# 知识库 API 实现入口

入口 `server.mjs`；集成测试使用 `await buildApp(config)`（从 `app.mjs` 导入）。实现使用本模块锁定的 Fastify 与 Node 内置 `node:sqlite`，不调用系统 sqlite3 CLI。

## 运行

在应用根目录执行 `npm run dev:api` 或 `npm start`。默认监听 `127.0.0.1:4390`，数据位于应用根 `.data/knowledge.sqlite`，图片在 `.data/uploads/`。启动建议按[模块 README](../../README.md)显式设置仓外 `KB_DATA_DIR`；环境变量及备份见[运维](../../docs/OPERATIONS.md)，另支持 `KB_RELEASE_ID` 供 health 报告已部署版本。`KB_ALLOWED_ORIGINS` 使用逗号分隔的完整回环 Origin。

`buildApp` 可传 `dataDir, dbPath, host, port, webDist, allowedOrigins, releaseId, logger`；测试迁移还可传 `migrationsDir`。调用方负责 `app.close()`，关闭时释放 SQLite 连接。静态前端目录在建 app 时存在才启用，SPA 页面回退不影响 API 的 JSON 404。

## 持久化与事务

- 每连接设置 foreign_keys、recursive_triggers、busy_timeout=5000、synchronous=FULL、WAL；实际 SQLite 必须 >=3.51.3。
- 迁移按 `db/NNN_name.sql` 连续编号执行。DDL 为 CLI 自带事务；runner 仅去除明确定义的 PRAGMA 与外层 BEGIN IMMEDIATE/COMMIT 行，再把迁移版本、SHA-256 和建表放入同一个受锁事务。触发器 BEGIN/END 保留。重复启动校验已执行的文件哈希，变更需新增迁移，不能改旧迁移。
- 菜谱写入在 BEGIN IMMEDIATE 后先找回执，同键同内容返回初次状态码和快照；随后校验版本和引用，写当前关系表、完整历史及成功回执。失败全部 rollback。
- 配料、步骤采用删除本菜谱的关联后按原 ID 有序重建，支持重排及完整 PUT 清空字段；其他菜谱拥有的行 ID 返回 422。
- 精确数量为字符串；未知人数、未知数量保持缺失/unknown。同名独立，无父菜品实体。
- 当前 detail 与历史均返回已提交版本的完整快照。查询列表使用当前关系表。每份快照除 API 示例字段外，增加 **`sourceRecords`**，包含保存时的来源原文、作者、URL、创建时间；文件来源还带当时公开 asset 描述。历史读取不 JOIN 当前来源或素材。

## 文件与边界

JPEG/PNG/WebP 最大 8MiB，根据魔数判定 MIME，上传完整解析后才写文件。临时文件 fsync、rename、目录 fsync 成功后登记 ready。数据库登记失败清理本次文件；进程在文件落地和 DB 提交间被强制杀死可能留下未引用文件，保留供后续维护处理，不自动删除未知文件。

图片路径由服务端 UUID 决定，读取拒绝 symlink；历史引用图片不会被编辑覆盖。外链仅登记，ready 表示已登记，服务端不会下载或验证其远端可用性。魔数检查不等同于完整图像解码校验。

仅回环绑定；Host 校验回环主机，Origin 精确匹配允许列表，写入要求 `X-KB-Client`。这些是私有原型的跨站防护，不是用户身份鉴权。写入菜谱另要求 Idempotency-Key，修改/归档要求 If-Match。响应不暴露 SQL、堆栈或磁盘路径。

## 验证

`npm run test:api`：真实临时磁盘数据库，覆盖同名独立、未知/精确量、幂等重放、版本冲突、归档、历史来源/媒体快照、完整 PUT、重排、引用错误、UUID/数量校验、搜索/分页、上传持久化/失败清理、Host/Origin、两个连接、DB busy、迁移重开/哈希/初始化失败回滚及静态页面。

独立任务另负责 `tests/integration/**` 的真实 HTTP 子进程重启测试；部署和远端验收由主调度/运维任务执行。本后端任务没有改动旧 CanteenOS，也没有自行部署。

## 候选原片参考图（004 迁移）

`GET /api/v1/favorites/items` 的每条作品在存在候选时增加 `candidateSummary`：
`{candidateId, title, status, ingredientCount, stepCount, illustrationCount, thumbnailAssetId, unresolvedCount}`。
`title` 沿用菜谱的 `{zh?,en?,uk?}`，无参考图时 `thumbnailAssetId` 为 `null`；没有候选的旧作品不带这个字段。
摘要选该作品按 `created_at DESC, id DESC` 排序的最新候选；缩略图优先取成品图、再取配料图、最后取步骤图，只返回内部素材 UUID，不改变图片 `rightsState: unknown`，也不把参考图放入 `recipe.assets`。
列表新增 `q`，按最新候选的中/英/乌菜名作字面子串搜索，最多 200 字符；仍可与 `folder`、`state`、`limit`、`cursor` 一起使用。搜索词属于游标筛选条件，旧无搜索词的游标保持可用。列表不推算本次分析批次数量；`/favorites/imports` 的数量仍是收藏清单导入口径。

- `POST /api/v1/favorites/candidates/:id/illustrations`：已上传内部图片的不可变追加事件。请求字段为 `assetId, sourceMediaSha256, frameMs, role, stepId, caption, sourceUrl, author, rightsState`；`caption` 为至少一种语言的 `{zh,en,uk}`，`role` 为 `ingredient|step|finished`，当前只接收 `rightsState: unknown`。
- 图片必须关联同一候选实际步骤，媒体 SHA 与 URL 必须匹配原 capture，时码不能超出视频；asset 必须是 ready 的本地 image。
- 事件按图片 SHA 与关联字段幂等：第一次 201，重复 200。候选 GET 和 items/candidates 返回聚合的 `illustrations`。原 candidate document、capture 和 recipe revision 不被重写。已审核候选仍能内部查看原片图；这些图不会进入 `recipe.assets`、菜单照片或阻断原有固定版本流程。
- 二进制图片继续走 assets/content，通过 CanteenOS 的 Bearer 网关与 `api.image()` 读取。离页、换身份时取消读取和回收 blob；加载失败可重试。

将实际检查过的 `illustrations.json` 和同目录图片导入本地 KB：

```sh
node scripts/import-candidate-illustrations.mjs --artifact-dir /absolute/recipe-artifacts --candidate-id UUID
node scripts/import-candidate-illustrations.mjs --artifact-dir /absolute/recipe-artifacts --candidate-id UUID --apply --output /absolute/illustration-import-receipt.json
```

默认 API 为回环 `http://127.0.0.1:4390`。省略 candidate-id 时读取同目录 `local-import-receipt.json` 的 `candidateId` 或 `imported.candidateId`。脚本先验证整批来源、真实步骤、时间、文件哈希、实际图片尺寸（≤1280）与字节数（≤200000），然后上传并追加。重复导入复用既有事件和 asset；不会下载原视频、自动登记许可或师傅批准。网络在上传后、追加前断开时可能遗留未引用 asset，保留文件供排查，重试不会产生重复的逻辑图片事件。
