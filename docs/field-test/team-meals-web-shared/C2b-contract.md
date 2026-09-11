---
feature_ids: [team-meals]
topics: [web, published-data, assets, cache, integration]
doc_kind: implementation-contract
created: 2026-09-11
---
# C2b：已发布资料与应用更新边界

目标：D 的 menu/prep 读取真实发布投影及其同版图片，明确区分 published、C2a saved 与 draft。清单/投影/图片版本一致，缺失不回退，旧请求不能污染刷新后的数据。C 独占共享 data/types/main/pwa、view-models 和自有 Web tests；D 独占 pages/CSS；CI 独占构建配置。此文件记录实现合同，不是整份 C2b、页面组合或 Q L2 已通过的声明。

## 已固定的输入

- A 构建实现 `06f52b409696311465a85c2229deed09bb47127a`，已批准交付 `8cff8538f36557203b28d1021419370b563ff1e8`，本地完整历史合入 `41290adfe4f55f7749b6c084f48071ae20727f21`。正式 wire 见 `docs/modules/team-meals-build.md`；不再等待原草案确认。
- A 精确份数解析修订 `24d7359b8d478ee816e8e187599478e1420aa693` 已批准，本地完整历史合入 `51be4d9b614a871e94723201dfbf5e50c48d198f`。C 不复制解析算法。
- CI 静态发布资产缓存 `0ae16a964d9164c3b296595d96f2833939a075d4`（父 `41afcd09001d87f2882848849db97fe5aa8c0db2`）已由原审查者批准，本地完整历史合入 `3758aee1f1fe412e35b0971616d73761c7c03cff`。其配置覆盖 fetch 请求的空 destination；C 没有修改 vite/package/lock。
- C2a code `531aa266ab0368257c7522867a5cdcb6b477fc5d`、docs `99381cd3dd756e02463d7e0783a919798c614a1b` 已独立批准。saved source、ShoppingBasis、ShoppingList 决策仍由 C1/C2a 持有，不能从发布视图造写入依据。

| A wire | 读取边界 |
|---|---|
| build.json | target 精确 team-meals；projectionVersion 字符串 1；commit 完整小写 40 SHA；builtAt 为 Date.parse 有效的原始字符串，不强制改成 ISO；plans 为唯一 ID 列表，可空 |
| team-meals/<plan>.json | 平铺 TeamMealsProjection 加 estimates/assets/issues；sourceRevision 与 manifest.commit 一致；版本 1；单个 menuPlans[id]；成功 issues 只允许 warning |
| 空/无计划 | 合法空计划保留自身、meals 空；无计划 manifest.plans 空，不能把缺文件当作空计划 |
| asset | ownerPath/jsonPointer/source，available 含 path；external-unpinned 不含 path；技法额外 techniqueRef，原始数组 pointer 保留 |
| path/bytes | assets/<commit>/<规范化 data 路径>；输出原始 PNG/JPEG/WebP，生产者负责完整解码及尺寸/大小约束。当前 wire 没有 hash，reader 不虚构密码学来源证明 |

## 给 D 的接口

`src/data.ts` 暴露 Publication（legacy/team-meals）、PublishedTeamPlan、PublishedAsset、PublishedDataError 和共享 dataApi：

```ts
loadPublication(options?:{fresh?:boolean}):Promise<Publication>;
loadPublishedTeamPlan(publication:TeamPublication,planId:string):Promise<PublishedTeamPlan>;
loadPublishedAsset(view:PublishedTeamPlan,projectionPointer:string):Promise<PublishedAsset>;
clearCache():void;
```

Publication 和 PublishedTeamPlan 是 reader 发出的冻结实例，使用非导出品牌与 WeakMap 绑定代次。复制、重建、其它 reader 或过期对象不能作为句柄。PublishedTeamPlan 包含 kind:published、target:team-meals、planId/sourceRevision/builtAt/projection/estimates/issues；没有写锁或 ShoppingBasis。诊断保留 code、kind 及生产者定位字段，不根据 message 猜含义。

PublishedAsset 为 available（sourceRevision/source/bytes:Blob）、external-unpinned（sourceRevision/source）或 not-recorded。projectionPointer 指返回投影中的 ImageRef 位置，如 /dishes/<id>/steps/0/image，不是原文件 pointer 或 URL。D 不拼图片目录，不 fetch ImageRef.src，不重算投影/估算；available Blob 的 object URL 由 D 在卸载时释放。

PageCtx 增加 publication 和 publicationError，保留既有 planId/route/rest/lang/data/t，另有本次 render 的 setReloadCoverage 回调。main 原子替换 publication、planId、错误和 shell 信息；发布读取失败仍允许独立管理流程工作。首次读取后画页；后续仅刷新发布资料时只重画只读页，不替换 admin/purchase 的编辑 DOM。

loadBuild/loadMenu/loadPrep/loadPurchase 保留合法 legacy 行为。缺 target 的既有 manifest（含 commit:local）仍为 legacy；显式未知 target/version 不降级。legacy sheet 方法遇 team 返回 unsupported_target，team 方法遇 legacy 同样失败，不尝试其它目录。

## 读取与失败规则

1. 校验 manifest 后才发出句柄；team loader 只读取它列出的 plan。投影 revision/version/plan 和必要结构不匹配即失败，不换 Worker、Catalog、legacy、其它 plan/revision 补齐。
2. 图片先匹配完整 owner/pointer/source。source 与投影原 ImageRef 深相等；重复、缺失、错位、未知 status、available 缺 path 均 asset_binding_invalid。合法可选位置没有 ImageRef 才 not-recorded。
3. 技法资产用 techniqueRef 对应过滤后的投影数组；不使用原数组索引，也不按相同 src 配对。真实生产者样本覆盖前置未选技法与两个选中技法使用相同图片。
4. 路径是字面 POSIX 文件路径。owner 相对 src 或显式 data/ 解析后必须留在 data 内；拒绝绝对路径、反斜线、NUL、scheme、越界及错误版本目录。大小写、Unicode、百分号、问号、井号保留为文件名；URL 每段编码一次，不先解码文件名。
5. available 只请求绑定后的静态路径，GET、omit credentials、拒绝 redirect。响应必须成功、PNG/JPEG/WebP MIME、非空且不超过 200 KiB，头字节不能是 HTML/JSON。完整图像解码由 A 生产者负责；Web 的头字节检查不是完整解码。
6. external-unpinned 返回明确状态，不发图片请求。旧 A 在 B 部署后缺失的文件报该版资源不可用，不能读取 B 同名图片冒充 A。
7. PublishedDataError 保留 url/status/cause，增加 code、stage(manifest/projection/asset) 及已知 sourceRevision。码包括 unavailable、invalid_data、unsupported_target、unsupported_version、revision_mismatch、plan_not_published、publication_changed、asset_binding_invalid、asset_unavailable。不能把错误统称空菜单。

## 数据生命周期与真实 SW 缓存

reader 是活动发布数据的唯一 owner；不增加 localStorage/IndexedDB 或另一份发布状态。代次内共享请求；clearCache/fresh 先增加代次并使所有旧句柄失效。旧 resolve/reject 都返回 publication_changed，失败清理只针对自己的 Promise，不能删除 G2 请求。

普通初始 JSON 请求可命中既有 SW precache，以支持重启后的离线阅读。显式 fresh/clear 及 probe 使用独立 __publication 查询参数，必须实测绕过预缓存；no-store 自身不是证据。probe 只比较完整 manifest 身份（包括 target/version/commit/builtAt/plans），不采用其结果。

图片路径含 commit，保持无刷新参数，命中 CI 提供的 published-assets CacheFirst。缓存最多 300 项、30 天，仅同源且部署 scope 下 assets/<40 SHA>/非空路径、成功 200 响应。图片不全部预缓存；从未打开、被淘汰、旧部署已删除的图可能不可用。实测须先整页重载清掉 JS 内存，再验证 SW 缓存，不把内存命中算成离线缓存。

## 整页更新保护

共享全记录检查覆盖全部 C1 文档、草稿/handoff、辅助缓冲与操作、未完成页面登记，含离页 owner。详细接口分别见 C2b-store-auth-contract.md、C2b-aux-contract.md、C2b-aux-auth-contract.md。检查只读，不保存、reconcile、dispose、观察认证或复制正文；无法纯验证身份时只给通用 unknown，不输出旧身份/凭据。

| 全记录结果 | 应用更新行为 |
|---|---|
| saving / busy / pending | 继续等待，不能弃稿强刷 |
| outcome-unknown / recovering / 不完整状态 | 回原编辑器核实，不能自动重试写入、清 pending 或计时越过 |
| untracked 编辑页面 | 暂缓，页面完成 owner 登记或明确结束本地初始化后再检查 |
| 只有 dirty | 默认继续编辑；明确列出文档后，用户可放弃当前列出的本地更改并更新 |
| clear | 本次用户请求可更新；不替用户发布 saved-but-unpublished 资料 |

同意绑定完整记录集及 generation；任何新输入、开始/结束操作、认证/owner 变化都会使它失效，最终重载前同步再查。更新提示本身不保存、不激活 SW、不采用新 manifest。installed/waiting 只出提示；正常 controllerchange 只刷新 reader 和 shell，保留编辑 DOM。外部/plugin 通知没有有效用户意图不能重载。

当前插件忽略 updateSW(false) 的参数，必须接入它的 onNeedReload。直接重载、插件回调和旧两秒兜底均经过同一协调器；超时改为取消同意并提示重试，绝不强制刷新。有效同意最多重载一次。整页重载会结束旧 JS 会话；beforeunload 仅为尽力保护，不承诺浏览器强关/崩溃可恢复内存。

## 验证与尚未完成部分

published-data.test 使用正式 A 构建器从 Q golden 输入在临时真实 Git 生成普通/空/警告/外链及真实 PNG，不另造平行生产样本。reload/store/aux tests 验证 metadata、认证和多文档生命周期；pwa-integration.test 使用实际 pwa.ts/C1/协调器与受控插件/时钟验证超时和晚回调。它不是浏览器或真实 SW 证据。

pwa-browser-server 使用正式生产者和原 vite.config 生成 A、相同 commit 不同 builtAt、B 三套真实 SW，并只在回环地址供浏览器验证；pwa-browser.html 使用明确 mock editor 和真实 data/pwa。实测结果另见 C2b-evidence.md，需区分所测固定代码与后续改动。

当前旧 D 页面仍有五处 AnyMenuPlan 类型错误；共享测试与构建通过不等于整树 typecheck、D 页面组合或真实 Worker/L2 通过。最终须消费调度释放的 D 固定历史，完成主入口/编辑页/三语言/视口组合，再作固定代码的非作者 review。无远程 push、PR、部署或生产写入授权。
