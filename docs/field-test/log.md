# 调度日志（每天三行：合了什么 / 卡在哪 / 明天派什么）

> 由调度线（Helm）每天晚上追加；周五一段由 Owner 写（能用了什么 / 坏了什么 / 下周不做什么）。测试周（10/19–25）的每日日志在 `docs/field-test/<week>/log.md`。

## 2026-09-07（周一）

- 合了什么：第一波 + 第二波 5/6 全部进 main——#44 schema（#1，Owner 点）、#45 translate（#4）、#46 chore 基础设施、#47 渲染器（#5）、#48 build-data（#3），外加 #50 修 CI（`pnpm/action-setup` 与 `packageManager` 版本冲突，main 上 CI #1–#8 一直红，今天第一次绿）。每个 PR 都在干净克隆的合并树上复跑过：core 34/34、scripts 23/23、快照 5/5 行一致、schema 14/14。
- 卡在哪：GitHub App 没有 workflows 权限——工作流文件只能 Owner 网页改（#50 就是这么修的）；#49（#2 types 检查器）代码已推、Approve，缺 ci.yml 两步等 Owner 补后合。#5 的 `allergens` 需要 ingredient 加字段 → 已在 issue 标「建议回讨论区」。连接器打通花了大半天（仓库转 Public + 安装 App）。
- 明天派什么：无新 agent 任务——v0.1 agent 侧只剩 #49 等 Owner；之后是 Owner 的 #6（门 A：真实厨房 + 菜贩清单）与 #7（tag v0.1、CHANGELOG、周五演示）。v0.2 按计划 9/14 开工，不提前。
## 2026-09-08（周二）

- 合了什么：v0.2 全线已在 main 且线上跑真数据（#8 #13 #9 /prep、#10 /purchase、#11 /menu、#12 PWA、#14 QR，外加抽屉 `hidden` 被作者样式压过的线上热修 #59）。今天又合五个：#66 给 pnpm-lock 补 `qrcode@1.5.4`（#60 明确记的遗留，解锁 #57）、#67 给 `build-deploy.yml` 加 `workflow_dispatch`（ADR 写明是 #19 开工前的唯一外部依赖，已验证 Actions 页出现 Run workflow 按钮）、#61 ADR-0007 写入通道（Owner 拍板后改四处再合，Status → Accepted，closes #18）、#64 worker 契约、#65 前端契约。
- 卡在哪：**沙箱 `No space left on device`**，整天跑不了任何 install / build / test，所有核验退化成「sha1 逐字节自证 + 让 CI 说话」；因此不敢派实现类子 agent，今天全是我自己动手的文档与配置活。App 仍无 `workflows` 权限，两个 workflow 改动都是走网页编辑器 + 合成粘贴做的（中途撞了两次全选失灵，都 Discard 重来了）。#57 收紧 `--frozen-lockfile` 还没做，注意要改的是**两处** install，别漏 `--dir packages/core`。
- 明天派什么：沙箱一恢复就派 #19 worker——外部阻塞已解、契约已合、三条阻塞级硬伤已由 Owner 拍板（后台可直接建 active、令牌链接改 `…/#/admin/t/<token>`、worker 加只读 `GET /catalog` 与 `GET /changes`）。沙箱不恢复就继续纯文档/CI 路线：`ci.yml` 守卫 job、#57 收紧、v0.1 收尾（#7 的 CHANGELOG 与 tag）。**已按 Owner 指示去掉全部时间门槛**（不再等 9/14、不再按周五排期），只按依赖关系推进。Owner 侧仍是门 A #6：真实厨房 + 菜贩清单。
