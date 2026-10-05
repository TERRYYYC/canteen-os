# 视频证据交接格式

四份 UTF-8 文件放在同一工作目录；这是 AI 与 SQLite KB 导入器之间的**草稿交换格式**，不是已审核菜谱。

- `source.json`：`classification=video`、`sourceUrl` 和 `workId`（必须与将要关联的 KB 收藏作品一致；若分析 agent 只收到本地文件，由交付者按已验证的采集记录补齐）、`accessMethod=f2|browser_playback|user_file`（与真实采集方式一致）、`captureTime`、`localMediaPath`、`sha256`（小写 64 位）、`byteCount`、`durationMs`、`audioDurationMs`（无音轨写 0）、`videoDurationMs`、`streams`、`rightsState`、`analysisCoverage:{audioProcessedThroughMs,frameCount,lastFrameMs,maxFrameGapMs}`。有音轨就必须处理到音轨结尾；无音轨的处理终点写 0。末帧距片尾不超过 2 秒，最大帧间隔不超过 2 秒。`review.md` 还须说明未处理区间和视觉识别的具体限制。
- `evidence.json`：数组；每项有唯一 `id`、`kind=spoken|subtitle|visual`、整数 `startMs/endMs`、`text`、`extractor`，可加 `framePath`、`rawText` 与说明。时间在媒体时长内。平台摘要/收藏卡片可另存，但不得支持配料数量或步骤。
- `candidate.json`：`status=needs_human_review`、`classification=recipe`、`sourceSha256`、`title`、`titleEvidenceIds`、`yield`、`ingredients[]`、`steps[]`、`unresolved[]`、`approvedForMenu=false`、`approvedForProcurement=false`。

食材项：`name`、`rawQuantity`（原话或 null）、`quantityState=stated|stated_imprecise|not_stated|not_checked`、`prep`、`evidenceIds[]`、`uncertainty`。`stated_imprecise` 即使原话含数字也只保留文本，不可升格为可参与采购计算的精确量；`not_checked` 不得导入完整视频候选。AI `yield` 仅是待核对观察值，不能直接成为菜谱的 `baseServings`；须由师傅在 KB 菜谱修订中核定。替代项写在原料的 `substitution: {name,rawQuantity,evidenceIds,uncertainty}` 内；不能同时成为独立采购行。步骤项：`order`（从 1 连续）、`action`、`startMs/endMs`、`evidenceIds[]`、`unknowns[]`。

每项食材和步骤必须引用有效的**音画证据**。`not_stated` 是整段核对后确实没说；`not_checked` 是覆盖不足。后者不得作为完整视频草稿提交。综合 `unresolved`、食材 `uncertainty` 和步骤 `unknowns` 均须传给 KB 候选，审核后随固定版本进入备料提示。`rawQuantity` 只可在无歧义时转换数值；“两勺”“来点”“八成油温”保留原话，不推算克数/温度。

KB 导入器核对媒体 SHA 与字节数、ID/时码和引用，将替代项保留在原料说明中，输出 `favorite_capture` 和 `favorite_candidate`。人类界面默认展示完整菜谱、完整原视频和未定条件，时码依据折叠。
