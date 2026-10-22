---
feature_ids: [video-recipe-working-example]
topics: [video-import, working-example, cached-analysis, repository-boundary]
doc_kind: how-to
created: 2026-10-19
---

# 视频解析怎么用：从一个可运行案例开始

本例解决三个问题：解析流程放在哪里，怎么操作，以及结果怎样供 CanteenOS 使用。

你可以只克隆本仓库，用 Node.js 20+ 运行一个明确标记为**合成数据**的样本；有私有原片及已解析文件时，用同一个命令复跑真实“陈皮排骨”，得到完整、可阅读的菜谱和检查回执。

**这里重放并检查已有解析结果，不会下载视频、调用 AI、重新解码视频、写入知识库或发布菜单。** 首次分析视频另见下方“首次解析”。工具检查文件身份、证据引用及记录的覆盖范围，不证明菜谱每句话都正确。

## 1. 一分钟跑通公开样本

在包含本文的仓库根目录运行。无需安装 npm 包、模型、Docker 或知识库：

```sh
node scripts/replay-video-recipe.mjs \
  --artifact-dir examples/video-recipe/fixture \
  --media examples/video-recipe/fixture/media.txt \
  --output-dir /tmp/canteen-video-fixture-first-run \
  --synthetic-fixture
```

输出父目录须已存在，输出目录本身必须尚不存在，而且位于仓库和输入目录外；再次运行请换一个新目录。`media.txt` 是测试字节，**不是可播放视频**；这一条只演示契约检查和报告生成。输出的 `recipe.md` 可直接阅读，`receipt.json` 说明哪些检查执行了、哪些没有执行。合成模式不会产生“真实视频解析成功”的结论。

## 2. 真实案例：陈皮排骨

[案例身份](../examples/video-recipe/chenpi-ribs/case.json)记录了公开作品链接、原片指纹和预期数量：原片 132.4 秒，12 项食材、8 步做法、5 张内部参考图。它来自实际已执行批次，不是把合成样本改个菜名。

先准备你有权读取的本地文件：

```text
某个解析产物目录/
  source.json
  evidence.json
  candidate.json
  review.md
  illustrations.json
  images/...
另一个缓存目录/完整原片.mp4
```

这些私有文件不随公开仓库分发。2026-10-03 批次的这道菜复用了早期解析：`batch-50-20261003/<作品ID>/reuse-complete.json` 中的 `artifactDir` 才指向实际产物；不能假设批次每个目录都有 `candidate.json`。同一片已有完整结果时，应复用，不重复付出 AI 成本。

将下方三个路径换成实际位置；原片使用完整 MP4：

```sh
ARTIFACT_DIR=/absolute/path/to/recipe-artifacts
MEDIA_FILE=/absolute/path/to/original-video.mp4
CASE_OUTPUT_DIR=/absolute/path/to/new-replay-output

node scripts/replay-video-recipe.mjs \
  --artifact-dir "$ARTIFACT_DIR" \
  --media "$MEDIA_FILE" \
  --output-dir "$CASE_OUTPUT_DIR"
```

检查通过后：

- 打开 `recipe.md`：看全部材料和原量、替代关系、完整步骤、未知条件。技术标识留在辅助信息中。
- 打开 `receipt.json`：应明确是 `cached_artifact_replay`，没有新 AI 分析、下载、独立音视频解码或知识库写入。
- 对照 `case.json` 的作品 ID、媒体 SHA、大小和数量。相同文件内容才是这次案例，换了媒体不能沿用旧证据。
- 公共仓库中的脱敏运行回执只证明该次文件重放；原片、参考图、转写、完整证据和人读菜谱输出保留在私有目录。

已执行记录见[真实重放回执](../examples/video-recipe/chenpi-ribs/verified-replay.json)。其中 `needs_human_review` 沿用输入产物的历史状态，不表示当前 App 仍设置厨房审批门禁。

该命令不会播放或重做 ASR/OCR，也不会核实原方是否适合某个厨房。用量“两斤”“一勺”等按原文保留；份数不补成 50，酒的替代品不重复算成另一份采购需求。

## 3. 首次解析一条新视频，谁来做什么

第一次没有缓存结果时，按[视频导入 Skill](../skills/video-recipe-ingest/SKILL.md)和[候选格式](../skills/video-recipe-ingest/references/candidate-contract.md)执行：

1. **F2 获取原片。** 使用独立知识库包里的 `scripts/video-evidence/f2-acquire.py`，保留作品 ID、完整媒体大小和 SHA；下载失败就记录失败阶段。
2. **本机准备音画。** `scripts/video-evidence/prepare.py` 处理完整音轨、抽帧、OCR 和 ASR。它只产出证据，不产出完整菜谱。当前实现依赖 macOS/Apple Silicon、本地 MLX Whisper、FFmpeg 和 Swift/Vision。
3. **Agent 整理和核实。** 读声音转写、字幕和画面，对数字、后段调味、时间及冲突回看原帧，生成 `source.json`、`evidence.json`、`candidate.json`、`review.md`，有配图时再加 `illustrations.json` 和图片目录。模型调用与本机预处理是不同步骤；不要把整个流程称为离线本地大模型。
4. **检查并阅读。** 用本例 CLI 检查文件与引用、生成人读菜谱；再由人按自己的工作方式核对。机器检查与菜谱正确性是不同结论。
5. **需要入库时才导入。** 独立知识库提供 `scripts/import-video-candidate.mjs` 和图片导入器。用该包的文档先做 `--dry-run`，确认目标服务和收藏作品，再执行实际写入。不要把公开样本写进日常库。

独立知识库的使用说明名为 `docs/F2-VIDEO-ACQUIRE.md`、`docs/VIDEO-EVIDENCE-PREPARE.md`、`docs/VIDEO-RECIPE-INTEGRATION.md`。它目前由私有配套软件包交付，**不包含在本仓库 clone 中**。如果没有配套包，请向维护者取得；本例不提供一个不存在的知识库 GitHub 克隆地址。单克隆本仓可以运行第 1 节，不能据此声称首次下载、AI 分析和真实入库都已执行。

## 4. 主仓库、知识库、缓存的关系

| 位置 | 保存什么 | 怎样连接下一步 |
|---|---|---|
| 本仓库 CanteenOS | 页面、受控网关、菜单/采购逻辑、固定发布资料、解析契约和本案例工具 | 从知识库读取选定菜谱版本，固定用于菜单 |
| 独立 SQLite 知识库 | 日常候选、菜谱、版本、来源和受控素材 | 导入器经 API 写入；App 经 Worker 网关读取 |
| 仓库外的本机缓存 | 完整视频、音轨、抽帧、转写和解析产物 | 用媒体 SHA 关联；本例只读检查，不复制或提交 |
| `recipe.md` / `receipt.json` 输出 | 本次给人阅读的菜谱和机器检查结果 | 用于继续理解、复核与交接；不是自动发布 |

```text
首次：完整视频 → 音画处理 → Agent 形成候选 → 检查 → 知识库
复用：已有原片 + 同片解析产物 → 本例只读重放 → 人读菜谱和回执
使用：知识库保存菜谱 → 排菜时选择并固定版本 → 保存/发布 → 菜单与备料
采购：从已保存计划建立工作单 → 人工选择待核对/待买/已有/已买
```

当前 [ADR-0011](adr/0011-recipe-review-outside-app.md) 将来源确认和厨房核定放在 App 外。候选可直接存为菜谱，未归档的保存版本可用于排菜；本例不恢复旧 App 审批流程，也不替任何人写核定记录。保存、发布、真正按菜谱备料仍是不同事实。

## 5. 为什么之前只有部分内容入仓

方法契约已在主仓，底层工具提交在独立知识库本地 Git；实际 50 条的排队、恢复和复核记录又放在单机运行目录。此前没有把“新接手者如何取得工具、运行一条案例、读懂结果”作为同一项交付收尾，因此文档有了，复跑入口仍然断开。

本次补上公开仓库可运行的契约样本、同一入口的真实缓存案例、使用边界和关系说明。**它没有把全部 50 条批调度、F2 Docker 构建、私有知识库源码发布或新视频自动 AI 执行器补齐。** 那些需要各自的版本化软件交付，不能以本案例测试通过代替。

测试命令：

```sh
node --test scripts/replay-video-recipe.test.mjs
```
