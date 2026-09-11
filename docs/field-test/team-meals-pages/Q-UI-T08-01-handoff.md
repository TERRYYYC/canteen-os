---
feature_ids: []
topics: [team-meals, purchase, export, q-ui-t08-01]
doc_kind: approved-repair-handoff
created: 2026-09-11
---
# Q-UI-T08-01：复制清单缺项修复，交回 Q 复验

本项获得原非作者 plan_review 对固定 `5049f0a47c76c4149a91a288a6a9b6edf279b1ea` 的 **APPROVE**，无 open P1/P2。Root 已全文读取[原审查报告](review-receipts/q-ui-t08-01-5049f0a/REVIEW.md)及 verdict，并逐项核验原件。仅闭合 D 本次导出修复，不代表 Q T01–T09、另项导入缺陷或 L2 完成。原 APP-BUNDLE-D1 回执保持不变。

## What / Why

原复制函数只输出名称、判断和通用提醒，丢失页面已经显示的真实来源与缺项，违反原 T08/S09。[固定契约](Q-UI-T08-01-contract.md)内容版本 `71fd5663ffddc2161ad2c48f1987e9ea2957147a`，原 STANDARD/S09 哈希及 Q ad54d4f 原始失败均保留在 [intake](q-ui-t08-01/q-fixed-Q-UI-T08-01.md)。

原作者 page_inventory 将导出移至 Purchase 同步使用的最小展示文件；消费者直接传当前所选清单同一 basis 的 projection 与 estimate。现在包含日期餐次、完整来源版本、四组当前判断、可区分的材料 ID、所有来源、原用量/计划及配方份数、独立覆盖问题与具体估算缺项。未知与适量分开；已有参考不变成总需求或完整预算。

## Tradeoff / 证据

三个生产文件、三个 D 测试文件；没有新增计算、异步边界、保存 owner、协议或持久化。C/shared、core/Worker、Q、main/PWA、config/deps 不变。新 helper 只随 Purchase 进入，避免共享页面体积增加。

- [作者证据](q-ui-t08-01-copy-fix/README.md)：生产5049，完整证据 `e6aef33e8f9e910c6f5d17b5a4e0b85030194a44`；目标55/55、Node20 Web509/509、type通过。原2/15 RED及11/15测试正则误匹配300g的中途失败完整保留；24份原件已对Git核验。
- [实际浏览器](q-ui-t08-01-browser/README.md)：归档 `eb42e575b8cce463ff34653d9382e7b58eea60d5`；真实main→C→本地HTTP→真实Worker→固定Q FakeRepo。zh/en/uk原生clipboard读回成功，失败textarea逐字一致；六来源、具体缺项、A绑定/未应用B、迟到语言和离页失败共32/32。两个Worker POST仅首次创建和显式判断保存；其余步骤无新增Worker写入。33原件及57个生产Web源文件对Git核验。
- 独立 reviewer：Node20 Web509/509、type/core通过，另6/6真实core边界探针，重算浏览器32/32，并核对第二次If-Match精确等于首次ACK blobSha。143份审查原件含原始工具失败，逐字保留。
- 作者及审查人独立重建：两配置、11入口、SW/no-SW共44/44均≤60000gzip；每配置12个实际preload闭包、24/24应用JS全部预缓存。最紧HTTP Plan **59568，余432字节**；HTTP Purchase54467。全部JS gzip171122/171191与入口体积分开，不宣称冷安装总量下降。

Root 浏览器选择了原fixture全部餐次，name-only缺成分属于晚餐；Q原native午餐现场没有此项。两者与Q函数RED分别保留，不混算或覆盖旧失败。无API及同步throw是Node实际renderer用例，不冒称额外native场景。

## 原件与后续

审查身份 `Codex /root/plan_review`；Subject `task:01a08db7-43f3-7952-adb5-75106389e557/Q-UI-T08-01`；verdict `APPROVE / approved`。原报告SHA256 `419d2f6c285e75e64e45764e84f981edb21a15cf1415ef74c66dbfecd695b31c`，143项清单SHA256 `87b55e91a9515ec4f87ac04c2e6e31d873bebb227719d195be86b955cd2ef097`。原路径 `/private/tmp/canteen-q-t08-review-5049f0a/`；[归档清单](review-receipts/q-ui-t08-01-5049f0a/reviewer-artifact-manifest.json)。本包 packages tree 与5049始终相同：`b0407a1b761561f03aa07d66a5c6b003687458c8`。

Next Action：通过唯一授权 dispatch task `01a08d6d-be28-7142-ad8e-3f964658d3f4` 交 Q 独立复验。之后同一原作者/原审查人分项处理 Q-UI-T01-02 导入丢失未保存编辑；本包不批准该项。所有本地浏览器监听已停止，无远程推送、PR/消息、发布、部署或 L2 操作。
