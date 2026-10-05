---
feature_ids: [101, 110, 111, 113, 122, 123, 124, 125, 126, 127, 128]
topics: [release, recipe-adoption, verification, private-companion]
doc_kind: release-guide
created: 2026-10-05
---

# alpha.4 发行与复跑

本版为 CanteenOS `0.3.0-alpha.4` 与独立私有 KB `0.1.2`（schema 6）。CanteenOS 的发布源码不包含私有 SQLite 内容。两者的 full source revision、包 SHA256、运行产物清单、独立审查和实际合入/平台结果在 [#128](https://github.com/TERRYYYC/canteen-os/issues/128) 与关联发布 PR 回执中固定。参考 [当前合同](../current-contract.md)、[CHANGELOG](../../CHANGELOG.md) 和 [运维清单](../field-test/week-43/ops-checklist.md)。

## 使用顺序

1. 师傅后台 → 复核菜谱：完整读取原方、来源和待核验项，确认来源后进入普通正式菜谱。
2. 正式菜谱：维护全部食材/调料/步骤，显式绑定标准食材及版本。原方与厨房切配分开；未知量、份数、单位、净料率或时间留空待补。
3. 厨房核定当前版本，然后明确采用。审批与全部固定依赖绑定；编辑出新版本不修改已固定旧版。
4. 选择或创建实际计划，把采用的菜排到日期/餐次，保存并发布。菜单和备料页读取同版发布资料。
5. 采购页从所选计划生成清单后明确保存。每项人工判断 check/buy/available/bought，保存并重开继续操作。新标准规格不会静默升级旧清单；同名不同 ID、冲突版本和未知量仍可追溯。

候选来源确认与厨房核定是两个动作；工程测试代理只能在隔离副本模拟，不能批准原库真实菜谱。来源图片只供师傅复核，公开资料仍遵守固定版本与使用权校验；原片打开完整来源链接，未承诺应用内视频播放。

回滚被明确拒绝后可继续合法操作；结果不明仍保持保护，先核实再操作（[#129](https://github.com/TERRYYYC/canteen-os/issues/129)）。

## 源码检查

Node 20+ 运行 CanteenOS；KB 必须 Node 24.18+ / SQLite 3.51.3+。CanteenOS 使用 pnpm 9.15.0 与受控 pnpm-lock，KB 使用自己的 package-lock，分别安装到独立物理目录，不共享或链接 node_modules。

```sh
pnpm install --frozen-lockfile
node scripts/prepare-team-image-tools.mjs
node scripts/validate-schemas.mjs
python3 scripts/local-validate.py
node scripts/check-types-vs-schema.mjs
pnpm -C packages/core test
pnpm -C packages/worker test
pnpm -C packages/web test
node --test scripts/*.test.mjs
pnpm -C packages/web typecheck
pnpm -C packages/web build
```

测试 SQLite 集成时为 web 测试显式提供 `KB_SOURCE_ROOT`，指向独立安装并校验过的私有 KB 源码，不将缺少 KB 的公开 CI 当作同一次真实 SQLite 浏览器验收。旧数值契约用固定 golden 回归：

```sh
node scripts/build-data.mjs --target legacy-numeric --check --compare-snapshots \
  --root test/fixtures/contracts/valid/golden --at 2026-10-03T00:00:00.000Z
```

实际页面使用 [本机验收工具](../../packages/web/test/e2e/team-meals/acceptance-harness.md)：固定完整 C/KB revision，从官方备份恢复到 NEW 私有目录，通过 API 启动迁移到 schema 6；核对 listener PID、实际打开的 SQLite 文件、releaseId 与产物清单。空业务和保留旧演示两轮各使用自己的数据库副本。工具运行实际 main/Worker/正式生产者/Vite/SW，但 GitHub/Actions/Pages 托管是明确标示的本机持久 Git 模型。

完整验收需两条真实完整原片菜谱和一条手工菜谱的保存/重开/核定/采用/计划/菜单/备料/采购页面证据，并覆盖冲突、丢 ACK、角色权限、资料版、离线与回退。现有缓存按原媒体 SHA 复用，不重复下载或 AI 解析。保留失败尝试、原库、备份和业务副本，不通过删除重置掩盖失败。

## 私有知识库伴随包

KB 包仅含受控 apps/contracts/db/infra/scripts、package.json/package-lock.json、公开 releaseId 的 release.env、release.json 及本版本构建的 apps/web/dist。封包时逐一枚举，禁止额外文件、符号链接和路径穿越；不包含 .git、历史、node_modules、数据库、uploads、原 CSV、媒体、Cookie 或密钥。不要将整个工作目录打包。

接收者在 NEW 干净目录先核对外部包 SHA256、full source pair 和严格文件清单，再独立 npm ci/typecheck/build，核对运行产物并在自己的副本启动；不复用作者安装目录/PID，不把源码清单当作服务身份。私有包及 clean-directory replay 的具体文件/结果只在本地发行回执交付，不上传真实采集内容。

## 上线状态

源码合入不升级原本机窗口或远端服务。以实际 Actions、目标 Worker/KB health/releaseId、浏览器抽屉应用版本以及网络 build.json 的 commit/builtAt 判断部署。公开 Pages 只读构建不等于完整可写部署；KB、Worker 地址和成对凭据配置仍需目标环境独立核验。真实师傅批准、素材使用权和真实厨房周另行完成。
