---
feature_ids: [team-meals]
topics: [deployment, configuration, operations]
doc_kind: operations-checklist
created: 2026-09-13
---

# week-43 运维清单（出事怎么办）

> 写入通道已在 `packages/worker` 实现；这不等于真实服务已部署。现行配置、角色权限与 Team API 行为以 `packages/worker/wrangler.toml`、`packages/worker/src/auth.ts`、[`team-meals-contract.md`](../../specs/team-meals-contract.md) 为准。下文原运维流程保留，发布前先完成 §0.1；不能把只读 Pages 构建当作完整可写版本上线。
>
> 一句话原则：**测试周不改代码，只让人能干完今天的活。**（执行简报 §3「真实厨房周」、§7）

---

## 0. 三十秒分诊

| 症状 | 是哪一类 | 翻到 |
|---|---|---|
| 页面打不开 / 白屏 / 扫码没反应 | 前台或部署 | §3.1 |
| 页面能开，但数据是旧的 / 数字不对 | 数据 | §3.2 |
| 后台保存或发布报错（400 / 401 / 403 / 409 / 413 / 429 / 502） | worker、令牌或 PAT | §3.3 |
| 链接发错了地方 / 进了群 / 被截图 | 令牌泄露 | §2 |
| PAT 快到期 / 已到期 | PAT | §1 |

先问一句：**帮厨今天还能拿到单吗？** 能 → 不是 P0，记进 [`log.md`](log.md)，测试周内不动代码。

### 0.1 发布配置与完整可写版本的前置检查

**配置入口只有一个：** 仓库 Settings → Secrets and variables → Actions → **Variables** 中的 `VITE_WORKER_URL`。`build-deploy.yml` 在 build job 注入 `vars.VITE_WORKER_URL`，校验和 Web 编译使用同一个值。它是公开 API 根地址，会进入浏览器产物，不能填 PAT/角色令牌，不能用 Secrets 代替。`github-pages` 环境属于后续 deploy job；只在那里设置变量不会为前面的 build job 提供此值。变量是构建期输入，修改后须重新构建才生效。参见 [GitHub 变量说明](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables)及 [Vite 构建期环境变量](https://vite.dev/guide/env-and-mode)。

| `VITE_WORKER_URL` | 构建行为与能力边界 |
|---|---|
| 未设置或空串 | 保留合法只读构建，Actions 给出 warning 和摘要。可查看已发布的菜单、备料及其可用资料；Team 编辑、保存采购单、发布不可用，不自动创建可写 mock |
| 已确认的公网 HTTPS Worker 根地址 | 可带一个尾斜杠；不得含凭据、接口路径、查询或片段。先通过格式检查再安装/翻译/构建；合格格式不证明连通、权限或完整可写流程 |
| 格式错误，或本地、IP、示例、GitHub Pages 地址 | 发布流程在安装及翻译提交之前失败，不输出可能含凭据的原值；不能把前端站点地址当 Worker 地址 |

本地 Vite 开发/构建仍可在 `packages/web/.env.local` 使用已经确认的 HTTP localhost 测试服务，或留空做只读构建；生产工作流的地址限制不加入产品代码。只读离线能力只覆盖已缓存且仍可用的资料，未读取/已淘汰资源不能承诺离线可用。

**完整可写发布前，按顺序完成以下步骤并记录结果（本轮未执行外部动作）：**

1. 确定同一套已批准的前端和 Worker 源码，以及专用的隔离验收环境。先核对目标仓库、分支、数据 seed 和专用凭据；`wrangler.toml` 当前默认指向生产 main，不能直接拿它做隔离验收。这里不另建后端方案，沿用既有 Cloudflare Worker → GitHub 架构。
2. 确认真实 Worker 已部署、可达，记录公开根地址与部署版本。部署前依现有构建链生成 core/Worker/validators；核对 `GITHUB_REPO`、`GITHUB_BRANCH`、`PUBLISH_WORKFLOW=build-deploy.yml`、`PUBLISH_MODE=dispatch`。生产 `ALLOWED_ORIGIN` 为 `https://terryyyc.github.io`（无路径），`PAGES_BASE_URL` 为 `https://terryyyc.github.io/canteen-os/`；隔离环境必须填自己的成对地址，不能混用生产。
3. 在 Worker 的秘密配置中核对 `GITHUB_PAT`、`TOKEN_HASH_CHEF`、`TOKEN_HASH_BUYER`、`TOKEN_HASH_ADMIN` 和有效期/轮换安排（§1–2）。PAT 只授权目标仓的 Contents RW + Actions RW，无 Workflows；明文角色令牌不进入仓库、构建变量或截图。DeepL 为可选，不是完整餐食流程的前置服务。
4. 由发布负责人把已核实 Worker 地址设置为上述**仓库变量**，再授权运行发布。确认 Actions 摘要的配置状态，确认真实浏览器请求送往该 Worker、CORS 放行正确 Pages origin；错误源被拒绝，无令牌 401，越权 403。仅 URL 格式通过不能勾选此项。
5. 先在隔离环境走完真实链路：排菜/导入并保存 → 正式发布并核对 `data/build.json.commit` 与同版计划/图片 → 菜单/备料可读 → 人工确认采购并保存/重开同一清单；覆盖冲突或丢 ACK 后的核实，确认没有重复写入。buyer 可保存采购单但不能改计划/菜谱，admin 才可回退；回退应新增 data commit，确认后再次发布。记录 commit/run 与成功结果，不记录凭据。
6. 正式切换后按授权做最小验收，确认发布进度对应真实终态，三种 QR 指向正式站点并能打开对应能力；菜单/备料同版资料可读，PWA 联网更新与离线已读资产通过。`packages/web` 已声明 `prebuild` 生成图标/QR，仍需检查**实际发布命令**确实调用并包含产物；本轮由 Q 检查，未拿到实际缺失证据前不改接线。以上缺项未关闭时，不能宣布完整可写上线。

**当前缺失项（2026-09-13，调度只读盘点；本任务未重新访问远端）：** Pages 地址已知为上述正式站点，远端 main `1503074` 于 9/11 部署成功；仓库变量/secret 名单均为空，仅有 `github-pages` 环境。尚无已核实的真实 Worker、隔离远端环境或配套凭据证明。因此当前不能交付一个已验收的完整可写线上版本。主调度负责真实环境盘点和最后外部动作；配置补丁、既有本地产品验收均不替代这些事实。

**本轮本地证据：** 基于已审产品 `4b1e5e1` 与文档头 `7bbfe22`，实际 Node 20.20.2；旧流程的配置回归先出现 7 失败/3 通过，修复后配置 11 项与既有接线 21 项合计 **32/32**，发布映射 **16/16**，零跳过。core/Worker 前置编译通过；空值、公开 HTTPS 测试地址、本地 HTTP 地址三种实际 Vite 临时构建通过，后两者在产物中含各自配置值。这里只执行提取的安全工作流片段和编译，没有联系测试地址；临时 Vite 编译不证明 package prebuild/QR 被调用。证据保存在本机 `/private/tmp/canteen-ci-deploy-config-*.log` 与 `/private/tmp/canteen-ci-config-build-0q0vv264/validation.json`。未执行翻译提交、推送、上传或部署，也未重复全量产品验收；独立审查结论由原任务回传，沿用此入口，不另建交付包。

---

## 1. PAT：有效期与轮换

依据 ADR-0007 §8 第 2 层与「跟进事项 4」（原文要求把 PAT 有效期与轮换步骤写进 `docs/field-test/` 的运维清单——就是本节）。

**照 ADR 的事实**

- worker 用**细粒度 PAT**，只对本仓库，权限只有 `Contents: Read and write` + `Actions: Read and write`；**没有 `Workflows` 权限**——即便 worker 被完全攻破，也改不了 `.github/workflows/**`。
- PAT 存 Cloudflare Workers secret；**最长一年有效期**。
- 到期后果，ADR 在「负面 / 代价」里明写：**到期当天写入会全线 502**。
- 更好的做法（GitHub App 安装令牌，自动过期）留给第二轮；v0.3 先用 PAT 换落地速度。

**登记表（测试周开工前填满，别留空）**

| 项 | 值 |
|---|---|
| 签发日 | |
| 到期日 | |
| 日历提醒（到期前 30 天） | |
| 存放位置（Cloudflare Workers secret 名） | `GITHUB_PAT`；实例与配置状态待确认 |
| 权限核对（应为 Contents RW + Actions RW，**无 Workflows**） | |

> secret 名已在 `packages/worker/src/types.ts` 与 `wrangler.toml` 固定；表中的实例、日期和权限仍须由负责人按真实部署补齐，不能从模板推断为已配置。

**轮换步骤（到期前，或怀疑泄露时；约 10 分钟）**

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token。
2. 权限逐项对齐：Resource owner 选本人；仓库只勾 `TERRYYYC/canteen-os`；Repository permissions 只勾 **Contents = Read and write**、**Actions = Read and write**；**不要勾 Workflows**；有效期 ≤ 1 年。
3. 复制新 token（**只显示这一次**）。
4. Cloudflare → Workers → 对应 Worker → Settings → Variables and Secrets → 改那个 secret 的值 → 保存 → 重新部署。
5. 在 `/admin` 存一次无害改动（比如某天份数 +1 再改回来），确认返回 ok，不是 502。
6. 回 GitHub 删掉旧 token。
7. 把新的签发日 / 到期日填回上表，日历提醒往后挪一年。

**停机窗口**：第 4 步到第 5 步之间写入会失败。**别在师傅排菜单的时候做**，选晚上。

---

## 2. 令牌泄露：改一个 secret + 重发链接

依据 ADR-0007 §4。

**照 ADR 的事实**

- 三个角色令牌 `chef` / `buyer` / `admin`，各是 32 字节随机串（base64url，43 字符），**与人无关**——不存姓名、不存邮箱、不存设备标识。
- 令牌走 URL 的 **fragment**（`…/#/admin/t/<token>`；参见 `packages/web/src/admin/token.ts`），不会随 HTTP 请求发给静态站点。页面加载后读进 sessionStorage，再把地址栏里的令牌抹掉。
- worker **只存 SHA-256 哈希**（`TOKEN_HASH_*`），常数时间比较。明文只存在于发给人的那条链接里。
- **令牌不过期**（阶段 1 有意的取舍）。安全性完全靠「链接不外传 + 泄露后马上轮换」。

**什么算泄露**（宁可误判，别犹豫）：链接进了群、被转发、被截图发出去、写进了文档 / issue / PR、手机丢了、人不干了。

**处置（ADR §4：轮换 = 改一个 secret + 重发链接，几十秒能完成）**

1. 生成新的 43 字符 base64url 随机串。
2. 算它的 SHA-256（十六进制），改对应那个 `TOKEN_HASH_*` secret。
3. 重新部署 worker。**旧链接立刻失效**（哈希对不上 → 401）。
4. 当面 / 私聊把新链接发给本人。不进群、不进文档。
5. 在 [`log.md`](log.md) 记一行：哪天、哪个角色、为什么轮换。

> 生成与哈希的命令以 `packages/worker` 的 README / #19 为准。参考写法（**未在本轮验证**，第一次用先对着输出核一眼长度）：
> `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='` → 应得 43 个字符；
> `printf %s "<token>" | openssl dgst -sha256` → 应得 64 位十六进制。

**预防**

- 链接一律**当面扫码或私聊**发；不进群、不进共享文档、不进 issue / PR、不进截图。
- 一人一条，别几个人共用同一条。
- 现行 Team 权限允许 `buyer` 保存采购清单（`POST /shopping-list/:id`），但不允许修改计划/菜谱或发布/回退；泄露会影响采购记录，必须轮换。原 v0.3「buyer 无写权限」说明已不适用。

---

## 3. 线上挂了怎么回退

### 3.1 前台打不开 / 白屏（代码或部署的问题）

- 代码回退**不经过 worker**（ADR-0007 §7：「只回退 `data/`。代码回退走正常的 git 流程」）。
- 做法：GitHub 上找到那个 commit → Revert → 合进 `main` → CI 重新构建部署。
- **注意**：Worker 的 PAT 无 Workflows 权限，不能用它修部署流程。流程可先在本地修复和审查，再由有相应仓库权限的发布负责人授权发布；本清单不授予外部修改权限。
- 判断「到底换版了没有」：打开 `https://terryyyc.github.io/canteen-os/data/build.json`，看 `commit` 和 `builtAt` 变了没有。别只看页面刷没刷新。

### 3.2 数据不对（回退 `data/`）

依据 ADR-0007 §7：`POST /rollback/:sha`，**只有 `admin` 令牌能调**，把 `data/` 恢复到某次 commit。

关键三点：

1. **是新 commit，不是 force push**——历史里能看到「改错了 → 又退回来」的完整过程。
2. **只动 `data/`**，其它路径原样保留。
3. **回退不自动发布**——回退完「N 项未发布」变成非零，确认后再点一次发布。误操作有一次挽回机会。

找目标 sha：GitHub 上看 `data/` 目录的历史，挑最后一个「对的」commit。

后台调不通时的兜底：Terry 直接在仓库里把 `data/` 那几个文件改回去，正常提交，CI 重新构建部署。

### 3.3 后台报错对照表（HTTP 状态照 ADR-0007 §5）

| 状态 | 意思 | 当场怎么办 |
|---|---|---|
| 400 | schema 校验没过 | 页面会把出错字段标黄，照提示改。**没有产生任何 commit**，不用回退 |
| 401 | 令牌无效 | 链接不对，或刚轮换过 → 用最新那条链接 |
| 403 | 角色越权 | 拿 buyer 链接干了 chef 的事 → 换链接 |
| 409 | 并发冲突 | 有人刚改过 → 刷新后重试 |
| 413 | 体积超限 | 照片超 200 KB → 从 `/admin` 页面正常上传（浏览器会先压到 ≤ 200 KB、最长边 ≤ 1280），别绕过页面直接 POST |
| 429 | 超限流 | 写入 60 次/小时、发布 10 次/小时 → 等一会儿 |
| 502 | GitHub API 异常 | **先看 PAT 是不是到期了**（§1）；不是的话看 GitHub 状态页 |

> 发布进度卡住不动、四步里某一步永远不亮：ADR-0007 §6 说明四步是按 `build-deploy.yml` 的**步骤名逐字匹配**映射的，改过步骤名会静默打断显示。这属于「显示坏了」，不是「发布坏了」——先去 Actions 页面看那次 run 的真实状态。

---

## 4. 兜底：让今天的活干得完

线上修不好也不能让厨房停工。三层兜底，从上往下用：

1. **离线副本（PWA）。** 帮厨手机上加到主屏幕的那份，断网能看**上一次打开的**内容；抽屉底部会显示「已存离线副本」和数据更新时间。**所以每天早上必须让他联网开一次**（[`README.md`](README.md) §4 第 4 步）——否则救回来的是前天的单。
2. **打印今天那页。** 浏览器打开 `#/prep`，切到今天，直接打印，放案板边。纸不会白屏。
3. **上一版材料。** [`../week-41/`](../week-41/README.md) 里的 `prep-list-uk.md` / `purchase-order-*.txt` 是纯文本单，格式与引擎输出一致——极端情况下照那个格式手写一张也能开工。

---

## 5. 每天 3 分钟自检（师傅，早上）

1. 打开 `https://terryyyc.github.io/canteen-os/data/build.json` → `builtAt` 是不是最后一次发布的时间？`plans` 里有本周的计划吗？
2. `#/prep` 切到今天 → 菜、份数、配料对吗？
3. `#/purchase` → 有「⚠ N 条问题」或「待补全」吗？
4. 让帮厨手机联网开一次 → 刷新离线副本。
5. 任何一条不对 → 先判是不是 P0（[`log.md`](log.md)），再回 §0 分诊表。

---

## 6. 联系方式（开工前填）

| 角色 | 姓名 | 联系方式 |
|---|---|---|
| Owner / 唯一能改 workflow 的人 | Terry | |
| 师傅 | | |
| 帮厨 | | |
| 采购员 | | |
| 供应商 1 | | |
| 供应商 2 | | |
