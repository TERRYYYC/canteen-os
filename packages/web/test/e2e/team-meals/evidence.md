---
feature_ids: []
topics: [team-meals, client-worker, integration, L1, acceptance]
doc_kind: verification-evidence
created: 2026-09-11
---

# L1 客户端-接口组合验证

RC-Q 本轮只交付客户端与接口组合测试。`e2e/team-meals` 是预留目录名；本证据不表示真实页面、C2、UI E2E、Cloudflare 运行态、真实 GitHub 历史或 L2 已通过，也不关闭完整 T01–T09。

## 固定来源与改动归属

- 工作分支：`codex/team-meals-api-integration`。
- Q 起点：`afc328992a151a2ecc390a083b195dc060f86736`。
- C1：实现 `1575f2b4768938c0efcc8a9c5db7c9c25096c738`，合入已审归档头 `5b8bdd50d1775cce441d0457f6be7f589a7bb673`。
- B2：实现 `32e674cd9bdc9f565cd1cfff263aa1f8c4367cde`，合入已审归档头 `a75250c36dfd2b280af2bb2d949c1e632af967e4`。
- 两次无冲突合并后的基点：`8e87f915b6e5a2186cca8a8fdb51798cff6c6332`。保留 C/B/CI 上游提交作者；包清单、exports、锁文件等来自上游依赖，RC-Q 未改这些文件。
- 合同：`docs/specs/team-meals-contract.md`，最后内容变更 `ad1f427ae8d7ffc6841bfd2e51c279d2c90381d2`。
- RC-Q 自有增量仅本目录的 `api-contract.test.mjs`、`helpers.mjs`、本证据。

## 执行边界

真实 `createTeamMealsApi`、`HttpTransport`、`ApiError` 和 `createEditSession` 在同一个 esbuild 模块中运行，保留错误类型身份。请求桥只把真实 Request 交给真实 B2 `worker.fetch`，返回其原始 Response；不模拟 Worker 错误体、成功体或业务算法。清单创建、人工判断和复核调用正式 core 导出。

唯一外部服务替身是已有 `packages/worker/test/helpers.mjs` 的 FakeRepo / injected fetch。其 blob SHA 按 Git blob 算法生成，提交和树是内存模型；模型 revision 只证明本次 L1 链路一致。公开测试 token 和假 PAT 来自既有 helper。全局原生 fetch 被阻断并断言调用数为 0；Worker 的注入 fetch 限定到 FakeRepo 所处理的 GitHub API origin。

测试 API 显式标为 `mode: mock`，实际执行真实客户端类。没有浏览器、监听端口、网络连接、真实凭据、发布或部署。响应丢失发生在真实 handler 返回成功之后，模拟传输抛错，未改写任何 Worker Response。追踪记录不包含 Authorization/token。

每例在独立临时目录物化 Q `local-image` 样本，覆盖两份冻结 A1 v3 计划/菜谱，并使用正式 `validateData` 校验后载入 FakeRepo。后续图像字节使用 Worker 既有 `PNG_B`。测试只改内存图及自己的临时目录，未修改冻结样本。

## 五组断言及实际输出

| 场景 | 核心断言 | 客户端请求 / POST / 模型 GitHub 写调用 |
|---|---|---|
| 无份数计划 | 新建 `If-None-Match:*`、整份 JSON；缺份数字段保持缺省，已有 2 份保留；再更新使用首次 blob 锁；两次固定回读 | 5 / 2 / 8 |
| 复核与人工判断 | 四个材料全 check 新建；tomato buy+bought；真实保存菜谱 300→301；合并 rebase+available 被真实 409 拒绝，structured reviewRequired 为 tomato、原草稿/锁保留、服务端零写；明确替换后先保存 check+previous，再以新锁单独保存 available 并清除 previous | 15 / 6 / 20 |
| 两客户端冲突 | 并发创建一个成功一个 conflict；失败方草稿保留，盲重试 blocked；读同一锁后两种人工判断，旧锁失败且保留草稿，服务端不追加写入 | 9 / 4 / 8 |
| 固定资料与图片 | 两个模型 revision 的 source/catalog 内容与 asset 字节、类型、版本头一致；不可用 revision、非法 pointer、历史缺图但当前有图、外链、坏 JSON 均为真实结构错误；仅真实 not_found 映射 null | 15 / 0 / 0 |
| 成功后响应丢失 | 先缓存不存在，再真实提交并丢失成功响应；pending 期间再保存 blocked；后续编辑保留；恢复强制 current→固定 commit 双读，实际新增请求恰为两个 GET，POST 总数仍 1，模型写调用不增加，不捏造 warnings/unchanged | 5 / 1 / 4 |

模型写调用包含 blob/tree/commit/ref 操作，不能当作成功保存次数。第四例的模型版本推进由测试布置直接完成，不是 Worker 写入。全部五组首次运行即通过，没有构造业务 RED，也没有发现或修复生产业务缺陷。

## 可复现命令与验证结果

运行位置为仓库根（本次在隔离 acceptance worktree），Node `v24.18.0`，npm `11.16.0`。先安装仓库锁定依赖，再构建真实 Worker；其 build 自动先构建 core：

```sh
pnpm install --frozen-lockfile
npm --prefix packages/worker run build
node --test packages/web/test/e2e/team-meals/api-contract.test.mjs
```

本次安装器尝试 `pnpm install --offline --frozen-lockfile --ignore-scripts` 时无法访问 pnpm 版本签名校验源并退出，未完成重新安装。已存在锁定版本的本地依赖；仅补上新合入的 Worker workspace core 链接后构建成功。此环境说明不是 clean-install 通过声明。

| 本次实际执行 | 结果 |
|---|---|
| `npm --prefix packages/worker run build` | core build + validators + Worker build 通过 |
| `node --test packages/web/test/e2e/team-meals/api-contract.test.mjs` | 5/5，无跳过 |
| `node --test packages/web/test/*.test.mjs packages/web/test/e2e/team-meals/api-contract.test.mjs` | 87/87 = 原 Web 82 + 新 5 |
| `node --test packages/worker/test/*.test.mjs` | 259/259；消费既有测试，未复制它们 |
| `node --test packages/core/test/*.test.mjs` | 87/87 |
| `node --test scripts/validate-contract-fixtures.test.mjs` | 64/64 |
| `npm --prefix packages/web run typecheck` | 通过 |
| `npm --prefix packages/worker run check:validators` | 通过，schema digest `61cbb92f8d23` |
| `git diff --check` | 通过 |

Q 回归入口首次误写为不存在的 `test/contracts/*.test.mjs`，shell 在执行测试前拒绝；查明正式入口后运行上表命令，64 项通过。该调用错误不是业务失败或 RED 证据。

**CI owner 接入要求：** Web 现有 `node --test test/*.test.mjs` 不递归发现此目录。需在已安装 workspace 依赖并完成 Worker（含 core）build 后，从仓库根显式执行 `node --test packages/web/test/e2e/team-meals/api-contract.test.mjs`。本轮不修改 package scripts 或 CI，不把本地执行计作 CI 已接入。

## 范围自检与交接

五轴风险：生产行为无变更；冻结数据不写；凭据仅公开测试值且网络封闭；主要风险是跨包契约断言是否充分；不可逆操作无。架构归属仍为 C1 客户端/editor、B2 Worker、A2 core，新增测试连接器归 Q，生产架构图无变化。Dogfood 豁免理由：纯测试交付，无页面行为或视觉变更；本轮真实执行上述 L1 路径。

原主仓的 3 个修改项和 2 个未跟踪项保持原状。旧 Q v2、A1、A2 三分支分别仍为 `2c9c7e1`、`4878a867`、`afc3289`；六份冻结发布/审阅 payload 的 SHA256 与原记录完全一致。

本轮验收目标是五组客户端与接口组合协议，均已覆盖。完整产品/页面、真实历史与 L2 由调度后续授权阶段负责；不是本轮通过项。独立审阅必须绑定本轮固定提交，结论由非作者返还本地任务后交给父调度；本文件不自行签发批准。
