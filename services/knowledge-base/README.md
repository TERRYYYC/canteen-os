---
feature_ids: [knowledge-base, douyin-favorites-ingest]
topics: [sqlite, development, source-import, video-recipe]
doc_kind: module-entry
created: 2026-10-19
---

# SQLite 菜谱知识库

这是 CanteenOS 的知识库服务源码，现与主应用保存在同一仓库。它仍是独立进程和独立数据库：日常菜谱、候选、不可变历史及私有媒体保存在 SQLite；主应用 Worker 通过受控网关读取和写入，浏览器不直接访问 SQLite。菜单采用的版本及依赖仍由主应用显式固定到 Git，日常编辑不会改写旧菜单。

本模块随主仓采用 [Apache-2.0](../../LICENSE)；第三方依赖遵循各自许可证，未 vendor F2 或其他解析项目源码。

菜谱格式 3（ADR-0012，canteen-os#182）把每行的原方和食堂用量分开记，食堂用量和标准食材换算值写明出处，「没说清」的地方带上步骤或食材行，见 [API 合同](docs/API-CONTRACT.md#菜谱格式-3原方和食堂用量分开记没说清带位置adr-0012canteen-os182)。旧修订原样保留。

迁入基线是知识库 `0.1.2`、数据库 schema `6`。这次提供可克隆源码和操作入口，未升级正在运行的服务或迁移用户数据。[来源与迁入边界](SOURCE-IMPORT.md) · [主仓当前合同](../../docs/current-contract.md) · [知识库模块](../../docs/modules/knowledge-base.md)

## 新建隔离实例

从主仓根目录进入本模块；以下命令的 Node 必须为 **24.18.0 或更新版本**。实际链接的 SQLite 必须至少 **3.51.3**，系统 `sqlite3` 的版本不代表 Node 内置 SQLite。

```sh
cd services/knowledge-base
node --version
npm ci
node scripts/sqlite-ops.mjs runtime
npm run build
```

先查看 4390 是否已有实例。若已占用，保留它，换一个空闲端口并把 `KB_ALLOWED_ORIGINS` 中的端口一起改掉。下面使用仓库外的**全新**目录，不连接现有业务数据库：

```sh
KB_SANDBOX_PARENT="${TMPDIR:-/tmp}"
KB_SANDBOX_DIR="$(mktemp -d "$KB_SANDBOX_PARENT/canteen-kb-XXXXXX")"
env -u KB_DB_PATH KB_DATA_DIR="$KB_SANDBOX_DIR" \
  KB_HOST=127.0.0.1 KB_PORT=4390 \
  KB_ALLOWED_ORIGINS=http://127.0.0.1:4390,http://localhost:4390 \
  npm start
```

打开 <http://127.0.0.1:4390>，API 健康检查为 <http://127.0.0.1:4390/api/v1/health>。首启自动运行 `db/001` 至 `006`；重启后保留该目录可继续读回数据。这个实例不会自动获得现有收藏、菜谱或视频；不要把空库当成现有知识库的同步副本。

该服务只允许回环绑定。`X-KB-Client` 和 Host/Origin 校验是跨站请求保护，不是用户身份认证。公开部署必须另外提供访问保护；CanteenOS 的角色与来源权限由主仓 Worker 网关承担。

## 日常开发与验证

所有命令在本模块目录运行；本模块使用自己的 `package-lock.json`，不加入主仓 `packages/*` 的 pnpm workspace。

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run test:editor
```

`npm test` 使用临时 SQLite/素材目录，覆盖 API、真实 HTTP 生命周期、迁移、导入和备份恢复；F2 与预处理测试使用替身工具，不调用真实平台或模型。浏览器测试使用隔离临时目录和构建副本，截图默认写入已忽略的 `test-results/browser/`；可通过 `KB_BROWSER_EVIDENCE_DIR` 指向仓外目录。测试通过只证明这些检查，不代表现有 50 条内容完整、真实厨房确认或远端已部署。

开发时先为 API 设置一个仓外 `KB_DATA_DIR`，执行 `npm run dev:api`；另开终端运行 `npm run dev:web`，打开 <http://127.0.0.1:5177>。该 Vite 入口代理到 4390，是知识库自己的编辑器，不是主应用 CanteenOS 页面。主应用页面、角色网关与发布逻辑分别位于 [`packages/web`](../../packages/web)、[`packages/worker`](../../packages/worker)。

## 从视频到菜谱的各阶段

1. **收藏目录**：`scripts/import-douyin-favorites.py` 导入已有收藏清单；它不登录抖音或抓取完整视频。
2. **完整原片**：[`f2-acquire.py`](scripts/video-evidence/f2-acquire.py) 调用单独安装的 F2 下载并校验媒体、复用缓存，见 [F2 说明](docs/F2-VIDEO-ACQUIRE.md)。F2 环境不随 `npm ci` 安装。
3. **全片证据**：[`prepare.py`](scripts/video-evidence/prepare.py) 调 FFmpeg、MLX Whisper ASR 和 Apple Vision OCR，见 [预处理说明](docs/VIDEO-EVIDENCE-PREPARE.md)。当前真实工具链限 macOS / Apple Silicon，Linux Docker 不会自动拥有 Apple Vision。
4. **AI 理解**：agent 阅读完整转写、帧与争议处，按[主仓解析契约](../../skills/video-recipe-ingest/SKILL.md)生成 `source.json / evidence.json / candidate.json`。上述脚本不替 agent 生成菜谱，也没有随迁入交付完整 50 条自动调度 worker。
5. **写入知识库**：[`import-video-candidate.mjs`](scripts/import-video-candidate.mjs) 先校验原片和引用，再调用 API；[`import-candidate-illustrations.mjs`](scripts/import-candidate-illustrations.mjs) 单独导入参考图。两者有 dry-run / apply 边界，见[视频导入](docs/VIDEO-RECIPE-INTEGRATION.md)。
6. **使用**：候选可保存为菜谱，再由主应用选定版本排菜、发布、查看备料和采购。来源确认与厨房核定在 app 外进行，见 [ADR-0011](../../docs/adr/0011-recipe-review-outside-app.md)。API 保留历史兼容字段不等于当前产品要求 app 审核。

媒体、缓存、来源原文和数据库不在 Git 中。要重放已有解析产物，使用[主仓实际案例](https://github.com/TERRYYYC/canteen-os/pull/165)；它是缓存结果重放，不会下载新视频、调用 AI 或写入知识库。

## 接手开发

先读[根 AGENTS](../../AGENTS.md)、[当前合同](../../docs/current-contract.md)和目标 issue，再读相关 API/schema。这里的 `contracts/` 是 SQLite 服务契约，主仓 `schemas/` 是 Git 固定实体契约，两者不能互相冒充。

[#182](https://github.com/TERRYYYC/canteen-os/issues/182) 的原方/食堂用量拆分与带位置 unknowns **尚未在本模块实现**；这次迁入不是该 issue 的完成回执。开发时从当前分支新建独立工作树，数据库使用副本或全新目录，历史修订保持不可变。

| 路径 | 内容 |
| --- | --- |
| `apps/api/` | Fastify API、SQLite 访问、媒体、候选、标准材料/技法、采用导出 |
| `apps/web/` | 知识库独立 React 编辑器 |
| `contracts/` / `db/` | JSON Schema 与校验和迁移 |
| `scripts/` | 导入、视频证据与发布/备份 CLI |
| `infra/` | 通用 Linux 用户级 systemd 模板 |
| `tests/` | API、集成、浏览器与运维检查 |

[API 合同](docs/API-CONTRACT.md) · [历史资料导入](docs/LEGACY-INTEGRATION.md) · [运维](docs/OPERATIONS.md)。API/前端的旧 M1 状态文件仅作历史记录；以当前代码和本次实际验证为准。
