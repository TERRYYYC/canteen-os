---
feature_ids: [team-meals]
topics: [web, pwa, browser, auth, verification]
doc_kind: validation-evidence
created: 2026-09-11
---
# C2b 分层证据（尚未整体完成）

本文件区分固定共享代码、真实生成 SW 辅助站、D 页面与 Worker/L2。所有操作都在隔离本地工作树或临时回环测试站完成；没有远程 push、PR、部署或真实发布。测试 editor/操作为明确 mock；静态数据由正式 A 生产者生成。

## 有界独立批准

| 固定代码 | 原非作者证据 | 边界 |
|---|---|---|
| d8bb56875e927a08627f480473895bdbd5c75a21 | c1_review APPROVE；123 共享、Chrome 12、畸形 URI 288/合法编码 24；/private/tmp/c2b-shared-review-d8bb568-24ISwM/REVIEW.md | store/auth/pure peek/reload；未含完整 published/main/PWA |
| 65f6641bb3ca20b5e474d07e8903eaeb02e141c8 | c1_review APPROVE；API34、120 合成 GET；/private/tmp/c2b-publish-terminal-review-65f6641-SoKjAl/REVIEW.md | 仅可选发布终态字段，D 仍须已知 runId 精确关联 |
| 27867290bd6da40e06e7b6d28b886de9a073503f | c1_review APPROVE；130 共享，含 A 初始化→B 同页→旧 A 取消；/private/tmp/c2b-aux-auth-review-2786729-AHBXU4/REVIEW.md | aux 票据与 coverage 认证隔离；5885f8f docs 后缀 Web 零差异 |
| 873526e6c0ec29dde677a88fddc68208bdd28065 | 调度非作者 APPROVE；父5885，仅 types.ts 注释/可选 setReloadCoverage 共2行 | 独立小分支供 D，未附 reader/publication/runtime |

## c7785 固定候选的真实浏览器矩阵

代码 SHA `c7785a990c49e7dd28aaad690516893276b2620c`，包含已批准 278/5885 认证修订。测试目录 `/private/tmp/c2b-real-sw-SdkTLg`，回环站 `http://127.0.0.1:58080/canteen/`，IAB tab 6。构建前后核对 `a/src` 与固定候选 `packages/web/src` 全目录无差异。测试脚本为该 SHA 的 pwa-browser-server.mjs / pwa-browser.html，配置是 CI 已审配置，未注入伪 SW。

三份产物均由正式 A 构建器在真实临时 Git 生成：A `ffb846a75b7b44c801100b50e0f9fd54d75f46ee`；A-time 同 commit、builtAt 从 September 11 改 September 12；B `d573843bb1aa202de758787d6395d8bac4504062`。A 红色 PNG SHA256 `c82ddb86afafe7f6410d8bc7f50c0ec8a38deea8a3b65d899d02a10e8824a111`，B 蓝色 PNG `d02fd4c0ba6964848ff3a04d6a6d53b049736e05ff23004fd32ecc1a10ed5878`。

| 实际浏览器操作 | 观察结果 |
|---|---|
| 在线初装 A，打开 tomato | controller 已接管，boot1，原 A 字节 |
| 来源断连，整页重载清内存 | boot2；预缓存 A JSON 仍可读，已打开 tomato 从 SW 返回同字节 |
| 离线打开 never-opened egg | asset_unavailable，没有假装全部图片已离线 |
| 显式淘汰 tomato 后离线整页重载 | boot3；A JSON可读，tomato asset_unavailable |
| 切到同 commit 的 A-time，Check new version | 有更新提示；活动 manifest 仍为 A 原 builtAt，不静默采用探测值 |
| C1 dirty 后切到另一文档，点击更新 | 对话框列出离页 dish；默认聚焦 Continue，可明确弃稿 |
| C1 held save 后切离页，点击更新 | 仅等待，没有弃稿强刷；没有额外写入或重载 |
| 丢失保存响应，回原 unknown 文档 | unknown；更新只有继续编辑选项 |
| 外部激活真实 waiting SW | boot3 不变，controllerRefreshes1，发布变 A-time；C1 state 深比较完全一致，writes1/reads0 |
| 手动仅刷新 published data | boot3；C1 state 同样深相等，writes1/reads0 |
| 显式 reconcile known miss | not-saved、dirty，writes1/reads2，无自动重载 |
| 辅助 write ticket busy / unknown | 两种都拒绝强刷；只有明确结束测试操作后解除 |
| 来源切 B，A 未缓存图片请求 | asset_unavailable，不回退 B 图片 |
| dirty 辅助缓冲获得弃稿同意；真实 controllerchange 中产生新输入 | 接管 B 后 boot3，aux generation5 dirty；旧同意失效，未整页重载 |
| 对新快照再次明确弃稿 | boot3→4，仅一次整页重载；B 蓝图同已记录字节，新的 mock 会话 writes0/reads0 |

来源断连由只读本地服务器关闭连接模拟，不是 navigator.onLine=false。整页重载用于排除 JS 内存缓存；没有把仅刷新 reader 当作重启。pwa-browser 使用实际 pwa/data/C1/aux/shell，但是明确的测试编辑界面，不是 D 页面或 main 实际页面组合。

更早的 `/private/tmp/c2b-real-sw-pgXHtJ`（旧配置 RED，fetch 图片离线失败）、`tK4a3u`、`v6GO7e` 都仅为历史，不替代以上最新已审 aux 认证之后的固定候选证据。

## c7785 之后的变化与检查

- `98d99652a08492fa8334030596733d75c87b0d0b`：非作者发现私有 asset.source 可变；正式 external/image fixture 红→绿，冻结 binding/source。published tests 13。日志 `/private/tmp/c2b-asset-source-red.log` / `c2b-asset-source-green.log`。上表不声称包含该后续修订。
- `28eb30f8c572a466215f82935bbfc54f8d9cb33b`：C1 正常 auth seal 旧未决保护修订，见 C2b-c1-auth-pending.md。全 Web 152 通过 `/private/tmp/c2b-web152.log`；原生 SW 正常 auth 场景追加进行中，不能将 c7785 的无登出矩阵冒充该修订已验。
- 实际 pwa.ts 的受控插件/DOM/时钟测试证明两秒后取消同意、晚 plugin callback 不强刷、重复 controllerchange 幂等、旧会话无私有 ID 提示。这个测试不是实际浏览器时钟或真实 SW 证据。
- c7785 实际 main 入口 Vite 构建成功，输出 `/private/tmp/c2b-web-application-build`，36 precache；当时 144 Web tests 通过。当前整树 typecheck 仍有旧 D import/plan 共五处 AnyMenuPlan 错误；不作通过声明。

完整固定代码的非作者审查仍进行中（原 reviewer 曾因服务 at-capacity 中断，保持同一身份/模型有限重试）；D 完整已审页面历史尚未组合，三语言/视口/main 实際流程与真实 Worker/L2 仍待验收。
