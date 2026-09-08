# v0.3 师傅后台（/admin）前端契约 · #20–#25

> **本文档的地位。** 它是 `docs/execution-brief.md` §3 v0.3 与 `docs/prd.md` §4.4 在前端上的**投影**，不是新决策。优先级链条照执行简报开头那一段：`docs/execution-brief.md` > `docs/plan-for-terry.md` > `docs/roadmap-v2.md` > ADR-0006 > 其他文档 —— **本文属于「其他文档」，与前四者冲突一律以前者为准**。凡本文与既有文档/代码不一致的地方，全部集中在 §9 显式标注，不藏在正文里。
>
> **UI 版式不在本文范围。** 执行简报写明「设计稿是 UI 的事实源：`docs/design/backoffice-v1.html`（后台）」。**本轮未读该文件**，因此本文一个像素、一个字号、一处间距都不规定；凡涉及版式一律以设计稿为准。本文只钉四件事：**路由 / 逐屏数据与状态契约 / 文件归属与防撞规则 / i18n 与 mock 边界**。
>
> **本轮无沙箱、无构建、无验证。** 沙箱 `No space left on device`。下文所有关于现有代码的陈述都来自 GitHub API 逐份读取的仓库原文（清单见附录），**没有任何一行被执行过**，也没有跑过 `tsc` / `vite build` / 测试。
>
> **未合并内容的引用口径**：ADR-0007（PR #61，**待合并**）；`docs/specs/v03-worker-contract.md`（PR #64，**待合并**，下文简称「worker 契约」）。worker 契约与本文冲突时**以 worker 契约为准**，本文跟进修订。
>
> 读者：#20 / #21 / #22 / #23 / #24 / #25 六个实现 agent，以及 #27（后台接真实 worker）。

---

## 0. 为什么现在写这个

六个前端 issue 会被**最多 5 个 agent 同时**实现，而它们全都要动同三样东西：路由注册、i18n 资源、全局样式。没有一份事先钉死的归属表，结果必然是三选一：撞车、风格分裂、返工。

本文的成功标准只有一条：**任何一个实现 agent 只读本文 + 自己那一节 + 设计稿，就能开工，且它改的文件与另外四个 agent 的文件集合交集为空。**

---

## 1. 口径与共享前提（全部来自实际读到的文件）

开工前必须知道的既有约定。每条都标了出处，**没有一条是推测的**。

### 1.1 页面契约

`packages/web/src/types.ts` 逐字规定：

- 每个页面是 `src/pages/<route>.ts`，只导出 `export function render(el: HTMLElement, ctx: PageCtx): void | Promise<void>`。
- `el` 是本次渲染专属的空容器（`<section class="outlet">`），已挂 DOM；**路由或语言一变，壳层换一个新 `el` 再调 `render`**，旧 `el` 已摘掉，晚到的异步渲染写进旧 `el` 无害。
- `PageCtx = { lang, planId, route, rest, data, t }`。**没有 `shell`、没有 `setTitle`、没有 `navigate`**。
- 内容文本用 `pick(i18nString, ctx.lang)`；UI 文案用 `ctx.t(key)`；**页面专属文案自己在 `pages/<x>.ts` 里建小字典即可，不必都塞进 `i18n.ts`**。
- 数据只从 `ctx.data` 拿；失败抛 `DataError`，页面显示 `ctx.t("data.notReady")`。
- **文本一律 `textContent`**（`src/dom.ts` 的 `h()`），JSON 不进 `innerHTML`。
- 页面私有样式 `pages/<x>.css`，在 `pages/<x>.ts` 顶部 `import`；共用样式在 `styles.css`。
- 子状态用 hash 第二段 `#/<route>/<rest>`，页面从 `ctx.rest` 读。

> **推论 A（后台的头号坑）**：语言切换 = 整页重新 `render`（`packages/web/src/main.ts` 的 `onLangChange(() => { shell.refresh(); renderPage(); })`）。前台三张单是只读的，重渲染没有代价；**后台是表单，重渲染会把用户没保存的输入全部清空**。每一屏都必须把「未提交的表单值」存进模块级变量并在 `render` 时回填 —— `prep.ts` 的 `let filter`、`menu.ts` 的 `let rememberedMeal` 就是这个模式。这条进每屏的验收标准。

### 1.2 路由（`packages/web/src/router.ts`）

- hash 路由，**顶层页面只有五个**：`export type Route = "prep" | "purchase" | "menu" | "admin" | "qr"`，`DEFAULT_ROUTE = "prep"`。
- `parseHash` 的正则是 `/^#\/?([^/?#]*)(?:\/(.*))?$/`：第一段必须逐字命中 `ROUTES`，否则返回 `null`；`normalize()` 随即 `location.replace` 到 `#/prep`（**不留历史记录**）。
- 页面段之后的部分原样交给页面（`rest`，已 `decodeURIComponent` 一次），**路由器不解释**。
- `hrefOf(page, rest)` 会把 `rest` 整体 `encodeURIComponent`，因此多段 rest 里的 `/` 会变成 `%2F`。`prep.ts` 的 `prepHref()` 与 `menu.ts` 的 `menuHref()` 都选择**手工拼接**以保持 URL 可读 —— 后台照抄这个做法。
- `main.ts` 里 `const PAGES: Record<Route, PageRender>` 与 `const TITLE = {...}` 是同一份 `Route` 的两张表。

> **推论 B（本文最重要的一条决定的依据）**：给 `/admin/plan`、`/admin/publish` 等各开一个顶层 route，意味着 5 个 agent 同时改 `router.ts` 的 `Route`/`ROUTES` 与 `main.ts` 的 `PAGES`/`TITLE` —— 两个共享文件、四处并发追加。**所以本文规定：不新增任何顶层 route，后台六屏全部是 `admin` 这一个 route 的 rest 子状态。** 见 §2。

### 1.3 i18n（`packages/web/src/i18n.ts`）

- 全局字典 `DICT` 是**一个扁平对象**，key 是点分小写字符串：`"page.admin"`、`"drawer.prep.role"`、`"data.notReady"`、`"foot.updated.unknown"`、`"update.available"`、`"ios.addToHome"`、`"admin.placeholder"`。
- 类型断言是 `as const satisfies Record<string, Record<Lang, string>>`，`Lang = "uk" | "zh" | "en"`。**三种语言一种都不能少，缺一个就是编译错误。**
- `DEFAULT_LANG = "uk"`；`t(key, params?, lang?)` 用 `{n}` 占位；`ctx.t` 只接受全局 `DICT` 里的 key（`UiKey`）。
- `pick(s, lang)` 的回退链是 `lang → zh → en → uk → ""`。
- 语言持久化 key：`localStorage["canteenos.lang"]`，读写全部包 `try/catch`。
- 页面私有字典有**两种既存风格**：`prep.ts` 用点分（`meal.lunch` / `group.at-hand` / `issue.missing-dish`），`menu.ts` 用无点 camelCase（`noMenuWeek` / `allergensNone`）。见 §9 矛盾 12。

### 1.4 样式

- `packages/web/src/tokens.css`：设计 token（`--bg --surface --surface-2 --ink --muted --line --accent --accent-ink --warn --warn-bg --ok --ok-bg --scrim --shadow --font-ui --font-display --sans --slab`）+ 三态主题（`<html data-theme>`）+ 全局 `:focus-visible { outline: 2px solid var(--accent) }`。**注释写明「改 token 先改稿再改这里」。**
- `packages/web/src/styles.css`：应用壳 + 共用件。可复用的共用类只有这几个：`.card`、`.muted`、`.section-label`、`.chip`（修饰符 `.solid .accent .ok .warn .ghost`）、`.sr-only`、`.outlet`；其余（`.appbar .corner .dd .drawer .di .scrim .theme .toggle .foot .update-bar .ios-hint`）是壳层专属。`.placeholder` 的注释写着「#9–#11 替换成真实内容后删」。
- 所有触控目标 ≥ 44px（`styles.css` 头注释：「移动优先；所有触控目标 ≥ 44px」）。
- **`pages/prep.css` 里存在大量无前缀的全局选择器**：`.num`、`.thumb`、`.li`、`.step`、`.clip`、`.dish-head`、`.pc`、`.qty`（在 `.li` 下）。Vite 会把所有页面 CSS 打进同一份样式表，**后台若复用这些裸类名会串味**。见 §9 矛盾 11 与 §3.4 的类名规则。

### 1.5 数据层（`packages/web/src/data.ts`）

- 只读 `public/data/*.json`：`build.json`、`prep/<planId>.json`、`purchase/<planId>.json`、`menu/<planId>.json`。
- `DATA_BASE = ${import.meta.env.BASE_URL}data/`；图片路径规则（`prep.ts` / `menu.ts` 的 `imgSrc`）：`http(s)://` 开头直接用，否则挂 `BASE_URL`。
- 内存缓存：同 URL 只 fetch 一次，失败不缓存；`clearCache()` 供 PWA 新版本提示用。
- 失败抛 `DataError { url, status }`。
- **`@canteenos/core` 目前只以 `import type` 出现**（`data.ts` 头注释：「只 import type，不进产物」）。

### 1.6 三张单与 build.json 的实际形状（`packages/core/src/sheets.ts`）

- `BuildManifest = { builtAt, commit, plans: Id[], readiness?: Record<Id, BuildReadiness> }`；`BuildReadiness = { canTeach, canPlan, canProcure, missing: string[] }`。注释写明「`provenance.source === "example"` 的示例菜已排除」。
- `PrepSheet / MenuSheet / PurchaseSheet` 只包含**被排进该 menu-plan 的内容**：没有全库食材、没有全库菜品、没有技法词表、没有供应商清单。
- `PREP_GROUP_ORDER = ["day-before", "morning", "before-service", "at-hand"]`，`DEFAULT_PREP_TIMING = "morning"`。
- `sheets.ts` 头注释点名了引擎侧的函数：`buildPrepSheet` / `buildMenuSheet` / `expand`，以及 `renderPurchaseOrders` / `formatPurchaseOrderText`。**`packages/core/src/procurement/engine.ts` 本轮未读，确切签名开工前自行读。**

> **推论 C**：后台需要的「全库索引」（菜名、食材名、技法名、已有供应商）在现有任何产物里都不存在。`build.json.readiness` 只有 `dishId → 三关卡`，连菜名都没有。这是 v0.3 前端最大的一个洞，处理见 §6.3 与 §8 的 D-05。

### 1.7 实体字段的事实源

表单字段一律对 `schemas/*.schema.json`（单一事实源）。本轮**未直接读 schema 文件**，字段表逐条引自两处已核对彼此一致的投影：

- `packages/core/src/types.ts`（手写投影，头注释写明「单一事实源是 `schemas/*.schema.json`」）；
- worker 契约 §1.1 / §1.2 / §1.3 的字段表（该文档标注为逐字读自 schema）。

**两者对不上的地方，以 schema 为准；实现时若发现第三种说法，停下来问 owner，不要猜。**

### 1.8 硬预算与硬禁令（执行简报 §4.5 / §7）

- 首屏 JS ≤ 60 KB gzip；单图 ≤ 200 KB。
- 不引入 UI 框架超过 10 KB gzip；**不引入 CSS 框架；不引入状态管理库**。
- 不在 worker 里存任何个人信息；**令牌只在链接里**。
- 不把示例数据当真实数据发布。

---

## 2. 路由表

### 2.1 规则

1. **不新增顶层 route。** `router.ts` 的 `Route` / `ROUTES` / `DEFAULT_ROUTE` 与 `main.ts` 的 `PAGES` / `TITLE` **本轮一行不改**。
2. 后台六屏是 `admin` 这一个 route 的 rest 子状态，形状 `#/admin/<seg1>[/<seg2>…]`。
3. rest 由 `packages/web/src/pages/admin.ts`（#20 独占）解析并分发；分发器提供 `adminHref(...segs)`，实现照抄 `prep.ts` 的 `prepHref()`：逐段 `encodeURIComponent` 后用 `/` 连接，**不走 `hrefOf(page, rest)`**（那个会把 `/` 编成 `%2F`）。
4. **保留字**：rest 第一段的 `t` / `plan` / `ingredient` / `dish` / `publish` 是路由关键字；`plan` 段下的 `import` 也是关键字，不得当 planId 用（planId 的约定形状是 `week-NN`，见 worker 契约 §0，不会撞）。

### 2.2 表

「顶栏标题」一列说明：`main.ts` 按 `TITLE[route]` 设置顶栏 `<h1>`，`admin` 只有一个值，而 `PageCtx` 里没有 `setTitle`。**所以顶栏标题恒为 `t("page.admin")`（「师傅后台 / Кабінет шефа / Back office」），每屏自己的标题画在页内**（见 §8 的 D-02）。

| # | 屏 | hash | 页内标题 key | 需令牌 | 直链行为 | 无令牌 | 未知 / 找不到 |
|---|---|---|---|:--:|---|---|---|
| 20 | 令牌入口 | `#/admin/t/<token>` | —— | —— | 消费令牌 → `history.replaceState` 成 `#/admin` → 渲染工作台 | —— | 令牌串为空 → 当作无令牌 |
| 20 | 工作台 | `#/admin` | `home.title` | ✅ | 直接进 | 锁屏 | —— |
| 21 | 排菜单（当前周） | `#/admin/plan` | `plan.title` | ✅ | 进当前周（§8 D-06 的周号推导） | 锁屏 | —— |
| 21 | 排菜单（指定周） | `#/admin/plan/<planId>` | `plan.title` | ✅ | 进该周 | 锁屏 | planId 在仓库里没有 → **空周新建态**，不报错 |
| 22 | 粘贴导入（当前周） | `#/admin/plan/import` | `import.title` | ✅ | 进当前周的导入 | 锁屏 | —— |
| 22 | 粘贴导入（指定周） | `#/admin/plan/<planId>/import` | `import.title` | ✅ | 进该周的导入 | 锁屏 | 同上，空周也能导入 |
| 23 | 新食材 | `#/admin/ingredient/new` | `ing.title.new` | ✅ | 空表单 | 锁屏 | —— |
| 23 | 改食材 | `#/admin/ingredient/<id>` | `ing.title.edit` | ✅ | 载入该食材 | 锁屏 | id 不存在 → 「没找到这个食材」+ 返回工作台 |
| 24 | 新菜 | `#/admin/dish/new` | `dish.title.new` | ✅ | 空表单 | 锁屏 | —— |
| 24 | 改菜 / 补全草稿 | `#/admin/dish/<id>` | `dish.title.edit` | ✅ | 载入该菜 | 锁屏 | id 不存在 → 「没找到这道菜」+ 返回工作台 |
| 25 | 发布 | `#/admin/publish` | `pub.title` | ✅ | 直接进 | 锁屏 | —— |
| —— | 二维码打印页 | `#/qr` | —— | ❌ | 既有路由，本轮**不改** | —— | —— |

**降级语义**

- **rest 认不出**（如 `#/admin/nope`）：由 `admin.ts` 渲染一张「没找到这一屏」卡 + 「回工作台」链接。**不要 `location.replace` 到 `#/prep`** —— `router.ts` 只在**页面段**非法时才 `normalize()`，rest 归页面解释。
- **无令牌**：任何 `#/admin/*` 都只渲染锁屏（issue #20 原文文案：「请用师傅链接打开」），**并且一个请求都不发**。
- **`#/admin` 与抽屉**：`shell.ts` 的抽屉 NAV 只有 prep / purchase / menu 三项 + 一个 `aria-disabled` 的「菜单计划」占位，`setActive("admin")` 时没有条目高亮。**这是现状，本轮不改**（师傅从私密链接进后台，后台入口不该出现在公开抽屉里）。

### 2.3 令牌怎么进来

ADR-0007（PR #61，待合并）§4 的链接形状是 `https://terryyyc.github.io/canteen-os/admin#t=<token>`。**这个形状在当前的 hash 路由下是坏的**（见 §9 硬伤 2）：`parseHash` 会判 `#t=<token>` 为非法 hash 并 `location.replace` 到 `#/prep`，令牌当场丢失。

本文规定的形状（§8 的 D-01）：

```
https://terryyyc.github.io/canteen-os/#/admin/t/<43 字符 base64url 令牌>
```

处理步骤（`pages/admin.ts`，#20 独占）：

1. `ctx.rest` 以 `t/` 开头 → 取第二段为令牌。
2. 长度不是 43 → 当作无令牌（与 worker 契约 §2.3 第 2 步同一个「先判长度」思路，省一次无谓请求）。
3. 写 `sessionStorage["canteenos.token"]`，**包 `try/catch`**（照 `i18n.ts` 的 `readStored()`）。
4. `history.replaceState(null, "", adminHref())` 抹掉地址栏里的令牌。`replaceState` **不触发 `hashchange`**，所以壳层不会重渲染，`ctx.rest` 会短暂陈旧 —— 因此**令牌解析必须幂等**：`sessionStorage` 里已有令牌就直接忽略 rest 里的那份。
5. 继续渲染工作台。

**红线**：令牌**不得**写 `localStorage`、**不得**进 query string、**不得**进任何 `console`、**不得**出现在任何 `data-*` 属性或 DOM 文本里（ADR §4 / 执行简报 §7 / worker 契约 §2.2）。

**角色**：worker 不回传角色，令牌是不透明串。**前端不做任何角色推断、不画任何按角色隐藏的 UI**；越权靠 `403 forbidden` 兜底，照 worker 契约 §1.8 原样显示「你这条链接不能做这件事」。

---

## 3. 文件归属、共享文件追加规则、共享状态

### 3.1 波次

issue 自己声明的依赖是：#21 / #22 / #23 / #25 **Blocked by #20**，#24 **Blocked by #23**。所以真正的形状是：

```
波 0：#20 骨架（见 §3.2「骨架清单」）——必须先落地
波 1：#21 #22 #23 #25 并行（4 个）
波 2：#24（等 #23 的食材表单件）
```

如果要凑满 5 并行，把 #20 拆成两个 PR：**#20a 骨架**（分发器 + 令牌 + 锁屏 + `api/` 全量 mock + 共用件 + 每屏一个空壳文件 + i18n/CSS 锚点）和 **#20b 工作台内容**。#20a 是纯机械工作（本文已把每个导出的签名钉死），落地后 #20b / #21 / #22 / #23 / #25 五个可以真并行，#24 仍等 #23。

### 3.2 骨架清单（#20 必须一次做完的东西）

**只要少一件，就会有 agent 去动别人的文件。**

| 交付物 | 文件 | 必须导出 |
|---|---|---|
| 路由分发 | `pages/admin.ts` | `render(el, ctx)`；`adminHref(...segs)` |
| 令牌 | `admin/token.ts` | `getToken(): string \| null`；`consumeTokenFromRest(rest): string`（返回剥掉令牌段后的 rest）；`renderLockScreen(el, lang)` |
| API 层 | `api/types.ts`、`api/client.ts`、`api/mock.ts` | 见 §6，**全部端点一次做完** |
| 跨屏内存 store | `admin/store.ts` | 见 §3.5 |
| 共用件 | `admin/kit.ts` | `stepper(opts)`、`fieldRow(opts)`、`applyFieldErrors(root, errors)`、`clearFieldErrors(root)`、`topBar(opts)`、`emptyCard(text)`、`errorCard(text, onRetry?)`、`busy(el)` |
| 共用样式 | `pages/admin/admin.css` | `.adm` 前缀下的共用件样式 |
| 空壳屏 | `admin/plan.ts`、`admin/import.ts`、`admin/ingredient-new.ts`、`admin/dish-new.ts`、`admin/publish.ts` | 各导出 `render(el, ctx, rest)`，先只画标题 + 「本屏由 #NN 实现」 |
| i18n | `i18n.ts` 里删掉 `admin.placeholder` | 见 §5 |
| 全局样式锚点 | `styles.css` 末尾一段 | 见 §3.4 |

共用件的签名（#21–#25 照这个写，**不许改 `kit.ts`**）：

```ts
// ± 步进器：#21 的份数（±10，长按 ±50）与 #23/#24 的数字字段共用
export function stepper(opts: {
  value: number; min?: number; max?: number;
  step?: number;        // 默认 1；#21 传 10
  bigStep?: number;     // 长按用；#21 传 50
  label: string;        // 无障碍名
  onChange(v: number): void;
}): HTMLElement;

// 一行表单：<label for> + 控件 + 说明 + 错误位；id 由 idPrefix 生成，见 §3.4
export function fieldRow(opts: {
  idPrefix: string;     // 如 "adm-ing"
  name: string;         // 如 "packSize"；最终 id = `${idPrefix}-${name}`
  pointer: string;      // JSON Pointer，如 "/purchase/packSize"，标黄靠它
  label: string; hint?: string;
  control: HTMLElement;
}): HTMLElement;

// 把 worker 的 errors[] 按 JSON Pointer 标黄；未命中 pointer 的错误集中显示在顶部
export function applyFieldErrors(root: HTMLElement, errors: readonly FieldError[]): void;
```

`applyFieldErrors` 的行为照 ADR §5 与 worker 契约 §1.8 逐字：**原样显示 `message`，不二次编造文案**；`path` 为 `""` 的错误显示在表单顶部。

### 3.3 文件归属表（一个文件只有一个主人）

| 文件 / 目录 | 归属 | 说明 |
|---|---|---|
| `packages/web/src/main.ts` | **无人 · 本轮禁改** | route 表与 PAGES 映射不动 |
| `packages/web/src/router.ts` | **无人 · 禁改** | 不新增顶层 route |
| `packages/web/src/shell.ts` | **无人 · 禁改** | 抽屉不加后台入口；可 `import { formatBuiltAt, netState }` 复用 |
| `packages/web/src/types.ts` | **无人 · 禁改** | `PageCtx` 不扩字段 |
| `packages/web/src/data.ts` | **无人 · 禁改** | 三张单只读层不变；后台数据走 `api/` |
| `packages/web/src/dom.ts` | **无人 · 禁改** | |
| `packages/web/src/tokens.css` | **无人 · 禁改** | token 事实源是设计稿 |
| `packages/web/src/pwa.ts` | **无人 · 禁改** | 本轮不为 /admin 增加任何 SW 规则 |
| `packages/web/src/pages/{prep,purchase,menu,qr}.{ts,css}` | **无人 · 禁改** | |
| `packages/web/src/i18n.ts` | **#20 独占写**，其余只读 | 见 §5 与 §3.4 |
| `packages/web/src/styles.css` | **#20 独占写**，其余只读 | 只在文件末尾追加一段 |
| `packages/web/src/pages/admin.ts` | **#20** | 分发器（现有占位文件在此位置，#20 重写它） |
| `packages/web/src/pages/admin/admin.css` | **#20** | |
| `packages/web/src/pages/admin/home.{ts,css}` | **#20** | |
| `packages/web/src/admin/{token,store,kit}.ts` | **#20** | |
| `packages/web/src/api/{types,client,mock}.ts` | **#20** | |
| `packages/web/src/pages/admin/plan.{ts,css}` | **#21** | |
| `packages/web/src/pages/admin/import.{ts,css}` | **#22** | |
| `packages/web/src/pages/admin/ingredient-new.{ts,css}` | **#23** | |
| `packages/web/src/pages/admin/dish-new.{ts,css}` | **#24** | |
| `packages/web/src/pages/admin/publish.{ts,css}` | **#25** | |
| `packages/core/src/import/parse-plan-text.ts` + 同名测试 | **#22** | **另起一个 PR**（跨 package 拆 PR，执行简报 §4.4） |
| `packages/core/src/index.ts` | **#22** | 只在末尾追加一行 `export * from "./import/parse-plan-text.js";` |
| `packages/web/package.json` | **#22** | 只加表格解析库一项；许可须在白名单（SheetJS Apache-2.0 / Papaparse MIT，执行简报 §1.5） |

> `pages/admin.ts`（文件）与 `pages/admin/`（目录）**同时存在是刻意的**：`main.ts` 里 `import { render as admin } from "./pages/admin"` 这一行因此一个字都不用改。不要把 `admin.ts` 挪成 `admin/index.ts`。

### 3.4 共享文件追加规则

**规则 0（最强的一条）：本波内宁可重复，不许互改。** 某屏需要一个 `kit.ts` 里没有的小部件，就写进**自己那个文件**，不要去改 `kit.ts`、不要去改别人的屏。重复几十行 DOM 代码的成本，远低于两个 PR 抢同一行。

**i18n.ts**

- 默认规则：**除 #20 外没有人写 `i18n.ts`**。每屏的文案放自己文件里的私有小字典（`types.ts` 已有此约定，`prep.ts` / `menu.ts` 均如此）。按 §5 的设计，本波在 `i18n.ts` 上的净改动只有「删掉 `admin.placeholder`」一条。
- 万一 owner 要求把某些 key 提到全局：退化规则 = 在 `DICT` **末尾**、`ios.dismiss` 那一条之后，按 issue 号升序放锚点注释，各自只在自己那段里追加：
  ```ts
    // --- v0.3 /admin：#20 ---
    // --- v0.3 /admin：#21 ---
    // --- v0.3 /admin：#22 ---
    // --- v0.3 /admin：#23 ---
    // --- v0.3 /admin：#24 ---
    // --- v0.3 /admin：#25 ---
  ```
  **不许重排既有条目、不许改别人段落、不许在 `DICT` 中间插入。** 三种语言一个都不能缺（`satisfies` 会挡）。

**styles.css**

- 只有 #20 写，且只在**文件末尾**（`.ios-hint` 那段之后）追加一段：
  ```css
  /* ---------- /admin 共用（v0.3 · #20） ---------- */
  ```
- 既有的 `.appbar / .corner / .drawer / .di / .chip / .card / .section-label / .outlet` 等一律不动。

**CSS 类名（防串味，依据 §1.4 与 §9 矛盾 11）**

- 每屏根元素两个类：`class="adm adm-<screen>"`，`<screen> ∈ home | plan | import | ing | dish | pub`。
- **该屏 CSS 的每一条选择器都必须以 `.adm-<screen>` 开头**，一条例外都没有。
- `.adm` 前缀保留给 #20 的共用件。
- **禁止**在任何后台 CSS 里定义无前缀的裸类名，尤其**禁止**复用 `prep.css` 已占用的 `.li .num .thumb .step .clip .dish-head .pc .qty .back`。开工前先 `grep` 一遍 `pages/*.css`（本轮只逐字读过 `prep.css`，`menu.css` / `purchase.css` / `qr.css` 未读，按同样风险处理）。

**DOM id**

- 全局已占用的 id：`#app #main #drawer #lang #theme-label`（`shell.ts`）。
- 后台里凡是 `<label for>` 需要的 id 一律 `adm-<screen>-<field>`，由 `kit.fieldRow` 的 `idPrefix` 统一生成。

### 3.5 共享状态与模块边界

共四种状态，各有唯一归宿：

| 状态 | 存哪 | 谁写 | 生命周期 |
|---|---|---|---|
| 语言 / 主题 | `localStorage`（`i18n.ts` / `theme.ts`） | 壳层 | 跨会话 |
| 令牌 | `sessionStorage["canteenos.token"]` | `admin/token.ts` | 关标签页即失 |
| 屏内未提交输入 | 各屏文件里的**模块级变量** | 各屏自己 | 刷新即失；语言切换时靠它回填（推论 A） |
| 跨屏未保存草稿 | `admin/store.ts` 的模块级 Map | #20 提供，各屏读写 | **进程内内存，刷新即失** |

`admin/store.ts` 的契约（#20 实现，签名不许改）：

```ts
// 未保存的周计划：#22 导入后写入，#21 读出来渲染并允许撤销
export function getDraftPlan(planId: string): MenuPlan | null;
export function setDraftPlan(planId: string, plan: MenuPlan, source: "import" | "copy-last-week" | "edit"): void;
export function clearDraftPlan(planId: string): void;
export function undoDraftPlan(planId: string): boolean;   // 一层撤销，够 #21「复制上周可撤销」与 #22「保存前可撤销」

// 跨屏「带着一句话去下一屏」——替代 query string（隐私红线：不把数据放 URL）
export function setHandoff(v: { newDishName?: string; newIngredientName?: string; returnTo?: string }): void;
export function takeHandoff(): { newDishName?: string; newIngredientName?: string; returnTo?: string };  // 读一次即清空
```

**边界**

- `store.ts` 只放**未保存**的东西。已保存的一切一律回 `api` 拿。
- 任何写入成功后，`api` 层自行失效 `catalog` / `changes` 缓存（§6.4）；屏不要自己管缓存。
- 三张单缓存（`ctx.data`）**不要清** —— 它们是发布产物，写入不改它们；清了只会让前台白等一次网络。

### 3.6 代码分包（首屏预算，执行简报 §4.5）

- `pages/admin.ts` 会被 `main.ts` 静态 import，因此它必须**很小**：只有分发、令牌、锁屏。
- 六屏一律 `await import("./admin/<screen>.js")` 动态加载。
- `@canteenos/core` 的**运行时**部分（#21 的采购单预览、#21/#24 的 readiness 现算）只准出现在动态分包里 —— 这是 core 第一次进浏览器产物（§1.5），别让它挤进 `/prep` 的首屏。
- 表格解析库（#22）只在用户选了文件之后再 `await import`。
- 每个 PR 的「怎么验证的」一段里必须贴 `vite build` 后 `dist/assets` 的分包体积（本轮无法代跑）。

---

## 4. 逐屏契约

每节结构固定：屏上有什么 / 数据来源 / 空态·加载态·错误态 / 成功后去向 / 移动端与键盘 / 验收标准。
**版式一律以 `docs/design/backoffice-v1.html` 为准**（本文未读该文件）。

### 4.0 六屏共用的行为

- 顶栏标题恒为 `t("page.admin")`；页内第一行是 `kit.topBar({ back, title, actions })`：左「←」回上一屏、中标题、右主操作。
- 无令牌 → 锁屏，**不发请求**。
- 任何 `api` 调用失败 → `ApiError`（§6.2）：
  - `code` 属于字段级（`type/required/enum/pattern/minimum/maximum/minItems/additionalProperties/format/anyOf`）→ `applyFieldErrors` 标黄，**原样显示 message**；
  - `401` → 「链接失效了，找 Terry 要新的」+ 清掉 `sessionStorage` 里的令牌 + 回锁屏；
  - `403 / 409 / 413 / 429 / 502 / 503` → 顶部一条 `errorCard`，文案**原样用 worker 返回的 message**（worker 契约 §1.8 已给全套中文），附「重试」。
- 保存类按钮在请求进行中禁用并显示进行态（`kit.busy`），**不允许连点**（worker 侧虽有内容幂等兜底，见 worker 契约 §3.1，但界面不能靠它）。
- 有未保存改动时离开本屏 → `beforeunload` + 页内二次确认；`hashchange` 无法被取消，所以**离开确认只在自己的「返回 / 导航」按钮上做**，浏览器返回键按「丢弃」处理并在下一屏顶部提示「刚才那屏有没保存的改动，已丢弃」。

---

### 4.1 #20 · `/admin` 工作台

#### 屏上有什么

1. **顶部状态条**：「N 项改动还没发布 · 上次发布 hh:mm」，右侧「发布」chip → `#/admin/publish`。整条可点。
2. **入口块**（issue 正文列了 7 项，标题写「六块」—— 见 §9 矛盾 3，按正文实现）：
   - 排菜单（大块，显示本周已排餐数） → `#/admin/plan`
   - 加一道菜 → `#/admin/dish/new`
   - 待确认（红点数 = `status === "draft"` 的菜数） → `#/admin/dish/new`？**不是**：红点是列表入口，本轮没有草稿列表屏 → 指向 `#/admin/plan`？**也不是**。裁决见 §8 的 D-10：**指向第一条草稿的编辑屏 `#/admin/dish/<第一个 draft id>`**；草稿数为 0 时该块置灰不可点。
   - 食材库（数量 + 缺调料提示） → `#/admin/ingredient/new`
   - 翻译待审（`translations.lock.json` 里 `status === "machine"` 的条数） → 本轮**没有审阅屏**，块置灰只显示数字（§7 排除项）
   - 二维码 → `#/qr`
   - 发布记录 → `#/admin/publish`
3. **令牌处理与锁屏**（§2.3）。

#### 数据来源

| 屏上的数 | 来源 |
|---|---|
| N 项未发布 / 上次发布时间 / 线上 commit | `api.getChanges()` → `unpublished.length` / `lastPublishedAt` / `onlineCommit`（口径 = worker 契约 §3.6 的 D-12：一项 = 一个动过 `data/` 的 commit，排除 `chore(i18n): machine translations`） |
| 本周已排餐数 | `api.getPlan(currentPlanId())` → `meals.length`；404 → 0 |
| 草稿菜数 | `api.getCatalog().dishes` 里 `status === "draft"` 的个数 |
| 食材数 / 缺调料 | `api.getCatalog().ingredients` 的个数；`role === "seasoning"` 少于 20 时显示「常用调料还差 M 个」（阈值 20 来自执行简报 §3 v0.4「含常用调料 ≥ 20」） |
| 翻译待审 | `api.getCatalog().translations.machine` |
| 时间格式化 | `import { formatBuiltAt } from "../shell"`（`shell.ts` 已导出，不要重写） |
| 在线 / 离线 | `import { netState } from "../shell"` |

`currentPlanId()` 的推导规则见 §8 的 D-06。

#### 空态 / 加载态 / 错误态

- **加载态**：立刻画出全部入口块（导航不依赖数字），数字位显示 `—`，不做骨架闪烁。
- **N = 0**：顶部条显示「都发布了 · 上次发布 hh:mm」，发布 chip 置灰（但仍可点进发布屏看记录）。
- **`getChanges()` 失败**：顶部条换成 `errorCard`「连不上后台」+ 重试；入口块照常可点。
- **`getCatalog()` 失败**：各数字位显示 `—` 并在块上加一行小字「数字暂时取不到」；块仍可点。
- **离线**（`netState() !== "online"`）：顶部一条「现在没网，后台只能看不能存」，所有写入入口置灰。

#### 成功后去向

入口屏，无提交动作。

#### 移动端与键盘

- 入口块是 `<a>`，`min-height: 44px`；大块（排菜单）单独一行。
- 焦点顺序 = DOM 顺序：状态条 → 排菜单 → 其余块。
- 锁屏卡 `role="status"`，进入时把焦点放在它上面。
- 红点数字要有文字等价物（`.sr-only`），不能只靠颜色。

#### 验收标准

- [ ] 顶部显示「N 项改动还没发布 · 上次发布 hh:mm」，N 与线上 `build.json.commit` 的比较口径 = worker 契约 §3.6（对应 issue #20 bullet 1）
- [ ] 顶部「发布」chip 跳 `#/admin/publish`（bullet 1）
- [ ] 七个入口块齐全，各自的数字来自上表的数据源（bullet 2）
- [ ] 排菜单块显示本周已排餐数（bullet 2）
- [ ] 待确认块的红点数 = 草稿菜数，且有 `.sr-only` 文字等价物（bullet 2）
- [ ] 食材库块显示食材数，调料 < 20 时显示缺口（bullet 2）
- [ ] 翻译待审块显示 machine 条数（bullet 2）
- [ ] `#/admin/t/<token>` 能把令牌存进 `sessionStorage` 并从地址栏抹掉（bullet 3）
- [ ] 无令牌时显示「请用师傅链接打开」，且 Network 面板里**一个后台请求都没有**（bullet 3）
- [ ] **没有一个数字是写死的**（DoD）
- [ ] 切换语言后页面不报错、数字不丢（推论 A）
- [ ] `main.ts` / `router.ts` / `shell.ts` / `types.ts` / `data.ts` 的 diff 为空（§3.3）
- [ ] 骨架清单（§3.2）逐项交付，`api/mock.ts` 覆盖 §6.1 的**全部**方法

---

### 4.2 #21 · `/admin/plan` 排菜单

#### 屏上有什么

1. 周导航 `‹ 第 N 周 ›`（`planId = week-NN`）。
2. 按天卡片，每天「午 / 晚」两行；早餐行按「本周任一天排过 breakfast 就显示」的规则出现。
3. 点一格展开：菜品选择（从全库搜索，显示能教 / 能排 / 能采三 chip，**不可排的灰掉**）+ 份数步进器（±10，长按 ±50）+ 「上周同餐次：排 X，实际 Y」提示。
4. 右上角下拉：日 / 周 / 月。日视图 = 当天两餐大号步进器；月视图 = 日历，**只看有没有排，不编辑**。
5. 「复制上周」（可撤销）。
6. 「采购单预览」（本地跑引擎，不落库）。
7. 「保存本周」。
8. 顶部「粘贴导入」入口 → `#/admin/plan/<planId>/import`。

#### 数据来源

| 需要什么 | 来源 |
|---|---|
| 本周计划 | `api.getPlan(planId)` → `{ content: MenuPlan, blobSha }`；**404 → `null` → 空周新建态**，不是错误 |
| 未保存草稿 | `store.getDraftPlan(planId)`，**优先于** `api.getPlan` 的内容 |
| 上周计划 | `api.getPlan(prevPlanId)`；404 → 隐藏「复制上周」与「上周同餐次」提示 |
| 「上周实际」 | 执行简报 §3 v0.3 原文：**第一轮「实际」用上周计划数代替，必须标注**。界面文案写「上周排的：Y（本轮还没有实际数）」 |
| 菜品列表 + 名字 + 状态 | `api.getCatalog().dishes` |
| 三关卡（能教/能排/能采） | 浏览器内现算：`const { readiness } = await import("@canteenos/core")`，喂 catalog 里的完整实体。**不要用 `build.json.readiness`** —— 那是上次发布时的快照，看不见刚建的草稿菜（§9 矛盾 6） |
| 采购单预览 | 同一个动态 import 里的 `expand` + 采购渲染（`packages/core/src/sheets.ts` 头注释点名了 `expand` / `renderPurchaseOrders` / `formatPurchaseOrderText`；确切签名开工前读 `procurement/engine.ts`） |
| 保存 | `api.savePlan(planId, plan, { ifMatch: blobSha })` |

**MenuPlan 字段**（照 worker 契约 §1.1 与 `core/src/types.ts`，两者一致）：

```jsonc
{
  "schemaVersion": "2",          // 必填，逐字 "2"
  "name": { "zh": "…" },         // 可选，I18nString
  "dateRange": { "start": "…", "end": "…" },  // 可选；给了就两个都必填
  "margin": 1.1,                 // 可选，> 0；缺省时引擎按 1.1
  "meals": [{
    "date": "YYYY-MM-DD",
    "mealType": "breakfast|lunch|dinner",
    "dishRef": "<kebab id>",
    "plannedServings": 200,      // ⚠ 字段名是 plannedServings，不是 servings
    "serviceWindow": "12:00-14:00"  // 可选
  }]
}
```

> `meals[]` 与顶层都是 `additionalProperties: false` —— **保存前不要往里塞任何界面自用字段**（UI 状态留在模块级变量里）。

#### 空态 / 加载态 / 错误态

- **空周**（`api.getPlan` 返回 `null`）：显示七天空卡 +「这周还没排 · 可以从上周复制，或粘贴导入」，两个按钮。
- **上周也没有**：只留「粘贴导入」。
- **catalog 加载中**：日期骨架先出，菜品选择器显示「正在读食材和菜」。
- **catalog 失败**：周视图仍可看（已排的菜显示 `dishRef` 原文），但**禁用**菜品选择与采购单预览，顶部 `errorCard` + 重试。
- **预览失败**（引擎抛异常 / 数据不全）：不要吞，展开一块「算不出来，因为：…」并原样列出引擎的 `issues` / `pending`（`PurchaseSheet.pending` 与 `issues` 的形状见 `core/src/sheets.ts`）。
- **保存 409**（`conflict`）：顶部提示「有人刚改过，刷新后重试」（ADR §2 逐字），给「重新读取」按钮；**不要自动覆盖**。
- **保存 400**：逐字段标黄（`/meals/3/plannedServings` 之类），滚到第一处错误。

#### 成功后去向

保存成功（`WriteResult`）→ 留在本屏，顶部出现绿条「已存好 · 还没发布」+「去发布」链接 → `#/admin/publish`；同时 `store.clearDraftPlan(planId)`，本地 `blobSha` 更新为响应里的新值（供下一次 `If-Match`）。`unchanged: true` 时文案改成「没有改动，什么都没存」。

#### 移动端与键盘

- 步进器 `−` / `+` 各 ≥ 44×44；中间数字用 `<input inputmode="numeric" pattern="[0-9]*">` 允许直接改。
- 长按 ±50：`pointerdown` 起 400 ms 后进入连发，`pointerup` / `pointercancel` / `blur` 都要停；**键盘等价物**：`Shift + ↑/↓` = ±50，`↑/↓` = ±10。
- 步进器要 `aria-label`（「周三午餐份数」）与 `aria-live="polite"` 的数值播报。
- 日 / 周 / 月是原生 `<select>`（照 `shell.ts` 的语言下拉做法，不自造下拉）。
- 月视图只读，格子用 `<button disabled>` 或非交互元素，不要给假的可点感。
- 横向周导航别用横滑，用 `‹ ›` 按钮（单手可达）。

#### 验收标准

- [ ] 周导航 `‹ 第 N 周 ›`；按天卡片，每天午 / 晚两行，早餐按规则出现（bullet 1）
- [ ] 点一格展开菜品选择，能教 / 能排 / 能采三 chip 正确，**不可排的菜灰掉且不可选**（bullet 2）
- [ ] 份数步进器 ±10、长按 ±50，键盘等价物可用（bullet 2）
- [ ] 显示「上周同餐次：排 X」，并**明确标注本轮的「实际」是上周计划数**（bullet 2）
- [ ] 日 / 周 / 月三视图；日视图大号步进器；月视图只读（bullet 3）
- [ ] 「复制上周」可撤销（走 `store.undoDraftPlan`）（bullet 4）
- [ ] 「采购单预览」在浏览器内跑 `@canteenos/core`，**不落库**（bullet 5）
- [ ] 「保存本周」→ `api.savePlan`；保存后工作台的「N 项未发布」+1（bullet 6）
- [ ] 份数 < 1、菜品不可排 → 逐字段标黄（bullet 7）
- [ ] 切语言后未保存的份数改动不丢（推论 A）
- [ ] 预览数字与 `build-data` 一致（DoD）—— 验证方式写进 PR 的「怎么验证的」
- [ ] core 与表格库都在动态分包里，`/prep` 首屏 JS 未变大（§3.6）
- [ ] 只改了 §3.3 里归 #21 的两个文件

---

### 4.3 #22 · 粘贴导入（`/admin/plan[/<planId>]/import`）

> 本 issue 跨两个 package，**必须拆两个 PR**（执行简报 §4.4）：先 `packages/core` 的解析器 + 测试，再 `packages/web` 的界面。

#### 屏上有什么

1. 大 `<textarea>` + 「解析」按钮（师傅现在就是在微信里发「周一午番茄炒蛋200」）。
2. 逐行结果列表，每行一个状态与对应动作。
3. Excel / CSV 上传区（四列自动识别）。
4. 底部按钮，文案动态：「导入 N 行，跳过 M 行」。

#### 解析器（`packages/core/src/import/parse-plan-text.ts`，纯函数）

签名（本文新增，issue 未规定 —— §8 的 D-07）：

```ts
export interface ParsePlanInput {
  text: string;
  dishes: ReadonlyArray<{ id: Id; name: I18nString; status?: DishStatus }>;
  /** 本周第一天（ISO date），用来把「周一」落成具体日期 */
  weekStart: string;
  /** 允许的最大编辑距离，默认 2 */
  maxDistance?: number;
}

export type ParsedLineStatus =
  | "ok"            // ✓ 匹配
  | "unknown-dish"  // ! 菜名不存在 → 新建 / 换一个
  | "draft-dish"    // ? 有草稿不能排 → 去补全
  | "next-week"     // 日期落在下周（标注，仍可导入）
  | "unparsed";     // 整行认不出

export interface ParsedLine {
  lineNo: number;          // 1-based
  raw: string;
  status: ParsedLineStatus;
  date?: string;           // ISO date
  mealType?: MealType;
  dishRef?: Id;
  /** 模糊匹配的候选（按距离升序，≤ 3 个），供「换一个」下拉用 */
  candidates?: Array<{ id: Id; distance: number }>;
  dishNameRaw?: string;    // 原文里的菜名，供「新建」预填
  plannedServings?: number;
  reason?: string;         // 认不出时的原因（人话，中文）
}

export function parsePlanText(input: ParsePlanInput): { lines: ParsedLine[] };
```

必须认的输入（issue 原文）：星期（周一 / 礼拜一 / Mon）或日期（10.05 / 10月5日 / 2026-10-05）· 餐次（早 / 午 / 中 / 晚 / breakfast / lunch / dinner）· 菜名（模糊匹配三语名，编辑距离 ≤ 2）· 份数（阿拉伯或中文数字，可带「份」）。

**解析器是纯函数：不 fetch、不读 DOM、不认时区**（「今天」由调用方以 `weekStart` 形式传进来）。

#### 数据来源

| 需要什么 | 来源 |
|---|---|
| 菜品名单（模糊匹配的字典） | `api.getCatalog().dishes` |
| 目标周 | rest 里的 planId，缺省 `currentPlanId()` |
| Excel / CSV | 用户选的文件，**只在浏览器内解析，不上传任何地方**（既是隐私红线，也是因为没有对应端点） |

#### 空态 / 加载态 / 错误态

- textarea 空 → 「解析」禁用；给一段示例占位文本（`placeholder`）。
- 全部认不出 → 「一行都没认出来 · 常见原因：菜名和食材库里的对不上」+ 原文回显。
- catalog 未就绪 → 「解析」禁用并说明「正在读菜品名单」。
- 文件超大 / 列名认不出 → 「这张表认不出哪一列是日期 / 餐次 / 菜名 / 份数」+ 显示识别到的表头，让人手工映射四列。
- 解析器抛异常 → 视为整表 `unparsed`，不允许白屏。

#### 成功后去向

点「导入 N 行，跳过 M 行」→ 把结果合并成 `MenuPlan` → `store.setDraftPlan(planId, plan, "import")` → `location.hash = adminHref("plan", planId)`。#21 检测到 `store` 里有草稿 → 顶部显示「已导入 N 行 · 还没保存」+「撤销」。**导入本身不调任何写入端点。**

行内动作的去向：

- 「新建」→ `store.setHandoff({ newDishName: line.dishNameRaw, returnTo: adminHref("plan", planId, "import") })` → `#/admin/dish/new`。
- 「换一个」→ 行内下拉，就地改，不跳转。
- 「去补全」→ 同样 `setHandoff({ returnTo })` → `#/admin/dish/<id>`。

#### 移动端与键盘

- textarea 用 `rows` 自适应 + `enterkeyhint="done"`；粘贴后自动触发一次解析（debounce 300 ms）。
- 每行结果是一张卡（不是表格）—— 窄屏上表格必然横滑。
- 状态用「图标 + 文字 + 颜色」三重编码，不能只靠颜色（`✓ / ! / ?`）。
- 「导入」按钮 sticky 在底部，避开 `env(safe-area-inset-bottom)`（`styles.css` 里 `.outlet` 已留了 `90px` 底部余量）。

#### 验收标准

- [ ] 解析器在 `packages/core/src/import/parse-plan-text.ts`，**纯函数**，单独一个 PR（bullet 1）
- [ ] 认星期（周一/礼拜一/Mon）、日期（10.05 / 10月5日 / 2026-10-05）、餐次（早/午/中/晚/breakfast/lunch/dinner）、模糊菜名（编辑距离 ≤ 2）、中文与阿拉伯数字份数（bullet 1）
- [ ] 每行给出 ✓ / ! 菜名不存在（新建 / 换一个）/ ? 有草稿不能排（去补全）/ 日期落在下周（标注）四种结果（bullet 2）
- [ ] Excel / CSV 四列自动识别；库许可在白名单（Apache-2.0 / MIT）且**动态 import**（bullet 3）
- [ ] 底部文案动态显示「导入 N 行，跳过 M 行」（bullet 4）
- [ ] 解析器测试 ≥ 15 条，含中文数字、混排、多余空格、全角标点（DoD）
- [ ] 导入后进入周视图，**未保存前可撤销**（DoD）
- [ ] 文件不上传、菜名不进 URL（隐私红线）
- [ ] 只改了 §3.3 里归 #22 的四个位置（core 解析器 + core index 一行 + web 两个文件 + package.json 一项）

---

### 4.4 #23 · `/admin/ingredient/new` 新食材

#### 屏上有什么（字段映射逐条对 schema）

| 界面（人话） | 实体字段 | 规则 |
|---|---|---|
| 中文名 | `name.zh` | 必填（I18nString 至少一种语言） |
| 英文 / 乌克兰语 | `name.en` / `name.uk` | 由 `api.translate(name.zh)` 即时填充并标「机翻，可改」；**用户改过就不再自动覆盖** |
| **英文短名（当文件名用）** | —— 就是**实体 id** | **本文新增字段**，见 §8 的 D-04；默认由 `name.en` slug 化，正则 `^[a-z][a-z0-9-]*$`，重名时提示「已有同名食材，是要改它吗？」 |
| 照片 | `image = { src, license, author?, sourceUrl? }` | `src` 与 `license` **都必填**；自摄默认 `license: "own"` |
| Wikidata | `externalId` | `^Q\d+$`；取图时把返回的 license / author / sourceUrl 一并写入 `image`，只读展示 |
| 按什么算 | `baseUnit` | 表单里只给 `g` / `ml` / `pcs` 三选（schema 枚举更宽，但食材库只用这三个） |
| 一个多少克 | `pcsToGram` | 仅 `baseUnit === "pcs"` 时出现，> 0 |
| 净料率「用 100 g 能剩多少」 | `yield` | 仅 `baseUnit ∈ {g, ml}` 时出现（`types.ts`：pcs 食材不得设置）；(0, 1]；**默认「100%」时不写字段**，见 §8 的 D-08 |
| 调料 · 适量就行 | `role: "seasoning"` | 见 §9 矛盾 4：issue 写的「允许 to-taste」在 Ingredient 上无字段可落 |
| 怎么买 | `purchase` | `supplier`（下拉已有 + 新建，非空）、`packSize`（> 0）、`packUnit`（Unit 枚举）**三者必填**；`minPacks`（整数 ≥ 1）、`lastPrice { amount ≥ 0, currency ∈ CNY/USD/UAH/EUR }` 可选。整组可以整体不填（那就是「还不能算采购」） |
| 耐放 · 记库存 | `trackStock` | 布尔，**必填** |
| 现有量 | `onHand` | ≥ 0，仅 `trackStock === true` 时出现 |
| （固定） | `schemaVersion: "2"` | 表单不显示，保存时写死 |

> **红线**：前端**只写实体 JSON 的 `{zh, en, uk}`，绝不写 `data/translations.lock.json`**。lock 由 CI 的机翻步骤维护（`docs/i18n.md` §6），worker 契约 §7.1 也确认 lock 不在写入白名单。

#### 照片处理

ADR-0007 §9（PR #61，待合并；**该条 ADR 自己标注「需要 owner 明确点头」**，见 worker 契约 §9.1 判断题 ①）：**压缩在浏览器里做** —— canvas 缩到最长边 ≤ 1280、编码到 ≤ 200 KB 再上传；worker 只做校验。

- 因此 `/admin/ingredient/new` 必须自带 canvas 压缩，压不到 200 KB 以下就不许上传，界面提示「这张照片太大，换一张或裁小一点」。
- 若 owner 否掉 ADR §9（改回执行简报的「worker 压缩」），本屏**删掉压缩逻辑、上限放宽**，`api.uploadImage` 的签名不变（§6.1），调用方零改动。

#### 数据来源

| 需要什么 | 来源 |
|---|---|
| 已有供应商下拉 | `api.getCatalog().suppliers` |
| 重名检查 | `api.getCatalog().ingredients` 的 key 集合 |
| 机翻 | `api.translate(zh, ["en", "uk"])` |
| 编辑既有食材 | `api.getIngredient(id)` → `{ content, blobSha }` |
| 保存 | `api.saveIngredient(id, ingredient, { ifMatch: blobSha })` |
| 传图 | `api.uploadImage("ingredients", id, blob, { license, author?, sourceUrl? })` |

#### 空态 / 加载态 / 错误态

- 供应商下拉 catalog 未就绪 → 只留「新建供应商」输入框，不阻塞。
- `translate` 失败 / 超时（含 worker 没有该端点的情况）→ **不阻塞保存**：en / uk 留空并提示「机翻暂时用不了，可以先存中文名」（I18nString 只要求至少一种语言）。
- 上传图片失败 → 保留表单其他内容，只在照片区显示错误；**照片不是必填**。
- 保存 400 → `applyFieldErrors` 按 JSON Pointer 标黄（`/purchase/packSize`、`/name`、`/yield` …）。
- 保存 409 → 「有人刚改过，刷新后重试」。

#### 成功后去向

- 从复核 / 导入屏跳来（`store.takeHandoff().returnTo` 有值）→ 保存成功后回 `returnTo`。
- 直接进来 → 回 `#/admin`，顶部绿条「已存好 · 还没发布」。

#### 移动端与键盘

- 一屏填完：分组折叠（基本 / 照片 / 怎么算 / 怎么买 / 库存），默认只展开「基本」与「怎么买」。
- 数字输入一律 `inputmode="decimal"` 或 `"numeric"`；金额与包装量分开两个输入框，不做「5kg」这类自由文本解析。
- 每个 `<label for>` 都要指到控件（`kit.fieldRow` 保证）。
- 拍照走 `<input type="file" accept="image/*" capture="environment">`。
- 保存按钮 sticky 底部；错误发生时把焦点移到第一个出错控件。

#### 验收标准

- [ ] 字段映射逐条与上表一致（bullet 1）
- [ ] en / uk 由即时机翻填充并标「机翻，可改」，用户改过不被覆盖（bullet 1）
- [ ] 照片三条路径：拍照上传（浏览器压缩 ≤ 200 KB / ≤ 1280px）、Wikidata 取图（显示许可）、从视频截（占位）（bullet 1）
- [ ] `baseUnit` 选 `pcs` 时出现「一个多少克」，且**不出现**净料率（bullet 1 + `types.ts` 规则）
- [ ] 净料率文案是「用 100 g 能剩多少」，默认 100%（bullet 1）
- [ ] 「调料 · 适量就行」落到 `role: "seasoning"`，并在 PR 里说明与 issue 原文「允许 to-taste」的差异（bullet 1 + §9 矛盾 4）
- [ ] 供应商下拉 = 已有 + 新建（bullet 1）
- [ ] 保存 → `api.saveIngredient`；从复核屏跳来时保存后返回来源（bullet 2）
- [ ] 校验错误按 JSON Pointer 逐字段标黄，message **原样显示**（bullet 3）
- [ ] 产出的 JSON 通过 schema（DoD）—— 验证方式写进 PR
- [ ] 手机上建一个食材 ≤ 2 分钟（DoD）
- [ ] 切语言后已填内容不丢（推论 A）
- [ ] 只改了 §3.3 里归 #23 的两个文件

---

### 4.5 #24 · `/admin/dish/new` 手动加菜（视频分支占位）

> ⚠️ **本屏有一个阻塞级矛盾**：issue 要求「『入库』= status active」，但唯一的菜品端点 `POST /dish/:id/draft` **会强制把 `status` 覆盖成 `"draft"`**（ADR §5 端点表逐字；worker 契约 §1.3 与测试 T-16）。详见 §9 硬伤 1 与 §8 的 D-09。**开工前必须先拿到 owner 的裁决**，否则本屏做出来的菜排不进菜单，v0.3 的 DoD（「Terry 用后台排一周并发布」）走不通。

#### 屏上有什么

1. 顶部 readiness 三 chip（能教 / 能排 / 能采），**随输入实时变化**。
2. 菜名 zh（en / uk 即时机翻）+ **英文短名（当文件名用）**（同 §4.4 的 id 规则）。
3. 基准份数，默认 50。
4. 配料列表：从食材库搜索添加；每条 = 数量 + 单位（或「适量」）/ 切法（从技法词表选）/ 大小 / 备注 / 提前多久 / 照片。
5. 步骤列表：文本 + 技法 + 照片。
6. 「保存草稿」与「入库」（后者的可用性取决于上面的裁决）。
7. 「视频」标签页：占位文案「第二轮上线；现在由 Terry 用命令行导入」+ 链接到 `skills/video-recipe-ingest/SKILL.md`。

#### 字段映射（照 `core/src/types.ts` 与 worker 契约 §1.3）

| 界面 | 字段 | 规则 |
|---|---|---|
| 菜名 | `name` | I18nString，**唯一必填项**（「一道菜只有名字也能导入」） |
| 一句话简介 | `description` | I18nString，可选，菜单页抽屉用 |
| 成品图 | `image` | ImageRef，`src` + `license` 必填 |
| 基准份数 | `baseServings` | 整数 ≥ 1，默认 50（§9 矛盾 10：issue 说的「全局设置」没有存放处，本轮是常量） |
| 配料行 | `components[]` | 项内 `ingredientRef` + `qty` 必填 |
| 数量 / 单位 | `components[].qty` | `{ value?, unit }`；`unit === "to-taste"` 时 **`value` 隐藏且不写**；其余单位 `value` 必填且 > 0 |
| 切法 | `components[].prep.techniqueRef` | 闭集，只能从技法词表选；**给了 `prep` 就必须有 `techniqueRef`** |
| 大小 / 备注 / 提前多久 / 照片 | `prep.size` / `prep.note` / `prep.timing` / `prep.image` | `timing ∈ day-before \| morning \| before-service`，缺省按「早上」（`sheets.ts` 的 `DEFAULT_PREP_TIMING`） |
| 步骤 | `steps[]` | 每项 `text` 必填；`techniqueRef` / `image` / `clip` 可选 |
| （固定） | `provenance.source: "manual"` | 手输分支写死 `manual`。**绝不写 `example`** —— 那是设计稿示例菜专用，构建时会被排除（执行简报 §7） |
| 状态 | `status` | 见上面的裁决 |

#### 数据来源

| 需要什么 | 来源 |
|---|---|
| 食材搜索 | `api.getCatalog().ingredients` |
| 技法词表 | `api.getCatalog().techniques` |
| readiness 实时 | `await import("@canteenos/core")` 的 `readiness()`，喂当前表单值 + catalog 里的食材 |
| 机翻 | `api.translate` |
| 编辑既有菜 | `api.getDish(id)` |
| 保存 | `api.saveDishDraft(id, dish, { ifMatch })` |
| 传图 | `api.uploadImage("dishes", id, blob, meta)` |

#### 空态 / 加载态 / 错误态

- 空表单：配料 0 行、步骤 0 行，readiness 三个都是 ✗ 并写清缺什么（`BuildReadiness.missing` 的机器键在 `sheets.ts` 有列举：`prep:<ref> / components / steps / baseServings / qty:<ref> / ingredient:<ref> / purchase:<ref>`，界面必须翻成人话）。
- 食材搜不到 → 行内「新建这个食材」→ `store.setHandoff({ newIngredientName, returnTo })` → `#/admin/ingredient/new`。
- 技法词表为空 / 取不到 → 切法下拉禁用并提示「技法词表读不到，先只填数量」，**不允许手打技法**（闭集约束）。
- 保存返回 `warnings` 含 `status-forced` → 顶部照实说「已存为草稿」，不要假装成功入库。
- 保存返回 `warnings` 含 `dangling-ref`（worker 契约 §3.4 D-10：跨文件引用只警告不拒绝）→ 顶部黄条列出悬空引用，**仍算保存成功**。

#### 成功后去向

- `store.takeHandoff().returnTo` 有值（从 #22 的导入屏来）→ 回那一屏，并让该行的菜名重新匹配。
- 否则留在本屏，顶部绿条「已存为草稿 · 还没发布」+「再加一道」/「去排菜单」。

#### 移动端与键盘

- 配料行是可展开卡（收起时只显示「食材名 · 数量」），不是宽表格。
- 增删行的按钮 ≥ 44px，删除要二次确认或提供撤销。
- 配料 / 步骤列表用 `<ol>`；每行有可读的 `aria-label`（「第 3 个配料」）。
- readiness 三 chip 用 `aria-live="polite"`，变化时播报。
- 顺序调整本轮**不做**拖拽（触屏拖拽 + 无障碍成本太高），用「上移 / 下移」按钮。

#### 验收标准

- [ ] 字段齐全：菜名 zh（en/uk 机翻）、基准份数默认 50、配料列表（数量+单位/适量、切法、大小、备注、提前多久、照片）、步骤列表（文本+技法+照片）（bullet 1）
- [ ] 顶部 readiness 三 chip 随输入实时变化（bullet 2）
- [ ] 「保存草稿」→ `api.saveDishDraft`；worker 强制 draft 时界面照实说明（bullet 3）
- [ ] 「入库」按 owner 裁决实现（置灰 + 说明，或走新端点）；**不许静默地假装成功**（bullet 3 + §9 硬伤 1）
- [ ] 视频标签页显示「第二轮上线；现在由 Terry 用命令行导入」并链接 `skills/video-recipe-ingest/SKILL.md`（bullet 4）
- [ ] 技法只能从闭集选，不能手打（`types.ts` 的闭集约束）
- [ ] 无照片时「能教 ✗」并正确列出缺什么（DoD）
- [ ] 手动建一道菜到 canPlan ≤ 10 分钟（DoD）
- [ ] 切语言后配料 / 步骤列表不丢（推论 A）
- [ ] 只改了 §3.3 里归 #24 的两个文件

---

### 4.6 #25 · `/admin/publish` 发布

#### 屏上有什么

1. **未发布改动列表**：`main` 与线上 commit 之间动过 `data/` 的改动，人话化（issue 举例：「第 41 周菜单 · 周三午 160 → 180 · 09:14」）。
2. **发布按钮** → `api.publish()`；随后轮询显示四步（检查数据 / 补翻译 / 生成三张单 / 上线）与耗时；失败显示哪一步与原因。
3. **发布记录**：最近 10 次，当前线上版标注；「回到这版」→ `api.rollback(sha)`，**二次确认**。
4. **打印页链接** → `#/qr`。

#### 数据来源与协议

**轮询协议、四步映射、超时判定、429 退避一律照 worker 契约 §4.6（D-16）、§1.5、§4.2、§4.4 执行，本文不重复。** 要点只重申三条前端必须做对的：

1. **四步的文案由前端出，不用 worker 的 `label`。** worker 契约 §1.5 的 `steps[].label` 是中文（「检查数据 / 补翻译 / 生成三张单 / 上线」），而界面是三语的。**按 `steps[].key`（`validate` / `translate` / `build` / `deploy`）查本屏私有字典**；遇到字典里没有的 key 才兜底显示 worker 的 `label`。见 §9 矛盾 8。
2. **`mode` 决定 UI，不要靠环境变量猜**（worker 契约 §5.2 逐字）：
   - `"dispatch"` → 正常四步；
   - `"push-trigger"` → 四步照常 + 顶部黄条「发布走的是临时通道，进度可能晚几秒出现」；
   - `503 dispatch_unavailable` → 发布按钮**置灰**，旁边一行字：「发布暂时关着……你排的改动都已经存好了（N 项未发布），权限一开就能一次发出去。」**绝不能显示成『发布成功』。**
3. **回退 ≠ 上线**（ADR §7）：回退成功后必须显示「已回退到 <短 sha> · 改了 M 个文件 · **但还没上线**，要上线请再点一次发布」，并刷新未发布计数（会变成非零）。

| 需要什么 | 来源 |
|---|---|
| 未发布列表 + 发布记录 + 线上 commit | `api.getChanges()`（§6.3；**本文新增的端点**） |
| 触发发布 | `api.publish()` → `{ runId, mode, commit? }` |
| 进度 | `api.getPublish(runId)` → `PublishProgress` |
| 回退 | `api.rollback(sha)` → `{ commit, restoredFrom, changedFiles }`；`changedFiles` 正是给二次确认弹窗用的 |

#### 空态 / 加载态 / 错误态

- **N = 0**：「都发布了」+ 发布按钮置灰；发布记录照常显示。
- **`runId: null`**（worker 契约 §5.1 的 D-17：dispatch 接口返回 204，run 可能还没出现）→ 显示「已让它开始了，正在找这次构建…」，按 §4.4 的判定继续等；**不要报错**。
- **`status: "unmapped"`** → 「发布流程变了，进度显示不准」+ `htmlUrl` 链接，**照常允许发布**（这是显示坏了，不是发布坏了）。
- **`slow: true`** → 「比平时慢，可以去 Actions 页面看看」+ `htmlUrl`。
- **`status: "timeout"`** → 停止轮询 + `htmlUrl`。
- **`status: "failure"`** → 红条显示 `failedStep` 对应的三语步骤名 + `failureReason`（**原样，不翻译**，worker 契约 §1.5）。
- **切走本屏**（`hashchange`）→ 立即停止轮询（worker 契约 §4.6 的终止条件之一）。
- **页面隐藏** → `visibilitychange` 暂停，回前台补一次。

#### 成功后去向

- 发布成功（四步全绿）→ 顶部绿条「上线了 · 大家两分钟内能看到」，未发布计数刷成 0，发布记录顶部多一条并标「当前线上版」。
- 回退成功 → 留在本屏，见上面第 3 条。

#### 移动端与键盘

- 四步是纵向列表（横向进度条在窄屏上塞不下四个中文标签）。
- 进度区 `role="status" aria-live="polite"`；每步状态用「图标 + 文字」，不只靠颜色。
- 「回到这版」二次确认用原生 `<dialog>` 或自建对话框，**必须有 Esc 关闭 + 焦点圈定 + 关闭后焦点归位**（照 `shell.ts` 抽屉与 `menu.ts` 底部抽屉的既有做法）。
- 发布按钮在请求进行中禁用；轮询期间不允许再次点击。

#### 验收标准

- [ ] 未发布改动列表，人话化，口径 = worker 契约 §3.6（bullet 1）
- [ ] 发布按钮 → `api.publish()`；轮询显示四步与耗时；失败显示哪一步与原因（bullet 2）
- [ ] 四步文案按 `key` 出三语，不直接用 worker 的中文 `label`（§9 矛盾 8）
- [ ] `mode` 三态各自的 UI 都实现了，`503` 时按钮置灰且文案照 worker 契约 §5.2（bullet 2）
- [ ] 发布记录最近 10 次，当前线上版标注（bullet 3）
- [ ] 「回到这版」→ `api.rollback`，二次确认显示 `changedFiles`；回退后明确说明「还没上线」（bullet 3 + ADR §7）
- [ ] 打印页链接 → `#/qr`（bullet 4）
- [ ] 轮询在切屏 / 页面隐藏 / 终态时停止，429 按 §4.6 退避（worker 契约 §4.6）
- [ ] 切语言后轮询不中断、不重复起两条（推论 A 的反向要求）
- [ ] 只改了 §3.3 里归 #25 的两个文件

---

## 5. i18n key 注册表

### 5.1 结构决定：全局字典基本不动

`packages/web/src/types.ts` 已有约定「页面专属文案自己在 `pages/<x>.ts` 里建小字典即可，不必都塞进 `i18n.ts`」，`prep.ts`（`const T`）与 `menu.ts`（`const UI`）都这么做。**后台六屏照办。**

结果：**本波在 `i18n.ts` 上的净改动只有一条 —— 删掉 `"admin.placeholder"`**（占位屏被 #20 替换后它成了死键）。这条由 #20 做。顶栏标题 `page.admin` 已存在，不动。抽屉条目不动。

**收益**：五个并行 agent 在 `i18n.ts` 上的冲突面积 = 0。

### 5.2 前缀与风格约定

- 后台六屏一律用**点分小写**风格（与全局 `DICT` 和 `prep.ts` 一致；`menu.ts` 的 camelCase 风格不再扩散，见 §9 矛盾 12）。
- 前缀 = 屏号：

| 前缀 | 归属 | 文件 |
|---|---|---|
| `adm.` | #20 共用件与锁屏 | `admin/kit.ts` / `admin/token.ts` |
| `home.` | #20 | `pages/admin/home.ts` |
| `plan.` | #21 | `pages/admin/plan.ts` |
| `import.` | #22 | `pages/admin/import.ts` |
| `ing.` | #23 | `pages/admin/ingredient-new.ts` |
| `dish.` | #24 | `pages/admin/dish-new.ts` |
| `pub.` | #25 | `pages/admin/publish.ts` |

- 每个字典的类型断言照抄既有写法：
  ```ts
  const T = { … } as const satisfies Record<string, Record<Lang, string>>;
  ```
  **三语缺一即编译错误** —— 所以不存在「先留空、以后补」这个选项。

### 5.3 en / uk 的补齐规则与责任人

| 语言 | 谁写初稿 | 谁定稿 | 规则 |
|---|---|---|---|
| zh | 实现 agent | Terry | **权威语言**。用人话，不用术语（执行简报 §4.7：「用 100 g 能剩多少」而不是「净料率」） |
| en | 实现 agent | Terry | 直译即可；界面 chrome 不进 `translations.lock.json`（`docs/i18n.md` §7：UI chrome 不在数据模型内） |
| uk | 实现 agent 出初稿 | **帮厨**（母语者），Terry 签字 | 初稿必须在 PR 描述里单列一节「待帮厨校对的 uk 文案」，逐条列出 |

**uk 的硬规则（执行简报 §4.7）：备料 / 切配的动作词只能从 `data/techniques.json` 取。** 后台表单里凡是出现技法名的地方（#24 的「切法」下拉、#21 展开卡里的切配摘要），一律显示 `catalog.techniques[].name` 里的三语名，**不得自己造 uk 动词**。表单标签（「保存」「取消」「份数」）不受此限。

### 5.4 本波新增 key 的最小集（zh 逐条给全）

下表是**最小集**：实现时可在**本屏字典内**自行增补，但前缀必须是本屏前缀，且必须三语齐全。

**`adm.`（#20，共用）**

| key | zh |
|---|---|
| `adm.lock.title` | 请用师傅链接打开 |
| `adm.lock.body` | 这一页要用 Terry 发给你的那条专用链接才能打开。链接丢了就找他再要一条。 |
| `adm.notFound` | 没找到这一屏 |
| `adm.back.home` | 回工作台 |
| `adm.back` | 返回 |
| `adm.save` | 保存 |
| `adm.saving` | 正在保存… |
| `adm.saved` | 已存好 · 还没发布 |
| `adm.saved.unchanged` | 没有改动，什么都没存 |
| `adm.saved.goPublish` | 去发布 |
| `adm.cancel` | 取消 |
| `adm.retry` | 重试 |
| `adm.undo` | 撤销 |
| `adm.discarded` | 刚才那屏有没保存的改动，已丢弃 |
| `adm.leave.confirm` | 这一屏有还没保存的改动，真的离开吗？ |
| `adm.loading` | 正在读… |
| `adm.offline` | 现在没网，后台只能看不能存 |
| `adm.err.network` | 连不上后台 |
| `adm.err.expired` | 链接失效了，找 Terry 要新的 |
| `adm.err.hasFieldErrors` | 有 {n} 处要改，已经标出来了 |
| `adm.machineTranslated` | 机翻，可改 |

**`home.`（#20）**

| key | zh |
|---|---|
| `home.title` | 师傅后台 |
| `home.unpublished` | {n} 项改动还没发布 |
| `home.unpublished.none` | 都发布了 |
| `home.lastPublished` | 上次发布 {t} |
| `home.lastPublished.never` | 还没发布过 |
| `home.publish` | 发布 |
| `home.block.plan` | 排菜单 |
| `home.block.plan.sub` | 本周已排 {n} 餐 |
| `home.block.dish` | 加一道菜 |
| `home.block.draft` | 待确认 |
| `home.block.draft.sub` | {n} 道草稿 |
| `home.block.ingredient` | 食材库 |
| `home.block.ingredient.sub` | {n} 个食材 |
| `home.block.ingredient.seasoning` | 常用调料还差 {n} 个 |
| `home.block.translate` | 翻译待审 |
| `home.block.translate.sub` | {n} 条机翻 |
| `home.block.qr` | 二维码 |
| `home.block.log` | 发布记录 |
| `home.number.unknown` | 数字暂时取不到 |

**`plan.`（#21）**

| key | zh |
|---|---|
| `plan.title` | 排菜单 |
| `plan.week` | 第 {n} 周 |
| `plan.prevWeek` | 上一周 |
| `plan.nextWeek` | 下一周 |
| `plan.view.day` | 日 |
| `plan.view.week` | 周 |
| `plan.view.month` | 月 |
| `plan.meal.breakfast` | 早餐 |
| `plan.meal.lunch` | 午餐 |
| `plan.meal.dinner` | 晚餐 |
| `plan.empty` | 这周还没排 |
| `plan.empty.hint` | 可以从上周复制，或者把微信里那段话粘进来 |
| `plan.copyLastWeek` | 复制上周 |
| `plan.copyLastWeek.none` | 上周没有计划 |
| `plan.copied` | 已复制上周 {n} 餐 · 还没保存 |
| `plan.import` | 粘贴导入 |
| `plan.imported` | 已导入 {n} 行 · 还没保存 |
| `plan.pickDish` | 选菜 |
| `plan.searchDish` | 搜菜名 |
| `plan.noDish` | 还没排 |
| `plan.servings` | 份数 |
| `plan.servings.aria` | {day} {meal} 的份数 |
| `plan.lastWeek` | 上周排的：{n} |
| `plan.lastWeek.note` | 本轮还没有「实际做了多少」的数，这里是上周计划数 |
| `plan.ready.teach` | 能教 |
| `plan.ready.plan` | 能排 |
| `plan.ready.procure` | 能采 |
| `plan.ready.cannotPlan` | 这道菜还排不了 |
| `plan.preview` | 采购单预览 |
| `plan.preview.note` | 只是看看，不会存进去 |
| `plan.preview.failed` | 算不出来，因为： |
| `plan.save` | 保存本周 |
| `plan.conflict` | 有人刚改过，刷新后重试 |
| `plan.reload` | 重新读取 |

**`import.`（#22）**

| key | zh |
|---|---|
| `import.title` | 粘贴导入 |
| `import.paste.label` | 把微信里那段话粘进来 |
| `import.paste.placeholder` | 周一午 番茄炒蛋 200\n周二晚 土豆烧牛肉 180 |
| `import.parse` | 解析 |
| `import.upload` | 上传 Excel / CSV |
| `import.upload.hint` | 四列：日期 · 餐次 · 菜名 · 份数 |
| `import.upload.columns` | 这张表认不出哪一列是什么，自己点一下 |
| `import.result.ok` | 认出来了 |
| `import.result.unknownDish` | 食材库里没有这道菜 |
| `import.result.draftDish` | 这道菜还是草稿，排不了 |
| `import.result.nextWeek` | 这天在下周 |
| `import.result.unparsed` | 这行认不出来 |
| `import.action.new` | 新建 |
| `import.action.swap` | 换一个 |
| `import.action.complete` | 去补全 |
| `import.none` | 一行都没认出来 |
| `import.none.hint` | 常见原因：菜名和食材库里的对不上 |
| `import.submit` | 导入 {n} 行，跳过 {m} 行 |

**`ing.`（#23）**

| key | zh |
|---|---|
| `ing.title.new` | 新食材 |
| `ing.title.edit` | 改食材 |
| `ing.name.zh` | 中文名 |
| `ing.name.en` | 英文名 |
| `ing.name.uk` | 乌克兰语名 |
| `ing.slug` | 英文短名（当文件名用） |
| `ing.slug.hint` | 只能用小写字母、数字和短横线 |
| `ing.slug.taken` | 已有同名食材，是要改它吗？ |
| `ing.photo` | 照片 |
| `ing.photo.camera` | 拍一张 |
| `ing.photo.wikidata` | 从 Wikidata 取 |
| `ing.photo.video` | 从视频截（第二轮） |
| `ing.photo.license` | 许可 |
| `ing.photo.tooBig` | 这张照片太大，换一张或裁小一点 |
| `ing.baseUnit` | 按什么算 |
| `ing.baseUnit.g` | 按重量（克） |
| `ing.baseUnit.ml` | 按体积（毫升） |
| `ing.baseUnit.pcs` | 按个数 |
| `ing.pcsToGram` | 一个多少克 |
| `ing.yield` | 用 100 g 能剩多少 |
| `ing.yield.hint` | 去皮去根之后还剩下的部分；不确定就留着不填 |
| `ing.seasoning` | 调料 · 适量就行 |
| `ing.purchase` | 怎么买 |
| `ing.purchase.supplier` | 从谁那儿买 |
| `ing.purchase.supplier.new` | 新供应商 |
| `ing.purchase.packSize` | 一包多少 |
| `ing.purchase.packUnit` | 单位 |
| `ing.purchase.minPacks` | 最少买几包 |
| `ing.purchase.lastPrice` | 上次一包多少钱 |
| `ing.trackStock` | 耐放 · 记库存 |
| `ing.onHand` | 现在还有多少 |
| `ing.translateFailed` | 机翻暂时用不了，可以先存中文名 |

**`dish.`（#24）**

| key | zh |
|---|---|
| `dish.title.new` | 加一道菜 |
| `dish.title.edit` | 改这道菜 |
| `dish.tab.manual` | 手动输入 |
| `dish.tab.video` | 从视频 |
| `dish.video.later` | 第二轮上线；现在由 Terry 用命令行导入 |
| `dish.video.link` | 看命令行说明 |
| `dish.name.zh` | 菜名 |
| `dish.slug` | 英文短名（当文件名用） |
| `dish.description` | 一句话介绍（菜单上给顾客看） |
| `dish.baseServings` | 这个配方按几份写的 |
| `dish.components` | 配料 |
| `dish.components.add` | 加一样配料 |
| `dish.components.search` | 搜食材 |
| `dish.components.newIngredient` | 食材库里没有 · 新建 |
| `dish.qty` | 用量 |
| `dish.qty.toTaste` | 适量 |
| `dish.prep.technique` | 怎么切 |
| `dish.prep.size` | 切多大 |
| `dish.prep.timing` | 提前多久 |
| `dish.prep.timing.dayBefore` | 前一天 |
| `dish.prep.timing.morning` | 当天早上 |
| `dish.prep.timing.beforeService` | 开餐前 |
| `dish.prep.note` | 备注 |
| `dish.steps` | 步骤 |
| `dish.steps.add` | 加一步 |
| `dish.moveUp` | 上移 |
| `dish.moveDown` | 下移 |
| `dish.remove` | 删掉 |
| `dish.ready.teach` | 能教 |
| `dish.ready.plan` | 能排 |
| `dish.ready.procure` | 能采 |
| `dish.missing.components` | 还没有配料 |
| `dish.missing.steps` | 还没有步骤 |
| `dish.missing.baseServings` | 还没写按几份 |
| `dish.missing.prep` | {name} 还没写怎么切 |
| `dish.missing.qty` | {name} 还没写用量 |
| `dish.missing.ingredient` | 食材库里没有 {name} |
| `dish.missing.purchase` | {name} 还没写怎么买 |
| `dish.saveDraft` | 保存草稿 |
| `dish.savedDraft` | 已存为草稿 · 还没发布 |
| `dish.activate` | 入库 |
| `dish.warn.dangling` | 有引用指向不存在的东西，先存下了： |

**`pub.`（#25）**

| key | zh |
|---|---|
| `pub.title` | 发布 |
| `pub.changes` | 还没发布的改动 |
| `pub.changes.none` | 都发布了 |
| `pub.publish` | 发布 |
| `pub.publishing` | 正在发布… |
| `pub.step.validate` | 检查数据 |
| `pub.step.translate` | 补翻译 |
| `pub.step.build` | 生成三张单 |
| `pub.step.deploy` | 上线 |
| `pub.state.pending` | 等着 |
| `pub.state.running` | 正在做 |
| `pub.state.success` | 好了 |
| `pub.state.failure` | 出错了 |
| `pub.state.skipped` | 跳过了 |
| `pub.queued` | 已经让它开始了，正在找这次构建… |
| `pub.slow` | 比平时慢，可以去 Actions 页面看看 |
| `pub.timeout` | 等太久了，去 Actions 页面看看到底怎么了 |
| `pub.unmapped` | 发布流程变了，进度显示不准 |
| `pub.openActions` | 打开 Actions 页面 |
| `pub.failedAt` | 卡在「{step}」 |
| `pub.done` | 上线了 · 大家两分钟内能看到 |
| `pub.mode.pushTrigger` | 发布走的是临时通道，进度可能晚几秒出现 |
| `pub.mode.off` | 发布暂时关着：等 Terry 把权限打开。你排的改动都已经存好了（{n} 项未发布），权限一开就能一次发出去。 |
| `pub.log` | 发布记录 |
| `pub.log.online` | 现在线上就是这版 |
| `pub.rollback` | 回到这版 |
| `pub.rollback.confirm` | 要把数据退回到 {sha} 吗？会改动 {n} 个文件。 |
| `pub.rollback.done` | 已回退到 {sha} · 改了 {n} 个文件 · **还没上线**，要上线请再点一次发布 |
| `pub.qr` | 打印二维码 |

---

## 6. mock 边界（`packages/web/src/api/`）

### 6.1 唯一的调用面

六个 issue 的「并行方式」一节逐字写着：对着 `packages/web/src/api/mock.ts`（按 ADR-0007 与执行简报 §5 契约实现的内存版）开发。

> **注意**：该文件**在 `main` 上不存在** —— `packages/web/src/` 下没有 `api/` 目录（本轮逐份读过目录）。worker 契约 §8 第 9 行把它标成「⚠️ 未知」，事实是「还没有」。**由 #20 从零建。**

```ts
// packages/web/src/api/client.ts
export interface AdminApi {
  // —— 读 ——
  getCatalog(opts?: { force?: boolean }): Promise<Catalog>;
  getChanges(opts?: { force?: boolean }): Promise<Changes>;
  getPlan(planId: string): Promise<Source<MenuPlan> | null>;        // 目标不存在 → null（不抛）
  getIngredient(id: string): Promise<Source<Ingredient> | null>;
  getDish(id: string): Promise<Source<Dish> | null>;

  // —— 写 ——
  savePlan(planId: string, plan: MenuPlan, opts?: WriteOpts): Promise<WriteResult>;
  saveIngredient(id: string, ingredient: Ingredient, opts?: WriteOpts): Promise<WriteResult>;
  saveDishDraft(id: string, dish: Dish, opts?: WriteOpts): Promise<WriteResult>;

  // —— 辅助写 ——
  translate(zh: string, targets?: ReadonlyArray<"en" | "uk">): Promise<{ en?: string; uk?: string }>;
  uploadImage(
    kind: "ingredients" | "dishes",
    id: string,
    file: Blob,
    meta: { license: string; author?: string; sourceUrl?: string },
  ): Promise<ImageRef>;

  // —— 发布 ——
  publish(): Promise<PublishResult>;
  getPublish(runId: number): Promise<PublishProgress>;
  rollback(sha: string): Promise<RollbackResult>;
}

export interface WriteOpts { ifMatch?: string }

/** v0.3 返回 mock；#27 只改这一个函数体（外加 client.ts 里的 fetch 实现），调用方零改动 */
export function getApi(): AdminApi;
```

**方法名与参数里没有任何 URL。** 这是「#27 换真实实现时调用方零改动」的全部机制：worker 契约 §10 的 **D-01**（`POST /ingredient` 还是 `POST /ingredient/:id`）无论 owner 怎么裁，改动只落在 `client.ts` 里那一行拼路径的代码上。

### 6.2 类型（`api/types.ts`）

```ts
export interface FieldError { path: string; code: string; message: string }

export class ApiError extends Error {
  readonly status: number;        // 400/401/403/404/409/413/429/502/503（worker 契约 §1.8）
  readonly code: string;          // 同上表的 code
  readonly errors: FieldError[];  // 字段级错误；非字段级时为 [{ path: "", code, message }]
  readonly retryAfter?: number;   // 429 时的秒数
}

export interface Source<T> { content: T; blobSha: string; commit: string }

export interface WriteResult {
  commit: string;
  blobSha: string;
  unchanged: boolean;             // worker 契约 §3.1（D-05）内容幂等
  warnings: string[];             // "status-forced" | "dangling-ref" | "yield-on-pcs" | "no-if-match" | …
}

export interface PublishResult {
  runId: number | null;
  mode: "dispatch" | "push-trigger";   // worker 契约 §1.4 / §5.2（D-04）
  commit?: string;
}

export interface PublishStep {
  key: "validate" | "translate" | "build" | "deploy";
  label: string;                  // worker 给的中文；前端按 key 出三语，只在 key 未知时兜底用它
  state: "pending" | "in_progress" | "success" | "failure" | "skipped";
  startedAt: string | null;
  completedAt: string | null;
}

export interface PublishProgress {
  runId: number | null;
  status: "queued" | "in_progress" | "success" | "failure" | "timeout" | "unmapped";
  htmlUrl: string;
  steps: PublishStep[];
  failedStep: string | null;
  failureReason: string | null;
  unmappedSteps: string[];
  slow?: boolean;
}

export interface RollbackResult { commit: string; restoredFrom: string; changedFiles: number }
```

**错误一律 `throw new ApiError(...)`，不返回 `{ ok: false }`** —— 调用方要 `try/catch` 之后把 `err.errors` 直接喂给 `kit.applyFieldErrors`。

### 6.3 两个本文新增的读端点

worker 契约 §1.0 的端点表（6 个 ADR 端点 + `GET /source/:kind/:id` + `POST /translate` + `POST /image`）**不足以支撑这六屏**。缺两样东西，且都不是可以绕过去的：

**(1) `GET /catalog`** —— 全库实体索引。

```jsonc
{
  "ok": true,
  "commit": "<main HEAD>",
  "dishes":      { "<id>": { /* Dish 实体逐字 */ } },
  "ingredients": { "<id>": { /* Ingredient 实体逐字 */ } },
  "techniques":  [ /* data/techniques.json 逐字 */ ],
  "suppliers":   [ "绿源农产品配送", "宏达粮油调味批发" ],   // 从 ingredients[].purchase.supplier 去重
  "translations": { "machine": 42, "human": 7, "stale": 1 }  // translations.lock.json 的计数
}
```

为什么必须有：#20 的四个计数、#21 的菜品搜索与采购单预览、#22 的模糊匹配字典、#23 的供应商下拉与重名检查、#24 的食材搜索与技法闭集 —— 六屏里有五屏靠它。现有产物里没有任何替代品（§1.6 推论 C）。

**返回完整实体而不是轻量索引**，因为 #21 的采购单预览要在浏览器里跑引擎，引擎需要 `Dish.components` 与 `Ingredient.purchase / yield / packSize`。
**体积红线**：第一轮量级是 ≤ 60 个食材 + ≤ 20 道菜，未压缩 JSON 预计 < 150 KB。**一旦超过 300 KB，必须改成「轻量索引 + 按需 `GET /source`」**，那时 `getCatalog()` 的签名不变，只有 `client.ts` 与预览那一处调用点要改。

**(2) `GET /changes`** —— 未发布改动 + 发布记录。

```jsonc
{
  "ok": true,
  "onlineCommit": "<线上 build.json 里的 commit>",
  "lastPublishedAt": "<ISO>",
  "unpublished": [
    { "sha": "…", "shortSha": "a1b2c3d", "at": "<ISO>",
      "role": "chef", "endpoint": "POST /plan/week-43",
      "subject": "排 2026-10-19 那周（12 道菜）", "files": ["data/menu-plans/week-43.json"] }
  ],
  "publishes": [
    { "sha": "…", "at": "<ISO>", "runId": 123456789, "isOnline": true }
  ]
}
```

为什么必须有：ADR §3 把「N 项未发布」的取数途径留给 #20 二选一（前端直调 GitHub compare API，或 worker 代理）。选 **worker 代理**，理由与 worker 契约 §1.7（D-06）给 `GET /source` 的理由逐字相同：**匿名 GitHub API 是 60 次/小时/IP，后台一屏就可能打光**。而且 #25 的「发布记录最近 10 次」在 worker 契约里根本没有对应端点（§9 矛盾 7），合进这里最省。

口径：`unpublished` 的计数与过滤照 worker 契约 §3.6（D-12），`role` / `endpoint` 从 commit trailer（`X-CanteenOS-Role` / `X-CanteenOS-Endpoint`）取，`subject` 是 commit message 首行去掉 `[skip ci]`。**人话化的最终拼装在前端做**（worker 不知道当前界面语言）。

> **这两个端点必须回灌 #19 与 PR #64。** 在它们进 worker 之前，`mock.ts` 照样实现它们 —— 六屏可以先做完，#27 接线时补上就行。若 owner 否掉，反方案见 §8 的 D-05。

### 6.4 端点对照表

| `AdminApi` 方法 | 端点 | 出处 |
|---|---|---|
| `savePlan` | `POST /plan/:planId` | ADR §5 / worker 契约 §1.1 |
| `saveIngredient` | `POST /ingredient[/:id]` | ADR §5 / worker 契约 §1.2（**D-01 待裁**） |
| `saveDishDraft` | `POST /dish/:id/draft` | ADR §5 / worker 契约 §1.3 |
| `publish` | `POST /publish` | ADR §5 / worker 契约 §1.4 |
| `getPublish` | `GET /publish/:runId` | ADR §5 / worker 契约 §1.5 |
| `rollback` | `POST /rollback/:sha` | ADR §5 / worker 契约 §1.6 |
| `getPlan` / `getIngredient` / `getDish` | `GET /source/:kind/:id` | worker 契约 §1.7（D-06） |
| `translate` | `POST /translate` | worker 契约 §1.0（标注「仅见于 #19，ADR §5 未列」，**签名待 #19 定**） |
| `uploadImage` | `POST /image` | worker 契约 §1.0 + §9.1（**判断题 ① 待裁**） |
| `getCatalog` | `GET /catalog` | **本文新增**，§6.3 |
| `getChanges` | `GET /changes` | **本文新增**，§6.3 |

**下列内容一律引用 worker 契约，本文不重复、不改写：** 端点权限矩阵（§1.0）、错误 `code` 全集与 HTTP 状态（§1.8）、令牌校验与轮换（§2）、内容幂等（§3.1）、`If-Match` 与冲突（§3.2）、限流（§3.5）、未发布计数口径（§3.6）、四步映射（§4.2）、超时判定（§4.4）、回退语义（§4.5）、轮询协议（§4.6）、降级三态（§5.2）。**冲突时以 worker 契约为准（PR #64 待合并）。**

### 6.5 mock 的行为契约（#20 实现）

1. **不发任何网络请求**，不 import 任何真实端点常量。
2. **只用内存**：一个模块级 `Map`。允许从 `public/data/` 已有的三张单 + 一份内置 fixture 造初值。**刷新页面即回初值** —— 明确写在文件头注释里，免得实现者用 `localStorage` 造成脏状态误导联调。
3. **写入行为要像真的**：写同样内容 → `unchanged: true` 且**不 bump commit**（worker 契约 §3.1）；`ifMatch` 与内部 blobSha 不符 → 抛 `409 conflict`；`saveDishDraft` 强制 `status: "draft"` 并回 `warnings: ["status-forced"]`（worker 契约 §1.3）。
4. **校验要真跑**：至少做必填 / 类型 / 枚举 / 正则四类，产出**真正的 JSON Pointer**（`/meals/0/plannedServings` 而不是 `/meals/0/servings` —— 见 worker 契约 §1.1 的硬伤提醒）。否则 #21 / #23 / #24 的「逐字段标黄」验收无从验证。
5. **发布要能演全**：`publish()` 之后 `getPublish()` 按脚本推进四步（每步 1.5–3 秒），能演出 `success` / `failure`（停在指定步）/ `timeout` / `unmapped` / `slow` 五种终局。
6. **错误注入不走 URL**（隐私红线：不把数据放 query）：读 `sessionStorage["canteenos.mock"]`，形如
   ```jsonc
   { "publishMode": "off", "failNext": { "status": 409, "code": "conflict", "message": "有人刚改过，刷新后重试" } }
   ```
7. **`translate` 的假译文必须可辨认**（如前缀 `EN·` / `UK·`），免得有人把 mock 输出当真译文提交。
8. **`uploadImage` 返回一个 `blob:` URL 或占位路径**，不真的写盘。

---

## 7. 不做什么（本轮排除项）

执行简报 v0.3 的「不做」原文：帮厨勾选、采购员改包数、视频导入界面、权限细分。在此之上，本文再排除：

1. **不新增顶层 route**；`main.ts` / `router.ts` / `shell.ts` / `types.ts` / `data.ts` / `dom.ts` / `tokens.css` / `pwa.ts` **本轮零 diff**。
2. **不给 `/admin` 加任何 service worker 规则**：后台离线没有意义（写入必须联网），断网时只显示「现在没网，后台只能看不能存」。
3. **不做离线写入队列**：没网就不让存，不排队、不重放。
4. **不做前端角色推断**：不解析令牌、不画按角色隐藏的界面，越权靠 403 兜底。
5. **不做翻译审阅屏**：工作台上的「翻译待审」块只显示数字并置灰（`translations.lock.json` 的人工校对本轮仍走命令行，`docs/i18n.md` §6.2）。
6. **前端不写 `data/translations.lock.json`**：它由 CI 的机翻步骤维护，也不在 worker 的写入白名单里（worker 契约 §7.1）。
7. **不做草稿列表屏 / 食材库列表屏 / 菜品库列表屏**：工作台的块只是入口 + 计数。
8. **不做拖拽排序**（#24 用上移 / 下移按钮）。
9. **不做「全局设置」页**：`baseServings` 默认 50 是常量（§9 矛盾 10）。
10. **不做多周批量发布、不做逐字段 diff 视图**：#25 的改动列表是 commit 级人话摘要。
11. **不做把菜置为 `active` 的功能**，除非 owner 按 §8 的 D-09 拍板。
12. **不引入 UI 框架 / CSS 框架 / 状态管理库**（执行简报 §7）；表格解析库只在 #22、只动态加载、许可须在白名单。
13. **不动 `schemas/`**：本轮准许的 schema 变更清单在执行简报 §3 v0.1，已经用完。表单缺字段就报上来（§9），不许自己扩 schema。

---

## 8. 本文档做出的新决定（需 owner 确认）

每条都可以被推翻；推翻只需改本文，不需要改 ADR、不需要改 worker 契约。

| # | 决定 | 依据 | 若改成另一种，要动什么 |
|---|---|---|---|
| **D-01** | 令牌链接改成 `…/#/admin/t/<token>`，而不是 ADR §4 的 `…/admin#t=<token>` | 站点是 hash 路由单页（`router.ts`）。`parseHash` 的正则 `/^#\/?([^/?#]*)(?:\/(.*))?$/` 对 `#t=<token>` 与 `#/admin?t=<token>` **都不会给出合法 route**，`normalize()` 会 `location.replace` 到 `#/prep`，**令牌当场丢失** | 反方案：给 `parseHash` 加一个可选 query 段（`RouteState` 多一个 `query` 字段），支持 `#/admin?t=<token>`。代价：动 `router.ts`（本轮定为禁改文件）+ `parseHash` 的既有单测。**无论选哪个，ADR §4 里那条链接的写法都得改。** |
| **D-02** | 后台顶栏标题恒为 `t("page.admin")`，每屏标题画在页内 | `PageCtx`（`types.ts`）里没有 `setTitle`，`main.ts` 按 `TITLE[route]` 一次性设定 | 反方案：给 `PageCtx` 加 `setTitle(text)`，`main.ts` 把 `shell.setTitle` 透传进去。代价：动 `types.ts` + `main.ts` 两个共享文件，且 5 个 agent 都会用到它 |
| **D-03** | 后台六屏**不新增顶层 route**，全部走 `#/admin/<rest>` | 见推论 B：新增 route = 5 个 agent 同时改 `router.ts` 的两处 + `main.ts` 的两处 | 反方案：`Route` 加 `admin-plan` / `admin-publish` 等。代价：两个共享文件四处并发追加，且 `#/admin/plan` 这种直觉 URL 反而做不出来（route 段不能带 `/`） |
| **D-04** | 食材与菜品的表单**新增一栏「英文短名（当文件名用）」**，即实体 id；默认由机翻的 `name.en` slug 化，可改 | schema 里没有 `id` 字段（`common.schema.json` 的 `Id` description：文件内不再重复 id），而 #23 / #24 的字段清单**没有任何一栏对应文件名** —— 不加这一栏，界面就产不出 id | 反方案 A：中文名拼音转写（要引入拼音库，且多音字会产生烂 id）。反方案 B：worker 侧生成（要新增「取一个没被占用的 id」的往返，且师傅看不见文件叫什么） |
| **D-05** | 新增两个只读端点 `GET /catalog` 与 `GET /changes`（worker 代理） | 见 §6.3。六屏里五屏需要全库索引，现有产物没有；#25 的发布记录也没有端点。匿名 GitHub API 60 次/小时/IP 的限制与 worker 契约 §1.7（D-06）同理 | 反方案：`GET /catalog` 改由 `scripts/build-data.mjs` 产出静态 `public/data/catalog.json`（省一个端点、可离线），但**它只反映上次发布的状态** —— 刚建的草稿菜排不进本周计划，#22 → #24 → #21 的流程断掉。`GET /changes` 改由前端直调 GitHub compare API（ADR §3 允许），代价是限流风险 + 发布记录仍缺 |
| **D-06** | `currentPlanId()` = `week-<ISO 周号>`（worker 契约 §0 的约定），拿不到就退回 `ctx.planId`（= `build.json.plans[0]`） | 周号约定只写在 worker 契约 §0，仓库里没有共享的周号工具；`ctx.planId` 是**已发布**的计划，不一定是「本周」 | 反方案：把周号工具放进 `packages/core`（更正确，但要动 core，本轮 core 已归 #22）。**无论如何，`week-NN ↔ 日期` 的换算必须只有一份实现** |
| **D-07** | `parsePlanText` 的输入输出类型（§4.3）由本文钉死 | issue #22 只描述了行为，没给类型；#22 的 core PR 与 web PR 是两个 PR，中间必须有一份契约 | 反方案：让 #22 自己定。代价：两个 PR 之间对不上，且 #21 消费 `ParsedLine` 时要返工 |
| **D-08** | 净料率默认「100%」时**不写 `yield` 字段** | `types.ts`：`yield` 可选，`(0, 1]`。写 `1` 会把「没量过」伪装成「量过，结果是 1」，采购 trace 里的 `yieldApplied` 会从 `null` 变成 `1`，看起来像有依据 | 反方案：默认写 `1`。代价：`LineTrace.yieldApplied` 的语义（「pcs 食材或食材无 yield 时为 null」）被污染 |
| **D-09** | #24 的「入库」按钮默认**置灰 + 说明**（本轮后台产不出 `active` 的菜） | ADR §5 端点表逐字 `status: "draft"`；worker 契约 §1.3 与 T-16 明确「请求体带了别的值也覆盖成 draft」 | 反方案 A：worker 去掉强制，允许请求体显式 `status: "active"`。反方案 B：加 `POST /dish/:id/status`。**两个反方案都要改 ADR §5 与 worker 契约 §1.3，属 owner 裁决。** 见 §9 硬伤 1 —— 这条不裁，v0.3 的 DoD 走不通 |
| **D-10** | 工作台「待确认」块指向**第一条草稿的编辑屏**；草稿数为 0 时置灰 | 本轮没有草稿列表屏（§7 排除 7），块必须有个去处 | 反方案：做一个草稿列表屏（第 8 屏），归 #24 或新 issue |
| **D-11** | #23 的「调料 · 适量就行」落到 `role: "seasoning"` | Ingredient 上没有 to-taste 开关；`to-taste` 是 `Quantity.unit`，属 `Dish.components[].qty`（`types.ts`） | 反方案：把 `baseUnit` 设成 `"to-taste"`（schema 枚举确实允许），但这会让该食材的库存/采购聚合失去基准单位。**不推荐** |
| **D-12** | 四步进度的文案由前端按 `steps[].key` 出三语，忽略 worker 的 `label` | worker 契约 §1.5 的 `label` 是硬编码中文，界面是三语的 | 反方案：worker 按 `Accept-Language` 返回三语 label。代价：worker 要内置界面文案，违反「UI chrome 不在数据模型内」（`docs/i18n.md` §7） |
| **D-13** | 后台六屏的文案放各屏私有字典，`i18n.ts` 本波净改动只有「删 `admin.placeholder`」 | `types.ts` 已有此约定，`prep.ts` / `menu.ts` 均如此；这样 5 个并行 agent 在 `i18n.ts` 上的冲突面积为 0 | 反方案：全提到 `i18n.ts`，按 §3.4 的锚点规则追加。代价：五方并发追加同一文件 |
| **D-14** | 每屏 CSS 全部选择器以 `.adm-<screen>` 开头，禁止裸类名 | `prep.css` 已经泄漏了 `.li .num .thumb .step .clip .dish-head .pc` 等裸类名到全局（§9 矛盾 11），Vite 把所有页面 CSS 打进同一份样式表 | 反方案：引入 CSS Modules 或 scoped 方案。代价：动构建配置，且与「不引入 CSS 框架」的精神相悖 |
| **D-15** | 跨屏传参走 `store.setHandoff/takeHandoff` 的内存 store，**不用 query string** | 隐私红线：不把数据放 URL；且当前 router 也不支持 hash query（见 D-01） | 反方案：随 D-01 的反方案一起做 hash query。代价同 D-01 |

---

## 9. 与既有文档 / 代码的矛盾与硬伤

全部来自本轮逐字读到的原文。**按严重度排序，前三条建议开工前先解决。**

### 硬伤 1（阻塞级）· 后台建的菜永远是草稿，但 v0.3 要求用后台排一周

- issue #24 bullet 3 逐字：「保存草稿 → `POST /dish/:id/draft`；**『入库』= status active**（能不能排看关卡）」。
- ADR-0007（PR #61，待合并）§5 端点表逐字：`POST /dish/:id/draft` → `data/dishes/<id>.json`（`status: "draft"`）。worker 契约 §1.3 把它翻成实现语言：「**worker 强制写入 `status: "draft"`**，请求体带了别的值也覆盖成 draft」，并有测试 T-16 钉死。
- 后果链：后台建的菜永远 `draft` → `expand` 会给出 `dish-not-active` issue（`core/src/sheets.ts` 的 `SheetIssueCode`）→ 排不进菜单 → **执行简报 v0.3 的 DoD「Terry 用后台排一周并发布，全程不碰 JSON」走不通**。
- 处置：见 §8 的 D-09，两个反方案都需要动 ADR §5 与 worker 契约 §1.3。**这是 owner 判断题，不是实现细节。**

### 硬伤 2（阻塞级）· ADR §4 的令牌链接在当前路由下是坏的

- ADR §4 逐字：`https://terryyyc.github.io/canteen-os/admin#t=<token>`。
- 两处都过不去：(a) 站点是单页 hash 路由，路径 `/canteen-os/admin` 在 `router.ts` 里没有任何对应物（本轮未读 `vite.config.ts` 与是否有 `404.html`，所以不断言必然 404，但**路由层确定不认**）；(b) 即便改成根路径 + `#t=<token>`，`parseHash` 也会判为非法并 `location.replace(hrefOf("prep"))`，**令牌丢失且用户被弹到备料单**。
- 处置：见 §8 的 D-01。**ADR §4 里那行链接需要跟着改。**

### 硬伤 3（阻塞级）· 后台需要的全库索引在现有产物里不存在

- 三张单 JSON（`core/src/sheets.ts`）只含**被排进该 menu-plan** 的内容：没有全库食材、没有全库菜品、没有技法词表、没有供应商清单。
- `build.json.readiness` 只有 `dishId → { canTeach, canPlan, canProcure, missing[] }`，**连菜名都没有**，而且是上次发布时的快照。
- worker 契约 §1.0 的端点表里没有任何列表端点（`GET /source/:kind/:id` 一次只能取一个）。
- 六屏里五屏需要它（§6.3）。处置：§8 的 D-05。

### 矛盾 4 · issue #20 标题写「六块」，正文列了 7 项

标题「/admin 工作台：六块 + 未发布计数」、执行简报 v0.3 也写「六块」，但 issue 正文 bullet 2 列的是：排菜单 / 加一道菜 / 待确认 / 食材库 / 翻译待审 / 二维码 / 发布记录 = **7 个**。本文按正文的 7 项写验收（§4.1）。

### 矛盾 5 · #23 的「允许 to-taste」在 Ingredient 上无处安放

issue #23 bullet 1：「『调料 · 适量就行』→ 允许 to-taste」。但 `to-taste` 是 `Quantity.unit` 的取值（`core/src/types.ts`），属于 `Dish.components[].qty`，不是 Ingredient 的字段。`Ingredient.baseUnit` 的枚举里确实有 `to-taste`（worker 契约 §1.2），但那样该食材就没有可聚合的基准单位了。处置：§8 的 D-11。

### 矛盾 6 · 食材 / 菜品的 id 无处产生

`schemas/common.schema.json#/$defs/Id` 的 description（worker 契约 §1.2 引用）：「实体的 id 就是文件名……文件内不再重复 id 字段」。而 #23 / #24 的字段清单里**没有任何一栏对应文件名**，`Ingredient` / `Dish` schema 又是 `additionalProperties: false`。处置：§8 的 D-04。

### 矛盾 7 · 「发布记录最近 10 次」没有端点

issue #25 bullet 3 要求发布记录列表，worker 契约 §1.0 里没有对应端点。处置：合进 `GET /changes`（§6.3）。

### 矛盾 8 · 四步进度的 label 是中文，但界面是三语

worker 契约 §1.5 的 `steps[].label` 写死中文（「检查数据 / 补翻译 / 生成三张单 / 上线」，来源是 #25 的任务清单）。乌克兰帮厨 / 采购员用 `GET /publish/:runId`（buyer 也有读权限，ADR §5）时会看到中文。处置：§8 的 D-12。

### 矛盾 9 · 周号换算没有共享实现

`week-<ISO 周号>` 的约定只出现在 worker 契约 §0（并且它自己指出 ADR §2 的 commit message 示例写成 `week-42` 与同行文案自相矛盾）。#20（本周已排餐数）、#21（周导航、上周计划）、#22（`weekStart`）都需要 `week-NN ↔ 日期` 换算。处置：§8 的 D-06 —— **只准有一份实现**。

### 矛盾 10 · 「基准份数默认 50，全局设置」没有存储位置

issue #24 bullet 1 写「基准份数（默认 50，**全局设置**）」，但仓库里没有任何「后台设置」的存储位置（无数据库、无用户表、schema 里也没有 settings 实体，而实体是冻结项）。本轮按常量 50 实现，不做设置项（§7 排除 9）。

### 矛盾 11 · `prep.css` 泄漏了裸类名到全局

`packages/web/src/pages/prep.css` 里 `.num`、`.thumb`、`.li`、`.step`、`.clip`、`.dish-head`、`.pc`、`.back` 都是**无前缀**的全局选择器（大部分规则确实挂在 `.prep` 下，但这几个不是）。Vite 把所有 `pages/*.css` 打进同一份样式表，后台若复用这些类名会串味。处置：§8 的 D-14。（`menu.css` / `purchase.css` / `qr.css` 本轮未读，按同样风险处理。）

### 矛盾 12 · 页面私有字典有两种命名风格

`prep.ts` 用点分（`meal.lunch` / `group.at-hand`），`menu.ts` 用无点 camelCase（`noMenuWeek` / `allergensNone`）。后台统一用点分（§5.2）。**本轮不去改既有两个文件**（它们是禁改文件）。

### 矛盾 13 · 语言切换会清空后台表单

`main.ts` 的 `onLangChange(() => { shell.refresh(); renderPage(); })` + `types.ts` 的「语言切换 = 重新 render」。前台只读页无所谓，后台是表单 —— 用户填到一半切语言，输入全没。处置：推论 A（各屏用模块级变量保存并回填），进每屏验收标准。

### 矛盾 14 · `packages/web/src/api/mock.ts` 被当成已存在

六个 issue 的「并行方式」都写「对着 `packages/web/src/api/mock.ts` 开发」，worker 契约 §8 第 9 行把它标成「⚠️ 未知」。**事实是 `packages/web/src/` 下没有 `api/` 目录**（本轮逐份读过）。它得先被造出来 —— 归 #20（§3.2）。

### 矛盾 15 · 首屏 JS 预算与「浏览器内跑引擎」

执行简报 §4.5：首屏 JS ≤ 60 KB gzip。`data.ts` 头注释确认 `@canteenos/core` 目前**只以 `import type` 出现，不进产物**。#21 的采购单预览是 core 第一次进浏览器运行时。处置：§3.6 的分包规则 + 每个 PR 贴分包体积。

### 一处非阻塞的观察

`docs/specs/` 目录**在 `main` 上不存在** —— worker 契约只在 PR #64 的分支上。本文与它是同一目录下的两个**新增**文件，互不冲突；两个 PR 谁先合并都行。

---

## 附：本文引用的源文件

全部经 GitHub API 逐份读取，**未执行任何构建、测试或克隆**。

| 文件 | ref | 用途 |
|---|---|---|
| `docs/execution-brief.md` | `main` | §1.2 / §1.4 / §1.7 / §3 v0.1–v0.4 / §4 / §5 / §6 / §7（**权威**） |
| `docs/prd.md` | `main` | §2 角色、§4.4 产品形态、§7 非目标 |
| `docs/roadmap-v2.md` | `main` | §2 §3 的第一轮退出标准、uk 母语者校对要求 |
| `docs/i18n.md` | `main` | I18nString 契约、fallback 链、单位本地化、lock 规则、§7 UI chrome 边界 |
| `docs/specs/v03-worker-contract.md` | **`refs/heads/docs/v03-worker-contract`（PR #64，待合并）** | §6 全节的对齐基准；§1.0–§1.8 / §2 / §3 / §4 / §5.2 / §9 / §10 |
| `docs/adr/0007-write-channel.md` | **`refs/pull/61/head`（待合并）** | §2 写入方式、§3 写入≠发布、§4 令牌与 fragment、§5 端点与错误格式、§6 四步、§7 回退、§9 图片压缩 |
| `packages/web/src/router.ts` | `main` | §1.2 路由事实、§2 路由表、硬伤 2 |
| `packages/web/src/main.ts` | `main` | 路由注册方式、语言切换重渲染、`TITLE` 表 |
| `packages/web/src/shell.ts` | `main` | 抽屉 NAV、`formatBuiltAt` / `netState` 导出、对话框无障碍做法 |
| `packages/web/src/types.ts` | `main` | §1.1 页面契约逐条 |
| `packages/web/src/i18n.ts` | `main` | §1.3 与 §5：DICT 形状、key 风格、三语强制、存储 key |
| `packages/web/src/data.ts` | `main` | §1.5 数据层、`DataError`、`BASE_URL` 约定、core 只 import type |
| `packages/web/src/dom.ts` | `main` | `h()` / `append()` / `replace()` 与 textContent 红线 |
| `packages/web/src/styles.css` | `main` | §1.4 共用类名、44px 触控下限、追加锚点位置 |
| `packages/web/src/tokens.css` | `main` | 设计 token 名单、三态主题、`:focus-visible` |
| `packages/web/src/pages/admin.ts` | `main` | 现有占位屏（被 #20 重写） |
| `packages/web/src/pages/prep.ts` | `main` | 页面写法范本：私有字典、子状态解析、`prepHref`、模块级状态 |
| `packages/web/src/pages/prep.css` | `main` | 页面 CSS 写法与**裸类名泄漏**（矛盾 11） |
| `packages/web/src/pages/menu.ts` | `main` | 第二个范本：底部抽屉、焦点管理、`hashchange` 拆解、复数规则 |
| `packages/web/src/pages/`（目录） | `main` | 现有页面文件清单 |
| `packages/web/package.json` | `main` | 依赖现状（无 UI 框架）、脚本 |
| `packages/core/src/types.ts` | `main` | §1.7 与 §4.4 / §4.5 的字段表 |
| `packages/core/src/sheets.ts` | `main` | `BuildManifest` / `BuildReadiness` / `PrepGroup` / `SheetIssueCode` / 三张单形状 |
| `packages/core/src/index.ts` | `main` | 公共出口（#22 的追加位置） |
| `packages/core/src/procurement/`（目录） | `main` | 确认引擎只有 `engine.ts` 一个文件（**内容本轮未读**） |
| `schemas/`（目录） | `main` | 确认 5 实体 + techniques 共 6 个 schema 文件（**内容本轮未读**，字段以 §1.7 的两个投影为准） |
| issue #20 / #21 / #22 / #23 / #24 / #25 | —— | §4 逐屏的任务清单、完成定义、依赖与分支名 |

**未读、因此本文不做任何断言的文件**：`docs/design/backoffice-v1.html`（UI 事实源）、`docs/design/screens-v2.html`、`packages/core/src/procurement/engine.ts`、`schemas/*.schema.json`、`packages/web/vite.config.ts`、`packages/web/src/pwa.ts`、`packages/web/src/theme.ts`、`packages/web/src/pages/{purchase,menu,qr}.css`、`packages/web/src/pages/{purchase,qr}.ts`、`data/**`、`.github/workflows/**`。
