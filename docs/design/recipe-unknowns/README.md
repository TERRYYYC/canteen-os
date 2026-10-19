---
feature_ids: [team-meals, knowledge-base, video-recipe-ingestion]
topics: [design, proposal, recipe-unknowns, prep, dishes, materialization, i18n]
doc_kind: design-proposal
created: 2026-10-19
status: proposed-for-review
---

# 固定菜谱带上「视频里没说清」的提示（合同提案）

> **状态：提案，未签收。** 本文回答 [#168](https://github.com/TERRYYYC/canteen-os/issues/168) 的 5 个问题，属于 [#170](https://github.com/TERRYYYC/canteen-os/issues/170) 第 1 波设计（D3）。本文不改 schema、代码、`data/` 或任何知识库，也不改变[当前工作合同](../../current-contract.md)和 [D0 页面合同](../team-meals-pages/D0-contract.md)。要先由 Terry 定第 8 节的事，写进 ADR 和合同后才实施。
>
> 依据的代码是 main `e8febfe`。统计来自 49 道收藏菜谱的解析候选（`candidate.json`）和它们的导入回执，只记数量，不记本机路径和原话。按关键词分类的数字是约数。

## 0. 一页结论

1. **提示在三处丢了。** 解析把「没说清」写成自由文字；知识库导入器把它们平铺成一张列表，看不出属于哪一步（49 道全部如此）；知识库菜谱格式里没有放它们的地方；Worker 固定菜谱时只留步骤文字和图。所以帮厨在备料页看不到「腌多久没说」。
2. **数据：** `dish` v3 加一个可选的顶层字段 `unknowns[]`。每条只记**类别**和**位置**（第几步、第几样材料），不记原话。原话留在私有知识库，只有师傅和管理员能看（ADR-0010）。份数不另设类别，`baseServings` 没填就是没说。
3. **类别：** 9 类，全部带进固定版本，按页面分开显示。备料页只显示和备料有关的：提前多久、切多大、用量、毛重还是净重、用哪种。火候、做多久、做到什么样只在菜品页的「做法」里显示。
4. **显示：** 统一用人话，「……没说 · 问师傅」。我们的资料里这一项已经有值，就不显示（4.1 的表）。不写条数，不出现「核对」「复核」「核定」「仍需」，不显示 AI 原话，没有令牌时也不显示开发用信息（ADR-0011 第 5 条，D0 第 68–70 行）。
5. **知识库要配合 7 件事。** 最要紧的三件：导入时保留每条属于哪一步、哪样材料；菜谱修订里能存这些条目；存为菜谱时把它们一起带过去。
6. **ADR：并入 ADR-0012（#176），不另开一篇。** 这里的 schema 变了，固定菜谱的规则和候选合同也要改，所以要写进 ADR。Terry 10/19 定了本版只开 ADR-0012 一篇（[#170](https://github.com/TERRYYYC/canteen-os/issues/170#issuecomment-6257683642)），由 D1 的线程在 ADR-0012 里加一节，细节引用本文。已经固定的版本一律不改写。知识库也不在旧修订上就地补，只能存新版本。

## 1. 现状：提示在哪一步丢了

### 1.1 一条「没说清」从视频走到备料页

| 环节 | 现在的样子 | 依据 |
|---|---|---|
| 解析（候选） | 有三处，都是自由文字，没有类别：步骤的 `unknowns[]`、整道菜的 `unresolved[]`、每样食材的 `uncertainty` | `skills/video-recipe-ingest/references/candidate-contract.md:7`、`:9` |
| 合同要求 | 三处「均须传给 KB 候选，审核后随固定版本进入备料提示」 | `candidate-contract.md:11` |
| 导入知识库 | 49 道的导入回执里，「未定条件数」都等于三处条数之和，合计 1220 条（256 + 391 + 573）。说明导入器把三处平铺成候选上的一张列表；列表里每条还能不能看出属于哪一步，公开仓库看不到 | 导入回执（本机，只记数）；候选类型 `unresolved?: string[]` 见 `packages/web/src/pages/admin/knowledge/inbox.ts:24` |
| 师傅看到 | 收件箱里列出「视频里没说清的地方 · N」，只有师傅能看 | `inbox.ts:355-358` |
| 存为菜谱 | 知识库菜谱格式（`recipeFormatVersion: '2'`）的步骤只有 `id`、`text`、`techniqueId`，食材行也没有放说明的地方，所以存成菜谱后不会带上它们 | `packages/web/src/api/knowledge-types.ts:4`、`:6`、`:9`（这是 Web 侧的类型；导入器和知识库本身在私有仓库） |
| 固定进菜单 | Worker 读这一版菜谱（`knowledge-materializations.ts:119`）。它的类型里步骤和食材都没有「没说清」（`knowledge-materialization.ts:8-9`），步骤只留文字和图（`:128-132`） | `packages/worker/src/knowledge-materialization.ts` |
| 以前 | #161 之前，候选上那张平铺列表只以条数 `sourceGapCount` 进入发布资料。#161 去掉了这个条数，#162 去掉了页面上的「原视频仍需核对的条件」 | commit `1a55407`、`84fdd66` |
| 页面 | 备料页、菜品页都没有可显示的内容 | `packages/web/src/pages/prep-list.ts`、`prep.ts`、`dishes.ts` |

旧资料的兼容代码还在：schema 里有 `provenance.evidence.unresolved`（`schemas/dish-v3.schema.json:196-204`）和 `provenance.sourceGapCount`（`:212-217`），`publicDish` 仍会从旧的 `evidence.unresolved` 推出条数（`packages/core/src/public-dish.ts:34-36`），但页面已经不显示了。另外，Worker 返回的 `unresolvedCount` 数的是「没有结构化用量的材料行」（`knowledge-materialization.ts:106-107`、`:121`），和「没说清」不是一回事。

### 1.2 规模（49 道收藏菜谱）

| 层 | 条数 | 说明 |
|---|---:|---|
| 步骤 `unknowns` | 391 | 403 步里 380 步有，每步最多 2 条，每道 3–16 条 |
| 整道菜 `unresolved` | 256 | 49 道都有 |
| 食材 `uncertainty` | 573 | 867 行食材里有说明的行数 |
| 导入后平铺成一张列表 | 1220 | 每道 9–46 条 |
| 份数 | — | 46 道没说，另外 3 道说了但不是数字 |

步骤 `unknowns` 按关键词粗分（一条可以属于几类）：用量或配比 231，时长 199，火候或油温 116，预处理 67，熟度或出锅标准 61，食材身份 40，切法或规格 35，份数 20。有 12 条哪类都不沾，有 253 条同时沾好几类，例如一句话里既说火力又说时长。

要提前做的步骤（腌、泡、卤、醒、晾凉）：盘点报告的口径是 20 道有这类步骤，其中 17 道至少有一处没说要多久。本文换了一套关键词重数，得到 25 道和 18 道。**同一批数据，换个关键词结果就不同。所以类别要在解析时就标好，不能事后从自由文字里猜**（见第 5 节 K2、K6）。

## 2. 问题 1：数据字段

### 2.1 放在哪：两种做法

**做法 A：三层各放一份。** `steps[].unknowns`、`components[].unknowns`，再加一个整道菜的 `unknowns`。

- 好处：和候选的结构一一对应。
- 难处：v3 的 `steps` 直接引用了严格的 v2 定义（`dish-v3.schema.json:116-118` → `dish.schema.json:67-94`，`:92` 不许多出字段）。要么改 v2，但 ADR-0008 定了 v2 保持严格；要么给 v3 单独抄一份步骤定义。材料行也要加字段。改动面大。

**做法 B（建议）：一个顶层数组，每条写明位置。** `unknowns[]` 放在 `DishV3` 顶层，每条可以带 `stepIndex`（第几步）或 `componentIndex`（第几样材料），两个都不带就是整道菜的。

- 固定版本永远不改写，所以用数组位置当锚点是稳定的。
- 知识库那边用行 ID，Worker 固定时把 ID 换成位置。这和它现在把食材行换成按位置编号的引用是同一个做法（`knowledge-materialization.ts:56-65`、`:117-127`）。
- `steps` 和 `components` 的定义都不用动，v2 不受影响。

不放进 `provenance`，因为 `provenance` 记的是来源，而这里是页面要显示的菜谱内容。另外 `publicDish` 会删掉 `provenance.evidence`（`public-dish.ts:44`）。

### 2.2 schema 草案（加到 `schemas/dish-v3.schema.json`）

```json
{
  "properties": {
    "unknowns": {
      "type": "array",
      "minItems": 1,
      "maxItems": 200,
      "uniqueItems": true,
      "description": "视频里没说清的地方：只记类别和位置，不记原话（原话留在私有知识库，ADR-0010）。没有就省略本字段，不写空数组。",
      "items": { "$ref": "#/$defs/RecipeUnknown" }
    }
  },
  "$defs": {
    "RecipeUnknown": {
      "type": "object",
      "properties": {
        "kind": {
          "enum": ["prep-ahead", "amount", "net-or-gross", "cut-size", "identity", "heat", "duration", "doneness", "other"]
        },
        "action": {
          "enum": ["marinate", "soak", "brine", "rest", "cool", "other"],
          "description": "只用于 prep-ahead：要提前做的是腌、泡、卤、醒、晾凉，还是别的"
        },
        "stepIndex": { "type": "integer", "minimum": 0, "description": "在 steps 里的位置，从 0 起" },
        "componentIndex": { "type": "integer", "minimum": 0, "description": "在 components 里的位置，从 0 起" }
      },
      "required": ["kind"],
      "additionalProperties": false,
      "if": { "properties": { "kind": { "const": "prep-ahead" } } },
      "then": { "required": ["action"] },
      "else": { "not": { "required": ["action"] } }
    }
  }
}
```

几条规则：

- **没有就省略。** `minItems: 1`。这样知识库修订里没有这些条目时，Worker 生成的文件和现在逐字节相同，旧版本重放仍是「没有变化」（见 6.2 C2）。
- **一样的只写一条。** `uniqueItems: true`。同一位置、同一类别的几句 AI 原话合成一条，反正页面只显示类别。
- **位置不能越界。** JSON Schema 管不到「`stepIndex` 小于步骤数」，所以 Worker 固定时和 `scripts/validate-schemas.mjs` 校验时都要查，越界就拒绝，不悄悄丢掉。页面只读，遇到越界的条目跳过，不报错。
- **上限 200。** 49 道里平铺后最多一道 46 条，合并后只会更少，200 留足了余量。旧的 `evidence.unresolved` 上限是 100（`dish-v3.schema.json:198`）。
- **份数不设类别。** `baseServings` 没填，就是没说做几份（`dish.schema.json:18-22`）。如果再加一条「份数没说」，两处可能对不上。

TypeScript 草案（`packages/core/src/types.ts`，放在 `DishV3` 旁边，`:415`）：

```ts
export type RecipeUnknownKind = 'prep-ahead' | 'amount' | 'net-or-gross' | 'cut-size' | 'identity' | 'heat' | 'duration' | 'doneness' | 'other';
export type PrepAheadAction = 'marinate' | 'soak' | 'brine' | 'rest' | 'cool' | 'other';
export interface RecipeUnknown { kind: RecipeUnknownKind; action?: PrepAheadAction; stepIndex?: number; componentIndex?: number }
// DishV3 增加：unknowns?: RecipeUnknown[];
```

### 2.3 和 `sourceGapCount` 的关系

| | `sourceGapCount`（旧） | `unknowns`（新） |
|---|---|---|
| 记什么 | 条数 | 每条的类别和位置 |
| 谁写 | #161 之前的 Worker；#161 之后不再写 | 新的 Worker，只在知识库修订里有这些条目时写 |
| 页面 | #162 之后不显示 | 按第 4 节显示 |
| schema | 保留，只为读旧资料。描述里「仍需核对」改成「旧字段，ADR-0011 后不再写入」（`dish-v3.schema.json:216`） | 新增 |

旧资料里的条数**不换算**成 `unknowns`：没有类别和位置，换过来只会变成 N 条「还有别的没说清」，帮厨看不出要问什么。`publicDish` 从旧 `evidence.unresolved` 推条数的那段（`public-dish.ts:34-36`）已经没有页面在读，可以另开清理任务，不在本提案范围。

### 2.4 要改的文件（签收后实施，按 schema → types → data → docs）

| 顺序 | 文件 | 改什么 |
|---|---|---|
| schema | `schemas/dish-v3.schema.json` | 加 `unknowns` 和 `$defs/RecipeUnknown`；`sourceGapCount` 的描述改为旧字段 |
| types | `packages/core/src/types.ts`（`:415` `DishV3` 一带） | 加 `RecipeUnknown`、`RecipeUnknownKind`、`PrepAheadAction`，`DishV3.unknowns?` |
| types | `scripts/check-types-vs-schema.mjs`（`:79-89`） | 加 `dish-v3.schema.json#/$defs/RecipeUnknown` 和 `kind` 的对照 |
| types | `scripts/validate-schemas.mjs`（`:35-36` 附近） | 加位置越界检查 |
| 实现 | `packages/worker/src/knowledge-materialization.ts`（`:8-12` 类型，`:100-148` 生成） | 从知识库修订读 `unknowns`，把行 ID 换成位置，非空才写进菜谱文件 |
| 实现 | `packages/core/src/public-dish.ts` | 原样保留 `unknowns`（里面本来就没有原话），不要删掉 |
| 实现 | `packages/web/src/view-models/published.ts:141` | 读发布资料时接受 `unknowns` 数组，形状不对就报资料错误 |
| 实现 | `packages/web/src/pages/prep-list.ts`、`prep.ts`、`dishes.ts`，加一个三处共用的判断（`packages/web` 里） | 按第 4 节显示；「资料里已经有值就不显示」只写在那个共用判断里，三处都调用它（4.1 的表） |
| data | `data/` | 不改。新字段可选，旧文件照样有效。只加测试夹具 |
| docs | `skills/video-recipe-ingest/references/candidate-contract.md:9`、`:11` | 候选的「没说清」可以带类别；「审核后随固定版本进入备料提示」改成「存为菜谱后，随固定版本带上类别和位置」 |
| docs | `docs/current-contract.md:49` 附近 | 一句话：视频里没说清的地方随固定版本带上类别和位置，页面用人话写「没说 · 问师傅」 |
| docs | `docs/design/team-meals-pages/D0-contract.md`（「四条线第一批」第 1、4 条之后） | 写进第 4 节的显示规则 |
| docs | `docs/adr/0012-canteen-quantities.md`（#176） | 由 D1 的线程加一节，写 6.1 列的决定，细节引用本文。本提案不改这个文件 |

非本仓库：私有知识库的导入器、菜谱格式和接口，见第 5 节。

## 3. 问题 2：带哪些类别

**建议全部带进固定版本，按页面分开显示。** 理由：

- 存进去很便宜，每条只有一个类别和一个位置。如果只带一部分，以后菜品库要显示火候、时长时，得重新导入、重新固定。
- 「留给菜品库」的意思是：火候、时长不放进备料页，而是放在菜品页的「做法」里。菜品页就是第四条线的菜品库。

| `kind` | 中文 | 和谁有关 | 备料页「要准备的」 | 备料页下方的做法 | 菜品页 | 粗估规模 |
|---|---|---|:-:|:-:|:-:|---|
| `prep-ahead` | 提前多久（腌、泡、卤、醒、晾凉） | 帮厨排时间 | ✓ 每道菜一行 | ✓ 写在那一步 | ✓ | 约 20 道，约 30 步 |
| `cut-size` | 切多大 | 帮厨 | ✓ 写在那样材料 | ✓ | ✓ | 步骤 35 条，食材行约 70 条 |
| `amount` | 用量、配比 | 帮厨、采购 | ✓ 只写在那样材料上，而且那一行还没写「用量未录」时才写 | 只写在材料卡上 | ✓ 也写在步骤上 | 步骤约 230 条 |
| `net-or-gross` | 毛重还是净重 | 采购、帮厨 | ✓ | ✓ | ✓ | 主料约 12 行 |
| `identity` | 用哪种（品种、部位、牌子，或只描述了样子） | 采购、帮厨 | ✓（调料也写） | ✓ | ✓ | 步骤 40 条，食材行约 120 条 |
| `heat` | 火候、油温 | 师傅 | — | — | ✓ | 约 120 条 |
| `duration` | 做多久（不是提前多久） | 师傅 | — | — | ✓ | 约 200 条 |
| `doneness` | 做到什么样、出锅标准 | 师傅 | — | — | ✓ | 约 60 条 |
| `other` | 别的 | — | — | 写在那一步 | ✓ | 少量 |
| 份数（不是类别） | 做几份 | 帮厨、采购 | ✓ 一行合并写（见 4.2） | 已有提示（`prep.ts:559`） | 已有「原配方份数没写」（`dishes.ts:34`） | 49 道都没有 |

为什么备料页不放火候、时长、出锅标准：按关键词粗算，如果放进去，403 步里约 236 步会多一行。只放提前多久和切多大，约 65 步多一行。再把步骤上的用量也放进去，就到约 260 步，每两步多一行，帮厨很难找到真正和备料有关的那几行。

## 4. 问题 3：在哪里、用什么话显示

### 4.1 说法的规矩

- **「没说」**指视频里没说；**「没写 / 未录」**指我们的资料里没录（已有说法，例如「还没写怎么切」「用量未录」）。两种都以「· 问师傅」结尾。
- 只写类别，不写条数（不出现「391 处」），也不写 AI 原话。
- 不出现「核对」「复核」「核定」「仍需」「未经验证」（ADR-0011 第 5 条，`docs/adr/0011-recipe-review-outside-app.md:39`）。
- **资料里已经有值，就不显示对应的提示；已经有提示的地方也不再重复。** 判断方法见下表。例如师傅按 ADR-0012 给一行补了每份 150 g，存成新版本时忘了删那条 `amount`，备料页这一行也只写「150 g」，不会同时出现「用量没说」。
- 有令牌时，现有的「打开固定菜谱版本」入口照旧（`prep.ts:615-619`）。师傅从那里进知识库看原话。没有令牌时不出现任何后台入口（D0 第 68 行）。

**什么时候不显示**（按一条指向的材料或步骤判断）：

| 类别 | 这些情况不显示 | 页面现在能不能判断 |
|---|---|---|
| `amount`，指向某样材料 | 这样材料的 `qty` 有数值（`qty.value`）。没有数值，但这一行已经写了「用量未录」，或已经有用量的「……问师傅」提示（`prep.ts:587-589`），也不显示，免得重复。只剩原话（如「点」「两斤」）、没有数值、也还没有提示时，才写「用量没说清」 | 能 |
| `amount`，只指向某一步（如调汁的配比） | dish 里没有对应字段 | 不能，靠 K7 |
| `cut-size` | 有 `prep.techniqueRef`，也有 `prep.size`：已经写清。没有 `techniqueRef`：页面已经写「还没写怎么切 · 问师傅」，再写就重复。只有「有 `techniqueRef`、没有 `size`」时才写「切多大没说」 | 能 |
| `net-or-gross` | ADR-0012（#169）定的毛重、净重写法有值 | 暂时不能。#176（HEAD `114ecee`）只列了要补「毛重还是净重」，还没定记在哪个字段。定了以后按那个字段判断，在那之前靠 K7 |
| `prep-ahead` | ADR-0012 定的「要提前多久」有值。`prep.timing`（前一天 / 当天早上 / 出餐前）只说什么时候备，不说腌多久，不算 | 暂时不能，同上（调度已在 #176 提出） |
| `identity` | 这样材料绑了标准食材（有 `canonicalIngredientId`）。D2 的标准食材按部位、品种分开（#178 §2.2 归组规则第 6 条：「部位、品种、整碎不同，采购就不同的，不合并」），绑了就等于定了用哪种 | 能，以 D2 签收为准 |
| `heat`、`duration`、`doneness`、`other`，以及不带位置的条目 | dish 里没有对应字段 | 不能，靠 K7 |
| 份数（不是类别） | `baseServings` 有值 | 能，现有提示本来就这样判断 |

这条规则写成网页里的一个共用判断（网页只引用 core 的类型，见 `prep.ts:116`，所以放在 `packages/web` 里），备料清单、下方做法、菜品页都调用它，三处判断一致。它只决定显示不显示，不改资料，固定版本里的条目照旧保留。页面判断不了的条目，仍由师傅按 K7 手动删掉。

### 4.2 备料页「要准备的」清单（`prep-list.ts`）

1. **清单最上面**（标题 `:135-137` 之后，和现有的「有一道菜的菜谱未找到」用同一个样式 `prep-list-notice`，`:148`、`:150`、`:242`）：
   - 每道带 `prep-ahead` 的菜一行，例如「示例菜：要提前腌，腌多久没说 · 问师傅」。帮厨一打开就知道这道菜可能要前一天或一早动手。
   - 份数合并成一行：「原方没说做几份：示例菜、示例汤 · 标「原方」的量是视频里的量，这次备多少问师傅」。49 道都没有份数，所以不逐道重复写。
2. **每样材料**（`:225-233`，写在切法 `:186-203` 之后、「用于」之前，用 `prep-list-note`）：写指向这样材料的 `cut-size`、`amount`、`net-or-gross`、`identity`，按 4.1 的表决定写不写。
3. **调料一节**只写 `identity`，例如「用哪种没说」。调料本来就只写大概用量（D0 第 108 行），「点、少许」不算问题。
4. **不自动挪时机。** 带 `prep-ahead` 的菜，如果材料没录准备时机，仍放在「时机未录」，不替师傅定成「前一天」。
5. 「已备」勾的键不变（`:167`），加提示行不影响已经打过的勾。

示意（不是真实菜谱）：

```text
要准备的                                 已备 0 / 6
示例菜：要提前腌，腌多久没说 · 问师傅
原方没说做几份：示例菜 · 标「原方」的量是视频里的量，这次备多少问师傅

时机未录
☐ 排骨                          1 斤  原方
  Реберця
  还没写怎么切 · 问师傅
  毛重还是净重没说 · 问师傅            ← 新
  用于 示例菜
调料 · 备在手边
☐ 辣椒面                        点   原方
  用哪种没说 · 问师傅                  ← 新
  用于 示例菜
```

### 4.3 备料页下方的完整做法（`prep.ts`，`layout: 'cooking'`）

- **步骤**（`:604-613`）：在步骤文字下面加一行，只写这一步的 `prep-ahead`、`cut-size` 和 `other`。样式和现有的 `prep-task-note` 一样（`prep.css:208`），但不带「查看／补齐资料」入口（`attention()` 在 `:477-480`），因为菜谱库的菜要在知识库里补，不在 Git 菜谱编辑页。
- **材料卡**（`:564-600`）：和 4.2 第 2 条一样，按 4.1 的表决定写不写。材料卡已经有用量提示时（`:587-589`），不再写「用量没说清」。
- **份数**：现有提示在「配方资料与来源」折叠块里（`:559`），不动。

### 4.4 菜品页（`dishes.ts`）

- **「食材」**（`:159-181`）：每行（`:170-177`）用 `dishes-row-note` 写指向这样材料的全部类别，调料也写，按 4.1 的表决定写不写。
- **「做法」**（`:182-195`）：每步（`:190-192`）下面一行，写这一步的全部类别，包括火候、做多久、做到什么样，按 4.1 的表决定写不写。
- **整道菜的**（没有位置的条目）：在份数那一行下面（`:179`）写一行，例如「这道菜还有没说清的：用量、用哪种 · 问师傅」。
- 菜品页现在不分角色，有没有令牌都显示（[#154](https://github.com/TERRYYYC/canteen-os/pull/154)）。如果以后帮厨和师傅看到的内容要分开，另行定。

### 4.5 不显示的地方

- 菜单页（吃饭的人看）。
- 采购页：这一轮不加。缺用量、缺份数已经显示为「数量待定」。`identity`、`net-or-gross` 要不要写到采购行上，见第 8 节第 4 条。
- 「复制给菜贩」「复制给厨房」的文字。

### 4.6 三语文案草案

单独一类时写成一句：「〔类别〕没说 · 问师傅」。一步里有几类时合成一行：「没说：〔类别〕、〔类别〕 · 问师傅」。乌克兰语是草稿，要请帮厨看一遍（`CONTRIBUTING.md` 第 5 节：不伪造未核实的译文）；「问师傅」「原方」沿用页面现有译法（`prep-list.ts:148`、`:222`）。

| 类别词 | zh | en | uk（草稿） |
|---|---|---|---|
| `prep-ahead` + `marinate` | 腌多久 | how long to marinate | скільки маринувати |
| `prep-ahead` + `soak` | 泡多久 | how long to soak | скільки замочувати |
| `prep-ahead` + `brine` | 卤多久 | how long to simmer in the spiced broth | скільки тушкувати в пряному відварі |
| `prep-ahead` + `rest` | 醒多久 | how long to rest the dough | скільки має відпочити тісто |
| `prep-ahead` + `cool` | 晾多久 | how long to cool | скільки остуджувати |
| `prep-ahead` + `other` | 提前多久 | how far ahead | за скільки часу наперед |
| `cut-size` | 切多大 | cut size | розмір нарізки |
| `amount` | 用量 | how much | скільки класти |
| `net-or-gross` | 毛重还是净重 | weight before or after trimming | вага до чи після чищення |
| `identity` | 用哪种 | which kind | який саме продукт |
| `heat` | 火候 | heat level | який вогонь |
| `duration` | 做多久 | how long to cook | скільки готувати |
| `doneness` | 做到什么样 | when it is done | до якого стану |
| `other` | 还有别的 | something else | ще дещо |

| 句子 | zh | en | uk（草稿） |
|---|---|---|---|
| 单类 | 腌多久没说 · 问师傅 | How long to marinate is not said · ask the chef | Скільки маринувати — не сказано · спитайте шефа |
| 多类 | 没说：腌多久、切多大 · 问师傅 | Not said: how long to marinate, cut size · ask the chef | Не сказано: скільки маринувати, розмір нарізки · спитайте шефа |
| 清单顶部 · 提前 | {菜}：要提前腌，腌多久没说 · 问师傅 | {dish}: marinate ahead; how long is not said · ask the chef | {страва}: треба замаринувати заздалегідь; скільки — не сказано · спитайте шефа |
| 清单顶部 · 提前（别的） | {菜}：有一步要提前做，提前多久没说 · 问师傅 | {dish}: one step is done ahead; how far ahead is not said · ask the chef | {страва}: один крок роблять заздалегідь; наскільки — не сказано · спитайте шефа |
| 清单顶部 · 份数 | 原方没说做几份：{菜、菜} · 标「原方」的量是视频里的量，这次备多少问师傅 | The source does not say how many servings: {dishes} · amounts marked “original” are from the video; ask the chef how much to prepare | В оригіналі не сказано, на скільки порцій: {страви} · кількості з позначкою «за рецептом» — з відео; скільки готувати, спитайте шефа |
| 菜品页 · 整道菜 | 这道菜还有没说清的：用量、用哪种 · 问师傅 | Also not clear in this dish: how much, which kind · ask the chef | У цій страві ще не уточнено: скільки класти, який саме продукт · спитайте шефа |

「提前」那一行的动词随 `action` 换：腌、泡、卤、醒、晾凉（英、乌两种语言同上表）。

## 5. 问题 4：知识库那边要配合的点

导入器、知识库菜谱格式和接口都在私有仓库，本仓库只能看到 Web 侧的类型和导入回执。下面是需要它们配合的事，每条写明怎么核对。

| # | 要配合的事 | 为什么 | 怎么核对 |
|---|---|---|---|
| K1 | **导入时保留位置。** 候选步骤的 `order` 对上知识库步骤 ID，食材 `uncertainty` 对上知识库食材行 ID，整道菜的 `unresolved` 不带位置 | 回执显示三处被平铺成一个数（49 道都是），候选上只有 `unresolved?: string[]`（`inbox.ts:24`）。没有位置，就没法写「这一步腌多久没说」 | 导入一道菜后，读候选，能按步骤列出每条 |
| K2 | **存类别。** 候选给了类别，就原样存；没给（老候选），类别先空着，等 K6 补 | 关键词猜不准（1.2 节：同一批数据得到 20 道或 25 道） | 候选的类别和知识库里存的一致 |
| K3 | **菜谱修订格式加 `unknowns`。** 每条存 `kind`、`action`、`stepId` 或 `ingredientRowId`，以及原话 `text`。原话只在知识库里，只给师傅和管理员看（ADR-0010 第 20、22 行） | 现在的菜谱格式没有地方放它们（`knowledge-types.ts:4-9`） | `/recipes/:id/revisions/:v` 返回 `recipe.unknowns` |
| K4 | **存为菜谱时一起带过去。** 收件箱「存为菜谱」调用 `/favorites/candidates/:id/review`（`inbox.ts:331`），新建的菜谱修订要带上候选里的这些条目 | 现在它们只留在候选上 | 存为菜谱后读第 1 版，条数和候选一致（合并重复后） |
| K5 | **读接口原样返回，没有就不返回。** Worker 从 `/recipes/:id/revisions/:v` 读（`knowledge-materializations.ts:119`）。没有这些条目时，最好连空数组也不返回，Worker 也会把空数组当成没有 | 旧修订再次固定时，生成的文件要和以前一模一样（6.2 C2） | 旧修订的读结果和改动前逐字节相同 |
| K6 | **已导入的 49 道只存新版本，不就地改。** 类别从原始解析文件里带位置的原话分出来，一次性做（AI 分类或关键词加人工抽查），分不清的归 `other`。分类只标「哪里没说」，不补任何数值 | 知识库修订不可改（ADR-0009 第 19 行）。旧修订就地改了，Worker 再固定同一版时会发现内容和以前不同，拒绝写入 | 旧修订号的内容不变，新修订号带上这些条目 |
| K7 | **师傅能删掉一条。** 师傅问清后，在知识库菜谱编辑里写上数值（例如腌 30 分钟），同时删掉那一条，存成新版本。资料里不自动删 | 「写了数值」和「这一条问清了」不一定是一回事，比如写了时间但没写火候。页面能判断的类别会按 4.1 的表自动不显示；火候、做多久、做到什么样，以及只指向某一步的用量，页面判断不了，只能靠师傅删 | 编辑页能删，删除后存成新版本 |

写入权限不变：知识库写入和固定菜谱仍只限师傅和管理员（ADR-0011 第 6 条）。

## 6. 问题 5：ADR 和兼容

### 6.1 并入 ADR-0012

这里的 schema 变化要写进 ADR。Terry 10/19 定了本版只开 ADR-0012 一篇（[#170](https://github.com/TERRYYYC/canteen-os/issues/170#issuecomment-6257683642)；`AGENTS.md:55`「每版最多一篇新 ADR」），所以**本提案的决定并入 ADR-0012（[#176](https://github.com/TERRYYYC/canteen-os/pull/176)），不另开一篇。** 由 D1 的线程在 ADR-0012 里加一节，题目可以叫「固定菜谱带上视频里没说清的类别和位置」，细节引用本文。ADR 文件只由 D1 改，本提案不改。ADR-0012 是先收一个版本再合，还是这次破例，由 Terry 在 #170 定。

- **那一节要写的决定：**
  1. `dish` v3 加可选的 `unknowns[]`，只记类别和位置，原话留在知识库；
  2. 类别是 2.2 的闭集，份数用 `baseServings` 表示，不设类别；
  3. Worker 固定时把知识库行 ID 换成位置，没有条目就不写字段；
  4. 页面显示按第 4 节，说法遵守 ADR-0011 第 5 条；
  5. 候选合同的「没说清」可以带类别（第 7 节第 1 步）；
  6. 旧资料的兼容按 6.2。
- **和旧 ADR 的关系：** 不取代 ADR-0009、0010、0011 的任何条款，只补充。`candidate-contract.md:11` 里「审核后」的说法在 ADR-0011 之后已经不对，随那一节一起改。

### 6.2 兼容

| # | 对象 | 怎么办 |
|---|---|---|
| C1 | 已经固定进 Git 的菜谱 | 不改写，也不补 `unknowns`。要带上提示，就在知识库存新版本，再固定、在排菜时选它（ADR-0011 第 3 条）。本仓库 main 和各分支里都没有 `data/dishes/kb-*` 文件（`git log --all` 查过）；部署写入的仓库里有没有，这里看不到，所以按「有」来设计 |
| C2 | Worker 生成的文件 | 知识库修订里没有这些条目时，生成的菜谱文件和现在逐字节相同，快照哈希不变（`knowledge-materialization.ts:67`、`:105`），旧版本重放仍是「没有变化」（`knowledge-materializations.ts:146-153`）。所以字段只在非空时写 |
| C3 | 知识库旧修订 | 不就地补（K6）。否则重放同一版时内容变了，会被 Worker 拒绝 |
| C4 | 旧字段 `sourceGapCount`、`evidence.unresolved` | schema 保留，只为读旧资料；新固定的版本不写；不换算成 `unknowns`（2.3） |
| C5 | `dish.schema.json`（v2） | 不动。新字段只在 v3 |
| C6 | 网页 | 读发布资料的校验只看列出的字段（`published.ts:141`），旧网页（包括离线缓存）读到新字段时忽略，不会出错。新网页读到没有这个字段的菜，就不加提示 |
| C7 | 候选合同 | `unknowns` 里仍然允许纯文字，新增带类别的写法。如果 [#165](https://github.com/TERRYYYC/canteen-os/pull/165) 先合并，它的校验目前只接受纯文字，要跟着放宽 |
| C8 | 回滚 | 字段是可选的。撤掉页面代码，提示就不显示，资料仍然有效。撤掉 Worker 改动后，新固定的版本不再带这些条目，已经固定的不受影响 |

## 7. 签收后的实施顺序（属于 #170 第 2 波）

1. ADR-0012 加上 6.1 的那一节并合并后，改候选合同：给「没说清」加类别和位置的写法，和 [#159](https://github.com/TERRYYYC/canteen-os/issues/159) 的解析规则补充一起做。
2. schema 和 types（一个 PR，只碰 `schemas/`、`packages/core/src/types.ts` 和两个校验脚本）。
3. 私有知识库：K1–K5、K7。
4. Worker：读出条目，把 ID 换成位置，写进菜谱文件。回归测试加两条：没有条目时文件不变；有条目时位置正确，越界就拒绝。
5. 网页：备料页和菜品页，按第 4 节。三种语言都截图，没有令牌时不出现原话和后台入口。
6. 已导入的 49 道：K6。可以和第 2 波的补料表一起做，补料表上就能列出「这道菜哪里没说」，给师傅逐条填。

和并行工作的关系：

- **D1（#169，ADR-0012 食堂用量）：** 师傅补了用量、份数以后，即使忘了删对应的 `amount` 条目，页面也按 4.1 的表不再显示。ADR-0012 还要定「毛重还是净重」「要提前多久」记在哪个字段，定了以后 4.1 的表才能判断 `net-or-gross` 和 `prep-ahead`。两边都按「存新版本」来做，不冲突。
- **D2（#167，标准食材层）：** 材料绑定到标准食材以后，页面就不再显示 `identity`（4.1 的表），因为 D2 的标准食材按部位、品种分开（#178）。如果 D2 签收时改了这条分法，这里要跟着改。本提案不改 D2 的目录。
- **#165：** 见 C7。

## 8. 要 Terry 定的

1. **全部带上，还是只带四类？** 建议全部带进固定版本，按页面分开显示（第 3 节）。只带提前多久、用量、切法、份数也可以，但以后菜品库要显示火候时，得重新导入、重新固定。
2. **原话放不放进发布资料？** 建议不放，只放类别（2.1、4.1）。原话是 AI 写的单语中文，有的还引了字幕；放进去，就要另外处理翻译和公开范围（ADR-0010）。
3. **备料页的步骤上写哪些类别？** 建议只写提前多久、切多大和别的（约 65 步会多一行）。如果把用量也写在步骤上，约 260 步多一行；把火候、时长也写上，几乎每一步都会多一行。
4. **采购页要不要写「用哪种没说」「毛重还是净重没说」？** 建议这一轮不加，等 D2 标准食材层定了再看，因为绑定标准食材后这两类大多会清楚。
5. **说法：** 「没说」指视频里没说，「没写／未录」指资料里没录。这样分可以吗？还是统一成一种？
6. **ADR（已定）：** 并入 ADR-0012（#176），不另开一篇（[#170](https://github.com/TERRYYYC/canteen-os/issues/170#issuecomment-6257683642)）。由 D1 的线程在 ADR-0012 里加一节，细节引用本文。还没定的只有一件：ADR-0012 是先收一个版本再合，还是这次破例，由 #170 跟踪。
7. **已导入的 49 道由谁分类？** 建议一次性用 AI 分类，分不清的归「别的」，存成知识库新版本。它只标「哪里没说」，不补数值。也可以先用关键词分，再由人抽查。
8. **师傅问清一条后怎么去掉？** 建议分两层：页面上，资料里已经有值就不显示（4.1 的表），不用等师傅删；资料里，由师傅在知识库里手动删，存成新版本，不根据「填了数值」自动删（K7）。
