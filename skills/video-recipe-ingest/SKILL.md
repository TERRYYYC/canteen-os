---
name: video-recipe-ingest
description: 把做菜视频（中/英/乌克兰语旁白或字幕）解析为 CanteenOS 菜品草稿——直接输出 data/dishes/<菜>.json（status=draft）+ images/ 截帧目录，以 git PR 提交，师傅审 PR 即人工确认。解析可跑在云端/第三方（Gemini 主、Qwen 备）。
---

# video-recipe-ingest — 视频解析 Skill 契约

> 本文件是**实现方契约**：任何解析引擎（Gemini、Qwen-VL、自托管管线、AI agent 手工整理）只要遵守本契约，产物即可作为 CanteenOS 菜品草稿提 PR 入库。
> 背景与选型论证见 [docs/video-import.md](../../docs/video-import.md) 与 [docs/research/v2/scenario-c-video-to-dishpack-keyframes.md](../../docs/research/v2/scenario-c-video-to-dishpack-keyframes.md)。
> 输出格式以 [schemas/dish.schema.json](../../schemas/dish.schema.json) 为准（机器校验的单一事实源）；完整样例见 [data/dishes/tomato-egg-stir-fry.json](../../data/dishes/tomato-egg-stir-fry.json)。
> ⚠️ **v2 变更（ADR-0006，2026-09-06）**：不再有 dishpack 中间包，skill **直出菜品文件 + 图片**；git PR 即人工确认队列。

---

## 1. 输入

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `videoUrl` 或视频文件 | uri / binary | ✅ 二选一 | youtube / bilibili / douyin / tiktok / instagram / local-file（下载统一走 yt-dlp，ADR-0006 裁决其 Unlicense 可用；策略：锁版本+高频升级+失败回放） |
| `languageHint` | `zh` / `en` / `uk` | 否 | 旁白语言提示，提高解析质量（uk ASR 是最弱环，FLEURS WER ≈ 9.5%，数字字段需重点校验） |
| `targetLanguages` | 数组 | 否，默认 `[zh, en, uk]` | 输出内容语言（zh 权威，en/uk 机翻初稿） |

## 2. 输出：dish.json + images/（直出，无中间包）

一个菜品 = 一个 PR，包含：

```
data/dishes/<dish-id>.json     # 符合 schemas/dish.schema.json；status 必须为 "draft"
images/<dish-id>/              # 截帧目录
├── cover.jpg                  # 成品图（→ dish.image）
├── prep-<ingredientRef>.jpg   # 每个配料"被切的那几秒"的代表帧（→ component.prep.image）
└── step-<n>.jpg               # 步骤关键帧（→ steps[].image，可选）
```

dish.json 字段义务（相对 schema 的补充约束）：

| 字段 | 义务 |
|---|---|
| `name` | I18nString，**zh 必填**（权威），en/uk 机翻初稿 |
| `baseServings` | **食堂尺度**（默认按 50 份产出；视频是家常尺度时按师傅经验放大并标注 confidence） |
| `components[]` | `{ingredientRef, qty{value,unit}, prep?, confidence?}`——必须映射到 `data/ingredients/` **已有**食材（词典/模糊匹配）；匹配不到就在 PR 描述列出，由师傅决定新建食材还是改映射 |
| `components[].prep` | `{techniqueRef, size?, note?, image?}`——**image 必填**（有切配动作的配料）：该配料"被切的几秒"截帧，即备料单上帮厨要看的图 |
| `components[].confidence` | 机器来源逐条标注 `{value: 0..1, source: "video"}`；**< 0.85 的字段必须在 PR 描述中逐条列出** |
| `steps[]` | `{text{zh,en,uk}, techniqueRef?, image?, clip?{videoUrl,start,end}}`——**clip 必填**：每步对齐到视频时间段（WhisperX 词级时间戳 ∪ VLM temporal grounding，±2s 交叉校验） |
| `provenance` | `{source: "video", videoUrl}` 必填 |
| `status` | 必须 `"draft"`——skill 永远只产草稿 |

## 3. 技法闭集约束（硬性）

`prep.techniqueRef` 与 `steps[].techniqueRef` **只能是 [data/techniques.json](../../data/techniques.json) 中已存在的 id**（`cut | heat | pretreat` 三类受控词表）。模型 prompt 中附完整词表（id + 三语名 + 定义）作为选择闭集；词表外的切法/做法：

- 选语义最近的已有词条，把差异写进 `prep.note`（如词表只有"块"，视频是"骰子块"→ `small-cubes` + note 注明尺寸）；或
- 在 PR 描述中提议新增词条（师傅确认后先扩词表再引用）。

## 4. 质量门槛（硬性）

| 规则 | 阈值 |
|---|---|
| 单字段置信度 | `confidence.value < 0.85` → 该字段列入 PR 描述的"待人工确认"清单 |
| 整体置信度 | 全部 component 置信度均值 < 0.85 → PR 标题标 `[需重点审核]`；禁止自动合并 |
| JSON 合法性 | 产出必须通过 `schemas/dish.schema.json` 校验 + `scripts/local-validate.py`（含跨文件引用检查）；不通过自动重试 ≤ 2 次，仍失败则放弃并在日志说明 |
| 溯源完整性 | `provenance.videoUrl`、`steps[].clip` 必须可回溯到视频；截帧时间落在对应 clip 区间内 |
| 图片许可 | 视频截帧为自有演绎，`license: "own"`；若引用第三方图片必须带 `{license, author?, sourceUrl}`（ADR-0006 CC BY-SA 裁决） |

## 5. 推荐管线（场景 C）

```
视频 URL → yt-dlp 下载 → WhisperX large-v3 转写(zh/en/uk)+词级对齐
        → Gemini（主，responseSchema 约束 JSON 输出）/ Qwen3-VL（备，7B+，temporal grounding）
          归组出 配料+用量+备菜规格+步骤（步骤带时间窗）
        → 关键帧双路定位（VLM 时间窗 ∪ ASR"切/切丁…"词级时刻，±2s 交叉校验）
        → PySceneDetect 窗内切镜头 + Laplacian 清晰度 + pHash 去重挑帧
        → data/dishes/<菜>.json(draft) + images/<菜>/ → git PR → 师傅审核合并
```

引擎路由：Gemini 主（`response_schema` 服务端强制 JSON 结构，免自托管 GPU，约 $0.02–0.05/条）；Qwen 备（国内合规/中文优势/可自托管）。字幕轨优先于 ASR；疑难样本可升级 Gemini Pro 二次精修。

## 6. 审核流程 = draft + PR（无独立队列）

1. skill 产出 draft 菜品 + images/，开 PR；PR 描述模板列出：全部低置信字段（confidence < 0.85）、未匹配食材、词表外技法建议。
2. 师傅在 PR 里直接改 JSON（单人编辑，阶段 1 无编辑 UI）；CI 跑 schema + 引用校验。
3. 合并即入库；师傅把 `status` 改为 `active` 后参与菜单与采购推导。

## 7. 验收清单（审 PR 用）

- [ ] 通过 dish schema 校验与 `local-validate.py` 跨文件引用检查
- [ ] 所有 `ingredientRef` 指向 `data/ingredients/` 已有食材（或 PR 中说明新建）
- [ ] 所有 `techniqueRef` 在 techniques.json 闭集内
- [ ] 每个有切配动作的配料带 `prep.image`（截帧可辨认"切成了什么样"）
- [ ] 每个 step 带 `clip`，抽 1 条按时间段回放视频可核对步骤内容
- [ ] `confidence < 0.85` 的字段已全部列入 PR 描述并逐条人工确认
- [ ] `name` 三语齐全（至少 zh + 请求语言）；uk 数字字段重点抽查
- [ ] `status = "draft"`，`provenance.videoUrl` 可打开
