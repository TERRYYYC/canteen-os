---
feature_ids: []
topics: [team-meals, pages, interface, lifecycle, design]
doc_kind: implementation-plan
created: 2026-09-11
status: proposed-for-review
---

# D0 — 小团队页面实现契约

Goal: 排日期、餐次和菜品，份数可留空；看到全部已录材料与来源，以人工判断本次待买/已有，并查看同版资料。
Acceptance: 设计工作区 STANDARD-DATA-AND-ACCEPTANCE.md T01–T09；C01–C12 为兼容依据。顾客/订单/反馈/报告、库存流水、永久菜单行 ID、完整归档平台不在范围。
Architecture cell: RC-D pages。Map delta: none；仅消费 C 共享接线及 A core。前端验证: Yes，zh/en/uk × 393×852、1440×900。

## 2026-09-12 高保真更新（当前视觉依据）

本轮以 `canteen-os-design@2f890d8f182d02e8ed4acb55a865e8aa086416dd` 的绿色 Reference v3 为唯一视觉来源，先对齐 S08 / `[data-screen="plan"]` 的实际 main/router 排菜页。原 screens-v2/backoffice-v1 的“定稿”不再决定本轮字体、配色、导航和布局；下方旧实现记录仅作行为历史。

必须对齐绿色主色、浅背景、无衬线层级、紧凑日期/餐次、图文菜品行、主要动作和核心导航。小团队差异：份数可空且旧值保留，不显示人数/总份数，不补1；采购仍为人工判断，不引入预算/库存/顾客模块；原型工具栏、假状态栏不进入应用。渐进编辑保留新增、改菜、删除和份数能力；C1保存/冲突/unknown/迟到ACK/导入保护不变。

在既有 D 页面/CSS范围外，本轮明确增授 `src/shell.ts` 导航呈现、必要本地化和对应壳测试；API/认证/编辑会话/router语义/core/Worker不改。临时样本可采用绿色稿同菜名与图片，走正常受控资产读取，不改冻结data或Q共享样本。

顺序：先实际排菜代表页的中文393×852截图与可点击预览（最迟2026-09-12 08:30 UTC），由调度对照方向；再决定菜单/采购/详情扩展。第一检查点只做相关日期/份数/新增/保存/采购、至少一个非happy path及共享外观兄弟页抽样。长语言、桌面及后续独立审查按实际变化收口，不以全套历史矩阵阻塞可见成果。依据：调度feature-specs顶部“2026-09-12 高保真更新”。

## 输入及状态

工作区 `canteen-os-team-pages`，分支 `codex/team-meals-pages`，base `5b8bdd50d1775cce441d0457f6be7f589a7bb673`；C1 实现批准对象 `1575f2b4768938c0efcc8a9c5db7c9c25096c738`。原主仓脏改动不碰。历史选择 screens-v2/backoffice-v1 已由上方2026-09-12更新替换；本目录 screens.html 是本次页面设计提案，尚无视觉签收。原 2026-09-07 定稿和 PR #91 不代替本次批准。

四份未提交输入由 `/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-design/` 绝对路径读取，未复制覆盖：

| 文件 | SHA256 |
|---|---|
| feature-specs/2026-09-10-data-hld.md | ab0e68deb104872c2d5f55ae09ef666a567c1de1226390a6976e808f310c22ad |
| feature-specs/2026-09-10-reference-v3-integration.md | a887edc526c6a7eeb0bc80f582c456e19c0dc8284a83820fd25d55b95e24dd9c |
| docs/design/reference-v3/SCREEN-CONTRACTS.md | e05d43554181c4ebed52269d7f20cafd8b35d4d687e56c8ae52b127684ce3652 |
| docs/design/reference-v3/STANDARD-DATA-AND-ACCEPTANCE.md | 6aaff3f33b65aad6f6952297abae9dd2dafef379bcc0fa64066c07f5300f0352 |

## 文件 / 路由 / 数据需求

| 文件 / 入口 | 读取 / 主操作 | Shared owner C 的需求 |
|---|---|---|
| pages/admin/plan.ts、plan-form.ts、plan.css；#/admin/plan/<id> | AnyMenuPlan，v3 保存；日/周筛选；可选份数；添加删除菜；预览 | C1 TeamMealsApi + edit-session；C2 local-preview candidates；读当前 plan 后固定同版 catalog；导入 store 的 AnyMenuPlan 兼容 |
| pages/purchase.ts、purchase-list.ts、purchase.css；#/purchase[/<listId>] | 清单 ID 打开/新建，日期餐次选择，候选，人工判断，复制 | C2 固定输入 loader、collect/reconcile/estimate 结果与问题；C1 ShoppingList editor |
| pages/team-details.ts；#/purchase/<listId>/ingredient/<id> 或 dish/<id> | 同版三语材料、配方、技法、clip、ImageRef 许可；当前资料另入口 | basis.sourceRevision 下 Source/Catalog/Asset；不得旧版失败回退当前 |
| pages/menu.ts、prep.ts 及 CSS；原入口保留 | 日期餐次/菜品；全部配料、原配方用量和步骤；可算时独立参考 | C2 published 固定输入 loader；不依赖旧数量 sheets，不用当前 Catalog 补已发布资料 |
| pages/admin/dish-new.ts 及局部文件 | AnyDish、未知 qty 保留；草稿/active 为明确动作 | C1 AnyDish + editor；不走严格旧 Catalog/Dish 读边界 |
| pages/admin/import.ts、home.ts、ingredient-new.ts、publish.ts | 必要的旧入口兼容，保留原真值、发布独立状态 | 共享 store AnyMenuPlan/字典等若需变更由 C 提供 |

现有 main.ts 已将 rest 交页面，router 无需新增顶级入口。详情导航编码 ID；非法形状显示无法读取。不在 URL 放凭据或草稿。页面专用三语字典按 PageCtx 既有契约放 pages/team-copy.ts；全局标题/导航更名仍交 C。计划到采购仅带资源 ID，已保存来源版本由读取结果得出；本地预览不生成假 SHA，不创建持久清单。

## 状态与不变量

| 对象 / 唯一生命周期 owner | 事件与转移 | 不变量 / 对抗验证 |
|---|---|---|
| Plan editor / C1 session，D 持有单实例 | 初读→clean/new；edit→dirty；save→saving→saved-but-unpublished/conflict/unknown | INV-D1 全计划写，过滤只改显示；旧份数与可选字段保留；最后一餐删除保存 meals:[]；无自动默认份数 |
| 编辑视图 / D | 语言变 refreshView；路由离开 invalidate；返回 open 恢复；异步加载只在当前 el/auth 生效 | INV-D2 不用 open/replace 清未决写；迟到回调不得覆盖后续编辑；新 auth 重建 owner；读失败不当404 |
| 保存结果 / C1 | 冲突保留草稿→显示远端比较→显式采用来源；unknown→reconcileUnknown 两次强读 | INV-D3 原条件头不撤、不重试未知；保存中仍可输入；状态明确模式与保存/发布差别 |
| Shopping editor / C1，需求变更 / A core | 新建 all check；改范围/版本→正式reconcile→展示 affected/removed→完整文档保存→另次人工确认 | INV-D4 basis/items 原子写；不能把判断偷偷套用新需求；撤菜不撤购买；只写 ShoppingList |
| 同版资料 / C loader；DOM资产 / D | 加载 basis revision→同版来源/图片；另点 current→明确当前版本；离开 revoke URL | INV-D5 缺资料/图可见；无当前图片兜底；旧请求、跨语言/路由响应不能混版 |
| 候选/估算 / A纯函数，C编排 | 固定输入/本地稿→派生结果，不另存 | INV-D6 全部已录引用含适量/缺包装/缺基准份数；同ID去重保留来源；coverage问题可定位；部分小计不称总需求 |

真实模式配置不代表连接健康；未配置显示未连接/不可保存。显式 mock 验证必须显示“模拟演示，未写入真实仓库”，不能说已同步。离线状态可见；私有资料不承诺持久离线缓存。

## 页面与实现顺序

1. 本目录设计稿先于代码：计划、清单、材料/菜品详情、menu/prep、Dish 编辑各屏及缺项/冲突/unknown 状态。每屏登记 sourceSelector/viewport/lang/state；approvedBy/At 均待确认。
2. D1-plan：先页面行为红灯，覆盖可空份数/整计划保存/最后删除/C1 保存期间编辑和语言/unknown；再实现，固定提交。
3. D1-shopping/detail：只接固定审过 C2；新建及人工判断、换范围reconcile后二次确认、导出和同版详情先红后绿。未审 C2 不复制算法填空。
4. D2：menu/prep 原资料；Dish/import 必要双格式兼容；同样保留行为红绿及未覆盖边界。
5. quality-gate→非作者 review→receive-review 修订。页面作者自测不算独立批准；Q E2E 目录不写。

实际命令从包脚本核实：`npm --prefix packages/core run build`、`npm --prefix packages/web test`、`npm --prefix packages/web run typecheck`、`node scripts/build-data.mjs`、`npm --prefix packages/web run build`、`git diff --check`。新增页面专项测试用 `node --test packages/web/test/team-meals-pages*.test.mjs`。浏览器 4182；无 Redis。无本仓 formatter，使用 diff-check；不扩改包清单/锁文件/CI。

## 待接线与证据边界

C2 导出与 approved SHA、B2 明确放行、新 build 同版资产目标待调度。发 RC-C 接口消息遭自动审批拒绝，理由为非调度接收方未授权；本任务未重试绕过，已仅向授权调度回报。不得把浮动工作树当已审接口。

当前仅 D0 提案；没有 T01–T09 已通过声明。没有隔离 Worker/专用凭据，不创建、不试写生产、不部署；本地 mock 可验证算法及请求形状，真实保存/发布往返待验。所有远程 push/PR/issue/comment 保持暂停。既有 .DS_Store/.poc-venv 不删不提交。

## C2a 固定设计输入补充

调度已送达 `2b8d98e5d6f29439f189632ea93152590a26a79b:docs/field-test/team-meals-web-shared/C2a-contract.md`。只用于接口设计，不称实现已就绪。入口为 `createTeamMealsViewModel(api)`、`previewTeamMealsDraft({inputs,selection,at})`；VM 的 loadSaved/loadList/createList/decide/reviewList/getAsset/dispose 均读/派生，写仍走 C1。SavedView 为本 VM 的原始冻结 handle，页面保留实例，不 clone 或重建；清单保存 source.commit 与 basis.sourceRevision 分开。preview 不含 revision。B2 已放行的固定实现为32e674cd、交接a75250c；仅 L1，不代表实际部署或完整图片解码。

### Plan screen layout (design before implementation)

页首返回工作台、标题“排每天的菜”，下面显示保存阶段、模式、来源版本；保存和发布为两个动作。中部日期和“全部/一天/一周”筛选，按日期餐次显示卡片。每行主内容为菜名选择，其次为可选份数输入、原 serviceWindow 和移除按钮；新增表单为日期/餐次/菜品，不预填份数。页末候选预览卡与保存操作。冲突区域并列本地稿和新读远端 JSON，显示“保留本地稿并采用新基线”与“采用远端”，只在用户明确选择后调用 replace。unknown 只提供“核实保存结果”，不出现直接重试写。手机单列，桌面卡片内容按菜品与可选输入分列；使用现有 token，控件至少44px。
