---
name: video-recipe-ingest
description: >
  Use when: 把完整做菜视频变成可复核的 CanteenOS 菜谱草稿，或检查视频菜谱是否漏了配料和步骤。
  Not for: 只凭收藏卡片、标题或平台摘要生成菜谱，也不代替师傅审核。
  Output: F2 采集记录、全片音画证据、SQLite KB 待审核候选和完整菜谱阅读面；师傅审核后才进入固定菜单版本。
---

# 视频 → 完整菜谱 → 厨房

这是当前 SQLite KB 接入路径的执行契约。2026-09-06 的直写 `data/dishes/*.json`、默认放大到 50 份、PR 即厨师审核设计属于接入前历史方案；当前收藏收件箱不走这条路径。见 [视频导入说明](../../docs/video-import.md) 与 [KB 纵向决策](../../../knowledge-base/docs/VIDEO-RECIPE-INTEGRATION.md)。

## 1. 获取整片

- 输入为收藏作品 URL/ID 或已有视频文件。抖音作品先用远端 F2 `one` 模式测试详情和媒体；记录 F2 版本、作品 ID、详情/下载各自结果。F2 是采集器，不做视频理解。匿名失败后可用用户提供的文件或用户控制的可播放原视频；不得暗读浏览器 Cookie、绕验证或把凭据写进日志/数据库。
- 记录来源链接、实际获取方式、媒体 SHA-256、字节数、音视频时长、是否有音轨。签名媒体地址只是临时获取路径，不当作永久来源。
- 以媒体 hash 与解析契约版本查已有结果；同一片、同一契约优先复用完整证据和候选。媒体文件放在 KB 之外。

## 2. AI 读取完整音画

- 先使用 KB 已有的 [`scripts/video-evidence/prepare.py`](../../../knowledge-base/scripts/video-evidence/prepare.py)，执行方式和持久环境见[全片预处理说明](../../../knowledge-base/docs/VIDEO-EVIDENCE-PREPARE.md)。相同媒体与提取配置命中完整性校验后的缓存时，跳过重复抽帧、OCR 和 ASR。不要每次在 `/tmp` 重建依赖。其 `ready_for_analysis` 仅指原始证据包就绪，后续仍须核对并生成候选，不能直接当作完整菜谱或师傅批准。
- 整段音轨转写并保存分段时间。取字幕轨、全片字幕 OCR、必要的画面操作观察；覆盖开头配料表、中间处理、后段调味和收尾装盘。记录总时长、音轨处理终点、抽帧数、末帧与最大间隔；对数字、菜名、厨艺术语和冲突位置回看原帧。
- 每条观察有稳定 ID、`spoken|subtitle|visual` 类型、起止毫秒与文本。标题、收藏卡片、平台 AI 摘要只用于发现，不单独证明用量或做法。AI 纠错仍标明来自哪段原画面，不冒充人类复核。
- 输出全部食材/调料、原话用量、替代关系、预处理和完整步骤。未讲明的份数、火力、煲煮时间、勺规格、汤量或粉种类保持未知。替代项附在原料上，不能作为另一条同时采购。
- 采用 [本 skill 的本地候选契约](references/candidate-contract.md) 生成 `source.json`、`evidence.json`、`candidate.json` 和 `review.md`。若 agent 安装了 `video-recipe-evidence`，可按它完成音画取证；不得从卡片或三张缩略图生成“完整菜谱”。

## 3. 写入当前产品

- 用 KB 的 `scripts/import-video-candidate.mjs` 验证原媒体 hash、证据引用和候选结构，再通过 loopback/SSH 隧道 API 依次写入不可变 `favorite_capture` 和 `needs_review` 的 `favorite_candidate`。同输入重试复用记录。
- 候选页先展示整份食材、做法、未知条件和**完整原视频**。时码/证据折叠保存，师傅无需逐字段回看片段。保留来源使用权状态；未确认许可的视频帧不能作为可发布菜图。
- AI 不署名审批。师傅补齐厨房所需条件、审核保存 SQLite 菜谱版本后，CanteenOS 才能将 `recipeId + version` 固定为菜单快照。帮厨看该版本备料，采购读同版本、按真实份数和库存决策；未知量不生成精确采购数字。

## 完成证据

1. 视频 hash、时长和音画覆盖记录；候选每项有证据 ID，所有未知问题列明。
2. KB 返回 `captureId` 与 `candidateId`，重跑返回原 ID；收件箱能直接读完整菜谱并打开完整原视频。
3. 师傅审核人与版本回执；固定菜单版在 KB 后续编辑后不漂移，备料/采购显示同一份食材与步骤。
4. 至少另一条真实烹饪视频与非菜谱样本对照后，才扩至收藏批次。
