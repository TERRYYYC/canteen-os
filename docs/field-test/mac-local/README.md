---
feature_ids: [team-meals, knowledge-base]
topics: [deployment, mac-local, publishing, operations]
doc_kind: runbook
created: 2026-10-20
---

# 在 Mac 上录入、排菜、发布（#196）

部署方式见 [#157](https://github.com/TERRYYYC/canteen-os/issues/157)：录入、排菜、发布都在 Terry 的 Mac 上做；大家扫二维码看 GitHub Pages；远端服务器只存备份。

```
网页 127.0.0.1:5180 ──► Worker 127.0.0.1:8787 ──► 知识库 127.0.0.1:4391
                                   │
                                   └──► GitHub（写 main、触发 build-deploy.yml）──► Pages ──► 大家扫码看
```

- 三样都在 Mac 上，只听本机（127.0.0.1）。手机、别的电脑连不上，这是故意的。
- 发布写进 GitHub 仓库的 main，Pages 自动更新。
- Mac 关了，Pages 上已经发布的照常能看；只是不能录入、发布。
- 线上 Pages 还是只读的（没配 `VITE_WORKER_URL`），这次不改。

标「**Terry 做**」的步骤要用 Terry 本人的 GitHub 账号，Claude 不经手。其余每一步都在本机实际跑过，记录在[演练记录](rehearsal-2026-10-20.md)。

## 为什么用 Node 跑 Worker，不用 `wrangler dev`

- 用的是同一份 Worker：`packages/worker` 编译出的 `dist/index.js`。仓库的 Worker 测试本来就在 Node 里跑它。
- 不加依赖：wrangler 不在仓库依赖里，要另装它和 workerd。Node 24.18 本来就为知识库装了。
- 不受 Cloudflare 免费版的限制（每次 50 个子请求、10 毫秒 CPU）。固定一道菜要写很多文件，这也是 #157 不放 Cloudflare 的原因。
- 能自己管住门：只绑 127.0.0.1、只认本机网页这一个来源、启动前检查配置。
- 网页先编译好，再由一个只发编译产物的小服务发出去，不起 Vite 开发服务器：开发服务器能经 `/@fs/` 读整个仓库目录（#199 审查）。

核对过的几点：

| 要求 | 结果 |
|---|---|
| 连本机知识库 | Worker 只认 `http://127.0.0.1:4390–4392`；本机用 4391（正式）、4392（演练）。配置不许写 4390：那是连远端的隧道 |
| 调 GitHub API、触发发布 | Node 自带的 fetch 直接连 api.github.com；发布照旧 dispatch `build-deploy.yml` |
| CORS | 本机来源 `http://127.0.0.1:5180` 只写在本机配置里。`wrangler.toml` 的 `ALLOWED_ORIGIN` 不变，线上不放宽 |
| 只听本机 | 知识库、Worker、网页都绑 127.0.0.1。Worker 还拒绝别的 Host 和别的来源 |

## 第一次怎么配

### 1. 装依赖

Node 要 24.18 或更新（`node --version`）。在仓库根目录：

```bash
pnpm install --frozen-lockfile
```

```bash
npm --prefix services/knowledge-base ci
```

### 2. 建 GitHub token（Terry 做）

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token。
2. Resource owner 选本人。Repository access 选 **Only select repositories**，只勾 `TERRYYYC/canteen-os`。
3. Repository permissions 只给两项：**Contents = Read and write**、**Actions = Read and write**。
   - 不给 Workflows。Metadata 只读是 GitHub 自动带的。
4. 有效期最长一年。到期日写进 [ops-checklist §1](../week-43/ops-checklist.md#1-pat有效期与轮换) 的登记表，日历提前 30 天提醒。
5. 复制 token（只显示一次）。不贴进对话、issue、截图。

### 3. 生成三把钥匙

照 [ops-checklist §2](../week-43/ops-checklist.md#2-令牌泄露改一个-secret--重发链接) 的命令，每个角色做一遍（chef、buyer、admin）：

```bash
set +x
role_token="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
printf %s "$role_token" | openssl dgst -sha256 -r | cut -d' ' -f1
```

- 第二行打出 64 位十六进制，填进配置里的 `TOKEN_HASH_<角色>`。
- 钥匙本身（`$role_token`，43 个字符）拼成链接 `http://127.0.0.1:5180/#/admin/t/<钥匙>`，存进密码管理器。
- 存好以后 `unset role_token`。
- 日常用管理员钥匙。只有管理员钥匙能「回到这版」。
- 师傅不开后台（#157）。采购员在线保存是第二步，buyer 钥匙现在不用发，但三个哈希都要填。

### 4. 填配置

配置放在**仓库外面**，只有自己能读：

```bash
mkdir -p ~/.config/canteenos
```

```bash
cp packages/worker/.dev.vars.example ~/.config/canteenos/mac-local.vars
```

```bash
chmod 600 ~/.config/canteenos/mac-local.vars
```

打开 `~/.config/canteenos/mac-local.vars`，填：

- `GITHUB_PAT`：第 2 步的 token。
- `TOKEN_HASH_CHEF` / `TOKEN_HASH_BUYER` / `TOKEN_HASH_ADMIN`：第 3 步的哈希。
- 知识库，两种选一种（见下面「接上 #195 的知识库」）：
  - 由脚本来起：`KB_MODE=start`，`KB_DATA_DIR=` 那份库的数据目录。
  - 知识库已经在跑：`KB_MODE=existing`，不填 `KB_DATA_DIR`。
- 其余照模板，不用改。

- 不要放进仓库里（包括 `packages/worker/.dev.vars`）：仓库里的文件可能被别的程序原样发出去。
- 配置在仓库里，或者别人也能读，脚本会拒绝启动。
- 想放别处也行，启动时加 `--config <文件>`，同样要在仓库外、`chmod 600`。

### 5. 检查

```bash
pnpm mac:check
```

全是 ✓ 才能启动。打 ✗ 的照提示改。提示里不会出现 token 或哈希。

## 接上 #195 的知识库

#195 把本机那份装着 49 道的库升级、备份。它交付后，按它的**本机交接说明**选一种：

- **交接说明里知识库已经在 4391 上跑**（比如另开了窗口）：`KB_MODE=existing`。脚本只检查它活着，不起、不停它。
- **要由脚本来起**：先停掉原来那个，再填 `KB_MODE=start`、`KB_DATA_DIR=<交接说明里的数据目录>`。数据库不在 `KB_DATA_DIR/knowledge.sqlite` 时再填 `KB_DB_PATH`。
  - 目录里没有数据库文件，脚本会拒绝启动，免得在空目录里新建一个空库。

同一份数据只能有一个知识库在跑。

## 每天怎么用

### 启动

```bash
pnpm mac:start
```

- 先编译 Worker 和网页（网页放临时目录，停的时候删掉），再依次起知识库、Worker、网页，最后打出「都起好了」。编译要十几秒。
- 打开 `http://127.0.0.1:5180/#/admin/t/<管理员钥匙>`。打开后地址栏里的钥匙会被抹掉。
- 地址只用 `127.0.0.1`，不用 `localhost`：来源对不上，Worker 会拒绝。
- 拉了新代码再启动后，页面顶上如果出现「有新版本，点此刷新」，点一下。

### 停

- 在启动的那个窗口按 **Ctrl+C**，看到「都停了」。关掉这个终端窗口也会一起停。
- 任何一个自己停了，另外两个也会停，窗口里会写是哪个。
- `KB_MODE=existing` 时，知识库不归脚本管，不会被停。

## 存为菜谱 → 补用量 → 排菜 → 发布

1. **存为菜谱**：后台首页 → 菜谱知识库 → 收藏收件箱 → 点那道菜 → 「存为菜谱」→「打开菜谱」。
2. **补每份用量**：每一行填「每份多少」、单位、出处。
   - 出处选「实称」或「指定」时，还要写谁、哪天。发布出去只写「chef」，名字留在知识库。
   - 点「保存菜谱」，版本号加 1（v1 → v2）。
   - 「视频里没说清」的条目要先分好类（#184），没分类的固定时会被拒。
3. **排进菜单**：菜谱页点「排进菜单」，看到「已固定菜谱版本 vN」→「继续选择菜单日期与份数」。
   - 如果「选择菜品」里没有刚固定的那一版，**刷新一次页面**（演练里每次都遇到，见 #200）。
   - 选菜、日期、餐次 →「加一道菜」→ 填份数 →「保存计划」，看到「已保存」。
4. **发布**：「去发布」→ 看「还没发布的改动」→「发布」。四步都打勾，写「上线了」。

保存和发布是两步：只保存不发布，大家看不到。

## 怎么确认 Pages 已经更新

打开（`?t=` 后面随便一串数字，**一定要带**，见 [ops-checklist §3.1](../week-43/ops-checklist.md#31-前台打不开--白屏代码或部署的问题)）：

```
https://terryyyc.github.io/canteen-os/data/build.json?t=20261020
```

- `commit` 的前 7 位，和发布页「发布记录」最上面那条一样。
  - 配了 DeepL 机翻时，Actions 会再加一个译文提交，`commit` 是那个译文提交。
- `plans` 里有这周的计划（比如 `week-2026-43`）。
- 还是旧的：等一两分钟再看；再看 GitHub 的 Actions 页面那次 Build & Deploy 是不是绿的。
- 手机上：扫码打开备料、菜单、采购，看到这周的菜（二维码核对见 #197）。

## 出错怎么回退（ADR-0007 §7）

**数据发错了**（份数、菜排错）：

1. 用管理员钥匙打开发布页 → 「发布记录」→ 在对的那一版点「回到这版」→「退回」。
2. 这会在 main 上新加一个 `revert(data)` 提交，只动 `data/`，不改历史，**不会自动上线**。
3. 再点一次「发布」，再按上一节确认 Pages。

师傅钥匙不能回退（403）。

**后台用不了**：在 GitHub 网页上把 `data/` 里那几个文件改回去，正常提交（[ops-checklist §3.2](../week-43/ops-checklist.md#32-数据不对回退-data)）。

**页面坏了（代码问题）**：走 git revert，不经过 Worker（[ops-checklist §3.1](../week-43/ops-checklist.md#31-前台打不开--白屏代码或部署的问题)）。

**常见提示**（完整对照见 [ops-checklist §3.3](../week-43/ops-checklist.md#33-后台报错对照表http-状态照-adr-0007-5)）：

| 看到 | 怎么办 |
|---|---|
| 「这个网页来源不能用本机 Worker」 | 地址用了 localhost 或端口不对，改用 `http://127.0.0.1:5180` |
| 「链接失效了，找 Terry 要新的」 | 钥匙和配置里的哈希对不上：重新打开钥匙链接，或核对哈希 |
| 「GitHub 那边出问题了…」（502） | 先看 PAT 是不是到期、权限对不对（ops-checklist §1） |
| 「菜谱知识库尚未连接」/ 读不到知识库 | 知识库没在跑：看启动窗口，`pnpm mac:check` |
| 「发布功能暂时关着」 | 配置里 `PUBLISH_MODE=off`（测试分支时就是这样） |
| 网页一直转圈 | 看启动窗口，Worker 还在不在；不在就 Ctrl+C 后重新 `pnpm mac:start` |
| 「配置文件不能放在仓库里面」/「别人也能读」 | 照第 4 步挪到 `~/.config/canteenos/mac-local.vars`，`chmod 600` |

**钥匙泄露**：照 ops-checklist §2 生成新钥匙，改 `mac-local.vars` 里对应的哈希，Ctrl+C 后重新启动。旧链接马上失效。

**换 PAT**：照 ops-checklist §1 建新 token，改 `mac-local.vars` 里的 `GITHUB_PAT`，重新启动（不用碰 Cloudflare）。

**token 可能被看到了**（配置文件曾经放进仓库、被发到别处、截了图）：当作泄露，照上面换 PAT 和钥匙。

## 第一次真实发布（Terry 做）

开发期间没有往 main 写过任何数据。第一次往真仓库写，按这个顺序：

1. #195 交付后，照上面「接上 #195 的知识库」改好配置，`pnpm mac:check` 全 ✓。
2. **先只试写入（可选，推荐）**：
   - 在 GitHub 上从 main 建一个测试分支，比如 `mac-worker-trial`（Worker 不会自己建分支）。
   - 配置改成 `GITHUB_BRANCH=mac-worker-trial`、`PUBLISH_MODE=off`。脚本不允许测试分支配别的发布方式：在测试分支上发布，`build-deploy.yml` 会把它发到正式 Pages。
   - 启动，把一道已保存的菜「排进菜单」，再存一个计划。到 GitHub 上看这个分支多了 `data(knowledge)`、`data(plan)` 两个提交，尾部有 `X-CanteenOS-Role`。
   - Worker 的提交只动 `data/`、都带 `[skip ci]`；ci、build-deploy 只认 main 和 PR，所以测试分支上不会跑任何 workflow。不要从它开 PR。
   - 用完删掉：GitHub 仓库 → Branches → 删 `mac-worker-trial`，或者 `git push origin --delete mac-worker-trial`。
   - 这一步只证明 token 能写；发布要到下一步才第一次真跑。
3. **正式**：配置改回 `GITHUB_BRANCH=main`、`PUBLISH_MODE=dispatch`，重新启动。排真实的一周，发布，按「怎么确认 Pages 已经更新」核对。
4. 在 #196 记结果，只写：保存的提交、计划 id、Actions run、Pages 上 `build.json` 的 `commit`。不写 token、钥匙、本机路径。

## 演练（不碰真实仓库）

用假 GitHub 和临时空知识库（4392）再走一遍。`<演练目录>` 放在仓库外面。

```bash
mkdir -p <演练目录>/kb <演练目录>/tmp
```

```bash
TMPDIR=<演练目录>/tmp node scripts/mac-local/rehearsal-github.mjs --port 4480
```

另开一个窗口。复制模板成 `<演练目录>/rehearsal.vars`，`chmod 600`，钥匙另生成一套，再改这几项：

```
GITHUB_PAT=rehearsal
GITHUB_API_BASE=http://127.0.0.1:4480
PAGES_BASE_URL=http://127.0.0.1:4480/canteen/
KNOWLEDGE_BASE_URL=http://127.0.0.1:4392
KB_DATA_DIR=<演练目录>/kb
```

```bash
node scripts/mac-local/start.mjs --config <演练目录>/rehearsal.vars
```

```bash
node scripts/mac-local/rehearsal-seed.mjs
```

然后照上面的步骤走。看结果用 `http://127.0.0.1:4480/canteen/data/build.json?t=1`。假 GitHub 一停，演练的数据就没了。

## 文件

| 文件 | 做什么 |
|---|---|
| `packages/worker/.dev.vars.example` | 配置模板；真值放仓库外的 `~/.config/canteenos/mac-local.vars` |
| `scripts/mac-local/start.mjs` | 一键启动、检查、一起停（`pnpm mac:start` / `pnpm mac:check`） |
| `scripts/mac-local/worker-server.mjs` | 用 Node 跑 Worker，只听本机 |
| `scripts/mac-local/web-server.mjs` | 只发网页编译产物的小服务，只听本机 |
| `scripts/mac-local/config.mjs` | 读配置、逐项检查 |
| `scripts/mac-local/rehearsal-github.mjs` | 演练用的假 GitHub + 假 Pages |
| `scripts/mac-local/rehearsal-seed.mjs` | 往演练知识库（只认 4392）放一道造的菜 |
| `scripts/mac-local.test.mjs` | 这些脚本的测试 |
