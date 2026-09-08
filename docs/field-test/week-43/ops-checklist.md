# week-43 运维清单（出事怎么办）

> **依据 ADR-0007《写入通道》（PR #61，待合并）。** 本文引用的令牌模型、回退语义、PAT 权限都以那份 ADR 为准。ADR 状态是 **Proposed**，落地实现 `packages/worker` 在写本文件时**还没建**——所以凡是涉及 worker 的步骤，测试周开工前都要照实际实现核对一遍，别拿本文件当既成事实。
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
| 存放位置（Cloudflare Workers secret 名） | |
| 权限核对（应为 Contents RW + Actions RW，**无 Workflows**） | |

> secret 的具体名字以 `packages/worker` 的实现为准。ADR 只写死了三个令牌哈希 secret（`TOKEN_HASH_CHEF` / `TOKEN_HASH_BUYER` / `TOKEN_HASH_ADMIN`），**没给 PAT 的 secret 名**。#19 落地后回来把上表补全。

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
- 令牌走 URL 的 **fragment**（`…/admin#t=<token>`），不会进服务器日志、CDN 日志或 `Referer` 头。页面加载后读进 sessionStorage，再把地址栏里的令牌抹掉。
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
- 采购员的 `buyer` 令牌在 v0.3 **没有任何写权限**（他复制微信文本走的是前台，根本不经过 worker），所以 buyer 链接泄露影响最小——但照样换。

---

## 3. 线上挂了怎么回退

### 3.1 前台打不开 / 白屏（代码或部署的问题）

- 代码回退**不经过 worker**（ADR-0007 §7：「只回退 `data/`。代码回退走正常的 git 流程」）。
- 做法：GitHub 上找到那个 commit → Revert → 合进 `main` → CI 重新构建部署。
- **注意**：`.github/workflows/**` 只有 Owner 能在网页上改（GitHub App 没有 workflows 权限；先例见 #50、#57）。workflow 本身坏了，agent 修不了，必须 Terry 上手。
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
