---
feature_ids: [team-meals]
topics: [acceptance, week-filter, native-browser]
doc_kind: execution-record
created: 2026-09-11
---

# T01 周筛选追加原生检查

在4813固定证据送原v2_review之后继续使用同一842生产页面、本机4271和真实Worker/FakeRepo；不更改原150文件或52请求快照。

已经完成空计划保存/回读的隔离第三标签 `empty-check`（source1ea68909）添加9月10日first-dish、15日second-dish、18日second-dish，全部不填份数。选择“一周”、锚日期9月10日，页面显示10/15日两条，18日隐藏。点击保存，切全部日期可见三条；显式刷新回读仍三条且无份数。

`T01-week-handler-delta.json` 绑定原52请求快照SHA，程序核验此前52条一字不变，再保留新增真实handler请求段。保存带最新blob锁、200、新commit298d2ff6，正文三条均保留；之后GET同正文/commit。全部仓文件只有empty-check改变。

同目录DOM/截图记录筛选、保存、全部日期、刷新四个状态。此项补齐本轮原生周筛选保存，不覆盖T01导入丢稿RED；不触发发布、真实远端或L2。
