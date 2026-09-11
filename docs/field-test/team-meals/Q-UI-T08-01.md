---
feature_ids: [team-meals]
topics: [acceptance, export, missing-information, RED]
doc_kind: finding-evidence
created: 2026-09-11
status: RED-owner-repair-required
---

# Q-UI-T08-01：复制清单遗漏实际缺项

这是可复跑的失败检查点，不是完整 T01–T09 通过声明。调度已确认原 T08/S09 要求，并派回 D 原负责人；Q 不改页面实现，不删除断言。

固定实现来源 `842b778bd352c0dba8921584ce142d94665e5ca2`，实际 packages tree `dce6d72208652c80d2aa5b40865bef4a56732226`，Web 生产等于已审 792/734。Node `v20.20.2`。正式 main/pages → 正式 C client → 本地 HTTP → 真实 B handler → 既有 FakeRepo，无真凭据/外部网络/发布/回退。完整源文件哈希在 `page-browser/source-integrity-842.json`。

## 原始浏览器现场

服务器命令（仓库根）：

```sh
PATH=/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin:$PATH npm --prefix packages/worker run build
PATH=/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin:$PATH node packages/web/test/e2e/team-meals/page-server.mjs
```

仅监听 `127.0.0.1:4271`，需允许本地监听。安装现有锁定 workspace 依赖；本次 pngjs 缺失时仅复用 D 工作区已装的 `pngjs@5.0.0` 只读链接，没有改依赖/锁。

实际打开 `/#/admin/plan/team-week`：无份数增加 9月15日早餐 first-dish；day 过滤后保存整份四餐；通过页面链接打开采购新建，清单名 `page-shop`，读取已保存范围后只选择 `2026-09-14/lunch`，生成全 check、保存，再设置 tomato buy+bought 与 salt available 并保存。点击真实“复制清单”，用浏览器原生 clipboard API 读取其内容。

- 清单 basis 为 `9d2e93483b9d16ab6f2e66161b1bcb337c20cedc`，属于 FakeRepo 后续模拟提交；不是最初临时 Git 发布 revision。
- 现场两道菜 first-dish / second-dish：页面显示 draft、缺采购规格、缺基准份数、缺用量。**现场所选餐次不含 name-only，也没有 components-unrecorded。**
- 实际复制文字 `page-browser/T08-zh-clipboard.txt` 只含标题、ID、basis、餐次、名称/判断、通用完整性提醒，没有上述具体缺项。
- `page-browser/T08-zh-copy-visible-dom.txt` 保留同一次真实页面与“已复制”状态；`ledger-T08-red-checkpoint.json` 保留请求与 handler 响应、受锁保存和固定 basis。

## 补充函数级 RED

```sh
PATH=/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin:$PATH node packages/web/test/e2e/team-meals/copy-missing-info.repro.mjs
```

该复现重新物化固定 Q 输入，通过正式 schema、producer，实际 esbuild 导入 D `shoppingCopy`。输入是全部原三餐，**额外包含 name-only 的 components-unrecorded**，与上面只选午餐的原生现场明确分开。revision 为确定性临时 Git `ab3f584656e1c85cad51a0ac3f6193fa2ff5f21d`。输出中连这一明确缺成分问题也消失；断言失败（exit 1），原日志 `page-browser/T08-copy-red.log`。之后的缺规格断言尚未执行，不冒称两个独立失败。

根因：`packages/web/src/pages/purchase-list.ts` 的 `shoppingCopy` 只接收 `Pick<TeamMealsProjection,'ingredients'>`，只拼材料名称及判断；`purchase.ts` 的 `copyPanel` 未将 collection/issues/estimate 的实际缺项纳入输出。需要原 owner 修复；同名不同 ID 在复制中也只有名字，按原 S09 的来源信息要求一并核查，Q 未额外定义输出格式。

## 准备失败与安全边界

`setup-01`：正式 producer 资产不可用，进一步直接运行正式像素校验定位为本地缺 pngjs；补只读依赖后同样图片解码通过。`setup-02`：macOS `/var` 与 `/private/var` 别名令 Vite HTML 路径错误，修正 Q server 为 realpath。`setup-03`：受限环境拒绝 loopback listen，授权的本地监听升级后 `setup-04` 成功。均保留原日志，不当产品 RED。

fixture 的 `manual` provenance 是显式测试输入变体，冻结 example 原件不变；正式 producer 不允许 example 冒充发布资料。步骤为本地测试文字，技法引用与图片复用既有合法字段。公开投影/图片由正式 producer 生成，初始 Git blob 与 FakeRepo blob 逐个核对。未读取或修改生产 data。
