---
feature_ids: []
topics: [team-meals, dish, compatibility, verification]
doc_kind: implementation-handoff
created: 2026-09-11
status: author-tested-awaiting-integration-review
---

# RC-D 菜品编辑兼容交接

What: `dish-new.ts` 显式 AnyDish / TeamMealsApi 读取，v3 整body 保存；可空基准份数和未知 qty；C1 编辑会话处理冲突、未知结果和语言/离开返回；原有三语、配料、步骤、许可和来源字段保留。Why: 一道合法 v3 菜谱含未知量时，旧页会在 `c.qty.unit` 抛错；旧保存还会补 50 份、补 manual provenance。Tradeoff: 保留现有后台表单布局，缺项为事实提示，不调用旧数值 readiness；图片上传、翻译、内联新建食材仍使用原辅助接口，仅真实配置可用。Open Questions: 浏览器操作、三语两尺寸、真实服务往返待 RC-D root / 独立 Q；无 L2 Worker。Next Action: root 集成浏览器验证后固定本地 SHA，再交非作者 review。

## 对象与文件

工作区 `/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-pages`，`codex/team-meals-pages`。开始基线 5b8bdd50；root 授权推进固定 f443298（A2+Q）后继续。写本文时 root 已固定其它页面 checkpoint d3466f0ab80d462cc5fdce8734eeb435418d79ea。本子任务未暂存、未 commit、未远程外发；固定代码 SHA 由 root 补充，不能把这个文档当批准。

仅修改：

- `packages/web/src/pages/admin/dish-new.ts` / `dish-new.css`
- `packages/web/src/pages/admin/ingredient-new.ts`：只将内联表单 Catalog 参数收窄到实际所需 `ingredients | suppliers`，三处类型签名；独立 Ingredient 页面逻辑未改。
- `packages/web/test/team-meals-pages-dish.test.mjs` / `team-meals-pages-dish-browser.html`
- `docs/design/team-meals-pages/dish-editor.md` / 本文

原四份设计草稿未复制或改动；D0 与最新派工范围为准，无视觉签收声明。旧 .DS_Store / .poc-venv 未删除或混入。

## 行为与状态

1. 新建 `schemaVersion:3`，baseServings 留空省略；v2 真实 7 份、850 ml、适量等在升级时保留。未知 qty 省略，无默认 to-taste。额外核对 Quantity schema：to-taste 允许原 value，现也保留它。
2. 保留 confidence、provenance（包括原缺省）、prep.image、steps.image、clip、图片作者与许可。新菜才默认来源 manual。基准份数和已输入数量的无效值在页面阻止保存；缺量不阻止。
3. `createDishForm(api)` 是 render 实际消费的页内适配器，raw UI 字段与 C1 JSON会话分别保留；每 auth lifetime 唯一 owner。draft/active 操作先写进提交 body，C1 选择创建或源锁。保存中后续编辑保留 dirty，不自动返回导入；保存成功后给显式返回入口。
4. 语言 `refreshView`；离开 `invalidate`；返回 `open` 恢复同记录。异步读取有代次和 auth fencing。未决写不丢弃，不撤条件头。未知结果只 `reconcileUnknown`，强读 current 再同一 commit 强读，无直接重试。
5. 冲突保留本地稿；“读取远端并比较”强读后展示双方 JSON，显式选择保留本地+新基线或采用远端。read失败不当404、不清草稿。
6. 仅内存保存 UI 草稿；pending preview URL 离开时 revoke，返回从保留 Blob 重建。服务未配置时明确不能保存；模拟模式独立标明未写真实仓库。辅助上传、翻译和内联食材写入在未配置/模拟模式禁用。

## RED → GREEN

命令：`node --test packages/web/test/team-meals-pages-dish.test.mjs`

- 首次 RED 3/3：新建 schemaVersion 2≠3；v3 缺 qty 导致 `Cannot read properties of undefined (reading 'unit')`；旧 v2 回存多写 manual provenance 且仍为v2。
- 增加 C1 page adapter 契约后 RED 6/6，其中三个新增断言为 `createDishForm` 未导出/未实现。
- 第一 GREEN 6/6，覆盖整body draft+If-Match、保存中编辑+语言、unknown离开返回及两次固定读取。
- 补充合法 `to-taste.value` 源事实测试 RED 1/10，实际差异为 `value:2` 丢失；修正后 GREEN 10/10。其它新增对抗覆盖创建锁、冲突显式 adoption、迟到初读不重开离开页面。

本轮最终实际命令：

| 命令 | 输出 |
|---|---|
| `node --test packages/web/test/team-meals-pages-dish.test.mjs` | 10 tests / 10 pass / 0 fail |
| `npm --prefix packages/web run typecheck` | exit 0 |
| `npm --prefix packages/web test` | 102 tests / 102 pass / 0 fail（包含同工作树其它页面并行测试，不单独归功本任务） |
| `npm --prefix packages/web run build` | exit 0；entry gzip22.06KB；PWA 提示 data/**/*.json 尚无匹配，此时未生成生产data，无生成完整同版资产声明 |
| `git diff --check -- packages/web/src/pages/admin/dish-new.ts packages/web/src/pages/admin/dish-new.css packages/web/src/pages/admin/ingredient-new.ts` | exit 0 |

## 浏览器交给 root 的夹具

Vite 工作区启动后打开 `/test/team-meals-pages-dish-browser.html`（例如 root 的4182）。页面实际使用本次 render 与 C1 session，只有网络方法显式 mock，顶部有“模拟网络，仅内存数据”。初始 v3 菜缺 baseServings、有未知盐用量及clip。夹具提供 zh/en/uk、新建/原菜谱、下次延迟回应/释放回应、下次回应丢失、下次冲突。`window.dishMockWrites` 只记录提交body和条件，方便断言。render 第四参数仅供显式注入 TeamMealsApi；正常路由省略，仍走 getTeamMealsApi。

未在本子任务实际点击该夹具，不能将夹具存在视为浏览器通过。root 已承担正式页面集成验证；仍需执行保存中切语言并继续编辑、离开返回unknown、冲突比较选择、空份数/未知量显示及两尺寸布局。图片/翻译真实辅助接口、真实仓库保存和发布没有环境，待验；没有部署或生产写入。

## 自检边界

Architecture cell: RC-D pages，页内adapter消费C1，未新增共享Store/Router；Map delta: none。风险：behavior=表单及会话生命周期；data=条件整JSON；security=继承C1身份边界及回调fencing；contract=AnyDish/v3；irreversible=none本地。作者自测不是独立review。Dish兼容子任务已具备本地代码/单测交接条件；T01–T09、完整RC-D、UI视觉签收及真实保存不在此声明完成。

## Root actual-browser integration check

On localhost4183, explicit mock fixture and production Dish editor: zh loaded original unknown base servings/salt quantity; edit name, hold save, switch to uk, set base4, release => later4 remains dirty; next lost response => outcome unknown; visit new and return => same unknown retained; explicit verify => saved. Switch en, change5, force conflict => local5 retained and comparison exposes remote unspecified base. Root simplified conflict to named summaries with expandable raw JSON, collapses full source revision and prevents empty whole-document errors from producing an empty field-error summary. No shared kit mutation.

Screenshots `dish-delayed-uk-393.png`, `dish-unknown-uk-393.png`, `dish-conflict-en-393.png`, `dish-conflict-en-1440.png` show actual mock state. Browser fixture uses symbolic revisions, not historical commits; no real upload, translation, Worker round trip or deployment claim. Typecheck and10/10 page tests pass after integration edits. Independent review pending.
