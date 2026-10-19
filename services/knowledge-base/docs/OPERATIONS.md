---
feature_ids: [knowledge-base]
topics: [operations, sqlite, backup, release]
doc_kind: runbook
created: 2026-10-19
---

# SQLite 知识库运维

以下命令在本模块目录执行。源码迁入不代表已部署；这里不发布任何现有服务器位置、数据或历史现场回执。[本地启动](../README.md)使用仓库外的全新数据目录；备份、演练和发布分别是独立动作。

## 运行时与数据

Node 至少 24.18.0，实际链接 SQLite 至少 3.51.3：

```sh
node scripts/sqlite-ops.mjs runtime
```

服务使用 `KB_DATA_DIR`；默认数据库为该目录的 `knowledge.sqlite`，素材为 `uploads/`。`KB_DB_PATH` 可覆盖数据库路径。不要复制活库主文件来假冒备份，也不要在启动迁移入口之外手动执行 SQL：`schema_migrations` 维护版本、文件名和 SQL SHA-256，应用会核对已有迁移并拒绝较新的数据库。

应用仅绑定 `127.0.0.1:4390`，无独立数据库 TCP 端口。数据库放本机磁盘，不经网络文件共享。不要覆盖已有端口或数据目录。

## 在线备份与独立恢复

先用真实的外部绝对路径替换示例。备份与恢复目标必须尚不存在；命令不覆盖原数据。

```sh
node scripts/sqlite-ops.mjs backup \
  --data /absolute/kb-data \
  --out /absolute/backups/new-backup \
  --release kb-example-001
node scripts/sqlite-ops.mjs verify --backup /absolute/backups/new-backup
node scripts/sqlite-ops.mjs restore \
  --backup /absolute/backups/new-backup \
  --into /absolute/restores/new-rehearsal
```

在线备份通过 Node SQLite backup API 取得含已提交 WAL 的一致快照，再按 `assets` 表复制全部本地 ready 资产（含历史独有图片）。逐项核验文件、字节数、SHA、数据库完整性、外键和迁移，最后写完成 manifest。没有有效 manifest 的半成品不是成功备份。外链只保存 URL；原片、外部缓存、模型或对象存储需另行备份。

恢复先验证 bundle，再写新目录，拒绝已有目标、路径逃逸和符号链接。使用同一代码版本，在空闲回环 4391 演练读取：

```sh
env -u KB_DB_PATH KB_DATA_DIR=/absolute/restores/new-rehearsal \
  KB_HOST=127.0.0.1 KB_PORT=4391 \
  KB_ALLOWED_ORIGINS=http://127.0.0.1:4391 \
  KB_RELEASE_ID=kb-example-001 node apps/api/server.mjs
```

核对列表、详情、来源、历史和图片字节，并重启后再次读取。演练成功不意味着允许用旧快照覆盖活库。当前脚本没有自动定时、保留策略或异地备份。

## Linux 发布布局和前提

`infra/canteen-kb.service` 是用户级 systemd 模板，`%h` 表示该用户的 HOME：

```text
$HOME/canteen-kb/
  runtime/node-v24.18.0-linux-x64/
  incoming/<release-id>/
  releases/<release-id>/
  current -> releases/<release-id>
  shared/data/knowledge.sqlite
  shared/data/uploads/
  shared/backups/
  shared/restores/
```

现有 `remote-prepare.sh` / `remote-deploy.sh` 保留历史部署的保护合同：只支持 Linux x86_64 的 Node **24.18.0 / SQLite 3.53.1** 固定 runtime；需要已经存在的 `canteen-os-test.service` 与回环 `4380/_test/status`，部署前后对比其 PID、重启次数和资料版本。它们不是任意 Docker 或任意空白服务器的一键安装器。对不同布局先另做部署适配，不移除保护来硬跑。

脚本不会连接 SSH 或默认选择任何服务器；由操作者在目标机运行。必须显式指定当前部署用户，prepare 还要求已有并验证的 Node 发行目录：

```sh
KB_DEPLOY_USER="$(id -un)" \
  KB_SOURCE_RUNTIME=/absolute/verified-node-v24.18.0-linux-x64 \
  bash scripts/remote-prepare.sh
```

prepare 只创建独立目录并复制 runtime，不启动服务。构建和测试通过后，在一个全新仓外 staging 中复制 `package.json`、`package-lock.json`、`apps/`、`contracts/`、`db/`、`infra/`、`scripts/`；保留已构建 `apps/web/dist`，排除 `node_modules`、`.env`、数据库、上传、凭据和私有运行证据。不要把源目录或持久目录直接打包。

```sh
node scripts/release-manifest.mjs create /absolute/staging/kb-example-001 kb-example-001 6
node scripts/release-manifest.mjs verify /absolute/staging/kb-example-001 kb-example-001
```

schema `6` 必须与目标代码和数据库迁移一致。manifest 拒绝秘密文件、数据库和符号链接；它校验内容完整性，不是数字签名。经受信通道上传整个 staging 到目标 `incoming/kb-example-001` 后，核对该具体 release 并运行：

```sh
KB_DEPLOY_USER="$(id -un)" \
  bash "$HOME/canteen-kb/incoming/kb-example-001/scripts/remote-deploy.sh" \
  kb-example-001 --deploy-ready
```

deploy 有单实例锁、清单与端口归属校验；按 npm lock 安装生产依赖且禁用 lifecycle scripts；停止知识库实例、完整备份并验证、用该 release 事务迁移，成功后才原子切换 `current` 并启动。健康必须匹配 `releaseId/schemaVersion`，并读取静态页、列表和回环监听。不要 `rsync --delete` 持久目录，不用 `pkill node` 或广泛端口清理。

失败时保留数据与 release，停止已激活的新服务；不会自动覆盖数据库或重新启动旧主应用。运维命令支持通过 `current/` 符号链接调用（`import.meta.main`）。打包须排除 macOS AppleDouble `._*` 文件。

## 回滚与访问

代码回滚前，先把活库 `schema_migrations` 与目标 release 的 SQL 版本/散列逐项比对、备份、停止知识库，再原子切换兼容 release 并重复验收。`PRAGMA user_version` 不是本应用迁移版本。若 schema 不兼容，禁止只切代码；保留当前数据并前向修复或单独制定恢复方案。没有自动回滚脚本。

回环服务可通过自己配置的 SSH 主机别名转发，示例别名 `your-kb-host` 需要自行设置：

```sh
ssh -N -L 4390:127.0.0.1:4390 your-kb-host
```

本地打开 <http://127.0.0.1:4390>。该服务的 Host/Origin/客户端标记不是公网身份认证，直接开放公网需要额外访问保护。CanteenOS 浏览器正常通过主应用 Worker 网关访问，并由其执行角色和来源权限；不要让浏览器直接访问 SQLite。
