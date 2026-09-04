---
name: video-recipe-ingest
description: 把做菜视频（中/英/乌克兰语旁白或字幕）解析为结构化菜谱，打包成 CanteenOS dishpack 标准包，供本地知识库导入。解析可跑在云端/第三方，本地只导入标准包。
---

# video-recipe-ingest — 视频解析 Skill 契约

> 本文件是**实现方契约**：任何解析引擎（云端 Gemini、Qwen-VL、自托管管线、AI agent 手工整理）只要遵守本契约，产物即可被 CanteenOS 知识库导入。
> 背景与选型论证见 [docs/video-import.md](../../docs/video-import.md) 与 [docs/research/video-to-recipe-tech-survey.md](../../docs/research/video-to-recipe-tech-survey.md)。
> 输出格式以 [schemas/dishpack.schema.json](../../schemas/dishpack.schema.json) 为准（机器校验的单一事实源）；完整样例见 [examples/dishpack-tomato-egg.example.json](../../examples/dishpack-tomato-egg.example.json)。

---

## 1. 输入

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `videoUrl` 或视频文件 | uri / binary | ✅ 二选一 | 支持 youtube / bilibili / douyin / tiktok / instagram / local-file |
| `languageHint` | `zh` / `en` / `uk` | 否 | 旁白语言提示，提高解析质量 |
| `targetLanguages` | 数组 | 否，默认 `[zh, en, uk]` | 输出内容语言 |

## 2. 输出：dishpack 标准包

单一 JSON 文件（或含 media/ 子目录的目录包），顶层字段：

| 字段 | 说明 |
|---|---|
| `packVersion` | 常量 `"1"`；格式演进时递增，与实体 schemaVersion 解耦 |
| `id` | kebab-case 包 ID，如 `dishpack-tomato-egg-001` |
| `createdAt` | ISO date-time |
| `generator` | `{name, engine, engineVersion?, promptVersion?}`；engine ∈ `gemini-flash / gemini-pro / qwen-vl / self-hosted-pipeline / manual` |
| `source` | `{videoUrl, platform?, detectedLang, durationSeconds?}` |
| `manifest` | 见 §3 |
| `transcript` | 原文转写 `{lang, text, segments?}`（强烈建议保留，用于人工校对与溯源） |
| `media` | 关键帧/封面引用数组（包内相对路径或外部 URL） |
| `reviewQueue` | `{status: pending/approved/rejected, reasons?}`；产出时通常为 `pending` |

## 3. manifest 结构

```text
manifest
├── recipe                 # schema.org/Recipe JSON-LD 原始输出（交换格式）
│   ├── recipeIngredient[]     # ⚠️ 纯字符串数组，如 "番茄 300 克"
│   └── recipeInstructions[]   # HowToStep[]
├── ingredientMappings[]   # 字符串 → 知识库 Ingredient 的映射（核心义务）
│   └── {raw, ingredientRef?, quantity?, confidence, needsReview}
├── stepMapping[]          # i18n 步骤 + 视频时间段 timestampRange
├── suggestedDish          # {name: I18nString, category, baseServings}
└── overallConfidence      # 整体置信度
```

**核心义务：字符串 → Ingredient 映射。** schema.org 的 `recipeIngredient` 是纯字符串（数量/单位/名称不分字段），而 CanteenOS 的 Dish.components 必须 `ingredientRef` 引用知识库食材（采购引擎 BOM 展开的前提）。因此解析方必须：

1. 把每条 `raw` 字符串拆为 `(ingredientRef, quantity{value, unit})`；
2. 映射到知识库**已有** Ingredient（词典/模糊匹配）；匹配不到 → `ingredientRef` 留空 + `needsReview: true`；
3. 每条标注 `confidence {value: 0..1, source: "video-import"}`；
4. 用量单位混乱是主要错误源——过一层术语/单位词典（cup↔ml、тісто↔面团）归一。

## 4. 质量门槛（硬性）

| 规则 | 阈值 |
|---|---|
| 单字段置信度 | `confidence.value < 0.85` → `needsReview: true`，理由写入 `reviewQueue.reasons`（如 `low-confidence-ingredient: 小葱 10 克 (0.72)`） |
| 整体置信度 | `overallConfidence.value < 0.85` → `reviewQueue.status = "pending"`，禁止自动入库 |
| JSON 合法性 | 产出必须通过 `schemas/dishpack.schema.json` 校验（ajv）；不通过自动重试 ≤ 2 次，仍失败则整包标记 `rejected` 并说明 |
| 时间字段 | ISO 8601 duration（`PT10M`），禁止 `"10 minutes"` 这类自然语言 |
| 溯源完整性 | `source.videoUrl`、`transcript`（原文转写）、`stepMapping[].timestampRange` 必须可回溯到视频 |

## 5. 推荐管线

1. **首选**：Gemini 2.5 Flash 单调用——视频（或 URL）+ prompt + `responseSchema`（schema.org/Recipe 子集 + 扩展字段）→ JSON-LD。约 $0.02–0.05/条（3 分钟视频），免费档可 POC。
2. **备选 A**：阿里云百炼 Qwen3-VL Plus/Flash——国内合规/中文优势，接口形态与 Gemini 同构。
3. **备选 B**：自托管 `ffmpeg → WhisperX → 抽帧 → Qwen2.5/3-VL 融合`——大批量（> 数万条/月）或离线场景，工程投入 3–6 人周。
4. 字幕轨优先于 ASR；保留原文转写再翻译；疑难样本可升级 Gemini Pro 二次精修。

参考实现：[pick-a-recipe](https://github.com/pickeld/pick-a-recipe)（MIT，管线最完整）、[TsaiHao/recipe-from-video](https://github.com/TsaiHao/recipe-from-video)（中文场景，与本需求几乎同构）。

## 6. 验收清单（导入方抽检用）

- [ ] 通过 dishpack schema 校验
- [ ] `recipe.recipeIngredient` 与 `ingredientMappings` 一一对应（raw 逐字相等）
- [ ] 所有 `quantity.unit` 属于规范 Unit 枚举
- [ ] `suggestedDish.name` 三语齐全（至少 zh + 请求语言）
- [ ] `needsReview` 与置信度阈值一致（< 0.85 必为 true）
- [ ] 随机抽 1 条 `stepMapping`，按 `timestampRange` 回放视频可核对步骤内容
