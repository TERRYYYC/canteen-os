---
feature_ids: [canteen-kb-integration]
topics: [worker, sqlite, gateway]
doc_kind: handoff
created: 2026-09-19
---

# SQLite 知识库网关

本轮按用户确认的知识库接回方案，在现有 Bearer 鉴权后提供显式 `/knowledge/*` 路由。路由清单在 `src/knowledge-routes.ts`；不把 SQLite 菜谱改写为旧 Dish，旧发布数据路径保持原行为。

## 运行合同

- `KNOWLEDGE_BASE_URL` 只接受 `http://127.0.0.1:4390` 或隔离恢复端口 `4391`（可有末尾 `/`）。它是可信服务配置，不来自请求或浏览器。
- chef / admin 可读原始菜谱列表、明细、历史、收藏与图片字节；buyer 不可读这些来源资料。健康状态及标准食材、技法查询允许 chef / buyer / admin；写入仅 chef / admin。buyer 使用固定版本的公开 catalog 和采购投影。知识库读写采用独立角色限流桶，每小时 600 / 60；既有 Git 桶不受影响。与旧限流一样，计数是 isolate 内存级别，不宣称全局严格配额。
- GET recipes 接受 q/tag/cursor/limit；GET ingredients/techniques 接受 q/cursor/limit。字典游标最多 1000 字符，其余格式由 KB 校验。其他路由无查询参数。UUID、小写路径、版本、重复参数、未知参数都在调用上游前检查。
- 上游仅收到 Content-Type、If-Match、Idempotency-Key 白名单，以及服务端设置的 `X-KB-Client: web`；不转发旧 Bearer、Cookie、Origin、Host 或代理头。
- 上游正常 JSON/错误响应不重塑，状态码、ETag、Idempotency-Replayed、Retry-After 保留；图片字节保持原样。网关强制 no-store / nosniff，不向浏览器返回 Set-Cookie、Location 等无关头。
- CORS 增加 PUT、Idempotency-Key，并暴露 ETag / Idempotency-Replayed / Retry-After。沿用原指定 origin，无 Allow-Credentials。
- 固定菜谱写入 Git 时，只写经审核的可操作配方、版本标识、来源条件待核验数量及缺图状态；来源原文、引句、媒体 URL 与审核备注保留在私有 SQLite 知识库。公开投影沿用同一数据边界。此权限收紧由后续 ADR-0010（叠加 PR #121）正式取代 ADR-0009 第 3 项；本 PR 仍须作为草稿与 #121 连续交付，不单独合入或部署。
- 旧版已存的带原片证据 v3 菜谱继续可读取，但 `/catalog`、`/source/dish`、`/asset` 和静态团队菜单投影在返回前剔除私有来源字段、片段链接及未授权图片。通用 `/dish/:id` 写入不得伪装知识库定版；原始旧记录若在公开 Git 历史中已存在，应用层过滤不能抹去历史，公开部署前需单独核对数据迁移。

## 容量与失败

- 新知识库 JSON 请求上限 4 MiB；multipart 总请求上限 8 MiB + 64 KiB envelope。KB 自身继续校验单文件 8 MiB 与图片格式。旧 JSON 256 KiB 和旧图片容量不变。
- 读取采用流式计数，到上界立即取消 reader。知识库响应总上限 16 MiB。
- `KNOWLEDGE_TIMEOUT_MS` 默认 10000，允许 100–30000 ms；覆盖连接与完整响应体读取，超时取消请求和响应 reader。
- 未配置/配置非法返回 503 `KNOWLEDGE_NOT_CONFIGURED`；断连 502 `KNOWLEDGE_UNAVAILABLE`；超时 504 `KNOWLEDGE_TIMEOUT`；重定向或非预期内容 502 `KNOWLEDGE_BAD_RESPONSE`。不做 Git 回退，不自动重试写操作。
- KB 自身错误沿用 `{error:{code,message,…}}`；进入网关前的旧鉴权/权限/容量错误仍沿用旧 `{ok:false,errors:[…]}`。前端必须兼容这两种错误形状，并在不确定保存结果时保留输入和幂等键。

## 远程适配器交接

`scripts/remote-test/server.mjs` 由独立作者修改：需要为新路由保留 PUT body、Idempotency-Key，采用相同请求上限，设置 KNOWLEDGE_BASE_URL。网关使用真实 global fetch；测试只用独立 `__knowledgeFetch`，绝不能通过 GitHub `__fetch` 接缝代理。

## 验证

新增 `test/knowledge.test.mjs` 9 个测试块：全部 15 路由的三角色/未鉴权矩阵、严格路径查询、请求和响应头隔离、十进制原始 JSON、错误/图片透传、JSON 与 multipart 容量、流式取消、超时与连接失败、旧限流隔离和 CORS。

Worker 构建与完整 303 项测试已通过。超时 reader 释放增加红/绿断言：初次独立断言复现未取消 reader，修复后完整 suite 通过。该回执为作者验证，不代替独立代码审查或真实远端集成验收。
