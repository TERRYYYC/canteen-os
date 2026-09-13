---
feature_ids: [team-meals]
topics: [acceptance, browser, evidence, provenance]
doc_kind: execution-record
created: 2026-09-11
status: baseline-complete-two-open-defects
---

# 固定842页面执行记录

这是修复前的本地验收记录。原生页面操作已经发生；`page-ledger.test.mjs` 是对这些已保存捕获的可重复断言，**不等于重新运行浏览器**。两个真实产品失败独立记录于 [复制缺项](Q-UI-T08-01.md) 与 [导入丢稿](Q-UI-T01-02.md)，调度已派回原D。

## 固定输入与执行环境

- 实现 `842b778bd352c0dba8921584ce142d94665e5ca2`；生产输入 packages tree `dce6d72208652c80d2aa5b40865bef4a56732226`。已消费预算元数据修正原件，未重写错误旧日志。Q后续文件不算生产输入。
- 实际 Node `/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin/node`，20.20.2；先正式编译Core/Worker，再构建Web原配置。源完整性逐文件SHA见 `page-browser/source-integrity-842.json`，自动与Git842核验。
- 本机 `http://127.0.0.1:4271/`，实际 main/pages、C API/editor、B Worker；只有GitHub由既有FakeRepo建模。公网被测试env目标断言和本地CSP约束，不使用真实凭据。
- 固定日期 `2026-09-10T00:00:00.000Z`；Date.now保留真计时以测试30秒超时。正式producer的初始真实临时Git revision `ab3f584656e1c85cad51a0ac3f6193fa2ff5f21d`；后续FakeRepo模型提交不冒称GitHub历史。
- Q夹具在临时目录以明确manual变体生成，原example/冻结fixture/data不修改。PNG为1×1确定性合法图片，只用于同版字节和显示状态；不能作照片/美术签收。

## 实际动作与请求对应

完整原始记录是 `page-browser/ledger-842-page-run.json`（52个请求、真实响应、模型调用和最终全部13文件哈希/正文），不是模拟预期日志。

| 操作 | 实际证据 |
|---|---|
| T01日筛选保存全计划 | 请求3正文四餐，原name-only仍2，其他三行无份数；If-Match非空，handler200。`T01-*` 原生DOM/截图 |
| T02候选与来源 | four IDs cooking-oil/salt/tomato/tomato-other；tomato来源第一300g与第二未知。`T02-T03-T09-*`、原生同版详情及请求7 |
| 创建与判断 | 请求7 If-None-Match=*全check；8带7的blob锁，salt available、tomato buy+bought |
| 元数据变化 | 唯一control更改tomato三语名与pattern图到B；19更新basis但items与8相同。`T06-*`保留A详情、B独立入口及返回A |
| 两客户端冲突 | 22成功保存4；24相同旧锁保存5→409；第二标签保5/blocked，三语手机原生证据 |
| 需求rebase | 29基于22的新需求保存check+previous；30使用29的新锁再确认available；`T04-*`记录先禁用判断再保存、再确认 |
| 真提交后丢响应 | 31实际handler保存6→200后服务端断开；32读current、33读31的pinned版本，34读同版catalog，没有重复POST；页面保留后来7且dirty |
| 超时与晚确认 | 35真实保存7后被hold超过30秒→页面unknown保8，核实后保8；39保存8短hold，后续9与离页，释放真实ACK后回页新版本且9仍dirty。两种情形不合并为一次成功ACK |
| 导入失败 | 44/45为9→8；46为独立11→8。始终source6f479b8a，只有GET，原件详T01-02；没有保存导入稿 |
| 新空计划 | 隔离第三标签empty-check：47真实404；49 If-None-Match=*保存 `{schemaVersion:'3',meals:[]}`；51刷新回读相同，`T01-empty-*` |
| 同版资产 | 初期asset使用9d2e保存版本，红PNG SHA b1ff9c8e...；41/43使用e144版本的B蓝PNG。technique固定owner和`/1/image`，没有当前URL回退 |

未填数量、未录成分、draft、to-taste与缺包装均保留原记录含义；公开菜单一直绑定初始A，即使私有Worker后来有B元数据和8份计划，公共原配方仍300g/20ml并标原始未缩放。

## 三语与两尺寸

`responsive-metrics.json` 对 Plan/Purchase/Ingredient/Dish/Public Menu/Prep 各6组，实际viewport与document.scrollWidth均为1440或393，语言为zh-Hans/en/uk。计划各次都保留未保存9；清单各次保留同一ID与已保存判断。另有乌语手机公共原配方弹层、中文未录成分、三语冲突捕获。`T08-<page>-<language>-<size>.txt/.png` 可直接查看。

截图已采集，部分代表页面由Q查看可读性；没有把36组数量当成逐像素人工审美检查。公共图片使用懒加载，捕获中未滚到的图可能还未解码；不得从截图数量声称所有图已加载。材料/技法同版字节由真实asset响应另证。

初次viewport覆盖作用于选中第二标签，第一标签仍1440；读actual innerWidth后剔除误标mobile的未提交捕获，关闭已取证的第二标签后重取393。`setup-05-viewport-observation.json`记录设施原因。其余准备失败见T08-01，捕获解析器[active]问题见setup-06，均不归产品缺陷。

## 本轮自动检查

以下命令均前缀 `PATH=/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin:$PATH`，在Q工作区根运行；所有日志位于 `page-browser/`。这些结果不消除两个原生RED。

| 命令 | 结果 / 日志 |
|---|---|
| `npm --prefix packages/worker run build` | exit0，`regression-build-842.log` |
| `node --test packages/worker/test/team-*.test.mjs` | 118/118，`regression-worker-842.log` |
| `node --test packages/core/test/*.test.mjs` | 103/103，`regression-core-842.log`，包括原数值黄金 |
| `node --test scripts/validate-contract-fixtures.test.mjs packages/web/test/e2e/team-meals/api-contract.test.mjs` | 64+5=69/69，`regression-q-client-842.log` |
| `node --test packages/web/test/{pwa-integration,main-route-loading,reload-safety,main-publication-lifecycle,published-offline,published-data}.test.mjs` | 64/64，`regression-reader-update-842.log` |
| `node --test packages/web/test/e2e/team-meals/reference-boundary.test.mjs` | 2/2，`T03-reference-boundary.log` |
| `node --test packages/web/test/e2e/team-meals/page-ledger.test.mjs` | 7/7对原生捕获的断言，`native-ledger-checks-842.log` |

T03新增两例使用同正式夹具：悬空dishRef/ingredientRef的实际Worker保存为200并提示dangling-ref（现契约允许保存）；同正文在独立真实Git提交后，producer以missing-dish/ingredient阻止发布。已有候选不抹除unresolved coverage，旧manifest/投影字节保留。**不是笼统声称Worker拒绝一切悬空引用**，也未把负例塞进合法公共fixture。

## 有界继承，非本轮新原生运行

- [C reader独立review](../team-meals-web-shared/APP-READER-OFFLINE-C1-review-evidence/REVIEW.md)：固定3dd9db9，独立原生first-claim离线A、external-B接管后离线B、仍离线刷新新文档通过；完整JSON、CacheStorage、请求和source custody同目录可核对。本轮published.ts与3dd9字节相同，并复跑自动边界。只覆盖已验证团队投影，未见图片/legacy/QR仍不保证离线。
- [C R3独立review](../team-meals-web-shared/APP-MAIN-R3-review-7f3b4e6.md)：固定7f3b4e6，真实SW等待与一次显式consent、外部B无consent保草稿、offscreen未知保存不能强制reload。当前pwa.ts与reload-safety.ts仍与该cut字节相同。旧review当时有D Node20/预算失败，不能隐去；后续D792独立491/491、44项预算均≤60000及842元数据修正为其闭合证据。
- [D792独立review](../team-meals-pages/review-receipts/bundle-d1-repair-7920496/REVIEW.md)：固定生产734/受审792，页面模块晚写、保草稿与预算证据；该轮修复review消费作者冻结原生证据，没有新reviewer原生操作。Q本轮真实Worker页面链是另一次新的有界操作。

没有在本轮新操作浏览器断网、原生no-SW模式或SW更新；no-SW预算与自动边界不得冒称实际离线dogfood。没有L2、部署、远端publish/rollback、外部写入或用户视觉签收。
