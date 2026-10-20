# 视频证据交接格式

四份 UTF-8 文件放在同一工作目录；这是 AI 与 SQLite KB 导入器之间的**草稿交换格式**，不是已审核菜谱。

- `source.json`：`classification=video`、`sourceUrl` 和 `workId`（必须与将要关联的 KB 收藏作品一致；若分析 agent 只收到本地文件，由交付者按已验证的采集记录补齐）、`accessMethod=f2|browser_playback|user_file`（与真实采集方式一致）、`captureTime`、`localMediaPath`、`sha256`（小写 64 位）、`byteCount`、`durationMs`、`audioDurationMs`（无音轨写 0）、`videoDurationMs`、`streams`、`rightsState`、`analysisCoverage:{audioProcessedThroughMs,frameCount,lastFrameMs,maxFrameGapMs}`。有音轨就必须处理到音轨结尾；无音轨的处理终点写 0。末帧距片尾不超过 2 秒，最大帧间隔不超过 2 秒。`review.md` 还须说明未处理区间和视觉识别的具体限制。
- `evidence.json`：数组；每项有唯一 `id`、`kind=spoken|subtitle|visual`、整数 `startMs/endMs`、`text`、`extractor`，可加 `framePath`、`rawText` 与说明。时间在媒体时长内。平台摘要/收藏卡片可另存，但不得支持配料数量或步骤。
- `candidate.json`：`status=needs_human_review`、`classification=recipe`、`sourceSha256`、`title`、`titleEvidenceIds`、`yield`、`ingredients[]`、`steps[]`、`unresolved[]`、`approvedForMenu=false`、`approvedForProcurement=false`。

食材项：`name`、`rawQuantity`（原话或 null）、`quantityState=stated|stated_imprecise|not_stated|not_checked`、`prep`、`evidenceIds[]`、`uncertainty`。`stated_imprecise` 即使原话含数字也只保留原话，不转换成数；`not_checked` 不得导入完整视频候选。AI `yield` 只是原方说的份数（如「两三个人吃」），只作原方参考保留，不能成为菜谱的 `baseServings`：食堂菜谱的份数按每份记 1，由师傅在 KB 菜谱的新版本里写（ADR-0012 第 2 条）。替代项写在原料的 `substitution: {name,rawQuantity,evidenceIds,uncertainty}` 内；不能同时成为独立采购行。步骤项：`order`（从 1 连续）、`action`、`startMs/endMs`、`evidenceIds[]`、`unknowns[]`。

每项食材和步骤必须引用有效的**音画证据**。`not_stated` 是整段核对后确实没说；`not_checked` 是覆盖不足。后者不得作为完整视频草稿提交。综合 `unresolved`、食材 `uncertainty` 和步骤 `unknowns`（视频里没说清的地方）均须传给 KB 候选，存为菜谱后，随固定版本带上类别和位置（ADR-0012 第 11 条）。每条可以写纯文字，也可以写 `{text, kind?, action?}`：位置就是它写在哪里（步骤 `unknowns` 属于那一步，食材 `uncertainty` 属于那样材料，`unresolved` 属于整道菜）；`kind` 取 `prep-ahead|amount|net-or-gross|cut-size|identity|heat|duration|doneness|other` 之一，分不清就不写；`action` 只用于 `prep-ahead`，而且必须写，取 `marinate|soak|brine|rest|cool|other`。食材的 `uncertainty` 可以是一条，也可以是数组。`text` 是原话，只留在知识库，不进发布资料。`rawQuantity` 只可在无歧义时转换数值，转换出的数只作原方结构化值（KB 的 `originalQty`），只用来显示，不作食堂用量 `qty`，也不参与采购和备料计算（ADR-0012 第 1 条）；“两勺”“来点”“八成油温”保留原话，不推算克数/温度。

KB 导入器核对媒体 SHA 与字节数、ID/时码和引用，将替代项保留在原料说明中，输出 `favorite_capture` 和 `favorite_candidate`。人类界面默认展示完整菜谱、完整原视频和未定条件，时码依据折叠。
