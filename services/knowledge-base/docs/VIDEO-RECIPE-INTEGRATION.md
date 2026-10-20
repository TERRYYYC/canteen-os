---
feature_ids: [douyin-favorites-ingest, knowledge-base, menu-prep-purchase]
topics: [douyin, f2, video-understanding, recipe, import]
doc_kind: runbook
created: 2026-09-28
updated: 2026-10-19
---

# 收藏视频到菜谱：操作入口和边界

师傅应先读到整份食材与调料、完整做法和未讲明的条件，并能打开完整原视频。时码、证据 ID 和媒体 SHA 留作技术依据；未知份数、火力、时间、勺规格和替代量不由 AI 猜测。来源确认与厨房核定在 app 外完成；候选可直接保存为菜谱，已保存且未归档的版本可由主应用显式固定，见 [ADR-0011](../../../docs/adr/0011-recipe-review-outside-app.md)。旧 API 的 `needs_review` 等状态保留兼容，不能据此新增 app 审核门。

## 各工具负责什么

| 阶段 | 入口 | 产物与边界 |
| --- | --- | --- |
| 收藏目录 | `scripts/import-douyin-favorites.py` | 读取已有 CSV，通过 prepare/apply API 导入索引；不读浏览器登录态，不下载视频 |
| 完整视频 | [F2 获取](F2-VIDEO-ACQUIRE.md) | F2 详情、MP4、音视频轨校验、SHA 与缓存；不生成菜谱 |
| 全片证据 | [prepare / ASR / OCR](VIDEO-EVIDENCE-PREPARE.md) | 全音轨 ASR、带真实时间戳的帧/OCR、覆盖清单和缓存；只到 `ready_for_analysis` |
| 理解与核对 | [主仓解析契约](../../../skills/video-recipe-ingest/SKILL.md) | agent 核对字幕/语音/动作，形成 `source.json / evidence.json / candidate.json`；不是本模块内置的一键模型 worker |
| 入箱 | `scripts/import-video-candidate.mjs` | 校验媒体/覆盖/逐字段引用，再写 capture 和 candidate；不批准或发布 |
| 原片参考图 | `scripts/import-candidate-illustrations.mjs` | 校验原片 SHA/步骤/时间/图片后单独追加事件；不进入公开菜图 |
| 排菜和使用 | 主应用页面与 Worker | 保存菜谱，固定版本及依赖，保存/发布菜单，再查看同版备料和采购；独立于日常 KB 编辑 |

这些入口与方法已随源码提供，**完整 50 条的批量调度 worker、实际媒体、模型、解析缓存和现有数据库不在 Git 中**。主仓的[实际案例](https://github.com/TERRYYYC/canteen-os/pull/165)可以重放已有解析结果，不能证明新 F2 下载、重新 AI 理解或 KB 写入已经执行。

## 1. 准备索引和候选文件

先按[模块 README](../README.md)启动仓外全新库或自己明确选择的隔离副本。CSV 需要服务识别的列和真实作品 URL；API 合同及测试见 `apps/api/favorites.mjs`、`tests/api/favorites.test.mjs`。`claimed-count` 是原目录声称的总数，不能填成“已解析数”。

```sh
python3 scripts/import-douyin-favorites.py /absolute/favorites.csv --claimed-count 50
python3 scripts/import-douyin-favorites.py /absolute/favorites.csv --claimed-count 50 --apply
```

第一条调用服务器只读 prepare 校验；第二条才 apply。默认回环 4390，支持用 `--base http://127.0.0.1:4391` 指向隔离实例。之后读取 `/api/v1/favorites/items`，取待导入作品自己的 UUID。

原片获得方式与 `source.json` 中 `accessMethod` 必须一致：`f2`、`browser_playback` 或 `user_file`。不可把浏览器取得的媒体写成 F2 成功。完整解析文件必须由实际音画证据生成；标题、收藏卡片和几张静态图不能替代完整原片。

## 2. 先校验再写入

以下所有路径与 UUID 均为需要替换的示例：

```sh
node scripts/import-video-candidate.mjs \
  --api-base http://127.0.0.1:4390 \
  --item-id ITEM_UUID \
  --source /absolute/artifacts/source.json \
  --evidence /absolute/artifacts/evidence.json \
  --candidate /absolute/artifacts/candidate.json \
  --media /absolute/complete-video.mp4 \
  --source-method f2 --dry-run
```

`--dry-run` 读取目标作品并校验，返回食材/步骤/证据/未知项数量，不写入 capture 或 candidate。确认后去掉 `--dry-run`；同一输入重试复用同一记录。`--output` 可选写入仓外路径，保存的是构建后的导入请求内容，**不是 API 写入回执**；标准输出才包含 `captureId/candidateId` 和 replay 状态。

导入器按原媒体字节核对 SHA/大小，再核对作品 ID、URL、真实来源方法、音画覆盖与字段引用。声学证据必须落在音轨内，视觉证据必须落在画面轨内；引文和时码必须来自同一记录。`not_checked` 不能作为完整草稿，`stated_imprecise` 保留为不可算术原话。AI 声称的份数不会自动写成可计算的 `baseServings`。

### 格式 3：原方和「没说清」的位置（2026-10-19，ADR-0012，canteen-os#182）

导入器现在产出 `recipeFormatVersion: "3"` 的候选，字段见 [API 合同](./API-CONTRACT.md#菜谱格式-3原方和食堂用量分开记没说清带位置adr-0012canteen-os182)。

- **用量。** 原话进 `originalAmount`。能无歧义换成 CanteenOS 单位的数，进只显示的 `originalQty`，例如「5斤」记为 2500 g、「600克」记为 600 g。导入器不写食堂用量 `qty`；食堂用量由师傅在新修订里补，并写明出处。
- **没说清。** 候选里整道菜的 `unresolved`、食材的 `uncertainty`、步骤的 `unknowns`，每条可以是纯文字，也可以是 `{text, kind?, action?}`。导入后存进候选菜谱的 `unknowns[]`：
  - 整道菜的不带位置；
  - 食材的带食材行 ID；
  - 步骤的带步骤 ID。
- **类别。** 给了就原样存，没给就空着。
- **存为菜谱。** 这些条目原样进第 1 版。平铺的 `unresolved` 字符串照旧保留，给收件箱计数。

原片媒体和 Cookie 不写入 SQLite。capture 保存证据和来源元数据，candidate 保存结构化草稿和未核验项。原片及完整证据包由操作者在仓外配套保留；给师傅的原作品 URL 不等于拥有媒体再发布权。

## 3. 原片参考图

先准备实际检查过的 `illustrations.json` 及同目录图片：

```sh
node scripts/import-candidate-illustrations.mjs \
  --artifact-dir /absolute/artifacts --candidate-id CANDIDATE_UUID
node scripts/import-candidate-illustrations.mjs \
  --artifact-dir /absolute/artifacts --candidate-id CANDIDATE_UUID \
  --apply --output /absolute/illustration-import-receipt.json
```

第一条只校验/报告，第二条才上传追加。可用 `--api-base` 显式指定隔离回环实例；省略 candidate-id 时读取同目录 `local-import-receipt.json`。要求图片与同一 capture 的媒体 SHA、URL、实际步骤、帧时间匹配；图片最长边 ≤1280、字节数 ≤200000，rights 保持 `unknown`。幂等重试不会增加同一逻辑事件。上传与事件追加之间中断可能留未引用资产，保留供排查，不自动删除。

这些图片是内部原片参考图，不写入 `recipe.assets`，不会自动当成公开菜照。角色/来源权限由 CanteenOS Worker 实施。

## 历史验证与本次迁入

既有工具曾在独立样本上验证完整视频、ASR/OCR、字段引用、首次写入及重复导入，并保留非菜谱对照；历史媒体、capture/candidate UUID 和私有运行回执没有迁入。F2 旧版本的 HTTP 403、开发分支的 HTTP 200 空正文和后来游客初始化后的下载成功属于不同阶段；不能用任何一条历史记录保证所有作品或当前平台可用。具体方法见 F2 说明。

迁入提交 `2224e6a`（#189）时，自动化检查用的是合成 fixture，没有重跑真实下载、AI、用户库写入或厨房验收。那时导入器还是一行一个 `amount`。

现在的导入器已按 [#182](https://github.com/TERRYYYC/canteen-os/issues/182) 产出格式 3 候选，见上文「格式 3」一节。它的测试同样只用合成资料。还没完成的验收：用真实视频重新导入、写入真实知识库（#184），以及远端部署。
