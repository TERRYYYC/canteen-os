---
feature_ids: []
topics: [team-meals, ci, workspace, worker, package-exports]
doc_kind: verification-evidence
created: 2026-09-11
---

# RC-CI：Worker 消费 core 的包边界证据

本交付只完成包依赖与运行入口；生产 team-meals CI 接线、A2/B 业务集成、Wrangler 和真实 L2 尚未完成。

基线 `1fdaf7bf78264199ce87c80d20a4d37976cf05f2`；分支 `codex/team-meals-ci`。工作区为真实仓库的兄弟 `canteen-os-team-ci`，原有主工作区未切换或改动。首个中间提交 `11e761fe062e30ecc1a5b0049d9e09ae7e936101` 只新增 Worker 的 `@canteenos/core: workspace:*` 和锁文件 importer，共 7 行；它单独不能解决 Node 运行入口。

输入已读取：工作区 AGENTS、execution-brief、operating-model；调度计划及设计工作区四份草稿（SHA256 全部匹配调度）；A0 合同按 `8448d49525da02c2e3fceb65167c8cedb3d6df11:docs/specs/team-meals-contract.md` 读取。未将设计草稿或未交付实现复制进本分支。只读开放 PR 检查只有 #91 设计路径，与包清单无重叠。

## 最终变化

- Worker 声明正式 workspace 依赖，锁文件仅增加 `link:../core`；无第三方包新增、无版本升级。
- core 根出口按 `types → src/index.ts`、`node → dist/index.js`、`default → src/index.ts` 排序。保留原 main/types；Node 消费编译 JS，TS 和前端继续消费源码。不改 core 构建配置或生成声明。
- Worker 的既有 build 先执行 `npm --prefix ../core run build`，然后生成 validators 并编译 Worker。运行 Worker test 会自动执行这一前置顺序。
- 根出口会封闭未声明的包子路径；本分支与当时 A/B 工作区源码、测试、脚本扫描没有 `@canteenos/core/` 消费者。内部相对路径不受影响。后续新增公共函数由 A 从根 index 导出。

## 作者验证

安装使用仓库固定 pnpm **9.15.0**，锁内 TypeScript **5.9.3**。Node **20.20.2 darwin-arm64** 来自官方 `node-v20.20.2-darwin-arm64.tar.gz`，SHA256 `466e05f3477c20dfb723054dfebffe55bc74660ee77f612166fca121dacb65b6` 与官方清单一致；只放临时目录，没有加入项目依赖。另跑过本机 Node 24.18.0 的基线验证，不将其类型剥离能力算成 Node20 证据。

以下命令在 CI 工作区执行；测试阶段 PATH 首位为上述 Node20 的 bin。

| 检查 | 实际结果 |
|---|---|
| `env -u NODE_ENV pnpm install --frozen-lockfile`（基线、依赖后、最终） | 全部 exit 0；首次 364 包缓存复用、下载 0；最终锁文件无需变化 |
| `pnpm install --lockfile-only --prefer-offline --filter @canteenos/worker` | pnpm 9.15.0 生成锁文件；只多 Worker importer 的 4 行 |
| Worker 目录 `node --input-type=module -e 'import {readiness} from "@canteenos/core"; console.log(typeof readiness)'` | 中间提交实际 Node20 红灯 `ERR_UNKNOWN_FILE_EXTENSION`；条件出口后输出 `function`，exit 0 |
| Worker NodeNext 实际编译产物的 bare import | TS5.9.3 诊断 0；发出的 JS 保留 `import { readiness } from "@canteenos/core"`；实际 Node20 运行该 JS 输出 `function`、exit 0 |
| core/dist 不存在时 `npm --prefix packages/web run typecheck`、`npm --prefix packages/web run build` | 均 exit 0；Vite 5.4.21 构建 51 modules，证明前端不新增 core 预构建要求 |
| Vite `resolveConfig(..., 'serve').createResolver()` | 从 Web plan.ts 解析根包到 `packages/core/src/index.ts`；不启动监听服务 |
| core/dist 不存在时 `npm --prefix packages/worker run typecheck`、`npm --prefix packages/worker test` | 均 exit 0；日志顺序 core build → gen:validators → Worker tsc → tests；76/76，L1 FakeRepo |
| `npm --prefix packages/core run typecheck`、`npm --prefix packages/core test` | 实际 Node20 exit 0；64/64（包含原数值/单位回归） |
| `npm --prefix packages/web test` | 实际 Node20 33/33；HTTP 测试使用假 fetch |
| 锁内 esbuild 0.21.5，`bundle:true,format:'esm',platform:'browser',write:false` | core/dist 缺失时，Worker 源入口 + core 根导入一起打包，metafile 全部 core 输入来自 src；实际 Node20 加载 bundle，readiness 与 Worker.fetch 均为函数；没有发请求 |
| `node scripts/build-data.mjs --check --compare-snapshots` | 旧目标 5 行一致、0 差异、0 issues；只证明现有兼容回归 |
| `node scripts/build-data.mjs` 后 Web build | exit 0；PWA precache 36 entries，无 data glob warning；生成物均不入提交 |
| `git diff --check` | exit 0 |

bare-import 编译 probe 通过 TypeScript compiler API 读取 Worker 的真实 tsconfig.build，在内存追加一个虚拟 src 文件（仅导入 readiness 并打印其类型）；其余 Worker 源也参与诊断。只把该虚拟文件编译出的 JS 临时写入忽略的 worker/dist，再由实际 Node20 执行并清除。没有修改任何 core/Worker/Web 源码或测试。

安装与 probe 的非产品失败也已区分：离线 lockfile-only 因已有 qrcode 缺本地 metadata 失败，读取 registry metadata 后最小生成成功，未更新版本；首次 Web build 尚无 data 产物产生 PWA glob warning，按现有 build-data 顺序重跑消除。最初 Vite API probe 误选其 CJS 入口，随后误把 import 条件对象当字符串；读取 Vite 的真实 exports 后使用 `import.default`，解析验证成功。这些没有引发业务补丁。早期“包源码必然触发 rootDir 错误”的推断已撤回：实际 TS 将 workspace 包视为外部库，诊断为零；真正红灯是 Node 的 TS 入口。

## Quality gate 与余下边界

Architecture cell：调度唯一 owner 表；Map delta：none，现有包边界接线。五轴：behavior=低（构建顺序），data=无写入，security=无鉴权改动，contract=中（包出口），irreversible=无。自检覆盖合法依赖、Node20 发出与执行、干净前端源码消费、现有测试与锁稳定。Dogfood 豁免：内部构建基础设施，无新增用户流程；替代证据为真实包编译/运行。无 UI/设计稿改动，无根目录媒体工件；本项目没有 Clowder 专用 gate 脚本，不捏造执行记录。独立审查与作者自测分开，最终固定提交的非作者结论随调度交接提供。

- **CI 分流等待 A2 固定代码。** Q v2 黄金固定于 `3d9f2aac7fb3f76225d315e34ec5aad7d00dcf96` 的 `test/fixtures/contracts/valid/golden/data/**`；本分支未复制、改写 fixture/expected。生产计划应检查显式 team-meals target；黄金单独以 legacy-numeric、固定 root 和时间比对 snapshots。只有 A/Q 实际交付对应入口后才写 workflow/root scripts；当前未提交计划参数。
- **部署步骤名有调用方。** Worker 的 `endpoints/publish.ts` 映射 build-deploy 的显式步骤名，publish 测试检查完整映射。后续改 run 时保持名称；若增加/改名步骤，先让 B 同步映射与测试。
- **真实 Worker 模式未确认。** Web `VITE_WORKER_URL` 缺省会选 mock，当前 workflow 无已确认地址；本轮 Web 构建不是生产模式证据。C/B/Q 需先提供隔离仓、受限凭据和明确地址；CI 仅消费 C 的正式模式检查入口，验证必需配置、真实 HTTP 请求与写入后重读，不提供猜测 URL/secret。
- **Wrangler 未安装。** esbuild 只证明一般 bundler 层；还需 B/Q 对固定 B/A2 代码做 Wrangler 构建、隔离环境真实保存/并发/回退与同版读取。当前无部署、无生产写入，未创建账号、令牌或 secret。
- **外发状态待调度核对。** 只有本地 commits 与 PR 正文草稿；没有 push、创建 PR、issue 或评论，未触发部署或合并。
