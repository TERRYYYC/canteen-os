# packages/worker 接口契约与集成测试清单（v0.3 · #19）

> **本文档不是决策文件。** 决策在 **ADR-0007《写入通道》（已合并，Status: Accepted）**；本文是把那份 ADR 翻译成「打开编辑器就能照着写」的实现契约，外加 ADR 没写、但 #19 一开工就必须回答的那些细节。
>
> **ADR-0007 已于 2026-09-08 合并，Status: Accepted。** 本文正文里凡写作「ADR-0007（PR #61，待合并）§N」的地方，一律改读作「ADR-0007 §N」——章节号未变，引用仍然有效。合并前 Owner 当面拍板并改动了 ADR 三处，受影响的内容集中列在下面这块「决议追加」里；**正文尚未逐处回改，与本块冲突时以本块和 ADR 为准。**
>
> **决议追加（2026-09-08，Owner 当面拍板）**
>
> 1. **图片压缩已定**：按 ADR §9 走 —— 浏览器 canvas 压到最长边 ≤ 1280 且 ≤ 200 KB，worker 只校验 `Content-Length`、magic bytes、尺寸头，不做像素处理。执行简报那句「worker 压缩」以 ADR §9 为准。本文 §9 里这道判断题**已经落定，不再是开放项**。
> 2. **新增 `POST /dish/:id`**：`status` 由请求体决定，可直接写 `active`；`POST /dish/:id/draft` 保持无条件写 `draft`。原先「worker 一律强制 draft」会让 #24 后台新建的菜永远排不进菜单，v0.3 完成定义「用后台排一周并发布」当场断掉。权限矩阵同 `/dish/:id/draft`（chef ✅ / buyer ❌ / admin ✅），计入写入限流。**代价写在纸面上：少一道二次确认，schema 校验成为唯一闸门。**
> 3. **新增两个只读端点**：`GET /catalog`（菜名 / 食材名 / 技法 / 供应商的全库索引）与 `GET /changes`（未发布改动列表，#25 发布记录屏的唯一数据来源）。三个角色都可读；worker 直接代理读 `data/**`，不产生任何 commit，**不计入写入限流**。这两个端点本文 §1.0 的端点清单里**还没有**，#19 实现时以本块为准。不新增实体、不新增必填字段。
> 4. **令牌链接形状**：`…/#/admin/t/<token>`，不是 ADR 初稿的 `…/admin#t=<token>` —— 旧形状在当前 hash 路由下会被 `parseHash` 判为非法、弹回 `#/prep`，令牌当场丢失。本文凡引用链接形状处同此。
> 5. **`workflow_dispatch` 已上线**（PR #67，`ee00a8a`），本文 D-17 有配套了：调用方传 `request_id`，workflow 的 `run-name` 回显成 `publish · <request_id>`，`POST /publish` 轮询 runs 列表**按名字精确匹配**认领 runId。**不要按时间戳取最新一条** —— 本 workflow 有 `concurrency: group: pages`，publish 会排队，两次挨得近时时间戳会认错人。
>
> **本轮无沙箱、无构建、无验证。** 沙箱 `No space left on device`，本文所有内容来自 GitHub API 逐份读取的仓库原文，没有任何一行被执行过。
>
> 读者：#19（worker 实现）、#27（后台接真实 worker，照同一份契约替换 mock）、#20 / #21 / #23 / #25（后台各页对着 mock 开发时的字段依据）。

---

## 0. 为什么现在写这个

#19 是 v0.3 的关键路径，但它**开不了工**：ADR-0007（PR #61，待合并）§3 的注要求给 `build-deploy.yml` 加一行 `workflow_dispatch:`，而 GitHub App「Claude Github MCP Connector」没有 workflows 权限（成品 YAML 与实测记录见 **#62** 第 3 节第 ② 份）。ADR 原文把这件事写成「**这是 #19 开工前的唯一外部依赖**」。

卡着的这段时间能做的事只有一件：**把契约钉死**。权限一解开，#19 照着本文直接写；#27 照着同一份契约把 `packages/web/src/api/mock.ts` 换成真实客户端，两边不会对不上。

### 术语与口径（先统一，后面不再解释）

- **planId 周号约定**：`week-<ISO 周号>`，**`week-43` 对应 2026-10-19 那一周**（ISO 第 43 周周一 = 2026-10-19；交叉验证：已有的 `data/menu-plans/week-41.json` 的 `dateRange.start` = `2026-10-05`，正是 ISO 第 41 周周一）。已合并的 `docs/field-test/week-43/` 用的就是 43。
  > ⚠️ **ADR-0007（PR #61，待合并）§2 的 commit message 示例里写的是 `POST /plan/week-42`，与同一行文案「排 2026-10-19 那周」自相矛盾，应为 `week-43`。ADR 示例待修**（PR #61 的复核评论已提出）。本文一律用 `week-43`。
- **schema 事实源**：`schemas/*.schema.json`（draft 2020-12）。`packages/core/src/types.ts` 是它的手写投影，两者冲突时以 schema 为准（`docs/architecture.md` §1）。
- **写入 ≠ 发布**：见 §4。本文里「写入」永远指「改了 `main` 上的 `data/`」，「发布」永远指「线上产物换版」。

---

## 1. 端点契约

### 1.0 总览与出入口约定

| 端点 | 作用 | 落到哪个路径 | chef | buyer | admin | 出处 |
|---|---|---|:--:|:--:|:--:|---|
| `POST /plan/:planId` | 写 menu-plan | `data/menu-plans/<planId>.json` | ✅ | ❌ | ✅ | ADR §5 |
| `POST /ingredient` | 新建 / 更新食材 | `data/ingredients/<id>.json` | ✅ | ❌ | ✅ | ADR §5 |
| `POST /dish/:id/draft` | 保存菜品草稿 | `data/dishes/<id>.json` | ✅ | ❌ | ✅ | ADR §5 |
| `POST /publish` | 触发 build-deploy，返回 `runId` | —— | ✅ | ❌ | ✅ | ADR §5 |
| `GET /publish/:runId` | 四步进度 | —— | ✅ | ✅ | ✅ | ADR §5 |
| `POST /rollback/:sha` | 把 `data/` 恢复到某 commit | `data/**` | ❌ | ❌ | ✅ | ADR §5 |
| `GET /source/:kind/:id` | 读当前内容 + `blobSha`（冲突检测前提） | —— | ✅ | ✅ | ✅ | **本文新增，D-06** |
| `POST /translate` | 即时机翻单条 | —— | ✅ | ❌ | ✅ | **仅见于 #19，ADR §5 未列** |
| `POST /image` | 接收照片 | `data/<kind>/<id>/images/<name>.<ext>` | ✅ | ❌ | ✅ | **仅见于 #19，且与 ADR §9 冲突 → 判断题 ①** |

> **矛盾（必须由 owner 落一次）**：issue #19 的任务清单有 8 个端点，ADR-0007（PR #61，待合并）§5 的端点表只有 6 个。多出来的 `POST /translate` 与 `POST /image` **在 ADR 的权限矩阵里没有行**。`POST /image` 还与 ADR §9（压缩放浏览器）正面冲突——#19 原文写的是「接收照片，压缩到 ≤ 200 KB / 1280px」。处置见 §9 判断题 ①。上表里这两行的权限是本文按「与同类写入端点一致」推定的，**不是 ADR 的裁决**。

**共同约定**

- 传输：HTTPS，`Content-Type: application/json; charset=utf-8`（`POST /image` 除外，见 §9）。
- 鉴权：**每个端点**都要 `Authorization: Bearer <role-token>`（`docs/execution-brief.md` §5；ADR §4）。没有匿名端点。
- CORS（ADR §1 的引用块，逐字）：`Access-Control-Allow-Origin: https://terryyyc.github.io`（**逐字匹配，不用通配符**）、`Vary: Origin`、允许 `Authorization` 头、预检缓存 600 秒、**不开 `Allow-Credentials`**（不使用 cookie）。
- 请求体上限：JSON 端点 256 KB（**本文新增，D-07**）；`POST /image` 200 KB（ADR §9 与执行简报 §1.7）。超限 → 413。
- 路径白名单（ADR §8 第 1 层）：写入路径必须逐字匹配固定形状，含 `..`、绝对路径、以及任何 `schemas/`、`packages/`、`scripts/`、`.github/`、根目录文件的写入请求**一律 400，且不记录请求体**。
- 日志（ADR §8 补充）：只记 `{ 时间, 角色, 端点, HTTP 状态 }`；**不记令牌、不记请求体、不记可识别到人的字段**。

### 1.1 `POST /plan/:planId`

**路径参数**

| 参数 | 校验 | 出处 |
|---|---|---|
| `planId` | 必须匹配 `^[a-z][a-z0-9-]*$` | `schemas/common.schema.json#/$defs/Id` |
| | 约定形状 `week-NN`（见 §0）。**非 `week-NN` 形状不拒绝**，只在响应里带 `warnings[]` | 本文新增，D-08 |

**请求体 = MenuPlan 对象逐字**（`schemas/menu-plan.schema.json`，顶层与 `meals[]` 均 `additionalProperties: false`）

| 字段 | 类型 | 必填 | 校验规则 |
|---|---|:--:|---|
| `schemaVersion` | string | **是** | `const: "2"`，逐字 |
| `name` | I18nString | 否 | `{zh?, en?, uk?}`，**至少一个**；每个非空字符串（`minLength: 1`）；无其他键 |
| `dateRange` | object | 否 | `{start, end}` **两者都必填**，`format: date`；无其他键 |
| `margin` | number | 否 | `exclusiveMinimum: 0`。缺省时引擎按 1.1 |
| `meals` | array | **是** | `minItems: 1` |
| `meals[].date` | string | **是** | `format: date` |
| `meals[].mealType` | enum | **是** | `breakfast` \| `lunch` \| `dinner` |
| `meals[].dishRef` | Id | **是** | `^[a-z][a-z0-9-]*$` |
| `meals[].plannedServings` | integer | **是** | `minimum: 1`。**字段名是 `plannedServings`，不是 `servings`** |
| `meals[].serviceWindow` | string | 否 | `^\d{2}:\d{2}-\d{2}:\d{2}$` |

> ⚠️ **硬伤**：ADR-0007（PR #61，待合并）§5 的错误示例写的是 `{ "path": "/meals/0/servings", ... }`。`servings` **在 menu-plan schema 里不存在**（`servings` 只出现在 `purchase-order.schema.json` 的 `trace.meals[]` 里，那是引擎输出快照，worker 不写）。正确的 JSON Pointer 是 `/meals/0/plannedServings`。**ADR 示例待修。**

**请求头（可选）**

| 头 | 说明 |
|---|---|
| `If-Match: <blobSha>` | 目标文件当前 blob sha（从 `GET /source/...` 取）。带上则做文件级冲突检测；不带则只做 ref 级重试（见 §3.2） |

**成功响应** `200`

```jsonc
{ "ok": true, "commit": "<40 位 sha>", "blobSha": "<新文件 blob sha>", "unchanged": false }
```

`unchanged: true` 时 `commit` 是当前 `main` 的 HEAD，**没有产生新 commit**（幂等，见 §3.1）。

**commit message**（ADR §2 的形状）

```
data(plan): 排 2026-10-19 那周（12 道菜） [skip ci]

X-CanteenOS-Role: chef
X-CanteenOS-Endpoint: POST /plan/week-43
```

`[skip ci]` 见 §4。作者固定 `canteenos-bot`（与 `build-deploy.yml` 里 `Commit machine translations back to main` 的 `git config user.name` 一致，也是 #62 第 ④ 份守卫 job 的比对值）。

### 1.2 `POST /ingredient`

**请求体 = Ingredient 对象**（`schemas/ingredient.schema.json`，`additionalProperties: false`）

| 字段 | 类型 | 必填 | 校验规则 |
|---|---|:--:|---|
| `schemaVersion` | string | **是** | `const: "2"` |
| `name` | I18nString | **是** | 至少一种语言 |
| `image` | ImageRef | 否 | `{src, license}` **都必填**（`minLength: 1`）；`author?`、`sourceUrl?` |
| `externalId` | string | 否 | `^Q\d+$`（Wikidata QID） |
| `baseUnit` | Unit | **是** | 枚举：`g` `kg` `ml` `l` `pcs` `pack` `tbsp` `tsp` `pinch` `to-taste` |
| `pcsToGram` | number | 否 | `exclusiveMinimum: 0` |
| `yield` | number | 否 | `exclusiveMinimum: 0`、`maximum: 1`。**「pcs 食材不得设置」只写在 description 里，schema 不强制**（见 §3.4 业务规则） |
| `role` | enum | 否 | `main` \| `seasoning` |
| `purchase` | object | 否 | `supplier`（string，`minLength: 1`）、`packSize`（number，> 0）、`packUnit`（Unit）**三者必填**；`minPacks`（integer ≥ 1）、`lastPrice`（Money）可选；无其他键 |
| `purchase.lastPrice` | Money | 否 | `{amount ≥ 0, currency ∈ CNY\|USD\|UAH\|EUR}`，两者都必填 |
| `trackStock` | boolean | **是** | —— |
| `onHand` | number | 否 | `minimum: 0` |

> ⚠️ **schema 对不上，必须先扩 schema**：端点名是 `POST /ingredient`（**路径里没有 `:id`**），而 `ingredient.schema.json` 是 `additionalProperties: false` 且**没有 `id` 字段**（`common.schema.json#/$defs/Id` 的 description 明写「实体的 id 就是文件名……文件内不再重复 id 字段」）。**食材 id 在这个端点里无处安放。** 两条出路：
> 1. **改成 `POST /ingredient/:id`**（与 `/plan/:planId`、`/dish/:id/draft` 对称，不动 schema）——本文推荐，见 D-01；
> 2. 保留 `POST /ingredient`，请求体改成信封 `{ "id": "<id>", "ingredient": { … } }`（信封本身不入库，只有 `ingredient` 落盘）——不动 schema，但与另两个写入端点形状不一致。
>
> **两条都不需要改 schema。绝对不要把 `id` 写进实体 JSON**——那要改 `ingredient.schema.json`，属于执行简报 §1.2 冻结项（「不允许新增实体」之外的字段新增须走 owner 护栏，本轮准许的新增字段清单在执行简报 §3 v0.1，`id` 不在其中）。

**成功响应** `200`：与 §1.1 同形。commit message：`data(ingredient): 新增/更新 <id> [skip ci]` + 同样的 trailer。

### 1.3 `POST /dish/:id/draft`

**路径参数** `id`：`^[a-z][a-z0-9-]*$`。

**请求体 = Dish 对象**（`schemas/dish.schema.json`，`additionalProperties: false`）。**除 `name` 外全部可选**——「一道菜只有名字也能导入」（schema description、`docs/architecture.md`）。

| 字段 | 类型 | 必填 | 校验规则 |
|---|---|:--:|---|
| `name` | I18nString | **是** | 至少一种语言 |
| `schemaVersion` | string | 否 | `const: "2"` |
| `description` | I18nString | 否 | 菜单页抽屉展示 |
| `image` | ImageRef | 否 | `{src, license}` 必填 |
| `baseServings` | integer | 否 | `minimum: 1` |
| `components` | array | 否 | `minItems: 1` |
| `components[].ingredientRef` | Id | **是**（在项内） | `^[a-z][a-z0-9-]*$` |
| `components[].qty` | Quantity | **是**（在项内） | `{value?, unit}`；`unit` 必填；**`unit ≠ to-taste` 时 `value` 必填且 > 0** |
| `components[].prep` | object | 否 | `techniqueRef` **必填**；`size`（`minLength: 1`）、`timing`（`day-before`\|`morning`\|`before-service`）、`note`（I18nString）、`image`（ImageRef）可选；无其他键 |
| `components[].confidence` | object | 否 | `{value 0..1, source ∈ manual\|video\|llm-inference}`，两者必填 |
| `steps` | array | 否 | `minItems: 1`；每项 `text`（I18nString）必填；`techniqueRef`、`image`、`clip` 可选 |
| `steps[].clip` | object | 否 | `{videoUrl(format: uri), start ≥ 0, end ≥ 0}` 三者必填 |
| `provenance` | object | 否 | `source ∈ manual\|video\|example` 必填；`videoUrl` 可选 |
| `status` | enum | 否 | `draft` \| `active` \| `archived` |

**worker 强制写入 `status: "draft"`**（ADR §5 的端点表逐字：`status: "draft"`）。请求体带了别的值也覆盖成 `draft`，并在响应 `warnings[]` 里说明。

**成功响应** `200`：同形。commit message：`data(dish): 草稿 <id> [skip ci]`。

### 1.4 `POST /publish`

**请求体**：空或 `{}`。**成功响应** `200`：

```jsonc
{ "ok": true, "runId": 123456789, "mode": "dispatch" }   // 正常态
{ "ok": true, "runId": null, "mode": "push-trigger", "commit": "<sha>" }  // 降级态，见 §5.2
```

`mode` 是**本文新增字段**（D-04），用来让前端区分正常态与降级态。ADR §5 的返回体只写了 `{ ok: true, runId }`。

### 1.5 `GET /publish/:runId`

**路径参数** `runId`：正整数。降级态下前端不会拿到 runId，见 §5.2。

**成功响应** `200`（**响应形状是本文新增，D-03**；ADR §6 只裁决了「哪些步骤归哪一步」，没给 JSON 形状）：

```jsonc
{
  "ok": true,
  "runId": 123456789,
  "status": "in_progress",              // queued | in_progress | success | failure | timeout | unmapped
  "htmlUrl": "https://github.com/TERRYYYC/canteen-os/actions/runs/123456789",
  "steps": [
    { "key": "validate",  "label": "检查数据", "state": "success",     "startedAt": "…", "completedAt": "…" },
    { "key": "translate", "label": "补翻译",   "state": "success",     "startedAt": "…", "completedAt": "…" },
    { "key": "build",     "label": "生成三张单", "state": "in_progress", "startedAt": "…", "completedAt": null },
    { "key": "deploy",    "label": "上线",     "state": "pending",     "startedAt": null, "completedAt": null }
  ],
  "failedStep": null,                    // 失败时为 key
  "failureReason": null,                 // 失败时为该步第一个 failure 步骤的名字（原样，不翻译）
  "unmappedSteps": []                    // 出现未映射的显式 name: 步骤时列在这里（见 §4.3）
}
```

`state` 取值：`pending` | `in_progress` | `success` | `failure` | `skipped`。四步的中文 label 取自 #25 的任务清单（「检查数据 / 补翻译 / 生成三张单 / 上线」）。

### 1.6 `POST /rollback/:sha`

**路径参数** `sha`：`^[0-9a-f]{7,40}$`。worker 先把短 sha 解析成全长 sha，解析不到 → 404 `not_found`。

**权限：只有 `admin`**（ADR §5 端点表：chef ❌ / buyer ❌ / admin ✅；`docs/field-test/week-43/ops-checklist.md` §3.2 也这么写）。

**成功响应** `200`：`{ "ok": true, "commit": "<新 commit sha>", "restoredFrom": "<40 位 sha>", "changedFiles": 3 }`（`changedFiles` 为本文新增，用于 #25 的二次确认弹窗）。

### 1.7 `GET /source/:kind/:id` （本文新增，D-06）

`kind ∈ plan | ingredient | dish`。返回 `{ ok: true, content: <实体 JSON>, blobSha: "<sha>", commit: "<main HEAD>" }`；文件不存在 → 404 `not_found`。

**为什么必须有**：ADR §2 的乐观锁要求「Contents API 带上被改文件的 `sha`」，但 ADR §5 的端点表里**没有任何读端点**，前端拿不到那个 sha。备选是前端直读 GitHub Contents API（仓库 public，可匿名读），但**匿名 GitHub API 是 60 次/小时/IP** ——后台一屏就可能打光。同一条限制也影响 §4.4 的「N 项未发布」（compare API）。

### 1.8 错误响应（全端点统一）

返回体固定（`docs/execution-brief.md` §5、ADR §5）：

```jsonc
{ "ok": false, "errors": [ { "path": "/meals/0/plannedServings", "code": "type", "message": "应为整数" } ] }
```

`errors[].path` 是 **JSON Pointer**，前端按它把对应输入框标黄（设计稿第 6 屏），**原样显示 `message`，不二次编造文案**（ADR §5 逐字）。非字段级错误 `path` 为 `""`。

HTTP 状态取值 ADR §5 已裁决：`200` / `400` / `401` / `403` / `409` / `413` / `429` / `502`。**下表的 `code` 与中文提示语是本文新增（D-02）** ——ADR 只给了 `type` 与 `conflict` 两个样例值。校验类 `code` 逐字用 ajv 的 keyword，前端不需要认全。

| HTTP | `code` | 何时 | 给师傅看的 `message` |
|:--:|---|---|---|
| 400 | `type` | 类型不对 | 「这里要填数字」/「应为整数」 |
| 400 | `required` | 缺必填字段 | 「这项必须填」 |
| 400 | `enum` | 枚举外的值 | 「只能选：早餐 / 午餐 / 晚餐」 |
| 400 | `pattern` | 正则不匹配 | 「格式不对，例如 12:00-14:00」 |
| 400 | `minimum` / `exclusiveMinimum` | 数值下限 | 「份数至少 1」 |
| 400 | `maximum` | 数值上限 | 「净料率不能超过 1」 |
| 400 | `minItems` | 数组太短 | 「至少排一餐」 |
| 400 | `additionalProperties` | 多了 schema 不认识的键 | 「有一项系统不认识，先删掉再存」 |
| 400 | `format` | date / uri 格式 | 「日期格式应为 2026-10-19」 |
| 400 | `anyOf` | I18nString 三语全空 | 「中/英/乌至少填一个」 |
| 400 | `bad_id` | 路径参数不匹配 `^[a-z][a-z0-9-]*$` | 「名称只能用小写字母、数字和短横线」 |
| 400 | `bad_path` | 触到路径白名单（ADR §8 第 1 层） | 「这个位置不允许写入」**（不记录请求体）** |
| 400 | `bad_json` | 请求体不是合法 JSON | 「数据没发全，重试一次」 |
| 401 | `unauthorized` | 令牌缺失 / 哈希对不上 | 「链接失效了，找 Terry 要新的」 |
| 403 | `forbidden` | 角色越权（如 buyer 调写入） | 「你这条链接不能做这件事」 |
| 404 | `not_found` | `:sha` / `:runId` / `GET /source` 目标不存在 | 「没找到这个版本」 |
| 409 | `conflict` | 重读重试一次后仍冲突（ADR §2） | 「有人刚改过，刷新后重试」 |
| 413 | `too_large` | 超体积上限 | 「照片太大了，从后台页面正常上传」 |
| 429 | `rate_limited` | 超限流（ADR §5） | 「操作太频繁，等几分钟再试」 |
| 502 | `upstream_error` | GitHub API 异常 | 「GitHub 那边出问题了，先看看 PAT 是不是到期了」 |
| 503 | `dispatch_unavailable` | 降级态下调 `POST /publish` 且降级也不可用 | 「发布功能暂时关着」 |

> `404` 与 `503` **不在 ADR §5 的状态清单里**，是本文新增（D-02）。`docs/field-test/week-43/ops-checklist.md` §3.3 的报错对照表只覆盖 400/401/403/409/413/429/502 七项——若 owner 认可 404/503，运维清单需要补两行（**那个文件本轮不改，交由后续 PR**）。

---

## 2. 令牌

全节依据 ADR-0007（PR #61，待合并）**§4**，口径与 `docs/field-test/week-43/ops-checklist.md` §1–§2 逐条对齐（该文件已合并，本文不改它）。

### 2.1 格式与签发

- 三个角色：`chef` / `buyer` / `admin`。每个角色**一个** 32 字节随机串，**base64url，43 字符**（§4）。
- **与人无关**：不存姓名、不存邮箱、不存设备标识（§4；执行简报 §7「不在 worker 里存任何个人信息」）。所以「一人一条」是运维纪律（ops-checklist §2 预防），不是协议能力。
- 生成参考（ops-checklist §2 标注为**未验证**）：`openssl rand -base64 32 | tr '+/' '-_' | tr -d '='` → 43 字符；`printf %s "<token>" | openssl dgst -sha256` → 64 位十六进制。

### 2.2 放在哪：URL fragment

- 链接形状：`https://terryyyc.github.io/canteen-os/admin#t=<token>`（§4）。
- **fragment 不会发给任何服务器** → 不进 GitHub Pages 访问日志、CDN 日志、跳转的 `Referer` 头（§4）。
- 页面加载后：读 `location.hash` → 存 `sessionStorage` → `history.replaceState` 抹掉地址栏里的令牌（§4）。这是 #20 的任务（「令牌从 URL 读取并存 sessionStorage；无令牌显示『请用师傅链接打开』」）。
- 请求时才带上：`Authorization: Bearer <token>`（§4；执行简报 §5）。

### 2.3 校验步骤（worker 侧）

1. 取 `Authorization` 头，不以 `Bearer ` 开头 → 401 `unauthorized`。
2. 取 token，长度不是 43 → 401（**先判长度再算哈希**，省一次 SHA-256）。
3. 算 SHA-256 十六进制。
4. 与 `TOKEN_HASH_CHEF` / `TOKEN_HASH_BUYER` / `TOKEN_HASH_ADMIN` **逐个用常数时间比较**（§4：「比较用常数时间比较，避免时序旁路」）。**三个都要比完，不许命中即短路**——短路会把「哪个角色」泄露成时间差。
5. 都不中 → 401 `unauthorized`。中了 → 得到角色。
6. 查 §1.0 的权限矩阵，角色不允许该端点 → **403 `forbidden`**（不是 401；两者的区分是 ops-checklist §3.3 让人自助排障的依据）。
7. 查限流桶（§3.5），超限 → 429。

**worker 只存哈希**，明文令牌只存在于发给人的那条链接里（§4）。

### 2.4 过期与吊销

- **令牌无有效期**（§4：「阶段 1 无处存放过期状态；这是有意识的取舍，用『轮换成本极低』来换『不引入会话存储』」）。
- **吊销 = 轮换**：改一个 `TOKEN_HASH_*` secret + 重新部署 worker → **旧链接立刻 401**（§4；ops-checklist §2 第 3 步）。
- 单角色轮换只影响该角色，另两条链接不受影响。

### 2.5 权限矩阵

见 §1.0 总览表。要点：

- **buyer 在 v0.3 不含任何写权限**（ADR §5）——采购员只需要打开前台复制微信文本，那条路径根本不经过 worker。保留这个角色是为了第二轮加「采购员改包数」时不用改协议。
- buyer 能调的只有 `GET /publish/:runId`（ADR §5 端点表：buyer ✅）与本文新增的 `GET /source/:kind/:id`。
- **`POST /rollback/:sha` 只有 admin**。

### 2.6 泄露处置

口径与 `docs/field-test/week-43/ops-checklist.md` §2 逐条一致，此处只列 worker 侧的可验证点：

| 运维步骤（ops-checklist §2） | worker 侧应当表现为 |
|---|---|
| 生成新 43 字符串 → 算 SHA-256 → 改 `TOKEN_HASH_*` → 重新部署 | 旧 token 的所有请求返回 **401 `unauthorized`**，且**不区分**「令牌错」和「令牌被换过」（不给攻击者信息） |
| 「什么算泄露」：进群 / 转发 / 截图 / 写进文档或 issue / 手机丢了 / 人不干了 | —— |
| 在 `log.md` 记一行：哪天、哪个角色、为什么轮换 | worker 日志只有 `{时间, 角色, 端点, 状态}`，**查不到是谁**——所以人工记录是唯一线索，不能省 |

**PAT（另一把钥匙，别和令牌混）**：worker 用细粒度 PAT，权限只有 `Contents: RW` + `Actions: RW`，**没有 Workflows 权限**（ADR §8 第 2 层）；最长一年有效期，**到期当天写入会全线 502**（ADR「负面/代价」）。到期日与轮换步骤在 ops-checklist §1。

> ⚠️ ops-checklist §1 明确记了一笔：「ADR 只写死了三个令牌哈希 secret，**没给 PAT 的 secret 名**。#19 落地后回来把上表补全。」**本文定名 `GITHUB_PAT`（D-09）**，#19 若改名，必须回填 ops-checklist §1 的登记表。

---

## 3. 写入语义

### 3.1 幂等性

ADR 未裁决。**本文新增（D-05）：内容幂等，不引入存储。**

- worker 把请求体按稳定序列化（键排序 + 2 空格缩进 + 末尾换行）后，与目标文件当前内容逐字节比较。
- **相同 → 不产生任何 commit**，返回 `200 { ok: true, commit: <当前 HEAD>, blobSha: <当前>, unchanged: true }`。
- 不同 → 正常写入，`unchanged: false`。

这样「网络抖动导致前端重发」「师傅连点两次保存」都不会在 `main` 上留下重复 commit——而 ADR「负面/代价」里那条「**`main` 会变吵**：每次保存一个 commit」也因此只对**真实内容变化**成立。

**反方案**：`Idempotency-Key` 请求头 + KV 存 5 分钟。多一个 KV 绑定与一次读写；ADR §1 强调 worker 是无状态的（「删掉它数据一点不少」），内容幂等不破这条，Key 幂等破。

### 3.2 并发

分两层，都来自 ADR §2（「写入用乐观锁——Contents API 带上被改文件的 `sha`，ref 更新带上期望的父 commit」）：

| 层 | 检测什么 | 依据 | 冲突时 |
|---|---|---|---|
| **文件级** | 两人改同一周 / 同一个食材 | 请求头 `If-Match: <blobSha>` 与目标文件当前 blob sha 不符 | 立即 **409 `conflict`**，**不重试**（重试会覆盖别人的改动） |
| **ref 级** | 两个写入几乎同时推 `main`（改的是不同文件） | ref 更新带期望父 commit，GitHub 返回 409 | **重读一次并重试一次**（ADR §2 逐字）；仍冲突 → 409 `conflict` |

前端提示统一为「**有人刚改过，刷新后重试**」（ADR §2 逐字）。

> ADR §2 补了一句：「第一轮只有一个师傅在写，这条基本不会触发，但不能没有。」
> **不带 `If-Match` 的请求**：worker 只做 ref 级检查（等价 last-write-wins），并在响应 `warnings[]` 里带 `no-if-match`。本文建议 #27 的客户端**始终带上**。

### 3.3 写入 ≠ 发布（边界）

见 §4。这里只钉一条边界：**除 `POST /publish` 外，没有任何端点会让线上换版**——包括 `POST /rollback/:sha`（ADR §7：「回退**不自动发布**」）。

### 3.4 schema 允许、业务上离谱的输入

ADR「负面/代价」明写：「**没有审阅环节**；schema 允许但业务上离谱的数字（比如 480 份写成 4800）挡不住，只能靠发布前的采购单预览让人自己看见。」

worker **不做**业务合理性判断。但有两类「schema 管不到、代价却很低」的检查，本文建议加（**D-10，需 owner 确认**）：

| 检查 | 为什么 schema 管不到 | 建议行为 |
|---|---|---|
| `dishRef` / `ingredientRef` / `techniqueRef` 指向的文件是否存在 | JSON Schema 不做跨文件引用完整性 | **只警告不拒绝**：`warnings[]` 带 `dangling-ref`，仍然写入。理由：dish schema 本身允许不完整（「一道菜只有名字也能导入」），拒绝会挡住正常的「先排菜单再补菜」 |
| `pcs` 食材设了 `yield` | `ingredient.schema.json` 只在 description 里写「pcs 食材不得设置」 | 同上，`warnings[]` 带 `yield-on-pcs` |

**真正的闸门在发布时**：`build-deploy.yml` 的 `Validate data/**/*.json against schemas/*.schema.json` 与 `Gate — build-data --check --compare-snapshots`（ADR §3：「同一份 schema 校验在 worker 提交**之前**已经跑过一遍，发布时的 Validate 与 Gate 步骤是第二遍；两遍都在，只是都不在 PR 上」）。

### 3.5 限流

ADR §5：**每个角色令牌写入 60 次/小时、发布 10 次/小时**（Workers 限流绑定或 KV 计数器，#19 选其一）。超限 429。

> ADR **没说 `POST /rollback/:sha` 算哪个桶**。**本文新增（D-11）：回退单独一个桶，5 次/小时**——它是低危频次、高危后果的动作，塞进 60 次/小时的写入桶等于没有保护。

### 3.6 「未发布改动」怎么计数

ADR §3 裁决了口径：「**N 项未发布** = `main` 上动过 `data/` 的 commit 与线上 `data/build.json` 里 `commit` 之间的差集」。取数途径「前端调 GitHub compare API 或 worker 代理，二选一由 #20 定，不影响本 ADR」。

**本文把「一项」定义为一个 commit（D-12）**，并排除两类噪音：

| 排除 | 识别方式 | 为什么 |
|---|---|---|
| CI 的机翻回写 | commit message 为 `chore(i18n): machine translations [skip ci]`（`build-deploy.yml` 里逐字） | 它是上一次发布的**产物**，不是师傅的未发布改动 |
| 不动 `data/` 的 commit | compare 结果里该 commit 的 files 全在 `data/` 之外 | ADR §3 的口径就是「动过 `data/` 的 commit」 |

人话化文案（#25：「第 41 周菜单 · 周三午 160 → 180 · 09:14」）由 `X-CanteenOS-Endpoint` trailer + commit message 首行拼出来——**这也是 ADR §2 那条 trailer 的第二个用途**（第一个是 `git log --grep` 按角色回溯）。

---

## 4. 发布与回退

### 4.1 状态机总览

```
         POST /publish
[未发布 N>0] ──────────────► [已触发 runId] ──► ① 校验 ──► ② 翻译 ──► ③ 构建 ──► ④ 上线 ──► [已发布 N=0]
     ▲                            │                │          │          │          │
     │                            └─ 任一步 failure ┴──────────┴──────────┴──────────┘
     │                                              │
     │                                              ▼
     │                                       [失败，停在该步] ── 数据仍在 main，线上还是老版
     │                                              │
     └──────────── POST /rollback/:sha ◄────────────┘（可选，且回退后 N 再次 > 0）
```

### 4.2 四步的判定依据（ADR §6）

ADR §6 的映射表**按 `build-deploy.yml` 当前的步骤名逐字匹配**。以下步骤名本轮从 `refs/heads/main` 逐字读取，与 ADR §6 和 #62 第 ② 份的提醒块一致：

| 界面四步 | `build-deploy.yml` 里的步骤名（逐字） |
|---|---|
| ① 校验 | `Validate data/**/*.json against schemas/*.schema.json`、`Gate — build-data --check --compare-snapshots` |
| ② 翻译 | `Machine-translate missing en/uk (only when DEEPL_API_KEY is set)`、`Commit machine translations back to main` |
| ③ 构建 | `Build @canteenos/core`、`Build data (three sheets + build.json → packages/web/public/data/)`、`Build web (vite → packages/web/dist/)` |
| ④ 上线 | `build` 作业里的 upload-pages-artifact 步骤 + `deploy` 作业整体 |

聚合规则（ADR §6 逐字）：**任一 `failure` → 该步红并停在这里；全部 `success` → 绿；否则 → 进行中。**

**这张表是硬耦合**：改 `build-deploy.yml` 的步骤名会静默打断进度显示（ADR §6）。

### 4.3 三处对不上（本轮读原文发现，#19 开工前要处置）

> 这三条都是**读 `main` 上 `build-deploy.yml` 原文与 ADR §6 逐条比对**得出的，不是推测。

**(a) 四步不是单调推进的。** `build` 作业里步骤的物理顺序是：

```
Validate(①) → Machine-translate(②) → Commit translations(②) → Build @canteenos/core(③)
  → Gate(①) → Build data(③) → Build web(③) → configure-pages(未映射) → upload-pages-artifact(④)
```

**① 的第二个步骤 `Gate` 排在 ③ 的第一个步骤 `Build @canteenos/core` 之后。** 按 §4.2 的聚合规则，`Build @canteenos/core` 跑起来时 ① 仍是「进行中」而 ③ 已经「进行中」——**两步同时亮**，且 ③ 可能先于 ① 变绿。前端若按「上一步绿了下一步才开始」渲染，会显示成错乱。

处置二选一（**需 owner 定，本文不替他选**）：把 ① 改成「只看 `Validate`」，`Gate` 归 ③；或把 `Gate` 步骤在 workflow 里移到 `Validate` 之后。**后者要改 `.github/workflows/**`，卡在 #62。**

**(b) `configure-pages` 步骤没有被映射，且没有显式 `name:`。** `build-deploy.yml` 里 `actions/configure-pages@v5`、`actions/upload-pages-artifact@v3`、`actions/checkout@v4` 等都是裸 `uses:`，**没有 `name:`** ——GitHub 会自动命名成 `Run actions/configure-pages@v5` 一类。ADR §6 的表里写的是「upload-pages-artifact 步骤」，是**描述**不是逐字步骤名。

**(c) ADR §6 的集成测试断言按原文写会永远红。** ADR §6 要求「#19 的集成测试里断言映射表覆盖到 run 的全部步骤，出现未映射的步骤名即失败」。但一个 run 的 steps 里必然包含 `Set up job`、`Run actions/checkout@v4`、`Post Run actions/checkout@v4`、`Complete job` 等 GitHub 自动生成的步骤，它们**不可能被映射**。

**本文新增（D-13）**：把断言收窄为——「**`build-deploy.yml` 里所有带显式 `name:` 的步骤**都必须落在四步映射表里；出现未映射的显式 `name:` 步骤，`GET /publish/:runId` 返回 `unmappedSteps[]` 非空且 `status: "unmapped"`，集成测试 T-21 失败」。自动生成的步骤与裸 `uses:` 步骤按前缀 `Run ` / `Post ` / 固定名单忽略。同时 ADR §6 那句「workflow 里这些步骤上方加一行注释指向本节」**目前尚未落地**（`build-deploy.yml` 里没有这样的注释）——同样卡在 #62。

### 4.4 每一步的超时行为（本文新增，D-14）

ADR 未定义。建议：

| 情形 | 判定 | `GET /publish/:runId` 返回 |
|---|---|---|
| run 整体 `completed` 且 conclusion `success` | 四步全绿 | `status: "success"` |
| 任一步 `failure` | 停在该步 | `status: "failure"`，`failedStep` + `failureReason` |
| 触发后 90 秒仍查不到 run（`queued` 都没有） | 触发可能没生效 | `status: "queued"`，前端继续轮询；超过 3 分钟 → `status: "timeout"` |
| 单步进行中超过 10 分钟 | 卡住 | 仍返回 `in_progress`，但带 `slow: true`，前端提示「比平时慢，可以去 Actions 页面看看」并给 `htmlUrl` |
| run 整体超过 20 分钟未完成 | 超时 | `status: "timeout"`，前端停止轮询并给 `htmlUrl` |

**worker 侧不做任何主动干预**（不取消 run、不重试发布）——它只读 Actions API 并映射。ops-checklist §3.3 已有对应口径：「发布进度卡住不动……这属于『显示坏了』，不是『发布坏了』——先去 Actions 页面看那次 run 的真实状态。」

### 4.5 回退的确切语义（ADR §7）

`POST /rollback/:sha` 的实现步骤，ADR §7 逐字：读目标 sha 的 `data/` 目录树 → 用 Git Data API 造一个新 tree（**只替换 `data/` 这一个条目，其余路径原样保留**）→ 以当前 `main` 为父提交 → **更新 ref（非 force）**。

commit message：`revert(data): 恢复到 <短 sha>`，带同样的角色 trailer。

| 问题 | 答案 | 出处 |
|---|---|---|
| 回退到什么？ | **只回退 `data/`**。代码回退走正常的 git 流程，不经过 worker | ADR §7 |
| 会 force push 吗？ | **绝不**。历史不改写，`git log` 能看到「改错了 → 又退回来」的完整过程 | ADR §7 |
| 回退后数据与产物一致吗？ | **不一致，且这是有意的**。回退只改 `main` 上的 `data/`，线上产物还是老的；「N 项未发布」变成非零，师傅确认后再点发布 | ADR §7 |
| 为什么不自动发布？ | 「这样『回退』和『回退并上线』是两个可分辨的动作，误操作有一次挽回机会」 | ADR §7 |
| 回退的 commit 带 `[skip ci]` 吗？ | **带**。它是写入，不是发布（与 §3.3 的边界一致） | 本文新增，D-15（ADR §7 未明说） |

### 4.6 前端轮询协议（本文新增，D-16）

ADR 未定义。建议：

- **轮什么**：`GET /publish/:runId`。
- **间隔**：前 30 秒每 2 秒一次；之后每 5 秒一次。
- **终止条件**（任一成立即停）：`status ∈ {success, failure, timeout, unmapped}`；页面隐藏（`visibilitychange`）时暂停，回到前台立即补一次；用户离开 `/admin/publish`。
- **429 处理**：退避到 15 秒，最多退 3 次，仍 429 → 停止轮询并提示「查太频繁了，去 Actions 页面看」。
- **`GET /publish/:runId` 不计入写入桶**，走独立的读桶（本文建议 600 次/小时/令牌，够 5 次并发轮询用）。
- **失败后不自动重发布**——发布是师傅按的，不是前端替他按的。

---

## 5. 构建触发

### 5.1 正常态：`workflow_dispatch`

ADR §3：「**发布 = `POST /publish`**，worker 对 `build-deploy.yml` 发 `workflow_dispatch`，返回 `runId`。」

**入参**：#62 第 ② 份给出的成品改动是**裸 `workflow_dispatch:`，不带 `inputs:`**。所以 `POST /publish` 没有任何业务入参可传，worker 调用时只需 `{ "ref": "main" }`。

> ⚠️ **实现坑（本文新增，D-17）**：GitHub 的 `POST /repos/{o}/{r}/actions/workflows/{id}/dispatches` **返回 `204 No Content`，不返回 run id**。而 ADR §5 的返回体是 `{ ok: true, runId }`。所以 worker 必须：
> 1. dispatch 前记下 `main` 的 HEAD sha 与当前时间戳；
> 2. dispatch 之后轮询 `GET /actions/workflows/build-deploy.yml/runs?event=workflow_dispatch&branch=main`，取第一条 `created_at ≥ 时间戳` 且 `head_sha` 匹配的 run；
> 3. 最多轮 90 秒（与 §4.4 的 `queued` 判定一致），拿不到就返回 `{ ok: true, runId: null, status: "queued" }`，让前端稍后用 `GET /publish/latest`（**本文建议顺带加的一个只读别名**，返回最近一次 dispatch run）补上。
>
> **这一段是 `POST /publish` 里最容易被低估的复杂度，ADR 完全没提。**

### 5.2 降级态：权限解开之前怎么办

`workflow_dispatch:` 那一行还没进 `main`（#62 第 ② 份，权限卡点）。**在此期间 `build-deploy.yml` 的唯一触发器是 `push: branches: [main]`，仓库里也没有任何定时构建**（本轮逐字读过整份 workflow，没有 `schedule:`）——所以「由定时构建兜底」这条路**现在不存在**。

本文给三级降级（**D-04**），由 worker 的一个 secret `PUBLISH_MODE` 选择：

| 级别 | `PUBLISH_MODE` | `POST /publish` 做什么 | 前端显示什么 |
|---|---|---|---|
| **D0 正常** | `dispatch` | 发 `workflow_dispatch`，返回 `runId` | 四步进度，完整 |
| **D1 推送触发**（推荐的降级） | `push-trigger` | 在 `main` 上造一个**不带 `[skip ci]`** 的空 commit（message：`chore(publish): 触发构建`，带角色 trailer），`push: branches: [main]` 因此触发 build-deploy | 四步进度**照常显示**（runId 靠 §5.1 的轮询补，匹配条件改成 head_sha = 那个空 commit）。顶部加一条黄条：「发布走的是临时通道（#62 未解），进度可能晚几秒出现」 |
| **D2 只写不发** | `off` | 直接返回 **503 `dispatch_unavailable`**，不产生任何 commit | 发布按钮**置灰**，旁边一行字：「发布暂时关着：等 Terry 在 #62 点一次权限。你排的改动都已经存好了（N 项未发布），权限一开就能一次发出去。」**绝不能显示成『发布成功』** |

**D1 为什么可行**：写入 commit 带 `[skip ci]`（ADR §3），所以平时不触发；发布 commit 不带，正好触发。零 workflow 改动，是「写入 ≠ 发布」在没有 `workflow_dispatch` 时的等价实现。

**D1 的代价**：`main` 上多一条空 commit（ADR「负面/代价」已经接受了「`main` 会变吵」）；`git log` 里发布动作与写入动作混在一起（靠 `chore(publish):` 前缀区分）；`§3.6` 的未发布计数必须把 `chore(publish):` 的空 commit 也排除掉（它不动 `data/`，按 §3.6 的第二条规则自动排除，无需额外处理）。

**降级态下 #27 的客户端**必须读 `POST /publish` 响应里的 `mode` 字段决定 UI，**不要靠环境变量猜**。

---

## 6. 集成测试清单

执行简报 §4.6：「worker 每个端点一个集成测试（对测试仓库提交后回滚）」；#19 完成定义：「每端点一个测试；无密钥进 git（CI gitleaks 绿）；错误响应能被前端逐字段标黄」。

### 6.0 三层与在哪跑

| 层 | 跑在哪 | GitHub API | 关联 |
|---|---|---|---|
| **L1 契约层** | **CI 可跑**（`ci.yml` 的 `build-web` 作业里加一步，或新增 `worker-test` 作业）。worker 本地跑（miniflare / `wrangler dev --local`），GitHub API 用 fetch stub | 打桩 | **#57 / #62 第 ① 份**（`build-web` 作业本身还没进 CI） |
| **L2 真仓库层** | **CI 可跑但只在 `push: main`**（需要 PAT secret，fork PR 上不可用）。对一个专用测试仓库跑 | 真调 | #19「对一个测试仓库跑一遍写入 → 校验 → 回退」 |
| **L3 真机层** | **必须人工**。Terry 手机 + 真实部署 | 真调 | #27 完成定义「Terry 用手机在真实部署上完成一次 保存 → 发布 → 回退」；执行简报 §6 v0.3 签字 |

> ⚠️ **L2 的 `POST /publish` 与 `GET /publish/:runId` 在 `workflow_dispatch:` 进 `main` 之前只能测降级态 D1/D2**（§5.2）。T-15/T-16/T-17 因此标注为「**#62 解开后补测**」。

### 6.1 鉴权（L1）

| # | 前置 | 动作 | 期望 |
|---|---|---|---|
| T-01 | 三个 `TOKEN_HASH_*` 已设 | `POST /plan/week-43` **不带** `Authorization` | 401，`{ok:false, errors:[{path:"", code:"unauthorized"}]}`；**无 commit** |
| T-02 | 同上 | 带 `Authorization: Bearer <42 字符串>` | 401 `unauthorized`（长度先判，不算哈希） |
| T-03 | 同上 | 带一个合法长度但哈希不匹配的 token | 401 `unauthorized`；响应体与 T-01 **逐字节相同**（不泄露「令牌存在但错」） |
| T-04 | 同上 | 用 **buyer** token 调 `POST /plan/week-43` | **403** `forbidden`（不是 401）；无 commit |
| T-05 | 同上 | 用 **chef** token 调 `POST /rollback/<sha>` | **403** `forbidden`（ADR §5：rollback 只有 admin） |
| T-06 | 同上 | 用 **buyer** token 调 `GET /publish/123` | **200**（buyer 有读进度权限） |
| T-07 | 轮换 `TOKEN_HASH_CHEF` | 用**旧** chef token 调 `POST /plan/week-43` | 401 `unauthorized`（ops-checklist §2 第 3 步「旧链接立刻失效」） |
| T-08 | —— | 任一请求 | 响应头含 `Access-Control-Allow-Origin: https://terryyyc.github.io`（**逐字**）、`Vary: Origin`，**不含** `Access-Control-Allow-Credentials` |
| T-09 | —— | `OPTIONS /plan/week-43` 预检 | 200，`Access-Control-Max-Age: 600`，允许 `Authorization` 头 |

### 6.2 校验失败（L1）

| # | 前置 | 动作 | 期望 |
|---|---|---|---|
| T-10 | chef token | `POST /plan/week-43`，`meals[0].plannedServings = "200"`（字符串） | 400，`errors[0] = {path: "/meals/0/plannedServings", code: "type", …}`；**无 commit** |
| T-11 | chef token | 同上，缺 `schemaVersion` | 400，`path: ""` 或 `/`，`code: "required"` |
| T-12 | chef token | 同上，`meals[0].mealType = "brunch"` | 400，`code: "enum"` |
| T-13 | chef token | 同上，多一个 `meals[0].notes` 键 | 400，`code: "additionalProperties"`（menu-plan schema 是 `additionalProperties: false`） |
| T-14 | chef token | `POST /plan/WEEK-43`（大写） | 400 `bad_id`（`^[a-z][a-z0-9-]*$`） |
| T-15 | chef token | 请求体 `{"name":{}}` 给 `POST /ingredient` | 400，I18nString 的 `anyOf` 失败 → `code: "anyOf"`，`path: "/name"` |
| T-16 | chef token | `POST /dish/x/draft`，body `{"name":{"zh":"红烧肉"},"status":"active"}` | **200**，写入文件里 `status` 是 `"draft"`（worker 强制），响应 `warnings` 含 `status-forced` |
| T-17 | chef token | `POST /plan/week-43`，`meals[0].dishRef = "no-such-dish"` | **200**（不拒绝），`warnings` 含 `dangling-ref`（D-10；**若 owner 否掉 D-10，本例改为期望 400**） |
| T-18 | chef token | 构造一个路径穿越请求（`:planId` = `..%2F..%2Fpackages%2Fweb%2Findex.html` 之类） | 400 `bad_path`；**日志里不含请求体**（ADR §8 第 1 层） |
| T-19 | chef token | JSON 体 300 KB | 413 `too_large` |
| T-20 | chef token | 请求体是 `{"a":` （截断的 JSON） | 400 `bad_json`，不是 502 |

### 6.3 幂等与并发（T-21–T-22 是 L1，T-23–T-24 是 L2）

| # | 前置 | 动作 | 期望 |
|---|---|---|---|
| T-21 | `week-43.json` 已存在且内容 X | 用**逐字相同**的 X 再 `POST /plan/week-43` | 200，`unchanged: true`，`commit` = 当前 HEAD，**GitHub 写 API 一次都没调**（D-05） |
| T-22 | 同上 | 用 X 但键顺序打乱、缩进不同 | 200，`unchanged: true`（稳定序列化后逐字节相同） |
| T-23 | 测试仓库，`week-43.json` blobSha = A | 带 `If-Match: A` 写 → 成功；再带 `If-Match: A` 写第二次 | 第二次 **409 `conflict`**，且 **worker 不重试**（文件级冲突不重试，§3.2） |
| T-24 | 测试仓库 | 并发发两个写入，改**不同**文件（`week-43.json` 与 `tomato.json`） | 两个都 200；worker 至少有一次走了「重读一次并重试一次」的 ref 级路径（断言重试计数 ≥ 1）；`main` 上两个 commit 都在 |

### 6.4 发布与构建触发

| # | 层 | 前置 | 动作 | 期望 |
|---|:--:|---|---|---|
| T-25 | L1 | `PUBLISH_MODE=off` | `POST /publish` | **503** `dispatch_unavailable`；**无 commit**；前端按 §5.2 D2 置灰 |
| T-26 | L1 | `PUBLISH_MODE=push-trigger` | `POST /publish` | 200，`mode: "push-trigger"`，产生一个**不带 `[skip ci]`** 的空 commit |
| T-27 | L1 | dispatch API 打桩返回 500 | `POST /publish` | **502** `upstream_error`（不是 200） |
| T-28 | L1 | dispatch 打桩 204，但 runs 列表 90 秒内始终为空 | `POST /publish` | 200，`runId: null`，前端进 `queued` 态而不是报错（D-17） |
| T-29 | L1 | 打桩一个 run，其 steps 逐字用 §4.2 的 8 个名字 + `Set up job` / `Run actions/checkout@v4` / `Complete job` | `GET /publish/:runId` | 四步映射正确；`unmappedSteps` 为空（自动生成步骤被忽略，D-13） |
| T-30 | L1 | 打桩一个 run，多一个显式 name 步骤 `Lint something` | `GET /publish/:runId` | `status: "unmapped"`，`unmappedSteps: ["Lint something"]`，**测试失败即视为 workflow 改了步骤名**（ADR §6 的兜底，按 D-13 收窄） |
| T-31 | L1 | 打桩 `Gate — build-data --check --compare-snapshots` = failure | `GET /publish/:runId` | `status: "failure"`，`failedStep: "validate"`（按 ADR §6 现行映射；**若采纳 §4.3(a) 的另一种处置，期望改为 `"build"`**） |
| T-32 | L1 | 打桩 run 进行中 25 分钟 | `GET /publish/:runId` | `status: "timeout"`，带 `htmlUrl`（D-14） |
| T-33 | **L2** | 测试仓库有 `workflow_dispatch:` | `POST /publish` → 轮询到终态 | 拿到 `runId`；四步全绿；**#62 解开后补测** |
| T-34 | L1 | chef token 连发 61 次写入 | 第 61 次 | 429 `rate_limited`（ADR §5：60 次/小时） |
| T-35 | L1 | chef token 连发 11 次发布 | 第 11 次 | 429（ADR §5：10 次/小时） |
| T-36 | L1 | admin token 连发 6 次回退 | 第 6 次 | 429（D-11：回退单独 5 次/小时） |

### 6.5 回退

| # | 层 | 前置 | 动作 | 期望 |
|---|:--:|---|---|---|
| T-37 | **L2** | 测试仓库：commit A（`data/` 正确）→ commit B（改坏 `week-43.json`） | admin `POST /rollback/<A>` | 200；`main` 上多一个 **新 commit**（`revert(data): 恢复到 <短 A>`）；`git log` 里 A 与 B **都还在**（非 force push，ADR §7） |
| T-38 | **L2** | 同上 | 回退后检查树 | `data/` 内容 = A 时的内容；**`data/` 之外的路径逐字未变**（ADR §7：「只替换 `data/` 这一个条目，其余路径原样保留」） |
| T-39 | **L2** | 同上 | 回退后查「N 项未发布」 | **非零**（ADR §7：回退不自动发布） |
| T-40 | **L2** | 同上 | 回退 commit 的 message | 含 `[skip ci]`（D-15）与 `X-CanteenOS-Role: admin` trailer |
| T-41 | L1 | —— | `POST /rollback/zzzz` | 400 `bad_id`（不匹配 `^[0-9a-f]{7,40}$`） |
| T-42 | L1 | —— | `POST /rollback/<不存在的合法 sha>` | 404 `not_found` |
| T-43 | **L3 真机** | 真实部署 | Terry 手机：保存 → 发布 → 等三张单更新 → 回退 → 再发布 → 三张单恢复 | 全程不碰 JSON；`data/build.json` 的 `commit` 两次都变过（ops-checklist §3.1 的判版方法） |

### 6.6 密钥与日志

| # | 层 | 动作 | 期望 |
|---|:--:|---|---|
| T-44 | CI | gitleaks 扫 `packages/worker` | 绿（#19 完成定义；**gitleaks workflow 本身卡在 #62 第 ③ 份**） |
| T-45 | L1 | 触发 401 / 400 / 502 各一次后读日志 | 日志只有 `{时间, 角色, 端点, HTTP 状态}`；**grep 不到令牌、不到请求体、不到任何人名邮箱**（ADR §8 补充；执行简报 §7） |
| T-46 | **L2** | 检查 PAT 权限 | Contents RW + Actions RW，**无 Workflows**（ADR §8 第 2 层；ops-checklist §1 的权限核对行） |

---

## 7. 安全边界（对齐 ADR §8）

| 层 | 内容（ADR §8 逐字要点） | 现状 |
|---|---|---|
| **1. 路径白名单（worker 内）** | 写入路径必须逐字匹配固定形状；含 `..`、绝对路径、以及任何 `schemas/`、`packages/`、`scripts/`、`.github/`、根目录文件的写入请求一律 400，**且不记录请求体** | **随 #19 落地**。测试 T-18 |
| **2. 凭据本身够不着** | 细粒度 PAT，仅本仓库，权限只有 Contents RW + Actions RW，**没有 Workflows 权限**——即便 worker 被完全攻破，也改不了 `.github/workflows/**` | **随 #19 落地**。到期日进 ops-checklist §1（#34 已建表待填）。测试 T-46 |
| **3. 事后守卫（CI）** | `ci.yml` 加 job：凡作者为 `canteenos-bot` 的 commit，若改动落在 `data/` 之外即失败 | **⛔ 卡在 #62**（第 ④ 份成品 YAML 已写好，权限一给即可推）。**在此之前三层防御实际只有两层** |

> #62 第 4 节对第三层的现状有一句判词：「ADR-0007 §8 声称『任一层单独失效都不足以出事』，但第三层根本没实现……这会让 PR #61 的 ADR 在合并时描述与现实不符。」**本文照抄这个判断，不缓和。**

### 7.1 ADR §8 第 1 层那条正则本身有问题

ADR §8 给的示意正则（原文标注「精确正则见实现」）：

```
^data/(ingredients|dishes|menu-plans)/[a-z0-9][a-z0-9-]*(/images/[a-z0-9][a-z0-9-]*\.(jpg|png|webp))?\.json$
```

三处对不上，**#19 写实现时不能照抄**：

1. **可选的图片分组在 `\.json$` 之前** → 一个图片路径必须长成 `data/dishes/x/images/y.jpg.json` 才能匹配。图片路径实际上匹配不上。
2. **`[a-z0-9][a-z0-9-]*` 允许数字开头**，而 `common.schema.json#/$defs/Id` 是 `^[a-z][a-z0-9-]*$`（**必须字母开头**）。白名单比 Id 松，等于给了一批「schema 校验会过但 id 不合法」的文件名。
3. **执行简报 §1.7 允许 `data/ingredients/<id>.jpg`（平铺，不在 `images/` 下）**，这条正则不允许。

本文建议拆成两条互不重叠的正则（**D-18**）：

```
实体：  ^data/(ingredients|dishes|menu-plans)/[a-z][a-z0-9-]*\.json$
图片：  ^data/(ingredients|dishes)/[a-z][a-z0-9-]*(/images)?/[a-z][a-z0-9-]*\.(jpg|png|webp)$
单文件：^data/techniques\.json$
```

另外两条注记：

- `data/techniques.json` 在 ADR §8 的白名单里（「或 `data/techniques.json`」），但 **ADR §5 的端点表里没有任何端点写它**。要么删掉白名单里这一条，要么补一个端点（本轮不建议补——`techniques.json` 是闭集词表，v0.4 由 `seed-wikidata.py` 与人工维护）。
- `data/translations.lock.json` **不在白名单里**，这是对的：它由 `build-deploy.yml` 的 `Commit machine translations back to main` 步骤写，不经过 worker。**但如果 `POST /translate`（#19）最终要落盘 lock，它会被第 1 层挡掉** ——判断题之外的一个待定项，随 `POST /translate` 的去留一起定。
- `data/purchase-orders/` **不在白名单里**，也是对的：它是引擎输出快照（`docs/architecture.md` §3「引擎 → 知识库」边界规则）。

---

## 8. 依赖与前置

| # | 开工前必须先解决的事 | 现状 | 卡在哪 |
|---|---|---|---|
| 1 | **`build-deploy.yml` 加 `workflow_dispatch:`** | ❌ 未做。`main` 上的 `on:` 只有 `push: branches: [main]`，**且没有 `schedule:`** | **#62 第 ② 份**（GitHub App 缺 Workflows 权限，2026-09-08 第三次实测仍 `403 Resource not accessible by integration`）。ADR §3 称其为「#19 开工前的**唯一**外部依赖」 |
| 2 | **ADR-0007 合并**（合并即批准，Status → Accepted） | ❌ PR #61 待合并 | Owner 需回答 §9 的两个判断题 |
| 3 | `ci.yml` 加 `bot-scope-guard`（ADR §8 第三层） | ❌ 未做 | **#62 第 ④ 份**，同一颗权限 |
| 4 | `secrets-scan.yml`（gitleaks，#19 完成定义要它绿） | ❌ 未做，`.github/workflows/` 下只有 3 个文件 | **#62 第 ③ 份**，同一颗权限。**注：该份 YAML 自标「版本与 digest 未核验」** |
| 5 | `ci.yml` 加 `build-web`（CI 跑单测 + 构建） | ❌ 未做 | **#57 / #62 第 ① 份**，同一颗权限。**后果**：worker 的 L1 契约测试现在**没有地方跑**——CI 里连既有 66 个单测都没跑 |
| 6 | ajv standalone 预编译产物的生成步骤进构建 | ❌ 未做 | ADR「跟进事项 3」，归 #19 自己 |
| 7 | Cloudflare 账号 + Worker + secrets（3 个 `TOKEN_HASH_*` + PAT） | ❌ 未做 | Owner 手工，且 PAT 的 secret 名 ops-checklist §1 还留着空（本文提名 `GITHUB_PAT`，D-09） |
| 8 | 集成测试用的测试仓库（L2） | ❌ 未建 | #19「对一个测试仓库跑一遍写入 → 校验 → 回退」，需要 owner 建仓 + 一把只对它有效的 PAT |
| 9 | `packages/web/src/api/mock.ts` 与本文契约对齐 | ⚠️ 未知（#20–#25 各自对着它开发） | 若 mock 已按 ADR §5 的 6 端点实现，需按本文补 `unchanged` / `blobSha` / `mode` / `warnings` 四个字段，否则 #27 换真实 client 时会漏 |

**不阻塞开工的**（ADR「跟进事项」原文：「都不阻塞 #19 开工，除了第 ①」）：PAT → GitHub App 迁移、令牌加有效期、buyer 写权限——全部第二轮。

---

## 9. 两个未拍板的 owner 判断题

来自 PR #61 的复核评论：「**你实际只需要判断两件事**」。其余七条（Cloudflare Workers、写入≠发布、令牌放 fragment、端点权限矩阵、四步进度映射、回退语义、三层安全边界）是「在既有约束下的唯一解或明显占优解」，本文照单执行。

**下面两节的意义**：无论 owner 怎么选，本文档都不作废——每条都写清了两种取值下契约分别怎么变。

### 9.1 判断题 ①：图片压缩放浏览器，还是放 worker？

- **ADR §9 的裁决**：放浏览器。`/admin/ingredient/new` 用 canvas 缩到最长边 ≤ 1280、编码到 ≤ 200 KB 再上传；worker 只做校验（`Content-Length ≤ 200 KB`、magic bytes ∈ jpg/png/webp、尺寸头解析合法），不做像素处理。
- **这条偏离了执行简报 §3 v0.3**（「拍照上传（worker 压缩到 ≤ 200 KB）」），**ADR §9 自己写明「需要 owner 明确点头」**。
- **说「不」的后果**（复核评论逐字）：回退成「worker 接第三方图片服务」，多一个外部依赖 + 一个新密钥，另起 issue。

| | **A：放浏览器**（ADR §9 现裁决） | **B：放 worker**（执行简报原文） |
|---|---|---|
| **端点** | `POST /image` 是**校验 + 落盘**端点 | `POST /image` 是**压缩 + 落盘**端点 |
| **请求** | `Content-Type: image/jpeg\|png\|webp`，体 ≤ **200 KB** | 体 ≤ **10 MB**（手机原图），JSON 端点上限不适用 |
| **必带字段** | `license` 必须随请求给（`ImageRef.license` 是 schema 必填），建议放请求头 `X-Image-License` / `X-Image-Author` / `X-Image-Source-Url` | 同左 |
| **新增字段** | 无 | 响应需回 `{ originalBytes, storedBytes, longestEdge }` 给前端显示「已压缩」 |
| **超限行为** | **413 `too_large`**——「绕过前端直接 POST 大图会被 413 挡掉而不是被压缩；**这正是想要的行为**」（ADR §9 逐字） | 413 只在超 10 MB 时触发；200 KB–10 MB 是**正常路径** |
| **新密钥** | 无 | **有**：第三方图片服务的 API key（Workers 无图像库；WASM 编解码器会把单文件 worker 撑成几百 KB） |
| **测试用例** | 新增：T-47 上传 210 KB → 413；T-48 上传伪造扩展名（magic bytes 不符）→ 400；T-49 浏览器侧压缩后 ≤ 200 KB 且最长边 ≤ 1280（**L3 真机，弱网**） | 上述三条**全部改写**：T-47 变成「上传 3 MB → 200 且存盘 ≤ 200 KB」；新增「第三方服务 500 → 502」；新增「密钥不进日志」 |
| **ops-checklist §3.3 的 413 行** | 现文「照片超 200 KB → 从 `/admin` 页面正常上传（浏览器会先压到 ≤ 200 KB、最长边 ≤ 1280）」**已经按 A 写好** | **必须改**（该文件已合并，改它要另起 PR） |
| **#19 任务清单** | **必须改**：#19 原文「`POST /image` 接收照片，**压缩到 ≤ 200 KB / 1280px**，写入对应目录」是 B 的描述 | 与 #19 原文一致，不用改 |

> **无论选哪个，`POST /image` 都得补进 ADR §5 的端点表与权限矩阵**——它现在在那张表里没有行。

### 9.2 判断题 ②：写入直接 commit `main`，还是走自动合并 PR？

- **ADR §2 的裁决**：直接 commit `main`。理由：审计靠 git 历史（作者 `canteenos-bot` + `X-CanteenOS-Role` / `X-CanteenOS-Endpoint` trailer，`git log --grep` 可按角色/端点回溯）；单人编辑没有审阅者（ADR-0006 §5）。
- **说「不」的后果**（复核评论逐字）：每次写入多两次 API 往返、多一个 merge commit、多一个「PR 开了没合上」的失败态。

| | **A：直接 commit main**（ADR §2 现裁决） | **B：自动合并 PR** |
|---|---|---|
| **成功响应** | `{ ok, commit, blobSha, unchanged }` | **多一个 `prNumber`**；且 `commit` 的语义变成「merge commit sha」而不是「写入 commit sha」——#25 的「回到这版」要传哪个 sha 需重新定义 |
| **新增失败态** | 无 | **`pr_open`**：PR 建了但自动合并没成（分支保护 / 检查未过 / 冲突）。需要新 HTTP 状态（建议 **202 Accepted** + `{ ok: true, prNumber, merged: false }`），**ADR §5 的状态清单里没有 202** |
| **幂等（§3.1）** | 内容相同 → 不产生 commit | 内容相同 → **不产生 PR**；但还要处理「上一次的 PR 还开着」这个新状态 |
| **并发（§3.2）** | ref 级重试一次（ADR §2） | 冲突推迟到**合并时**才暴露 → 409 变成异步的，前端得轮询 PR 状态 |
| **`[skip ci]`（§4）** | 写在写入 commit 上，直接生效 | **失效风险**：`pull_request` 事件不看 commit message 的 `[skip ci]`；`ci.yml` 会在每个写入 PR 上跑一遍。ADR §3 那句「带 `[skip ci]` 的写入 commit 不会被 `ci.yml` 校验」的代价论证要整段重写 |
| **未发布计数（§3.6）** | 数动过 `data/` 的 commit | 数 merge commit，**且必须排除 merge commit 引入的 parent commit 重复计数** |
| **回退（§4.5）** | 目标 sha 是写入 commit | 目标 sha 是 merge commit；`data/` 树的取法不变，但 #25 的「发布记录」列表要显示 PR 号 |
| **安全边界第 3 层** | `bot-scope-guard` 按 commit 作者判（#62 第 ④ 份） | **该 job 会漏**：#62 第 ④ 份自己写了「合并 commit 上 `git show --name-only` 默认输出为空……如果将来有人用 bot 身份做合并，这个守卫会漏过去」。**B 会让这个已知漏洞变成常态路径** |
| **PAT 权限** | Contents RW + Actions RW | **还要 Pull requests RW** ——ADR §8 第 2 层「凭据本身够不着」的论证要重写 |
| **测试用例** | T-21–T-24 如上 | 全部改写；新增「PR 开了没合上 → 202 且前端显示待合并」「合并冲突 → 409」「`ci.yml` 在写入 PR 上跑了一遍（本来不该跑）」 |

> **B 的连锁改动比 A 大得多**（至少 6 处契约变更 + 1 处安全论证重写 + PAT 多一项权限）。这不是替 owner 做决定，是把代价摊开。

---

## 10. 本文档新增的决定（需 owner 确认）

ADR-0007（PR #61，待合并）没写、但 #19 一开工就必须回答的。**每条都是可以被推翻的**——推翻只需改本文，不需要改 ADR。

| # | 决定 | 依据 | 反方案 |
|---|---|---|---|
| **D-01** | `POST /ingredient` 改成 **`POST /ingredient/:id`** | `ingredient.schema.json` 是 `additionalProperties: false` 且无 `id` 字段，`common.schema.json#/$defs/Id` 明写「文件内不再重复 id 字段」；改路径与另两个写入端点对称，且**不动 schema**（schema 变更是 owner 护栏项） | 保留 `POST /ingredient` + 信封体 `{id, ingredient}`。缺点：三个写入端点形状不一致，#27 的客户端要写两套 |
| **D-02** | 定义 §1.8 的 `code` 全集与中文提示语；新增 **404 / 503** 两个状态 | ADR §5 只给了 `type` / `conflict` 两个样例值与 7 个状态；#19 完成定义要求「错误响应能被前端逐字段标黄」，没有 code 全集前端无法穷举 | 只用 ajv 的 keyword 当 code，worker 级错误一律 `path: ""` + 状态码。缺点：401/403/409 在前端无法区分文案 |
| **D-03** | `GET /publish/:runId` 的响应 JSON 形状（`steps[]` / `failedStep` / `unmappedSteps`） | ADR §6 只裁决了映射关系，没给形状；#25 要显示「四步 + 耗时 + 失败在哪一步与原因」 | 直接透传 GitHub Actions 的 jobs/steps 原样，前端自己映射。缺点：映射表会散到前端，ADR §6「硬耦合」的约束就没地方落 |
| **D-04** | `POST /publish` 加 `mode` 字段；三级降级 `dispatch` / `push-trigger` / `off`，由 secret `PUBLISH_MODE` 选 | §5.2：`workflow_dispatch:` 卡在 #62，而仓库里**没有 `schedule:`**，「定时构建兜底」不存在；不给降级态，#19 就真的一行都写不了 | 只做 `off`（写入可用、发布置灰），等 #62。缺点：#19 的发布链路一条测试都跑不了 |
| **D-05** | 幂等 = **内容幂等**（稳定序列化后逐字节相同则不产生 commit），响应加 `unchanged` | ADR §1 强调 worker 无状态（「删掉它数据一点不少」）；内容幂等不需要任何存储 | `Idempotency-Key` 头 + KV 存 5 分钟。缺点：破无状态，多一个绑定 |
| **D-06** | 新增只读端点 **`GET /source/:kind/:id`**，返回 `{content, blobSha, commit}` | ADR §2 的乐观锁要求前端提供文件 sha，但 ADR §5 没有任何读端点；匿名 GitHub API 是 60 次/小时/IP，后台一屏就可能打光 | 前端直读 GitHub Contents API。缺点：限流风险 + 前端要处理 base64 解码与 ETag |
| **D-07** | JSON 端点请求体上限 **256 KB** | ADR 只给了图片的 200 KB；`week-41.json` 约 700 字节，256 KB 有 300 倍余量 | 1 MB。缺点：413 就基本不会触发，等于没有上限 |
| **D-08** | `planId` 非 `week-NN` 形状**只警告不拒绝** | schema 层面 planId 只受 `Id` 正则约束；周号是文档约定（`week-43` = 2026-10-19 那周），硬拒会挡住「排半个月」「排某个节日」这类合法用法 | 硬性要求 `^week-(0?[1-9]\|[1-4][0-9]\|5[0-3])$`。缺点：不够用时要改 worker 才能排菜单 |
| **D-09** | PAT 的 Workers secret 定名 **`GITHUB_PAT`** | `docs/field-test/week-43/ops-checklist.md` §1 明确留了这个空：「ADR 只写死了三个令牌哈希 secret，没给 PAT 的 secret 名。#19 落地后回来把上表补全」 | 任何其他名字。**关键不是叫什么，是落地后必须回填 ops-checklist §1 的登记表**（该文件本轮不改） |
| **D-10** | 跨文件引用（`dishRef` / `ingredientRef` / `techniqueRef`）**只警告不拒绝** | dish schema 本身允许不完整（「一道菜只有名字也能导入」）；真正的闸门是发布时的 `Validate` 与 `Gate`（ADR §3） | 拒绝（400 `ref_not_found`）。缺点：挡住「先排菜单再补菜」，与 readiness 分级理念相反 |
| **D-11** | `POST /rollback/:sha` **单独限流 5 次/小时** | ADR §5 只给了「写入 60/h、发布 10/h」两个桶，没说回退算哪个；回退是低频高危动作 | 并进写入桶。缺点：60 次/小时对一个能覆盖整个 `data/` 的动作太宽 |
| **D-12** | 「N 项未发布」的**一项 = 一个动过 `data/` 的 commit**，排除 `chore(i18n): machine translations` | ADR §3 只说「差集」；#20 要显示 N，#25 要人话化列表，必须有确定的计数单位。机翻回写是上一次发布的产物，不是师傅的改动 | 一项 = 一个被改动的文件。缺点：一次保存改两个文件会显示成 2 项，师傅会困惑 |
| **D-13** | ADR §6 的「全步骤覆盖」断言收窄为「**所有带显式 `name:` 的步骤**」，自动生成步骤按前缀忽略 | ADR §6 原文「映射表覆盖到 run 的全部步骤，出现未映射的步骤名即失败」按字面写会**永远红**——`Set up job` / `Post Run …` / `Complete job` 不可能被映射（§4.3(c)） | 维护一份显式忽略名单。缺点：GitHub 改了自动步骤名就会误红 |
| **D-14** | 每步与整体的超时行为（90 秒 / 3 分钟 / 10 分钟 `slow` / 20 分钟 `timeout`），worker **不主动干预** | ADR 完全未定义；ops-checklist §3.3 已有「进度卡住 ≠ 发布坏了」的口径，本条是它的机器化 | 无超时，永远转圈。缺点：ops-checklist §3.3 的分诊没有触发条件 |
| **D-15** | 回退 commit **带 `[skip ci]`** | ADR §7 明写「回退不自动发布」，而 §3 的不发布机制就是 `[skip ci]`；不带就等于回退即发布，与 §7 正面冲突 | 不带。**这不是可选项，是 §7 的必然推论**；列在这里只是因为 ADR §7 没把这句话写出来 |
| **D-16** | 前端轮询协议（2 秒 / 5 秒、终止条件、429 退避、读桶 600/h） | ADR 未定义；#25 要「轮询 `GET /publish/:id` 显示四步与耗时」 | 固定 5 秒。缺点：前 30 秒体感慢，师傅会反复点 |
| **D-17** | `POST /publish` 内部**轮询 runs 列表**来取 `runId`（dispatch API 返回 204 无 body） | ADR §5 的返回体要求 `runId`，但 GitHub 的 dispatch 接口不返回它。这是硬约束，不是选择 | 返回 `runId: null`，让前端自己去找。缺点：把 GitHub API 细节漏给前端，#27 要重复实现一遍 |
| **D-18** | ADR §8 第 1 层的路径白名单**拆成三条正则**（实体 / 图片 / 单文件） | ADR 原文那条正则有三处对不上（图片路径匹配不上、允许数字开头与 `Id` 冲突、不允许执行简报 §1.7 的平铺图片路径），详见 §7.1。ADR 自己标注了「精确正则见实现」 | 照抄 ADR 的示意正则。缺点：图片端点会被自己的白名单挡死 |

---

## 附：本文引用的源文件

全部经 GitHub API 逐份读取，**未执行任何构建或测试**。

| 文件 | ref | 用途 |
|---|---|---|
| `docs/adr/0007-write-channel.md` | **`refs/pull/61/head`（待合并）** | 主输入，§1–§9 逐节 |
| PR #61 复核评论 | —— | 两个 owner 判断题、`week-42`/`week-43` 硬伤 |
| `docs/execution-brief.md` | `main` | §1.2 / §1.4 / §1.7 / §3 v0.3 / §4 / §5 / §6 / §7 |
| `docs/architecture.md` | `main` | §1 / §2 / §3 / §5 |
| `.github/workflows/build-deploy.yml` | `main` | 逐字步骤名、`on:` 块、bot 作者名 |
| `schemas/common.schema.json` | `main` | Id / I18nString / Unit / Quantity / Money / ImageRef / MealType |
| `schemas/menu-plan.schema.json` | `main` | §1.1 字段表 |
| `schemas/ingredient.schema.json` | `main` | §1.2 字段表 |
| `schemas/dish.schema.json` | `main` | §1.3 字段表 |
| `packages/core/src/types.ts` | `main` | 交叉核对（**发现与 schema 的一处不一致，见下**） |
| `data/menu-plans/week-41.json` | `main` | 周号约定的交叉验证 |
| `data/`（目录树） | `main` | 写入落盘路径 |
| `docs/field-test/week-43/ops-checklist.md` | `main` | §2.6 / §1.8 的口径对齐 |
| issue #19 / #20 / #25 / #26 / #27 / #57 / #62 | —— | 端点清单、前端需求、卡点现状 |

### 顺手发现的一处 schema / types 不一致（不属于本文范围，另起 issue）

`schemas/menu-plan.schema.json` 的 `margin` description 写的是「**仅对按重量/体积（g/ml）计的食材生效，pcs 计数食材不乘**」，而 `packages/core/src/types.ts`、`schemas/ingredient.schema.json` 的 `pcsToGram` description、以及 `docs/execution-brief.md` §1.3 的引擎语义都写的是「**margin 对所有食材生效（ADR-0006 2026-09-06 修正）**」。

**只有 description 陈旧，没有任何校验规则受影响**（`margin` 的约束仍是 `exclusiveMinimum: 0`），所以不影响 worker 的校验行为，也不影响黄金数字。但它是 `schemas/` 里的文字，而 `schemas/` 是单一事实源——**建议另起一个一行 PR 改掉**。
