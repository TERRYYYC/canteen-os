# extract-recipe — 多模态抽取 Prompt 模板 / Extraction Prompt Template

<!-- PROMPT_VERSION: v2.0 -->

> 本文件由 `scripts/parse_video.py` 的 gemini / qwen adapter 在运行时加载：
> - `PROMPT_VERSION` 注释行 → 复核清单（`<slug>.review.md`）头部的 `promptVersion` 溯源字段
> - `SCHEMA:BEGIN/END` 之间的 JSON → Gemini `generationConfig.responseSchema` / Qwen `response_format` 约束
> - 其余正文作为指令文本随视频一起发送（`{LANG_HINT}` 与 `{TECHNIQUE_VOCAB}` 占位符会在运行时被替换：
>   前者为语言提示行，后者为 data/techniques.json 闭集词表全量清单）。
> 修改本文件时递增 PROMPT_VERSION，便于产物溯源。
> v2 变更（ADR-0006）：不再有 dishpack/schema.org Recipe 中间结构，输出直接面向
> schemas/dish.schema.json 的字段（components / steps / clip / techniqueRef / confidence）。

---

## 任务（中文指令）

你是一名菜谱结构化助手。请观看这段做菜视频（或阅读其字幕/转写），把菜谱抽取为严格符合下方 responseSchema 的 JSON。

{LANG_HINT}

硬性要求：

1. **技法闭集**：`components[].prep.techniqueRef` 与 `steps[].techniqueRef` **只能**从下方受控词表选择 `id`（不许自造、不许输出词表外的词）。
   词表外的切法/做法：选语义最近的已有词条，把差异写进 `prep.note`（如词表只有「块」，视频是「骰子块」→ `small-cubes` + note 注明尺寸）。

   技法受控词表（id（类别）：zh / en / uk —— 定义）：

{TECHNIQUE_VOCAB}

2. **单位归一**：所有 `quantity.unit` 必须使用规范 Unit 枚举：`g / kg / ml / l / pcs / pack / tbsp / tsp / pinch`。
   视频中出现的自然语言单位必须换算或归一到该枚举（如「克」→ `g`，「个」→ `pcs`，「毫升」→ `ml`，「一撮」→ `pinch`）。
3. **时间格式**：任何时长字段（`steps[].duration` 等）必须是 ISO 8601 duration（如 `PT8M`、`PT1H15M`），禁止输出 "10 minutes" 这类自然语言。
4. **逐字段置信度**：每条 `components[]`、每个 `steps[]` 以及整体 `overallConfidence` 都要给出 0..1 的置信度（number）。
   拿不准就老实给低分，不要虚高——低于 0.85 的字段会进入 PR 描述的「待人工确认」清单。
5. **时间段对齐**：每个步骤必须给出 `timestampRange {startSec, endSec}`（单位：秒），对应视频中的实际时间段（将生成 `clip` 供人工回放抽检）；
   每个有切配动作的配料在 `prep.frameSec` 给出该配料「被切的几秒」的代表时刻（用于截帧）。
6. **原文转写**：`transcript.text` 保留旁白/字幕**原文**（不要先翻译），`detectedLang` 标注主语言（zh / en / uk / other）。
7. **三语输出**：`steps[].instruction`、`components[].prep.note` 与 `dishName` 必须给出 zh / en / uk 三种语言；原文语言如实填写，另外两种翻译。
8. **份数如实**：`baseServings` 填视频实际的出品份数（家常尺度就填几就填几）；放大到食堂尺度由后处理完成，不要在用量上自行放大。
9. `components[].raw` 保留视频原文的配料描述字符串（如 "番茄 300 克"），`nameHint` 给食材名本身，用于词典匹配。
10. 只输出 JSON，不要输出任何解释文字、markdown 代码围栏或注释。

## Task (English instructions)

You are a recipe-structuring assistant. Watch this cooking video (or read its subtitles/transcript) and extract the recipe as JSON strictly conforming to the responseSchema below.

{LANG_HINT}

Hard requirements:

1. **Closed technique vocabulary**: `components[].prep.techniqueRef` and `steps[].techniqueRef` must be an `id` from the controlled vocabulary below — never invent terms.
   For out-of-vocabulary cuts/methods: pick the semantically closest existing entry and put the difference in `prep.note`.

   Controlled technique vocabulary (id (kind): zh / en / uk — definition):

{TECHNIQUE_VOCAB}

2. **Unit normalization**: every `quantity.unit` must use the canonical Unit enum: `g / kg / ml / l / pcs / pack / tbsp / tsp / pinch`. Convert natural-language units into this enum.
3. **Durations**: any duration field (e.g. `steps[].duration`) must be an ISO 8601 duration (e.g. `PT8M`, `PT1H15M`); natural-language durations like "10 minutes" are forbidden.
4. **Per-field confidence**: give a 0..1 confidence score for each `components[]` item, each `steps[]` item, and `overallConfidence`. Score honestly — fields below 0.85 are listed in the PR description for human confirmation.
5. **Time ranges**: every step must carry `timestampRange {startSec, endSec}` (seconds) pointing at the actual video segment (used to build `clip` for human spot-check replay); every component that gets cut must carry `prep.frameSec`, the representative moment of the cutting (used for frame extraction).
6. **Verbatim transcript**: keep the narration/subtitles in the **original language** in `transcript.text`; report the main language in `detectedLang` (zh / en / uk / other).
7. **Trilingual output**: `steps[].instruction`, `components[].prep.note` and `dishName` must be given in zh, en and uk (original language verbatim, the other two translated).
8. **Honest servings**: `baseServings` is the video's actual yield (home scale is fine); scaling up to canteen scale happens in post-processing — do not inflate quantities yourself.
9. Keep `components[].raw` as the verbatim ingredient string from the video (e.g. "番茄 300 克"); put the bare ingredient name in `nameHint` for dictionary matching.
10. Output JSON only — no explanations, no markdown fences, no comments.

---

## responseSchema

<!-- SCHEMA:BEGIN -->
```json
{
  "type": "object",
  "required": ["detectedLang", "dishName", "components", "steps", "overallConfidence", "transcript"],
  "properties": {
    "detectedLang": { "type": "string", "enum": ["zh", "en", "uk", "other"] },
    "durationSeconds": { "type": "number", "description": "视频总时长（秒）" },
    "dishName": {
      "type": "object",
      "required": ["zh", "en", "uk"],
      "properties": {
        "zh": { "type": "string" },
        "en": { "type": "string" },
        "uk": { "type": "string" }
      },
      "description": "菜名三语；zh 为权威必填"
    },
    "slug": { "type": "string", "description": "建议的菜品 id（kebab-case 英文短名，如 tomato-egg-stir-fry）" },
    "baseServings": { "type": "integer", "description": "视频实际出品份数（如实填写，食堂尺度放大由后处理完成）" },
    "components": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["raw", "nameHint", "quantity", "confidence"],
        "properties": {
          "raw": { "type": "string", "description": "视频原文配料描述，如 \"番茄 300 克\"" },
          "nameHint": { "type": "string", "description": "食材名（原文语言），用于词典匹配" },
          "quantity": {
            "type": "object",
            "required": ["value", "unit"],
            "properties": {
              "value": { "type": "number" },
              "unit": { "type": "string", "enum": ["g", "kg", "ml", "l", "pcs", "pack", "tbsp", "tsp", "pinch"] }
            }
          },
          "prep": {
            "type": "object",
            "required": ["techniqueRef", "frameSec"],
            "properties": {
              "techniqueRef": { "type": "string", "description": "刀工/预处理技法，必须是 prompt 所附闭集词表中的 id" },
              "size": { "type": "string", "description": "尺寸/规格补充，如 3mm、2cm 见方" },
              "note": {
                "type": "object",
                "properties": {
                  "zh": { "type": "string" },
                  "en": { "type": "string" },
                  "uk": { "type": "string" }
                },
                "description": "三语备注（词表外差异、操作要点等）"
              },
              "frameSec": { "type": "number", "description": "该配料「被切的几秒」代表时刻（秒），用于截帧" }
            },
            "description": "有切配/预处理动作的配料必填"
          },
          "confidence": { "type": "number", "description": "0..1，低于 0.85 进入 PR 待确认清单" }
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
          "techniqueRef": { "type": "string", "description": "本步涉及的加热/处理技法，必须是 prompt 所附闭集词表中的 id" },
          "duration": { "type": "string", "description": "本步实际耗时，ISO 8601 duration，如 PT2M" },
          "timestampRange": {
            "type": "object",
            "required": ["startSec", "endSec"],
            "properties": {
              "startSec": { "type": "number" },
              "endSec": { "type": "number" }
            },
            "description": "步骤对应的视频时间段（秒），将生成 clip 供回放核对"
          },
          "confidence": { "type": "number" }
        }
      }
    },
    "overallConfidence": { "type": "number", "description": "整体置信度 0..1；components 均值低于 0.85 的 PR 禁止自动合并" },
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
