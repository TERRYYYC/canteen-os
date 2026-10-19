---
feature_ids: [knowledge-base]
topics: [historical-implementation]
doc_kind: historical-note
created: 2026-09-19
---

> 历史记录（2026-09-19），不代表本次源码迁入的 review、测试或部署结论。当前操作入口见[模块 README](../../README.md)；以下保留当时范围与验证边界。

# Backend M1 — ready for integration / deployment freeze

日期：2026-09-19。所有写入限定 `apps/api/**` 与 `tests/api/**`，没有修改共享根依赖、DDL、前端或部署目录，没有访问或修改旧 CanteenOS，没有自行部署远程。

## 完成

- `app.mjs` 导出 `buildApp(config)`；`server.mjs` 环境配置入口，默认 `.data` 与 `127.0.0.1:4390`，拒绝非回环绑定。
- 真实磁盘 SQLite，实际库版本门槛、WAL/FULL/FK/recursive_triggers、版本化迁移及文件校验和。
- 菜谱创建、读取、完整更新、归档、搜索、分页、历史；同名独立，未知字段不补造，精确小数字符串不转 Number。
- BEGIN IMMEDIATE 内：查幂等回执 → 版本/引用检查 → 当前及关联 → 完整快照 → 成功回执 → 提交。重复请求返回原状态码及正文。
- 来源登记、图片上传/读取、外链图片和视频登记。素材魔数/大小/字段校验，文件与目录 fsync 后 ready，DB 失败清理此次文件。
- 快照增加 `sourceRecords`（见 README），实际包含原文/作者/URL/关联素材公开数据；历史不查询当前来源或当前素材代替旧值。
- UUID 严格小写裸 UUID，uppercase/URN 在路径、菜谱和 source assetId 均返回 400。
- 截断 multipart 的 Dicer/Busboy 与 `ERR_STREAM_PREMATURE_CLOSE` 仅在解析范围内映射 400；真正 I/O/内部故障仍为 500。
- Fastify 改用 `LogController`，清除 FSTDEP023 弃用日志。

## 验证结果

最终执行 `node --test tests/api/*.test.mjs`：**14 tests / 14 pass / 0 fail**，约 9.14 秒。

包含真实磁盘重开、相同菜名并列、未知量、长小数、创建/修改/归档重放、版本冲突、快照/回执插入故障回滚、媒体/来源历史、排序和完整清空、引用归属、分页搜索、图片字节重开、上传失败无残留、跨站防护、两个连接竞争、数据库忙 503、迁移校验和与初始化失败回滚、静态页面。

独立只读子 agent `backend_contract_review` 最终结论：**可冻结，未发现阻断 M1 的 P1/P2**。未冒称其执行了测试。真实 HTTP 子进程生命周期、浏览器与远程部署验收仍由主调度负责。

## 本轮范围

这是可运行的 M1；后台批量导入、自动来源提取、公开身份认证、标准食材管理界面、旧系统发布适配属于后续阶段。强制终止在文件持久化与 DB 登记之间可能留下未引用文件，当前保持文件以免误删；维护清理与更完整图像解码可后续增加。
