# CanteenOS 第一轮执行简报（给 AI agent）

> 2026-09-07 起生效。任何 agent 开工前读完本文。优先级：**本文 > `docs/plan-for-terry.md` > `docs/roadmap-v2.md` > ADR-0006 > 其他文档**；冲突以更前者为准。设计稿是 UI 的事实源：`docs/design/screens-v2.html`（前台）、`docs/design/backoffice-v1.html`（后台）。协作规范 `AGENTS.md` 继续有效，本文只增不减。**多 agent 并行的派工、交接、审查流程见 `docs/operating-model.md`**；任务队列是 GitHub issue（由 `.github/backlog/round-1.json` 生成），波次由 `node scripts/backlog-waves.mjs` 算出。

---

## 0. 一句话

做一个静态网址，四个页面（/prep /purchase /menu /admin），数据是 `data/` 里的 JSON，改数据按发布，两分钟后三张单自动更新。第一轮在 2026-10-25 前收于一个真实厨房的一周。

## 1. 冻结事项（第一轮内不得变更，提议变更走新 ADR 且需 owner 批准）

1. 目标与范围：ADR-0006 §1，`roadmap-v2.md` §0；不做清单见 `plan-for-terry.md` §7。
2. 数据模型：5 个实体（`ingredient` / `techniques` / `dish` / `menu-plan` / `purchase-order`），`schemaVersion: "2"`。**允许新增可选字段，不允许新增实体、不允许把可选改必填、不允许删字段。** 本轮准许的新增字段只有 §3 v0.1 列出的几个。
3. 引擎语义：`净需求 ÷ yield（仅 g/ml）× margin（所有食材）− onHand ÷ packSize 向上取整，与 minPacks 取大`；`to-taste` 采购跳过、备料单显示"适量"。黄金测试 `packages/core/test/engine.test.mjs` 的数字已逐行手算，改动任何一行须重新手算并在 PR 里附算式。
4. 无后端数据库、无登录、无自建服务。写入通道只允许"静态后台页 → 一个云函数 → GitHub API 提交 → CI 构建"。
5. 协议白名单：代码 MIT / Apache-2.0 / BSD / MPL / Unlicense（仅 yt-dlp）；数据 CC0 / CC BY / CC BY-SA（逐图存 `{license, author?, sourceUrl}`）/ 公有领域。AGPL / GPL / Commons Clause 只准看不准抄。
6. 三语：数据本体 `{zh, en, uk}`；翻译状态在旁文件 `data/translations.lock.json`，人工改过的永不被机翻覆盖。
7. 目录即知识库：一实体一文件，文件名即 ID；图片与实体同目录（`data/dishes/<id>/images/`、`data/ingredients/<id>.jpg` 或 `<id>/`）；单图 ≤ 200 KB、最长边 ≤ 1280，不用 Git LFS。

## 2. 目标仓库结构（第一轮结束时）

```
canteen-os/
├── schemas/                      5 实体（冻结）
├── data/                         知识库；translations.lock.json 在此
├── packages/
│   ├── core/                     引擎 + 三个渲染器 + readiness（已有）
│   ├── web/                      Vite 静态站：/prep /purchase /menu /admin（v0.2–v0.3）
│   └── worker/                   云函数：写入通道 + 触发构建（v0.3）
├── scripts/
│   ├── validate-schemas.mjs      已有
│   ├── build-data.mjs            data/ → 引擎 → 三张单 JSON + 构建时间戳（v0.1）
│   ├── translate.mjs             缺失 en/uk 机翻 + 术语表 + lock（v0.1）
│   └── seed-wikidata.py          按 QID 清单拉三语名 + 图（v0.4）
├── skills/video-recipe-ingest/   已有，命令行使用；不在本轮做界面
├── .github/workflows/
│   ├── ci.yml                    已有：schema 校验 + 测试
│   └── build-deploy.yml          push main → translate → build-data → web build → Pages（v0.2）
└── docs/
    ├── design/                   高保真（事实源）
    ├── field-test/               测试周材料与日志
    └── adr/0007-*.md             本轮最多一篇新 ADR（写入通道）
```

## 3. 版本任务清单

每个版本：任务 → 完成定义（DoD）→ 收尾动作。收尾动作固定三件：打 tag、`CHANGELOG.md` 一段、周五用真实数据演示并记录"坏了什么"。

### v0.1 收尾工程 · 9/7–9/13

任务：
- [ ] schema 新增可选字段：`dish.components[].prep.timing`（enum `day-before | morning | before-service`）；`dish.components[].prep.image`、`dish.image`、`ingredient.image` 统一为 `{src, license, author?, sourceUrl?}`（已有的对齐）；`dish.description`（I18nString，可选，菜单用）；`menu-plan.meals[].serviceWindow`（可选，如 `"12:00-14:00"`）；`dish.provenance.source` 枚举增加 `example`（构建时排除，用于设计稿里的示例菜）。以上是本轮**全部**准许的 schema 变更。
- [ ] `scripts/build-data.mjs`：读 `data/`，对每个 menu-plan 跑 `expand` + 三个渲染器，输出 `packages/web/public/data/{prep,purchase,menu}/<planId>.json` + `build.json {builtAt, commit}`。纯 Node，无框架。
- [ ] `scripts/translate.mjs`：扫描全部 I18nString，缺 en/uk 的用 DeepL API（glossary 由 `data/techniques.json` 自动生成）补齐；写 `data/translations.lock.json`（`path → {source_hash, status: machine|human}`）；status=human 的跳过；无 API key 时不报错、只列出缺失数。
- [ ] `readiness()` 输出接入 build-data（每道菜 `{canTeach, canPlan, canProcure, missing[]}`）。
- [ ] 渲染器：备料单按 `prep.timing` 分组（无 timing 归"早上"）；调料行不显示切配提示（已修）；菜单渲染输出"成分"句（按配料顺序，去调料）和估算克重（净重之和，`≈`）。
- [ ] 类型从 schema 生成（`json-schema-to-typescript`），删除手写 `types.ts` 中重复部分，或加 CI 检查两者一致。

DoD：`node scripts/build-data.mjs` 从当前 `data/` 生成三份 JSON 且数字与 `data/purchase-orders/` 快照一致；`translate.mjs` 在无 key 下跑通并列出缺失；测试 ≥ 23 全绿；CI 绿。

Terry 同步：确认真实厨房；收集菜贩清单（供应商名、包装、起订、上次价）。

### v0.2 三张单上屏 · 9/14–9/27

任务：
- [ ] `packages/web`：Vite + TypeScript，**不引入 UI 框架**（原生 DOM 或 Preact 二选一，≤ 10 KB gzip）；设计 token 从 `screens-v2.html` 抄成 `tokens.css`；字体 Golos Text + Bitter + Noto Sans SC（Google Fonts，带回退栈）。
- [ ] `/prep`：A 版列表为主视图；点配料行进 B 版详情（大图 + 技法 + 备注 + 该配料相关步骤 clip）；顶部日期 chip + 餐次 chip；`prep.timing` 作为筛选 chip；右上语言下拉 UA / 中 / EN，记住选择（localStorage，try/catch）。
- [ ] `/purchase`：按 `purchase.supplier` 分组；每行可展开 trace；底部"复制微信文本"（`navigator.clipboard`，回退为选中文本）；周切换 chip。
- [ ] `/menu`：日期条（一周）+ 餐次 chip（带 serviceWindow）；菜品行按 `screens-v2.html` 菜单页；点开底部抽屉：大图、三语名、description、≈克重、过敏原、成分（食材图 + 双语名）。
- [ ] 左上角目录角标 + 抽屉：备料 / 采购 / 菜单 三项 + 菜单计划占位；底部显示 `build.json.builtAt` 与离线状态。
- [ ] PWA：manifest + service worker（Workbox）：预缓存应用壳与当前周三张单 JSON；图片运行时 CacheFirst，上限 300 张 / 30 天；`build.json` 变化时提示"有新版本，点此刷新"。
- [ ] `.github/workflows/build-deploy.yml`：push main → translate（有 key 才跑）→ build-data → vite build → 部署 GitHub Pages（或 Cloudflare Pages）；失败即红，不部署半成品。
- [ ] 三个页面各一个二维码生成（构建期生成 PNG 到 `public/qr/`）。

DoD：网址可打开三页；用 `data/menu-plans/week-41.json` 数据；断网后重开能看上一版；从 push 到页面更新无人工步骤；Lighthouse 移动端性能 ≥ 85；首屏 JS ≤ 60 KB gzip；帮厨试看 5 分钟的记录写进 `docs/field-test/log.md`。

不做：任何写入、任何登录、评分、点单。

### v0.3 师傅后台 · 9/28–10/11

任务：
- [ ] ADR-0007《写入通道》：云函数 + 链接令牌 + GitHub API 提交；令牌按角色（chef / buyer / admin），泄露即轮换；不存任何个人信息。
- [ ] `packages/worker`（Cloudflare Worker 或等价，单文件优先）：
  - `POST /plan/:planId` — 写 menu-plan（校验 schema 后 commit 到 `data/menu-plans/`）
  - `POST /ingredient` — 新建/更新 ingredient
  - `POST /dish/:id/draft` — 保存草稿（v0.3 只用于手输加菜）
  - `POST /publish` — 触发 build-deploy，返回 run id；`GET /publish/:id` 查进度（校验 / 翻译 / 构建 / 上线 四步）
  - `POST /rollback/:sha` — 把 `data/` 回退到某次 commit（新 commit，不 force push）
  - 所有写入走一个 PR 分支自动合并到 main（保留审计），或直接 commit main——二选一写进 ADR-0007。
- [ ] `/admin` 工作台：六块 + 顶部"N 项未发布"（比较 main 与线上 `build.json.commit`）。
- [ ] `/admin/plan`：周视图（按天列表、±10 步进器、上周实际提示——第一轮"实际"用上周计划数代替，标注）；日/周/月切换；"复制上周"；"采购单预览"（本地跑引擎，不落库）。
- [ ] `/admin/plan/import`：粘贴导入解析器（宽松：星期或日期、午/晚/早、菜名模糊匹配、中文数字份数）+ 逐行结果 + Excel/CSV 上传（四列自动识别）；认不出的行给"新建 / 换一个 / 去补全"。
- [ ] `/admin/dish/new` 手动输入分支（视频分支本轮只放占位，指向命令行说明）。
- [ ] `/admin/ingredient/new`：按 `backoffice-v1.html` 第 6 屏；机翻由 worker 调 translate 逻辑即时返回；照片：拍照上传（worker 压缩到 ≤ 200 KB）/ Wikidata 取图（按 externalId）。
- [ ] `/admin/publish`：未发布改动列表（git diff 摘要人话化）、四步进度、发布记录与回退、三张二维码打印页。

DoD：Terry 用后台排一周并发布，全程不碰 JSON；采购员用自己的链接复制微信文本；回退一次成功；worker 无密钥泄露（CI 扫描）；所有写入在 git 历史可追溯。

不做：帮厨勾选、采购员改包数、视频导入界面、权限细分。

### v0.4 真实数据 · 10/12–10/18

任务：
- [ ] `scripts/seed-wikidata.py`（复用 `docs/research/v2/wikidata_probe.py`）：按 QID 清单拉三语名 + 图 + 许可元数据，缺 uk 的用 en 枢轴机翻并在 lock 标 machine。
- [ ] 食材 ≥ 60（含常用调料 ≥ 20），每个有 `purchase`；耐放品 `trackStock: true`。
- [ ] 真实菜单 ≥ 10 道菜：命令行视频导入或手输 → 师傅按 50 份称重回填 → 切配照片（视频截帧或现场拍）→ readiness `canTeach` 全部为真。
- [ ] `data/techniques.json` 覆盖这 10 道菜的全部技法，无空 `techniqueRef`；uk 由帮厨看一遍，改过的标 human。
- [ ] 真实周菜单录入并发布；三张二维码打印。

DoD：门 B 全部满足（见 `plan-for-terry.md` §5）；`docs/field-test/<week>/` 有测试周操作指南与记录模板。

### 真实厨房周 · 10/19–10/25

规则：**代码冻结**，只修当天阻塞（P0：帮厨/采购员无法完成当天工作）。每天一条日志进 `docs/field-test/<week>/log.md`：谁、看不懂/做不了什么、怎么绕过的、是否阻塞。

### 复盘与 v1.0 · 10/26–10/30

- [ ] 按日志排序，修最痛的三个；其余进 `docs/round-2-backlog.md`。
- [ ] 门 C 逐条核对写进 `docs/field-test/<week>/verdict.md`。
- [ ] tag `v1.0`，`plan-for-terry.md` 加一段"第一轮结论"。

## 4. 工程规则

1. **分支与合并**：每任务一个分支，PR 进 main；PR 描述固定四段：改了什么 / 怎么验证的（命令与输出）/ 没做什么 / 涉及数字的手算算式。周六、周日不合并。
2. **黄金数字**：改引擎或 `data/` 里任何影响采购单的数字，PR 必须附手算表；reviewer 逐格核对后才能合并。测试锁的是"写下来的数字"，不是"正确的数字"。
3. **每版本最多一篇新 ADR**；文档增量不得超过代码增量（按行数，CI 不强制，reviewer 看）。
4. **WIP 上限**：同一时间每个 package 只有一个 agent 在改（v0.2/v0.3 的 web 页面按“一页一文件、共用文件只读”例外）；跨 package 改动拆 PR；同时活着的子 thread ≤ 5（`docs/operating-model.md` §3）。
5. **性能预算**：首屏 JS ≤ 60 KB gzip；单图 ≤ 200 KB；`data/` 总图片 ≤ 50 MB（超过先压缩再考虑外部图床）。
6. **测试要求**：`packages/core` 保持纯函数 + node:test；`packages/web` 至少一条端到端冒烟（Playwright：三页可打开、语言切换、复制按钮）；worker 每个端点一个集成测试（对测试仓库提交后回滚）。
7. **文案**：界面文字是产品的一部分。中文页面用人话（"用 100 g 能剩多少"而不是"净料率"），乌克兰语页面的动作词只从 `techniques.json` 取。
8. **不确定就问，不猜**：需求不清写进 PR 的"没做什么"，@owner；不要用相近功能凑。
9. **每周五交付格式**（贴进 PR 或 issue）：
   ```
   本周做了：…（≤5 条，每条对应 §3 的一个 checkbox）
   验证方式：…（命令 / 网址 / 截图）
   坏了什么：…
   下周不做：…
   ```

## 5. 接口契约（v0.1–v0.3 共用）

**`build.json`**：`{ "builtAt": ISO8601, "commit": sha, "plans": [planId…] }`，前台抽屉底部显示 `builtAt`。

**三张单 JSON**（`build-data.mjs` 输出，前台只读）：
- `prep/<planId>.json`：`{ days: [{ date, meals: [{ mealType, dishRef, servings, dish:{name,image}, components:[{ ingredientRef, name, qty:{value,unit}, prep:{techniqueRef, technique:{name}, size?, note?, image?, timing}, isSeasoning }], steps:[{ n, text, techniqueRef?, image?, clip? }] }] }] }`
- `purchase/<planId>.json`：与 `data/purchase-orders/` 快照同构，外加 `wechatText[supplier]`。
- `menu/<planId>.json`：`{ days:[{ date, meals:[{ mealType, serviceWindow?, dishes:[{ id, name, description?, image, composition:[{ingredientRef,name,image?}], allergens[], approxGrams }] }] }] }`

**翻译锁** `data/translations.lock.json`：`{ "<file>#<json-pointer>": { "source_hash": sha1(zh), "status": "machine"|"human", "updatedAt": ISO } }`。规则：zh 变了且 status=machine → 重翻；status=human → 永不覆盖，只在 zh 变化时标 `stale: true` 提示人工。

**Worker**：所有请求头 `Authorization: Bearer <role-token>`；返回 `{ ok, commit?, runId?, errors?[] }`；错误按 schema 校验结果逐字段返回，前端原样标黄。

## 6. 验收谁签字

| 版本 | 演示给谁 | 签字 |
|---|---|---|
| v0.1 | Terry | Terry |
| v0.2 | Terry + 帮厨看 5 分钟 | Terry |
| v0.3 | Terry 亲自操作 + 采购员 | Terry |
| v0.4 | 师傅 + 帮厨 | Terry，附师傅口头确认记录 |
| v1.0 | 门 C 逐条 | Terry |

## 7. 禁止事项（在 AGENTS.md §4 之上追加）

- ❌ 不新增实体、不新增必填字段、不新增 ADR 超过每版一篇。
- ❌ 不引入 UI 框架超过 10 KB gzip；不引入 CSS 框架；不引入状态管理库。
- ❌ 不做本轮"不做"清单里的任何功能，哪怕"顺手"。
- ❌ 不把示例数据当真实数据发布（示例菜必须标 `provenance.source: "example"`，构建时排除）。
- ❌ 不在 worker 里存任何个人信息；令牌只在链接里。
- ❌ 不在测试周合并非 P0 修复。
- ❌ 不用"没找到"以外的方式处理找不到的东西——写清楚，不凑。
