---
feature_ids: [team-meals]
topics: [web, published-data, assets, cache, integration]
doc_kind: implementation-plan
created: 2026-09-11
---
# C2b：已发布资料读取边界

**Goal:** D 的 menu/prep 可读取真实发布投影及其同版图片，明确区分 published、C2a saved 和 draft。
**Acceptance:** manifest/投影/图片绑定一致；错误及跨部署缺失不回退；旧读取接口兼容且不把 team 当 legacy；旧请求不能污染刷新后的数据。
**Architecture cell:** RC-C 独占 data/types/main/pwa 等必要共享文件及自有测试，D 独占 pages/CSS；Map delta: none。
**本次交付:** 仅固定接口设计、失败状态和 A 的最少确认项。A 最终构建合同/实现获批后才实现 loader、测试和实测；不消费浮动代码、不运行新构建、不部署或外发。

## 输入证据与尚未批准的部分

- Web 基线 `99381cd3dd756e02463d7e0783a919798c614a1b`：`src/data.ts` 仅 legacy 四种读取，缓存键只有 URL，`clearCache` 仅清 Map；`main.ts` 从 loadBuild 取首个 plan；`pwa.ts` 探测新 commit 后提示刷新，controllerchange 只刷新 shell。当前实现没有 C2b 发布句柄或异步代次保护。
- 已批准 A0 `docs/specs/team-meals-contract.md` §4/6：正式投影、版本资产路径、外链 external-unpinned、静态发布与可变 ShoppingList 分开。A2 core `ad1f427` 的投影版本明确为字符串 `"1"`。
- 只读 A 工作树 `canteen-os-team-contracts/docs/modules/team-meals-build.md`；读取时为未跟踪草案，SHA-256 `fa4bec728007fad31d66e81af9c30f6bab184f1678cf10b43093862b349f3949`。未读/合入其浮动实现。草案描述 build.json、平铺投影加 estimates/assets/issues、版本目录原图；这里不把描述当作最终序列化合同或通过的构建证据。
- C2a 和 Q 的 C1+B2 本地证据不替代本合同、发布读取、页面或 L2 验证。
- 调度随后转达 A 的待固定设计决定：manifest projectionVersion 精确为字符串 `"1"`；`ownerPath=data/techniques.json` 的资产必须追加 techniqueRef，并保留原字段。已纳入下文，不作为可消费实现 SHA；A 仍在补完整 shape 与边界样本。
- 随后只读固定候选 `06f52b409696311465a85c2229deed09bb47127a:docs/modules/team-meals-build.md`：已有完整 TS、平铺输出、成功 warning/asset 状态、techniqueRef、空/无计划和命令说明。候选仍待原 reviewer APPROVE；未消费实现。builtAt/legacy target/路径编码/固定样本来源由调度集中交 A 确认，不重复另开询问。
- PWA 实证补充：现有 pwa.ts 的更新会调用 updateSW(true)、location.reload 和两秒强制 reload；这会结束整个 JS 会话。已安装 vite-plugin-pwa 1.3.0 的 `dist/client/build/register.js` 在 controlling/activated 中也可能重载，提供 onNeedReload 回调；其 `_reloadPage` 参数未被使用，不能靠传 false 保住内存。以上只作为本仓接线事实，不算新保护已实现。

## 给 D 的公共接口目标

在 `src/data.ts` / `src/types.ts` 暴露下列形状。A 的最终 wire 字段由 C 在边界适配；D 不猜输出目录、不 fetch ImageRef.src、不重算投影/估算。

```ts
type Publication = LegacyPublication | TeamPublication;
interface LegacyPublication { readonly kind:'legacy'; readonly manifest:BuildManifest }
interface TeamPublication { readonly kind:'team-meals'; readonly manifest:TeamPublishedManifest }
// TeamPublishedManifest 的最少 wire 字段见下文 A1；在正式确认前不新增这个类型的实现。
interface PublishedTeamPlan {
  readonly kind:'published';
  readonly target:'team-meals';
  readonly planId:string;
  readonly sourceRevision:string;
  readonly builtAt:string;
  readonly projection:TeamMealsProjection;
  readonly estimates:ShoppingEstimate;
  readonly issues:readonly PublishedIssue[];
}
// PublishedIssue 保留 A 的 kind/code 和原定位字段，不凭 message 反推原因/ID。
type PublishedAsset =
  | {kind:'available';sourceRevision:string;source:ImageRef;bytes:Blob}
  | {kind:'external-unpinned';sourceRevision:string;source:ImageRef}
  | {kind:'not-recorded'};

loadPublication(options?:{fresh?:boolean}):Promise<Publication>;
loadPublishedTeamPlan(publication:TeamPublication, planId:string):Promise<PublishedTeamPlan>;
loadPublishedAsset(plan:PublishedTeamPlan, projectionPointer:string):Promise<PublishedAsset>;
clearCache():void; // 保留原入口；同时使当前 published 代次及句柄失效
```

Publication 和 PublishedTeamPlan 都是本 reader 发出的冻结实例，含非导出的类型品牌及内部代次；复制/重建的对象不能作为读取句柄。公开对象不带锁、不带 ShoppingBasis，不能传入 C2a createList/decide 或冒充 C1 Source。`projectionPointer` 是该返回投影中的 ImageRef 地址，例如 `/dishes/<id>/steps/0/image`，不是原文件索引，更不是 URL。

`PageCtx` 新增 `publication:Publication|null` 和 `publicationError:PublishedDataError|null`；现有 planId/route/rest/lang/data/t 保留。main 原子更新 publication、planId、错误及 shell 的构建信息；加载失败仍允许不依赖发布资料的管理流程工作。D 根据 publication.kind 显式选展示入口，team 只调 loadPublishedTeamPlan；正常空计划依然展示名称和 meals:[]。

loadBuild/loadMenu/loadPrep/loadPurchase 保留签名及合法 legacy 行为。legacy manifest 缺 target 仍按已存在格式接受（包括既有 commit:"local"，不升级成真实 Git revision）；team 显式 target 才进入新路径。legacy sheet 方法遇到已识别的 team 发布返回 unsupported_target，不尝试已被清理的旧目录；team loader 遇到 legacy 也失败。未知 target/version 不被当作 legacy。PWA/main 改读区分 target 的 Publication，避免继续靠 legacy loadBuild 判断 team 发布。

## A 需正式固定的最少 wire shape（四项）

| 项 | 最少确认内容 | 为什么会阻止最终实现 |
|---|---|---|
| A1 manifest | 06f52b4 已列 builtAt:string(ISO)、commit 完整小写 40 SHA、排序 plans:Id[] 可空、target:"team-meals"、projectionVersion:"1" | 不猜测 number 版本；时间格式、legacy 显式 target 的剩余确认与最终批准仍待调度交接 |
| A2 projection 文件 | 06f52b4 已固定为平铺 `{...TeamMealsProjection,estimates,assets,issues}`，estimates:ShoppingEstimate、issues:TeamBuildIssue[]；成功仅 warning；空计划保留 menuPlans[id] 且各集合空，无计划仅 manifest | loader 校验 commit/revision/version/plan；出现 error 诊断的文件不可当成功发布。该类型与样本仍需随批准 SHA 交接 |
| A3 asset 映射 | 06f52b4 的 assets:TeamBuildAsset[] 保留 ownerPath/jsonPointer/source；成功只 available（含 path）或 external-unpinned（无 path）；技法资产必需 techniqueRef，其余 owner 不带该字段 | missing/invalid 属构建失败内存结果，不允许加载为成功发布。通过 techniqueRef 对应投影技法，不拿过滤索引或相同 src 配对；原 pointer 保留为来源地址。等待批准 SHA |
| A4 输出与字节约定 | 06f52b4 指定输出根默认 packages/web/public/data；team-meals/<plan>.json 与 assets/<commit>/<规范化data路径> 均相对该根；原图 bytes、替换输出可删旧版 | 路径编码及普通/空/警告/外链固定样本来源的剩余确认由调度集中收口。C 不承诺旧部署资源永久存在 |

以上只要求已有产物的固定字段和最小定位信息，不要求建立归档平台。如果 A 提供字节 hash/长度/Content-Type 字段，也须正式固定后校验；当前草案没有 hash，C 不虚构签名或宣称仅凭路径就完成密码学来源证明。同版原始字节的生成与不可变性仍由批准的生产者合同负责。

## 读取、资产与失败规则

1. loadPublication 校验完整 manifest 后建立代次内身份（完整数据根 URL、target、version、commit、builtAt、plans）；builtAt 只参与区分产物，不充当 sourceRevision。loadPublishedTeamPlan 只接受该句柄及其 plans 中的 id；读取一次目标文件，校验版本、revision、plan 和必要结构后才返回冻结视图。选择、collection、estimates 和 issues 保留批准产物，不在 Web 调 core 重建。
2. 不通过另读一次 manifest 把旧投影“变成新版本”。manifest A + projection B 必须报 revision_mismatch；所有失败不换当前 Worker/Catalog、legacy sheet、其它 plan 或其它 revision 来补齐。合法空投影与文件缺失分开。
3. loadPublishedAsset 先检查句柄和合法 ImageRef 位置，再通过 A 的绑定定位原 owner/pointer/source/path。source 必须与该投影字段的原 ImageRef 深相等；映射重复、缺失、错位、未知 status、仅检查态的 missing/invalid 或 available 缺 path 均报 asset_binding_invalid。合法可选字段没有 ImageRef 才返回 not-recorded。
4. available 的 repoPath 依 A0 解析：相对 src 从原 owner 文件目录算，显式 data/ 从仓库根算；最终仅在 data 内。输出 path 必须等于批准规则生成的 `assets/<视图revision>/<repoPath>`。拒绝绝对/跨域路径、越界、非法编码及规范化歧义；拼接须留在当前部署的数据根，不接受 API 代理 URL。technique 原地址不能从投影数组索引重建。
5. 只请求绑定后的静态字节，拒绝非成功响应、重定向、HTML/JSON 冒充图片及不合批准约束的响应；返回 Blob，由页面创建并在卸载时释放 object URL。原 ImageRef 不被改写成 asset URL。external-unpinned 原来源只作文字/明确来源链接，无图片请求；即使网络能打开原 URL 也不是同版图。
6. 旧页面 A 在部署 B 后请求已移除的 A 图片/文件，明确显示该版资源不可用；不请求 B 同路径图。内存里仍完整的一套 A 可作为旧版阅读，但不能标成最新。缺文件不自动恢复或下载整站归档。

`PublishedDataError extends DataError` 保留 url/status/cause，增加 code、stage(manifest/projection/asset) 和已知 sourceRevision。码：`unavailable`（stage+HTTP/网络细节）、`invalid_data`、`unsupported_target`、`unsupported_version`、`revision_mismatch`、`plan_not_published`、`publication_changed`、`asset_binding_invalid`、`asset_unavailable`。external-unpinned/not-recorded 是显式结果，不伪装成功图片；页面不会把上述错误全写成“空菜单”。未知诊断原样保留，不编造修复或隐藏 warning。

## 生命周期、缓存与 PWA

发布数据的唯一 owner 是共享 data reader；持久层不新增 CacheStorage/localStorage/IndexedDB。对象普查：reader 代次、manifest/plan/asset 请求及缓存、冻结句柄；应用更新协调器拥有更新意图/检查令牌，C1 editor 仍唯一拥有所有文档草稿与 pending 操作。PWA 后台探测只产生更新提示，不另存活动发布状态或复制草稿。

| 状态 × 事件 | 必须成立的转移 |
|---|---|
| 未加载 × loadPublication | 同一代次并发共享请求；通过校验后才发布句柄 |
| 已加载 × 语言/路由切换 | 沿用同一已校验发布，不清数据、不把原始索引重排后复用 |
| 任意 × clearCache / 显式 fresh | 先递增代次并清除缓存/句柄，再加载新 manifest；旧已发请求即使无法中止，resolve/reject 都不能写入新缓存或 main 状态 |
| G1 失败晚到 × 同 URL 的 G2 已建立 | 只允许失败清理其自身 Promise；不能 delete G2；旧调用返回 publication_changed |
| PWA 后台发现不同身份 | 只提示更新；不在用户阅读中静默换 manifest/资产。比较含 target/version/commit/builtAt，而非仅 commit |
| 普通 controllerchange / 仅刷新已发布资料 | 只使 reader 失效并由 main 重读发布资料；不调用 updateSW/location.reload，不 dispose/recreate C1 editor，不清草稿/pending。阅读页更新 PageCtx，编辑中的视图不能借刷新被重置；重复通知幂等 |
| 用户点击“更新应用” / 插件要求脚本重载 | 进入下述重载检查，不直接刷新。整页重载会丢失内存会话；不能写成 C1 保留。后台/外部控制器事件没有用户更新意图时仅提示 |

### 整页更新与 C1 编辑会话

更新提示出现只表示有新版本，不保存、不切数据、不触发 SW 激活或整页刷新。只有用户请求“更新应用”才进入检查；“仅刷新已发布资料”仍是上表的 reader 操作，两者不共用一个名为 reload 的模糊入口。

检查须覆盖同一认证应用生命周期内**全部 editor 的全部文档**，含已经离页的记录。现有 getState/subscribe 只面向当前文档，不能用它们推断全局安全；dispose() 既会破坏无 pending 的草稿，也只用 pending 判断能否释放，不能拿它作探针。实现阶段由 C 在自有 edit-session 共享层补无副作用的全记录安全摘要（identity、dirty、pending/recovering、phase、generation），与应用级编辑器生命周期绑定；PWA 不接触正文、令牌或 pending body，不依赖 D 每页临时注册才发现文档。导航/invalidate 不移除保护；所有完成/失败/核实结果，包括离页文档，都须使检查令牌过期。仍未接入共享摘要的可编辑入口视为状态未知，先延后重载，由 D 接入共享边界，不能默认为零阻断。

| 全记录检查结果 | 给用户的行为与可理解选择 |
|---|---|
| 任一 saving 或 pending 请求 | 延后重载，说明“有资料正在保存”。提供“继续等待”/“查看保存中的资料”；不取消请求、不提供强制丢弃更新。完成后只提示可重新检查，不自动执行旧更新意图 |
| 任一 outcome-unknown 或 recovering | 延后重载，说明“保存结果尚未核实，刷新会丢失核实所需信息”。提供“先核实保存结果”/“稍后更新”；核实走 C1 已有只读 reconcileUnknown，禁止无锁重试、自动保存、清 pending 或计时后越过检查。结果仍未知则继续阻止应用发起重载 |
| 无 pending，但有 dirty/conflict/未保存 error | 默认“继续编辑”；另可明确选择“丢弃 N 份本地未保存更改并更新”，列出文档标识。该选择只授权放弃当前列出的本地版本，不保存、不撤销已完成的服务端写入。用户也可回到原编辑入口显式保存/处理冲突后重新请求更新 |
| 无 pending、无未保存更改 | 用户本次更新请求可继续；saved-but-unpublished 不等于仍有未保存更改，也不表示更新操作会替用户发布资料 |

弃稿确认绑定检查时的完整文档集合与 generation；等待期间任何编辑、开始保存、离页完成、认证变化都会使确认失效，必须重新检查，不能用旧确认丢弃新输入。执行 location.reload 前还要同步重查，核实失败/未收到完整摘要则延后。不能只检查活动页，也不能“保存完成后自动刷新”而忽略随后输入。

所有整页重载入口由同一协调器约束：pwa.ts 直接 location.reload、updateSW 后插件 controlling/activated 的 onNeedReload，以及旧两秒兜底。实现使用已安装插件提供的 onNeedReload 接入协调器；不能靠 updateSW(false)，该版本忽略该参数。正常 controllerchange 保持 reader-only；插件通知如果无有效用户更新意图或检查变为阻断，只保留更新提示。两秒兜底改成“更新尚未完成，请重试”的状态，不保留绕过检查的强制 reload。调用 updateSW 和最终重载之间即使又发生编辑/保存，最终检查仍须阻止整页重载；重复事件最多执行一次有效重载。

这是应用发起更新的保护，不是持久草稿恢复平台。用户强制刷新/关闭、浏览器或进程终止仍会丢失内存；可在存在阻断时使用浏览器原生离页提示作尽力保护，不宣称它在所有平台都能阻止离站。普通 reader 刷新后 C1 的 identity/generation/draft/pending 必须保持，而合法整页重载之后旧 JS 会话确实结束。

请求/缓存键含完整数据根、代次、已知产物身份和完整对象地址。刷新与探测明确使用 no-store 和独立刷新参数；**no-store 本身不证明绕过 Service Worker**。现有 VitePWA 预缓存全部 data JSON、运行时图片为 CacheFirst，必须在最终生成的 SW 上实际验证请求匹配。静态图经受控 fetch 返回 Blob，不能再让页面用原 src 进入通用图片缓存。若现有 SW 不能满足规则，交调度/CI owner 明确最小配置改动；C 不越权修改 vite/package/CI 或把旧缓存当新响应通过。

## 获批后的实现与验证顺序

1. 调度确认 A1–A4 的最终合同、实现 SHA 及输出样本；C 对照本文件更新已固定 wire 类型，D 消费公共接口，暂不 import 不存在的 loader。
2. 在 C 自有 Web tests 写红例：A manifest/B projection、错误版本/target、缺文件/HTML、旧发布 A 资产在部署 B 缺失、外链零请求、未选技法在前且两个选中技法图片相同的 techniqueRef 关联、路径越界、复制/失效句柄、G1 迟到成功/失败不影响 G2、legacy 明确分流、真实空计划。随后实现 data/types/main/pwa 必要接线，不复制 A 算法。
3. 用 A 固定输出验证普通/空/警告/外链及原 ImageRef 不变；用真实生成的 PWA 做 A→B/离线/更新实测。测试区分内存缓存与 SW 缓存，包含同 commit 不同 builtAt/target 的变化；必要共享配置需求先交 owner。重载矩阵必须覆盖离页 dirty/unknown、多文档 saving、确认后又编辑/保存、核实仍未知/成功后仍 dirty、外部 controllerchange、插件 onNeedReload 和两秒超时；阻断时 save/updateSW/reload 均不被更新提示触发，reader-only 时 C1 正文/代次/pending 深相等，clean 或有效弃稿确认才允许一次显式重载。
4. Web 回归/typecheck/build、固定提交 diff-check、非作者 review；D 接入后的页面/语言/视口验证与 Q L2 分开报告。当前仅为文档合同，无 loader、PWA 或页面通过声明。
