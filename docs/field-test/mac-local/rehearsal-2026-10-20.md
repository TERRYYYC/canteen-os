---
feature_ids: [team-meals, knowledge-base]
topics: [deployment, mac-local, rehearsal]
doc_kind: test-record
created: 2026-10-20
---

# Mac 本机跑 Worker：两遍记录（#196）

只写结果，不写钥匙、token 和本机路径。操作说明见 [README](README.md)。

## 第一遍：模拟（2026-10-20，Claude 在 Terry 的 Mac 上跑）

**环境**

- macOS，Node 24.18.0，pnpm 9.15.0。源码是本 PR 的分支，从 main `97b18af` 切出。
- 假 GitHub + 假 Pages：`scripts/mac-local/rehearsal-github.mjs`，127.0.0.1:4480。起点是空的业务数据。Pages 用空的 `VITE_WORKER_URL` 构建，和线上一样只读。
- 知识库：临时空库，127.0.0.1:4392，数据目录在仓库外面。**没碰 4391 上的正式库**（那时它在跑，是 #195 起的）。
- 钥匙：演练专用的三把，只在本机，演练完作废。
- 菜：造的「演练菜：番茄炒蛋」，用 `rehearsal-seed.mjs` 放进收藏。原方 番茄两个、鸡蛋三个、盐少许；一条已分类的「没说清」：第 2 步火候。

**一键启动**

- `start.mjs --check`：7 项全 ✓。
- 启动：知识库 → Worker → 网页依次起来，三个都只监听 127.0.0.1。
- Worker 自检：本机来源的预检返回 `Access-Control-Allow-Origin: http://127.0.0.1:5180`。
- 用 curl 核对：
  - 别的来源、`localhost` 来源、伪造的 Host：都是 403。
  - 不带钥匙：401。
  - 采购钥匙读知识库菜谱：403（ADR-0010）。
  - 师傅钥匙读 `/knowledge/health`：200，Worker 用真的 fetch 连到了 4392。
  - 读 `/catalog`：200，Worker 用真的 fetch 连到了假 GitHub。

**存为菜谱 → 补用量 → 排菜 → 发布**（走了两遍：第一遍管理员钥匙，第二遍师傅钥匙。下面是第二遍）

| 步 | 结果 |
|---|---|
| 收件箱「存为菜谱」 | 知识库菜谱 v1 |
| 每份用量：番茄 150 g、鸡蛋 1 pcs、盐 2 g，出处「指定」 | 保存成 v2 |
| 「排进菜单」 | 「已固定菜谱版本 v2」，假仓库提交 `5bac508`，`X-CanteenOS-Role: chef` |
| 排 2026-10-20 午餐，40 份，「保存计划」 | 计划 `week-2026-43`，提交 `b61aab9`，文件里 `plannedServings: 40` |
| 「发布」 | dispatch `build-deploy.yml`，run 8100，四步都打勾，「上线了」 |
| `data/build.json?t=…` | `commit` = `b61aab9`，`plans` = `["week-2026-43"]` |

**Pages 上看到的**（只读构建）

- 备料：番茄 **6 千克**、鸡蛋 **40 个**、盐 **80 克**。
  - 手算：150 g × 40 = 6000 g = 6 千克；1 个 × 40 = 40 个；2 g × 40 = 80 克。
- 菜单：10 月 20 日午餐有这道菜。
- 采购：「未连接后台 · 只读清单」，列出番茄、鸡蛋、盐 3 种，数量待定（还没有采购规格，和 #170 第一级一致）。
- 菜品：有这道菜；详情里写「火候没说 · 问师傅」。
- 发布的资料里：「没说清」只有 `{kind: heat, stepIndex: 1}`，原话没发出去；出处的「谁」是 `chef`，名字没发出去。

**回退（ADR-0007 §7）**

| 步 | 结果 |
|---|---|
| 份数改 50，保存、发布 | 提交 `896f3d9`，run 8101，Pages 换成 `896f3d9` |
| 管理员钥匙：发布记录 → `b61aab9`「回到这版」→「退回」 | 新提交 `fbe7e71`「revert(data): 恢复到 b61aab9」，`X-CanteenOS-Role: admin`；提示「还没上线」 |
| 再「发布」 | run 8102，Pages 换成 `fbe7e71`，计划里又是 40 份 |
| 师傅钥匙调回退 | 403 |

**停**

- Ctrl+C（SIGINT）：「都停了」，退出码 0，三个端口都空出来。
- 只杀掉 Worker：脚本写「Worker 自己停了」，把另外两个也停了，退出码 1。
- 关终端窗口（给整个进程组发 SIGHUP，用 `pnpm mac:start` 起的）：都停了，没有残留进程。
- `KB_MODE=existing`：脚本只检查知识库，Ctrl+C 之后知识库还在跑。
- Mac 这边全停以后，假 Pages 照常能打开，`build.json` 还是最后发布的那版。

**其他核对**

- Node 直接连 api.github.com：不带 token 读公开仓库 200；带一个无效 token 401。Worker 带无效 token 读 `/catalog` 返回 502「GitHub 那边出问题了」。
- `PUBLISH_MODE=off` 时点发布：503「发布功能暂时关着」。

**演练里发现的（不在本 issue 改）**

- 「排进菜单」→「继续选择菜单日期与份数」之后，排菜页「选择菜品」里没有刚固定的那一版，刷新一次才有。两遍都遇到。说明里已写「刷新一次」，问题另报。
- 发布页把「固定菜谱」那条提交显示成「手工改动」。
- 假仓库的提交时间是模型固定的时钟（显示 9 月 12 日），只是演练的样子。

## 第二遍：真实（Terry 做，还没做）

要用 Terry 的 GitHub token，由 Terry 本人操作，步骤见 [README「第一次真实发布」](README.md#第一次真实发布terry-做)：

1. #195 交付后接上正式知识库，`pnpm mac:check` 全 ✓。
2. 可选：测试分支 + `PUBLISH_MODE=off`，只试写入，用完删分支。
3. 正式：main + `dispatch`，排真实的一周，发布。
4. 在 #196 记：保存的提交、计划 id、Actions run、Pages 上 `build.json` 的 `commit`。

开发期间没有往 main 或任何真实分支写过数据。
