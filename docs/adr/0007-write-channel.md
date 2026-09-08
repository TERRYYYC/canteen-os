# ADR-0007: 写入通道（静态后台 → 云函数 → GitHub API）与链接令牌

> **English summary.** Phase 1 keeps its hard constraint — no database, no login, no self-hosted server (ADR-0006 §5, execution brief §1.4) — while letting the chef edit through a UI. The write path is: static `/admin` page → a single-file **Cloudflare Worker** → **GitHub Contents/Git Data API** → a commit on `main` → GitHub Actions builds and deploys. Nine rulings: (1) Cloudflare Workers as the platform; (2) writes go **straight to `main`**, not through an auto-merged PR — git history is the audit log, and a structured commit trailer records the role; (3) **writing is not publishing**: write commits carry `[skip ci]` so nothing deploys until the chef presses Publish, which is a `workflow_dispatch` on `build-deploy.yml`; (4) auth is a per-role random token (chef / buyer / admin) delivered in the **URL fragment**, so it never reaches a server log or a `Referer` header — the Worker stores only SHA-256 hashes and rotation is one secret change; (5) the endpoint list, permission matrix and per-field error format; (6) publish progress maps Actions steps onto the four stages the design shows (validate / translate / build / go live); (7) rollback writes a **new** commit restoring `data/` from an old sha — never a force push; (8) three layers keep the Worker inside `data/**` (path allowlist, a credential without `workflows` permission, and a CI guard after the fact); (9) image compression moves to the browser, so the Worker only validates size and magic bytes. Open follow-ups are listed at the end; none of them block starting `packages/worker` (#19).

- Status: Proposed（2026-09-08）—— 完成定义要求 Terry 批准，合并本 PR 即视为批准，届时状态改 Accepted
- Deciders: @TERRYYYC
- 关联：[ADR-0006](0006-scope-reduction-v2.md) §5（阶段 1 单人编辑、不做编辑 UI —— 本文是它的下一步：有 UI 但仍无后端）、执行简报 §1.4 / §3 v0.3 / §5、设计稿 `docs/design/backoffice-v1.html`
- 落地 issue：#19（worker）、#20–#25（后台各页）、#26（密钥扫描）、#27（后台接真实 worker）

## Context

师傅不能靠别人改 JSON——这是 v0.3 存在的唯一理由。但阶段 1 的三条硬约束不动摇（执行简报 §1.4）：**无后端数据库、无登录、无自建服务**。三者叠加之后，可选的写入通道其实只剩一族：浏览器里的静态页 → 一个无状态函数 → 把改动写回 git → CI 构建部署。ADR-0006 §5 当时的裁决是「阶段 1 单人编辑、不做编辑 UI」；本文不推翻它，而是给出它的最小演进：编辑的人还是一个（师傅），入库的还是 git commit，只是把「手改 JSON + 提 PR」换成一张表单——**数据模型、校验链路、审计方式一个都没变**。

需要定案的是执行简报里明确留给本 ADR 的五个二选一：云函数平台、直接 commit 还是自动合并 PR、令牌模型、发布进度怎么查、回退语义。再加一条 ADR-0006 遗留的安全边界：worker 究竟能碰仓库的哪些路径。

## Decision

### 1. 平台：Cloudflare Workers（单文件）

`packages/worker` 是一个 Cloudflare Worker（`export default { fetch }`，单文件优先，无框架）。

理由，按重要性：

1. **密钥有地方放**。GitHub 写入凭据绝不能进浏览器；Workers 的 secret 是本方案里唯一「不需要自建服务器又能存密钥」的位置。
2. **无冷启动**。isolate 模型下 p50 首字节在几十毫秒量级；师傅点保存要立刻有反馈，Lambda 那种秒级冷启动会让人反复点。
3. **免费额度对本场景是无限**。10 万请求/天 vs 我们一天几十次写入。
4. **和 Pages 解耦**。前台部署在 GitHub Pages（已上线），worker 在 Cloudflare —— 两边可以各自回滚，互不牵连。

落选项：Vercel / Netlify Functions（同样可行，但会把前台也拽过去，或者多一个域名与 CORS 面）；GitHub Actions `workflow_dispatch` 直连（浏览器要拿到能触发 Actions 的令牌，等于把写权限发给客户端，违反第 1 条）；自建 Node 服务（违反「无自建服务」）。

> Worker 与前台不同源，所以 CORS 精确到源：`Access-Control-Allow-Origin: https://terryyyc.github.io`（逐字匹配，不用通配符）、`Vary: Origin`、允许 `Authorization` 头、预检缓存 600 秒；不使用 cookie，因此不开 `Allow-Credentials`。

### 2. 写入方式：直接 commit `main`（不走自动合并 PR）

执行简报 §3 留的二选一，选**直接 commit main**。

- **审计不靠 PR**。git 历史本身就是审计链：作者固定 `canteenos-bot`，commit message 首行人话（`data(plan): 排 2026-10-19 那周（12 道菜）`），尾部固定 trailer：
  ```
  X-CanteenOS-Role: chef
  X-CanteenOS-Endpoint: POST /plan/week-42
  ```
  `git log --grep` 就能按角色、按端点回溯。自动合并 PR 提供的额外信息只有一个 PR 号，代价是每次写入多两次 API 往返、多一个 merge commit、还多一个「PR 开了但没合上」的失败态。
- **单人编辑没有审阅者**（ADR-0006 §5）。PR 的价值是给人看的；这里没有第二个人，`data/` 的正确性由 worker 提交前的 ajv 校验 + 发布时的 `--check --compare-snapshots` 闸门保证，不由 PR 保证。
- 并发：写入用乐观锁——Contents API 带上被改文件的 `sha`，ref 更新带上期望的父 commit。冲突（HTTP 409）时 worker 重读一次并重试一次，仍冲突则返回 `{ ok: false, errors: [{ code: "conflict" }] }`，前端提示「有人刚改过，刷新后重试」。第一轮只有一个师傅在写，这条基本不会触发，但不能没有。

### 3. 写入 ≠ 发布

设计稿里 `/admin` 顶部有「N 项未发布」，`/admin/publish` 有四步进度——这要求写入之后**不自动上线**。实现方式用 GitHub 原生语义，不新增机制：

- worker 的每个写入 commit message 末尾带 `[skip ci]` → 不触发任何 workflow，`main` 上的 `data/` 前进了，线上没动。
- **发布 = `POST /publish`**，worker 对 `build-deploy.yml` 发 `workflow_dispatch`，返回 `runId`。
- **「N 项未发布」** = `main` 上动过 `data/` 的 commit 与线上 `data/build.json` 里 `commit` 之间的差集（前端调 GitHub compare API 或 worker 代理，二选一由 #20 定，不影响本 ADR）。

代价与兜底：带 `[skip ci]` 的写入 commit 不会被 `ci.yml` 校验。这不是漏洞——同一份 schema 校验在 worker 提交**之前**已经跑过一遍（§4），发布时的 `Validate` 与 `Gate` 步骤是第二遍；两遍都在，只是都不在 PR 上。

> 依赖：`build-deploy.yml` 需要加 `workflow_dispatch:` 触发器（一行）。这属于 `.github/workflows/**`，GitHub App「Claude Github MCP Connector」没有 workflows 权限，见 #57 的两条路。**这是 #19 开工前的唯一外部依赖。**

### 4. 令牌模型：按角色随机串，放在链接的 fragment 里

- 三个角色：`chef` / `buyer` / `admin`。每个角色一个 32 字节随机串（base64url，43 字符），**与人无关**——不存姓名、不存邮箱、不存设备标识，符合「不在 worker 里存任何个人信息」。
- **令牌走 URL fragment，不走 query**：`https://terryyyc.github.io/canteen-os/admin#t=<token>`。fragment 不会发给任何服务器，因此不会出现在 GitHub Pages 的访问日志、CDN 日志或跳转时的 `Referer` 头里。页面加载后立刻读 `location.hash` → 存 `sessionStorage` → `history.replaceState` 抹掉地址栏里的令牌。
- 请求时才带上：`Authorization: Bearer <token>`（执行简报 §5）。
- **worker 只存哈希**：secrets `TOKEN_HASH_CHEF` / `TOKEN_HASH_BUYER` / `TOKEN_HASH_ADMIN` = SHA-256(token) 的十六进制；比较用常数时间比较，避免时序旁路。明文令牌只存在于发给人的那条链接里。
- **轮换 = 改一个 secret + 重发链接**。没有用户表，所以轮换是一次部署的事，泄露时几十秒内可完成。链接一律用一次性方式发（当面扫码 / 私聊），不进群、不进文档。
- 令牌无有效期（阶段 1 无处存放过期状态）；这是有意识的取舍，用「轮换成本极低」来换「不引入会话存储」。

### 5. 端点、权限与错误格式

| 端点 | 作用 | chef | buyer | admin |
|---|---|:--:|:--:|:--:|
| `POST /plan/:planId` | 写 menu-plan → `data/menu-plans/<planId>.json` | ✅ | ❌ | ✅ |
| `POST /ingredient` | 新建 / 更新 → `data/ingredients/<id>.json` | ✅ | ❌ | ✅ |
| `POST /dish/:id/draft` | 保存草稿 → `data/dishes/<id>.json`（`status: "draft"`） | ✅ | ❌ | ✅ |
| `POST /publish` | `workflow_dispatch` 触发 build-deploy，返回 `runId` | ✅ | ❌ | ✅ |
| `GET /publish/:runId` | 四步进度 | ✅ | ✅ | ✅ |
| `POST /rollback/:sha` | 把 `data/` 恢复到某次 commit | ❌ | ❌ | ✅ |

buyer 令牌在 v0.3 **不含任何写权限**——采购员只需要打开前台复制微信文本，那条路径根本不经过 worker。保留这个角色是为了让权限矩阵在第二轮加「采购员改包数」时不用改协议。

返回体固定（执行简报 §5）：

```jsonc
{ "ok": true,  "commit": "<sha>" }                    // 写入成功
{ "ok": true,  "runId": 123456789 }                  // 发布已触发
{ "ok": false, "errors": [                           // 校验失败
  { "path": "/meals/0/servings", "code": "type", "message": "应为整数" }
]}
```

`errors[].path` 是 JSON Pointer，前端按它把对应输入框标黄（设计稿第 6 屏的行为），**原样显示 message，不二次编造文案**。HTTP 状态：200 成功 / 400 校验失败 / 401 令牌无效 / 403 角色越权 / 409 并发冲突 / 413 体积超限 / 429 限流 / 502 GitHub API 异常。

提交前校验：worker 内置 `schemas/*.schema.json` 的预编译产物（ajv standalone，构建期生成，运行时零解析开销），校验不过就**不产生任何 commit**。

限流：每个角色令牌写入 60 次/小时、发布 10 次/小时（Workers 限流绑定或 KV 计数器，#19 选其一）。超限返回 429。

### 6. 发布进度：Actions 步骤 → 四步

`GET /publish/:runId` 调 Actions API 取 run 的 jobs 与 steps，映射成设计稿的四步。映射表**按 `build-deploy.yml` 当前的步骤名逐字匹配**：

| 界面四步 | build-deploy.yml 里的步骤 |
|---|---|
| ① 校验 | `Validate data/**/*.json against schemas/*.schema.json`、`Gate — build-data --check --compare-snapshots` |
| ② 翻译 | `Machine-translate missing en/uk (only when DEEPL_API_KEY is set)`、`Commit machine translations back to main` |
| ③ 构建 | `Build @canteenos/core`、`Build data (three sheets + build.json → packages/web/public/data/)`、`Build web (vite → packages/web/dist/)` |
| ④ 上线 | `build` 作业里的 upload-pages-artifact 步骤 + `deploy` 作业整体 |

每一步的状态 = 该组步骤的聚合：任一 `failure` → 该步红并停在这里；全部 `success` → 绿；否则 → 进行中。

**这张表是硬耦合**：改 `build-deploy.yml` 的步骤名会静默打断进度显示。约束落在两处——workflow 里这些步骤上方加一行注释指向本节；#19 的集成测试里断言映射表覆盖到 run 的全部步骤，出现未映射的步骤名即失败。

### 7. 回退：新 commit，绝不 force push

`POST /rollback/:sha`：读目标 sha 的 `data/` 目录树 → 用 Git Data API 造一个新 tree（只替换 `data/` 这一个条目，其余路径原样保留）→ 以当前 `main` 为父提交 → 更新 ref（非 force）。commit message：`revert(data): 恢复到 <短 sha>`，带同样的角色 trailer。

- 回退**不自动发布**——与 §3 一致，回退后「N 项未发布」变成非零，师傅确认后再点发布。这样「回退」和「回退并上线」是两个可分辨的动作，误操作有一次挽回机会。
- 历史不改写：任何时候 `git log` 都能看到「改错了 → 又退回来」的完整过程。
- 只回退 `data/`。代码回退走正常的 git 流程，不经过 worker。

### 8. 安全边界：三层，任一层单独失效都不足以出事

1. **路径白名单（worker 内）**：写入路径必须逐字匹配 `^data/(ingredients|dishes|menu-plans)/[a-z0-9][a-z0-9-]*(/images/[a-z0-9][a-z0-9-]*\\.(jpg|png|webp))?\\.json$` 一类的固定形状（精确正则见实现），或 `data/techniques.json`。含 `..`、绝对路径、以及任何 `schemas/`、`packages/`、`scripts/`、`.github/`、根目录文件的写入请求一律 400，且不记录请求体。
2. **凭据本身够不着**：worker 用细粒度 PAT（仅本仓库，权限只有 Contents: RW + Actions: RW），**没有 Workflows 权限**——即便 worker 被完全攻破，也改不了 `.github/workflows/**`，攻击者无法通过改 CI 提权。PAT 存 Workers secret，最长一年有效期，到期日写进 `docs/field-test/` 的运维清单。（更好的做法是 GitHub App 安装令牌，自动过期；v0.3 先用 PAT 换取落地速度，第二轮再迁。）
3. **事后守卫（CI）**：`ci.yml` 加一个 job——凡是作者为 `canteenos-bot` 的 commit，若改动落在 `data/` 之外即失败。这是前两层都失守时的最后一道报警。（依赖 #57 的 workflows 权限，见 §3 的注。）

补充：worker 日志只记 `{ 时间, 角色, 端点, HTTP 状态 }`，**不记令牌、不记请求体、不记可识别到人的字段**。密钥扫描由 #26（gitleaks）在 CI 覆盖。

### 9. 图片压缩放在浏览器（对执行简报的一处偏离）

执行简报 §3 v0.3 写的是「拍照上传（worker 压缩到 ≤ 200 KB）」。**本 ADR 改为在浏览器里压缩**：`/admin/ingredient/new` 用 canvas 把照片缩到最长边 ≤ 1280、编码到 ≤ 200 KB 之后再上传；worker 只做校验（Content-Length ≤ 200 KB、magic bytes 属于 jpg/png/webp、尺寸头解析合法），不做像素处理。

理由：Workers 运行时没有图像库，要压缩就得引第三方图片服务或 WASM 编解码器——前者是新的外部依赖与新的密钥，后者会把单文件 worker 撑成几百 KB 的 bundle。手机端 canvas 压缩是成熟做法，且省掉一次大 body 的上传（弱网下这恰恰是体感最差的一段）。

代价：绕过前端直接 POST 大图会被 413 挡掉而不是被压缩；这正是想要的行为。**此项与执行简报冲突，按简报「§1 冻结事项」之外但优先级更高的原则，需要 owner 明确点头；否决则回退为「worker 接第三方图片服务」并另起跟进 issue。**

## Consequences

- 正面
  - 三条硬约束一条没破：仍然没有数据库、没有登录、没有自建服务器；worker 是无状态的，删掉它数据一点不少（全在 git 里）。
  - 审计与回滚是 git 原生能力，不需要额外实现：谁（角色）在什么时候改了什么，`git log` 一条命令看完。
  - 令牌方案的运维成本接近零：没有用户表、没有会话、没有过期任务；泄露的处置是「改一个 secret 重发链接」。
  - 「写入 ≠ 发布」让师傅可以攒一批改动再上线，也让误操作有一次回头的机会；四步进度是真实 Actions 状态的投影，不是编出来的动画。
- 负面 / 代价
  - **`main` 会变吵**：每次保存一个 commit。接受——`data/` 的每一次变化本来就该留痕，`--grep` 与路径过滤足够把噪音关掉。
  - **没有审阅环节**：worker 提交前的 schema 校验是唯一的入库闸门；schema 允许但业务上离谱的数字（比如 480 份写成 4800）挡不住，只能靠发布前的采购单预览让人自己看见。
  - **四步进度与 workflow 步骤名硬耦合**，改名会静默失效（已用集成测试断言兜底）。
  - **PAT 一年到期**，到期当天写入会全线 502；到期日必须进运维清单，且第二轮迁 GitHub App。
  - **令牌不过期**：安全性完全依赖链接不外传 + 泄露后及时轮换。单人场景可接受，人一多必须重议。
  - 多了一个部署目标（Cloudflare），前台与写入通道的可用性不再是同一个。
- 跟进事项（都不阻塞 #19 开工，除了第 ①）
  1. `build-deploy.yml` 加 `workflow_dispatch:` 触发器 —— **#19 的前置**，卡在 workflows 权限上（#57）。
  2. `ci.yml` 加「bot commit 不得越出 `data/`」守卫 job（同样卡 workflows 权限）。
  3. ajv standalone 预编译产物的生成步骤进构建（#19）。
  4. PAT 有效期与轮换步骤写进 `docs/field-test/` 的运维清单（#34）。
  5. 第二轮：PAT → GitHub App 安装令牌；令牌加有效期；buyer 角色的写权限。
