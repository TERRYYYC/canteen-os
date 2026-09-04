# extract-recipe — 多模态抽取 Prompt 模板 / Extraction Prompt Template

<!-- PROMPT_VERSION: v1.0 -->

> 本文件由 `scripts/parse_video.py` 的 gemini / qwen adapter 在运行时加载：
> - `PROMPT_VERSION` 注释行 → dishpack `generator.promptVersion`
> - `SCHEMA:BEGIN/END` 之间的 JSON → Gemini `generationConfig.responseSchema` / Qwen `response_format` 约束
> - 其余正文作为指令文本随视频一起发送（`{LANG_HINT}` 占位符会被替换为语言提示行）。
> 修改本文件时递增 PROMPT_VERSION，便于产物溯源。

---

## 任务（中文指令）

你是一名菜谱结构化助手。请观看这段做菜视频（或阅读其字幕/转写），把菜谱抽取为严格符合下方 responseSchema 的 JSON。

{LANG_HINT}

硬性要求：

1. **单位归一**：所有 `quantity.unit` 必须使用规范 Unit 枚举：`g / kg / ml / l / pcs / pack / tbsp / tsp / pinch`。
   视频中出现的自然语言单位必须换算或归一到该枚举（如「克」→ `g`，「个」→ `pcs`，「毫升」→ `ml`，「一撮」→ `pinch`）。
2. **时间格式**：`prepTime` / `cookTime` 必须是 ISO 8601 duration（如 `PT8M`、`PT1H15M`），禁止输出 "10 minutes" 这类自然语言。
3. **逐字段置信度**：每条 `ingredients[]`、每个 `steps[]` 以及整体 `overallConfidence` 都要给出 0..1 的置信度（number）。
   拿不准就老实给低分，不要虚高——低于 0.85 的字段会进入人工确认队列。
4. **时间戳保留**：每个步骤必须给出 `timestampRange {startSec, endSec}`（单位：秒），对应视频中的实际时间段，用于人工抽检回放。
5. **原文转写**：`transcript.text` 保留旁白/字幕**原文**（不要先翻译），`detectedLang` 标注主语言（zh / en / uk / other）。
6. **三语输出**：`steps[].instruction` 与 `suggestedDish.name` 必须给出 zh / en / uk 三种语言；原文语言如实填写，另外两种翻译。
7. `recipe.recipeIngredient` 保留**纯字符串**形式（如 "番茄 300 克"），与 `ingredients[].raw` 逐字一致、一一对应、顺序相同。
8. 只输出 JSON，不要输出任何解释文字、markdown 代码围栏或注释。

## Task (English instructions)

You are a recipe-structuring assistant. Watch this cooking video (or read its subtitles/transcript) and extract the recipe as JSON strictly conforming to the responseSchema below.

{LANG_HINT}

Hard requirements:

1. **Unit normalization**: every `quantity.unit` must use the canonical Unit enum: `g / kg / ml / l / pcs / pack / tbsp / tsp / pinch`. Convert natural-language units into this enum.
2. **Durations**: `prepTime` / `cookTime` must be ISO 8601 durations (e.g. `PT8M`, `PT1H15M`); natural-language durations like "10 minutes" are forbidden.
3. **Per-field confidence**: give a 0..1 confidence score for each `ingredients[]` item, each `steps[]` item, and `overallConfidence`. Score honestly — fields below 0.85 are routed to a human review queue.
4. **Timestamps**: every step must carry `timestampRange {startSec, endSec}` (seconds) pointing at the actual video segment, for human spot-check replay.
5. **Verbatim transcript**: keep the narration/subtitles in the **original language** in `transcript.text`; report the main language in `detectedLang` (zh / en / uk / other).
6. **Trilingual output**: `steps[].instruction` and `suggestedDish.name` must be given in zh, en and uk (original language verbatim, the other two translated).
7. `recipe.recipeIngredient` stays an array of **plain strings** (e.g. "番茄 300 克"), verbatim identical to `ingredients[].raw`, one-to-one, in the same order.
8. Output JSON only — no explanations, no markdown fences, no comments.

---

## responseSchema

<!-- SCHEMA:BEGIN -->
```json
{
  "type": "object",
  "required": ["detectedLang", "recipe", "ingredients", "steps", "suggestedDish", "overallConfidence", "transcript"],
  "properties": {
    "detectedLang": { "type": "string", "enum": ["zh", "en", "uk", "other"] },
    "durationSeconds": { "type": "number" },
    "recipe": {
      "type": "object",
      "required": ["name", "recipeIngredient", "recipeInstructions"],
      "properties": {
        "name": { "type": "string" },
        "description": { "type": "string" },
        "recipeYield": { "type": "string" },
        "recipeIngredient": {
          "type": "array",
          "items": { "type": "string" },
          "description": "纯字符串数组，如 \"番茄 300 克\"，与 ingredients[].raw 逐字一致"
        },
        "recipeInstructions": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["text"],
            "properties": {
              "position": { "type": "integer" },
              "text": { "type": "string" }
            }
          }
        },
        "prepTime": { "type": "string", "description": "ISO 8601 duration, e.g. PT8M" },
        "cookTime": { "type": "string", "description": "ISO 8601 duration, e.g. PT6M" },
        "recipeCuisine": { "type": "string" },
        "keywords": { "type": "string" },
        "tool": { "type": "array", "items": { "type": "string" } }
      }
    },
    "ingredients": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["raw", "quantity", "confidence"],
        "properties": {
          "raw": { "type": "string", "description": "与 recipeIngredient 中对应字符串逐字一致" },
          "nameHint": { "type": "string", "description": "食材名（原文语言），用于词典匹配" },
          "quantity": {
            "type": "object",
            "required": ["value", "unit"],
            "properties": {
              "value": { "type": "number" },
              "unit": { "type": "string", "enum": ["g", "kg", "ml", "l", "pcs", "pack", "tbsp", "tsp", "pinch"] }
            }
          },
          "confidence": { "type": "number", "description": "0..1，低于 0.85 进入人工确认队列" }
        }
      }
    },
    "steps": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["order", "instruction", "timestampRange", "confidence"],
        "properties": {
          "order": { "type": "integer" },
          "instruction": {
            "type": "object",
            "required": ["zh", "en", "uk"],
            "properties": {
              "zh": { "type": "string" },
              "en": { "type": "string" },
              "uk": { "type": "string" }
            }
          },
          "durationMinutes": { "type": "number" },
          "tools": { "type": "array", "items": { "type": "string" } },
          "timestampRange": {
            "type": "object",
            "required": ["startSec", "endSec"],
            "properties": {
              "startSec": { "type": "number" },
              "endSec": { "type": "number" }
            }
          },
          "confidence": { "type": "number" }
        }
      }
    },
    "suggestedDish": {
      "type": "object",
      "required": ["name", "category", "baseServings"],
      "properties": {
        "name": {
          "type": "object",
          "required": ["zh", "en", "uk"],
          "properties": {
            "zh": { "type": "string" },
            "en": { "type": "string" },
            "uk": { "type": "string" }
          }
        },
        "category": {
          "type": "string",
          "enum": ["staple", "meat-dish", "vegetable-dish", "soup", "cold-dish", "snack", "dessert", "drink"]
        },
        "baseServings": { "type": "integer" }
      }
    },
    "overallConfidence": { "type": "number", "description": "整体置信度 0..1，低于 0.85 禁止自动入库" },
    "transcript": {
      "type": "object",
      "required": ["lang", "text"],
      "properties": {
        "lang": { "type": "string", "enum": ["zh", "en", "uk", "other"] },
        "text": { "type": "string", "description": "原文转写，不翻译" },
        "segments": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["startSec", "endSec", "text"],
            "properties": {
              "startSec": { "type": "number" },
              "endSec": { "type": "number" },
              "text": { "type": "string" }
            }
          }
        }
      }
    }
  }
}
```
<!-- SCHEMA:END -->
