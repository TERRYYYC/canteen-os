---
feature_ids: [team-meals]
topics: [acceptance, import, T01, T07, review]
doc_kind: defect-closure
created: 2026-09-11
status: closed-local
---

# Q-UI-T01-02 本地闭合

导入另一餐导致未保存11份回退到保存版8份的问题，已在本地闭合。D生产修复 `6bb1ce916c9b4117b6e03db23a78a5d0b9724a10` 获原 plan_review 批准，统筹放行完整fa6；Q真实页面复测固定于 `1a0668ef4eb985d908f3fc44348bd9a2d9008595`，获原非作者 `/root/v2_review` 的有界 **APPROVE**，无新增P级发现，支持关闭受影响的本地T01/T07检查。

Q新原生旅程保留11、原空值及原2；无效13.7随原行排序并跨EN/UK保留；无数量匹配导入保留raw，显式7与显式清空正确替代匹配行；本地增删和键盘主动留空保留。真实六行Save响应暂存期间导入第七行，旧ACK后新行仍dirty；下一次明确Save才保存七行。日筛选只显示一行仍发送全部七行，刷新回读完整。

首个Save8正文精确等于旧842请求39，但新现场 `9203f8c2...` 与原 `6f479b8a...` 历史分开。所有原始RED、旧150证据、复制33证据和两份既有review保持原字节。原捕获脚本未改，在新的捕获目录输出11→11；它是捕获断言，不是第二次浏览器运行。

独立复核在exact临时副本使用真实Node20：编译通过，新捕获检查4/4；实际重放11请求经真实Worker，所有状态、响应头、正文SHA、每步head及最终11文件精确一致。只有明确Save的3/6/8为POST，三次If-Match连续继承原Source/ACK；只有计划文件改变，最终七行不含plannedServings字段，无默认数或零。复核者没有操作浏览器，重放也不冒充浏览器的20秒等待。

原[报告](review-receipts/import-1a0668e/report.md)、结构化review、实际命令与当时重定向日志、真实重放脚本/结果及manifest共21文件已核验后原样归档。报告SHA256 `f1e5dac712e649d68404251df09cd4d3ba524ae0ed43d5651bfc436b295f7a6a`；manifest SHA256 `8c92e0d481a4b95ac84444a6ccec551ed89a6a9fb6c2967a1ea01629137b0883`；review.json SHA256 `dac5811f7996a8a9f444be20b5761cda53bc43b2c072c96de6af3069c6aefd95`。

reviewSubjectRef为 `task:01a08d74-9915-7191-ba9f-3177c587e52a/RC-Q-import-repair-6bb-evidence`；acceptedSource为 `docs/specs/team-meals-contract.md@ad1f427ae8d7ffc6841bfd2e51c279d2c90381d2`；追加修复合同为85be；clientMessageId为 `rcq-import-repair-evidence-1a0668e-20260911`。

保全记录中的 `src/admin` 是未变C共享支持目录；本次四个获批D改动在 `src/pages/admin`。58份实际Web源匹配执行9084和批准6bb；9084之后只增加Q测试/证据/矩阵。4273服务、自建IAB5已关闭，未新增视口覆盖；旧4271/4272也已关闭。原主工作区的既有未提交文件保持不变。

本闭合仅覆盖列明的本地执行与继承证据。真实GitHub/Cloudflare往返、L2、发布部署、完整离线/无SW/更新新一轮原生矩阵、厨房用户走查和视觉签收均不因此通过。最终逐格边界见[本地矩阵](page-integration-matrix.md)。
