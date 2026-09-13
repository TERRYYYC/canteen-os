---
feature_ids: [team-meals]
topics: [acceptance, clipboard, T08, native-browser]
doc_kind: execution-record
created: 2026-09-11
status: native-green-review-pending
---

# Q-UI-T08-01 原始午餐范围修复复测

本目录是新的原生操作证据。原 842 的 150 个文件、RED 文本及断言保留不变；不把原来的失败改写成成功。T08 关闭等待原 v2_review 对本追加固定提交的批准；T01 导入丢稿仍 OPEN，T01–T09 整体仍 executing。

## 固定输入与执行边界

统筹放行 D 全交付 `f33dd42f1033073329d12579783d470e89dec00d`，其生产和测试固定于 `5049f0a47c76c4149a91a288a6a9b6edf279b1ea`，生产 packages tree `b0407a1b761561f03aa07d66a5c6b003687458c8`。干净合并后 Q 启动提交 `862ab0980d09493b92c5554768f05599ce925444`，Q 测试改变的 packages tree 为 `e825d70c8f96cb6c846fd03c5125524fc8c5cbe3`。`source-integrity.json` 记录全部 57 个 Web 源文件哈希，每个都与 Q 启动提交及获批 5049 逐字一致。

已全文消费 D 原 `/root/plan_review` 对 exact 5049 的 APPROVE：`docs/field-test/team-meals-pages/review-receipts/q-ui-t08-01-5049f0a/REVIEW.md` 与 `COMMANDS.md`，以及 `Q-UI-T08-01-handoff.md`。D 原生全餐范围包括 name-only；本轮实际午餐范围不包括该项，两者不混用。

本机 4272 的真实 `main.ts` / 原页面 / 正式 C client 与 editor → HTTP 桥 → 真实 B Worker → 既有 FakeRepo。真实 Node `v20.20.2`；固定日期和正式 producer 与原 842 相同；初始 fixture revision 同为 `ab3f584656e1c85cad51a0ac3f6193fa2ff5f21d`。未修改生产代码、业务结果或响应。

Q 服务额外以显式开关装入 D 已审 `copy-controls.js` 原字节，SHA256 `8ed49a89d355bb0bbfc3323fdc9ff4ec88e6fa2f9ead4ab7d1d849685b3ab6cb`。页面外的可见控制面板仅在点 Fail clipboard 后拒绝剪贴板边界；成功分支使用原生剪贴板。Change latest metadata to B 是既有隔离 fixture 元数据控制。全文 DOM 中 complementary 面板的旧尝试文本不是业务页面混语。

## 实际操作与证据

1. 同样新增 9 月 15 日早餐 first-dish，不填份数；日筛选保存全部四条。真实请求 3 的正文、条件头、完整响应、正文 SHA 和响应头均与旧 842 请求 3 精确相等，得到同一 basis `9d2e93483b9d16ab6f2e66161b1bcb337c20cedc`。
2. 实际创建 `page-shop`，仅勾选 9 月 14 日午餐 team-week。保存四项全 check，再将 salt 设 available、tomato 设 buy 且 bought。请求 7、8 也与旧原始请求精确一致，分别得到 `5a2118734d5fc2cff9628960da4369bea59d1153` 和 `7a65de840171464b540cb245e3a66cc7d848988c`。
3. 分别切换 zh/en/uk，点击实际复制按钮并读回原生剪贴板；显式点 Fail clipboard 再复制，确认手动 textarea 可见、readonly、值逐字等于原生文本。`T08-original-lunch-native-*` 与 `fallback-*` 保留文本，`*-visible-*` 保留实际 DOM。
4. 原始判断包含 check、available、bought 三个非空分组（buy 项已 bought），并非四个分组均有项。三语都包含四个材料 ID、六条来源、计划行/配料项索引、300 g / 200 g / 20 ml、两条原适量、未知原用量与缺份数/缺基准/缺包装/草稿提示；没有混入未选晚餐或 name-only，没有声称完整总需求或预算。
5. 点击可见 B 元数据控制，读取最新计划后范围编辑器显示 B `c3d9f2299e7ca0a19899737063dcf727aa37ea27`，不应用新范围。三语再次原生复制，内容均逐字等于各自原始 A 文本。完整 ledger 为 9 个请求，仅 3/7/8 为 POST，最后请求 9 为 GET；复制与故障回退没有写入。

新增手机端 uk fallback 原生截图和 DOM。实际 viewport 393×852；业务 main 的 clientWidth/scrollWidth 均 393，textarea 均 361。**整个文档 scrollWidth 2434**，原因是外置测试控制面板保留的长行（panel 389/2432）。本轮截图不能用作“整个文档无横溢出”证明；原无该面板的 36 组响应式证据仍单独保留。详情见 `mobile-metrics-detailed.json`。

## 自动复核与命令

以下命令的 PATH 均以前缀 `/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin` 指向实际 Node20：

```sh
npm --prefix packages/worker run build
node --test packages/web/test/e2e/team-meals/copy-repair.test.mjs
RCQ_PAGE_PORT=4272 RCQ_APPROVED_PRODUCTION=5049f0a47c76c4149a91a288a6a9b6edf279b1ea RCQ_CLIPBOARD_CONTROLS=1 node packages/web/test/e2e/team-meals/page-server.mjs
node --test packages/web/test/e2e/team-meals/copy-native-evidence.test.mjs
```

`build-core-worker.log` 编译通过；`copy-repair-green.log` 补充全餐的旧原始两断言 1/1 通过（只适配正式 helper 新入口/estimate 参数）；`native-evidence-checks.log` 对新原生捕获作 3/3 断言，包含源绑定、原请求相等、三语文本及尺寸边界。捕获断言不是第二次浏览器运行，也不与其他测试套件相加成 E2E 数。

`setup-label-check-failure.log` 保留 Q 断言初写时把真实中文“配料项”误写成“配方成分”的 2/3 失败。读实际原生文本后只修正断言标签，未修改页面或捕获，之后 3/3 通过。该准备错误不冒充产品 RED。

`EVIDENCE-SHA256.json` 封存本目录除自身以外的文件。本轮没有真实 GitHub/Cloudflare、发布/回退、L2、第二轮完整离线/SW 更新操作或用户视觉签收。
