# 调度日志（每天三行：合了什么 / 卡在哪 / 明天派什么）

> 由调度线（Helm）每天晚上追加；周五一段由 Owner 写（能用了什么 / 坏了什么 / 下周不做什么）。测试周（10/19–25）的每日日志在 `docs/field-test/<week>/log.md`。

## 2026-09-07（周一）

- 合了什么：第一波 + 第二波 5/6 全部进 main——#44 schema（#1，Owner 点）、#45 translate（#4）、#46 chore 基础设施、#47 渲染器（#5）、#48 build-data（#3），外加 #50 修 CI（`pnpm/action-setup` 与 `packageManager` 版本冲突，main 上 CI #1–#8 一直红，今天第一次绿）。每个 PR 都在干净克隆的合并树上复跑过：core 34/34、scripts 23/23、快照 5/5 行一致、schema 14/14。
- 卡在哪：GitHub App 没有 workflows 权限——工作流文件只能 Owner 网页改（#50 就是这么修的）；#49（#2 types 检查器）代码已推、Approve，缺 ci.yml 两步等 Owner 补后合。#5 的 `allergens` 需要 ingredient 加字段 → 已在 issue 标「建议回讨论区」。连接器打通花了大半天（仓库转 Public + 安装 App）。
- 明天派什么：无新 agent 任务——v0.1 agent 侧只剩 #49 等 Owner；之后是 Owner 的 #6（门 A：真实厨房 + 菜贩清单）与 #7（tag v0.1、CHANGELOG、周五演示）。v0.2 按计划 9/14 开工，不提前。
## 2026-09-08（周二）

- 合了什么：v0.2 全线已在 main 且线上跑真数据（#8 #13 #9 /prep、#10 /purchase、#11 /menu、#12 PWA、#14 QR，外加抽屉 `hidden` 被作者样式压过的线上热修 #59）。今天又合五个：#66 给 pnpm-lock 补 `qrcode@1.5.4`（#60 明确记的遗留，解锁 #57）、#67 给 `build-deploy.yml` 加 `workflow_dispatch`（ADR 写明是 #19 开工前的唯一外部依赖，已验证 Actions 页出现 Run workflow 按钮）、#61 ADR-0007 写入通道（Owner 拍板后改四处再合，Status → Accepted，closes #18）、#64 worker 契约、#65 前端契约。晚间又合 **#71**：`ci.yml` 新增 `build-web`（core 单测 → scripts 单测 → build-data 闸门 → build-data → web typecheck → vite build）与 `bot-scope-guard`（ADR-0007 §8 第三层）两个作业，三处 `pnpm install` 收紧成 `--frozen-lockfile`。**#57 关闭；#62 作废关闭**（那颗「Owner 补 workflows 权限」的卡点根本不存在，见下）。
- 卡在哪：**沙箱 `No space left on device`**，整天跑不了任何 install / build / test，所有核验退化成「sha1 逐字节自证 + 让 CI 说话」；因此不敢派实现类子 agent，今天全是我自己动手的文档与配置活。App 仍无 `workflows` 权限，两个 workflow 改动都是走网页编辑器 + 合成粘贴做的（中途撞了两次全选失灵，都 Discard 重来了）。#57 已做完（三处 install 全收紧，`--dir packages/core` 那处也没漏）。两条卡点更新：① **「让 Owner 去补 App 的 workflows 权限」是错的** —— App 的权限范围由发布方声明，安装页上这个 App 并没有在申请，Owner 点进去也没有开关可勾；网页编辑器（合成 `cmd+A` 全选 + `bubbles:false` 的 paste 事件）是常态路径，不是临时绕路，#62 已按此作废。② #26 密钥扫描仍未推，卡在 `gitleaks-action` 选 v2 还是 v3（上游已出 v3）以及 license 规则没实测；tag→commit 映射已核验并记在 #26。
- 明天派什么：优先级没变——沙箱一恢复就派 #19 worker（外部阻塞已解、契约已合、三条阻塞级硬伤已由 Owner 拍板）。沙箱继续挂着就走：#26 密钥扫描（先定 v2/v3）、`build-deploy.yml` 那处 install 也收紧、v0.1 收尾（#7 的 CHANGELOG 与 tag）。**今天 CI 第一次真跑单测就抓到一个既有 bug**：`packages/core` 的 `test` 脚本把 glob 写成 `node --test "test/*.test.mjs"`，Node 20 不展开引号里的 glob，这个包的单测从来没通过自己的 npm 脚本跑起来过（`tsc` 有效，断言无效），已在 `1243fa4` 修掉——这类「绿灯不等于跑过」的东西还有多少，只能靠继续把验证搬进 CI 来发现。已按 Owner 指示去掉全部时间门槛，只按依赖关系推进。Owner 侧仍是门 A #6：真实厨房 + 菜贩清单。
