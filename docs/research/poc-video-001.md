# POC-video-001：真实做菜视频 → dish.json 端到端验证（无 API key 版）

> ⚠️ **范围声明**：本次验证的是**契约能装下真实视频**（下载/截帧/校验为真，解析为 agent 人工整理）；**自动化管线（Gemini/Qwen adapter 端到端）尚未验证**，待 API key。

- **日期**：2026-09-06
- **解析引擎**：AI agent 人工整理（SKILL.md §0 允许的引擎类型之一；替代 Gemini/Qwen，因无 GEMINI_API_KEY）
- **目的**：验证 v2 新契约（直出 dish JSON status=draft + images/ 截帧 + 技法闭集 + clip 时间段 + confidence）在**真实视频**面前的可用性，产出契约缺口清单
- **契约依据**：[skills/video-recipe-ingest/SKILL.md](../../skills/video-recipe-ingest/SKILL.md)、[schemas/dish.schema.json](../../schemas/dish.schema.json)
- **产物**：`docs/research/poc-video-001/`（dish JSON + 5 张真实截帧）；工作副本 `/tmp/poc/`

---

## 1. 视频来源

| 项 | 值 |
|---|---|
| 标题 | 厨师长教你一道："番茄炒鸡蛋"非常很详细的讲解 |
| UP 主 | 美食作家王刚R |
| 平台 | Bilibili |
| BV 号 | BV13p411d7oQ |
| URL | https://www.bilibili.com/video/BV13p411d7oQ/ |
| 时长 | 154.2 s（2:34，符合 1–3 min 选片要求） |
| 播放量 | ≈ 241.8 万（2018-05-28 发布，搜索结果口径） |
| 下载 | yt-dlp 2026.08.19（`.poc-venv` 隔离环境），格式 30015+30216（avc1 640×360 + m4a），合并后 8.5 MB |
| 字幕 | **无软字幕轨**（B 站 CC 字幕需登录 cookies，仅 danmaku 可用）；信息全部来自**烧入画面的硬字幕** + 画面 |

### 下载卡点（对环境准备的反馈）

1. **B 站 412 Precondition Failed（间歇性）**：无 UA 时约半数请求被反爬拒绝；`--user-agent` 浏览器 UA + `Referer: https://www.bilibili.com` 后基本消除，偶发需重试。
2. **格式选择器失效**：`-f "worst[ext=mp4]/worst"` 在本视频匹配不到任何格式（B 站全线 video-only + audio-only 分离流），报 `Requested format is not available`。需先 `--list-formats` 再显式 `-f "30015+30216"` 合并。**建议 parse_video.py 的下载封装默认 fallback 为 `bv*+ba/b` 而非 `worst`。**
3. `bilisearch:` 搜索接口同样 412（需登录态），选片靠 WebSearch 找 BV 号再直链验证。

## 2. 抽取结果（含证据与置信度）

视频本体为餐厅灶台实拍，家常份量未明说几人份，按出品量（2 番茄 + 3 蛋）**估为 2 人份，×25 放大到 baseServings=50**（缩放系数本身是引擎假设，见缺口 G5）。

### 2.1 配料（入库 5 条，全部命中 data/ingredients/ 现有 id）

| ingredientRef | 视频证据（硬字幕原话 / 画面） | 原始量 | ×25 | confidence |
|---|---|---|---|---|
| tomato | 00:05 "准备熟透的西红柿2个（约300克）"；00:07 "切成大小均匀的滚刀块备用"；00:11 "可以稍微切大一些" | 300 g | 7500 g | 0.97 |
| egg | 00:14 "在碗中打入鸡蛋3个"（画面可见 3 颗蛋黄） | 3 pcs | 75 pcs | 0.98 |
| salt | 00:20 "加入少许的食用盐"（蛋液）＋ 01:29 "加入食用盐1克"（调味） | ≈1.5 g（1 g 明示 + 少许≈0.5 g 估计） | 37.5 g | 0.60 |
| cooking-oil | 00:31 "适量的油滑锅"＋00:39 "少许的底油（植物油）"＋01:08 "少许的底油"＋01:47 "少许的明油"，均无量 | ≈35 ml（纯视觉估计） | 875 ml | 0.50 |
| scallion | **旁白与字幕全程未提**；仅 02:04 成品特写可见葱花 | ≈5 g（视觉估计） | 125 g | 0.40 |

### 2.2 视频中明确出现但**未能入库**的配料（ingredients/ 无对应 id，按契约转复核清单）

| 食材 | 视频证据 | 量 | 处置 |
|---|---|---|---|
| 白醋 | 00:21 "加入白醋1克"（去腥增鲜） | 1 g → 25 g | 复核清单：提议新建 `white-vinegar` |
| 番茄酱 | 01:17 "加入番茄酱5克增加番茄的本味" | 5 g → 125 g | 复核清单：提议新建 `ketchup`（或 tomato-paste） |
| 白糖 | 01:32 "加入白糖1克平衡酸味" | 1 g → 25 g | 复核清单：提议新建 `sugar` |
| 水淀粉 | 01:38 "加入适量的水淀粉把汤汁勾成薄芡" | 适量 | 复核清单：提议新建 `starch`（勾芡用） |
| 清水 | 01:22 "加入适量的清水" | 适量 | 按惯例不入 BOM，仅记录于步骤文本 |

### 2.3 步骤与 clip（8 步，时间轴按硬字幕边界，±1–2 s）

| # | clip(s) | 内容 | techniqueRef |
|---|---|---|---|
| 1 | 5–14 | 西红柿去蒂切滚刀块 | `roll-cut-chunks` ✓ |
| 2 | 14–29 | 打蛋 3 个 + 盐少许 + 白醋 1 g，顺一个方向搅散 | **无匹配**（"打散/搅打"不在闭集） |
| 3 | 29–41 | 锅烧热，油滑锅后倒出，再加底油 | **无匹配**（"滑锅/炙锅"不在闭集） |
| 4 | 41–67 | 油温四成热下蛋液，小火煎 1 分钟定型，翻面炒香倒出 | `pan-fry` ✓ |
| 5 | 68–86 | 底油炒番茄，加番茄酱 5 g、清水，小火烧 1 分钟 | `stir-fry` ✓ |
| 6 | 86–98 | 调味：盐 1 g、白糖 1 g | —（调味步无技法） |
| 7 | 98–112 | 水淀粉勾薄芡，加明油 | `starch-thicken` ✓ |
| 8 | 112–128 | 鸡蛋回锅翻炒，出锅装盘撒葱花 | `stir-fry` ✓ |

### 2.4 截帧（真实产物，ffmpeg -ss 精确截帧，jpg q≈85，640×360 ≤1280 宽）

| 文件 | 时刻 | 内容 | 校验 |
|---|---|---|---|
| `prep-tomato.jpg` | 10.0 s | 砧板上滚刀切番茄（字幕"切成大小均匀的滚刀块"） | ∈ step1 clip [5,14] ✓ |
| `step-4.jpg` | 50.0 s | 蛋液下锅小火煎制定型 | ∈ step4 clip [41,67] ✓ |
| `step-5.jpg` | 75.0 s | 番茄块入锅翻炒 | ∈ step5 clip [68,86] ✓ |
| `step-8.jpg` | 121.0 s | 出锅装盘 | ∈ step8 clip [112,128] ✓ |
| `cover.jpg` | 126.0 s | 成品特写（可见葱花） | ∈ step8 clip ✓ |

注：scallion 有切配动作（minced）但**视频未拍切葱过程**，无法提供 prep.image —— 如实留空，由校验器列入复核清单（见缺口 G3）。

## 3. 验收输出（validate_dish.py 原文）

```
PASS  /tmp/poc/dishes/tomato-egg-stir-fry.json  ✓ schema（复用 scripts/local-validate.py） + 契约检查（0 条警告，5 条待人工确认）
  待人工确认清单（可贴入 PR 描述）:
  - [ ] low-confidence: components[2](salt) confidence=0.6 < 0.85（§4，PR 描述逐条人工确认）
  - [ ] low-confidence: components[3](cooking-oil) confidence=0.5 < 0.85（§4，PR 描述逐条人工确认）
  - [ ] missing-prep-image: components[4](scallion) 有切配动作（minced）但缺 prep.image 截帧（§2 备料单看图）
  - [ ] low-confidence: components[4](scallion) confidence=0.4 < 0.85（§4，PR 描述逐条人工确认）
  - [ ] [需重点审核] components 置信度均值 0.69 < 0.85，PR 标题须标注且禁止自动合并（§4）
exit=0
```

一次通过，无需重试。复核清单 5 条与抽取时的如实标注完全一致——阈值机制在真实数据上按预期触发。

## 4. 契约在真实视频面前的缺口清单（本次 POC 核心产出）

> 按对契约可用性的影响排序。**G1–G3 为必须解决的硬缺口**，G4–G7 为改进项。

- **G1 ｜ 调料类食材库缺位，契约"匹配不到即转复核"会系统性丢失调味维度。**
  一条 2.5 分钟的标准教学视频就出现 4 个未匹配食材（白醋/番茄酱/白糖/水淀粉），且其中 3 个带**明确克数**——这是视频里置信度最高的数据，却只能进复核清单、进不了 BOM。fixture 的 5 条食材（tomato/egg/salt/scallion/cooking-oil）全是主料，没有任何"调料"类目样例。**建议**：ingredients/ 补一批基础调料（sugar、white-vinegar、ketchup/tomato-paste、starch、soy-sauce、cooking-wine）；同时 SKILL.md §2 应明确"复核清单里的未匹配食材在 PR 合并前如何快速建 id"的闭环时限，否则每道菜都卡在同一个缺口上。

- **G2 ｜ "少许/适量"没有结构化表达路径，Quantity 强制 {value>0, unit} 逼引擎编造数字。**
  盐和油是真实视频里最高频的配料形态："少许""适量""明油少许"。契约要求 qty 必填且 value>0，引擎只能拍脑袋给数再压 confidence（本次 salt 0.6、oil 0.5 即由此产生）。Unit 枚举虽有 pinch，但"少许底油"既不是 pinch 也不是 ml 的诚实值。**建议**：qty 允许缺省（schema 已允许 component 无 qty？——否，components required [ingredientRef, qty]，需放宽），或 Unit 增加 `to-taste`/`as-needed`；SKILL.md 补一条"估计值必须写推导依据到 PR 描述"。

- **G3 ｜ "有切配必有 prep.image"在真实视频里不总成立，缺视觉-only 食材的降级路径。**
  葱花：旁白字幕零提及，成品帧铁证存在；切葱镜头根本没拍。于是同时踩中两条规则——confidence 0.4（视觉估计）+ missing-prep-image。ASR 优先的推荐管线（§5）会**整条漏掉这个配料**；VLM 不看成品帧也发现不了。**建议**：契约增加"视觉-only 配料"显式标注（如 confidence.source 已有 "video" 可覆盖，但 prep.image 必填应改为"视频展示了切配动作的配料必填"）；parse_video.py 管线必须包含"成品帧回扫"环节（对成品特写做配料核对），不能只走 ASR→步骤链路。

- **G4 ｜ 技法闭集缺 4 个高频词，步骤 techniqueRef 被迫留空。**
  本视频即缺：`打散/搅打`（蛋液制备，cut/pretreat 都不是）、`滑锅/炙锅`（wok seasoning，餐厅流标配动作）、`明油`（出锅前淋明油增亮，只能写进步骤文本）、`油温×成热`（火候参数无处结构化）。8 步里有 2 步挂不上 techniqueRef。**建议**：techniques.json 增补 `beat`（搅打，pretreat）、`wok-season`（滑锅，pretreat）、`finish-oil`（明油，pretreat）；火候（油温成数/大小火）考虑作为 step 的可选结构化字段而非技法。

- **G5 ｜ baseServings 缩放决策无落点。**
  视频未说几人份，×25 是引擎假设；契约要求"按师傅经验放大并标注 confidence"，但 confidence 挂在 component 上，**缩放倍数与"视频原始份量"这个事实本身没有字段记录**——师傅审 PR 时看不到"原始是 300 g/2 人份"。**建议**：provenance 增加可选 `originalServings` + `scaleFactor`，或 PR 模板强制写缩放推导（本次：2 人份 ×25 → 50 份；tomato 300→7500 g 恰好与 fixture 一致，交叉印证了该尺度的合理性）。

- **G6 ｜ B 站字幕轨策略落空，"字幕轨优先于 ASR"在 B 站不成立。**
  B 站 CC 字幕需登录 cookies（未登录仅 danmaku），而头部教学视频（王刚类）**硬字幕烧入画面**、信息完整度高于 ASR（克数、技法名全在屏上）。推荐管线（§5）以 WhisperX ASR 为主轴，会丢掉硬字幕这个更高质量的文字源。**建议**：管线加"硬字幕 OCR 分支"（抽帧 OCR ∪ VLM 直接读屏），与 ASR 互为校验——本次 POC 的 clip 边界即全部来自硬字幕时间轴，±1–2 s 精度足够对齐动作段。

- **G7 ｜ clip 粒度与精度：够用，但"一步一 clip"掩盖了复合动作。**
  本视频动作连续无剪辑，clip ±2 s 精度完全够用；但单步内常含多动作（step3 = 滑锅+倒油+加底油，step5 = 炒+加酱+加水+烧）。对"备料/教学回放"用途粒度可接受；若未来要按动作索引（如"只看勾芡"），需要 sub-clip。**暂不阻塞**，记为已知限制。另：uk 输出无独立来源（旁白 zh，uk 纯机翻），契约 §1 对 uk ASR 的预警同样适用于"zh→uk 翻译链"——uk 数字字段须按 §7 重点抽查（本次 uk 文本由引擎自译，未引入数字错误，但机制上无校验兜底）。

## 5. 与 fixture（data/dishes/tomato-egg-stir-fry.json）的差异

| 项 | fixture | 本 POC（真实视频） | 解读 |
|---|---|---|---|
| status | active | **draft** | fixture 不符合"skill 永远只产草稿"， POC 按契约修正 |
| provenance.videoUrl | `BV1example888`（假） | `BV13p411d7oQ`（真实可回放） | fixture 溯源不可验证 |
| 菜名 | 番茄炒蛋 | 番茄炒鸡蛋 | 以视频原题为准；入库时师傅可统一命名 |
| 番茄 prep.note | "去皮口感更好" | **视频未去皮**，原话为"稍大口感更好" | fixture 的 note 是编造的，真实抽取纠正了它 |
| 步骤数 | 3（粗） | 8（按字幕边界细分） | 真实 clip 对齐需要更细粒度 |
| 盐 | 75 g（conf 0.8） | 37.5 g（conf 0.6） | 视频明示仅 1 g+少许；fixture 数值无出处 |
| 油 | 500 ml（conf 0.9） | 875 ml（conf 0.5） | 视频全程无量，fixture 的高置信度不真实 |
| 葱花 | 250 g（conf 0.72） | 125 g（conf 0.4，视觉-only） | fixture 未体现"视频没提"这一事实 |
| 白醋/番茄酱/糖/水淀粉 | 无 | 视频明示但**无法入库**（G1） | fixture 回避了未匹配食材问题 |
| tomato 7500 g / egg 75 pcs | 同 | 同 | ×25 缩放交叉印证一致 ✓ |

**结论**：fixture 是"理想化答案"，真实视频抽取在 3 个维度上更严格（draft、可溯源 URL、未匹配食材转复核），也暴露了 fixture 回避的全部难点。

## 6. 对 SKILL.md / adapter（parse_video.py）的改进建议

1. **下载封装**：UA + Referer 默认注入；格式 fallback `bv*+ba/b`；412 重试退避；cookies 可选注入（B 站字幕/高清）。`bilisearch:` 不可用需文档化。
2. **管线加硬字幕 OCR 分支**（G6）：抽帧 OCR（或 VLM 读屏）与 WhisperX ASR 双路，数字字段（克数）优先采信字幕。
3. **成品帧回扫**（G3）：末尾 10 s 成品特写强制过 VLM 核对配料表，捕捉视觉-only 配料（葱花类）。
4. **qty 缺省/to-taste 路径**（G2）：推动 schema 放宽 components[].qty 必填，或 Unit 加 `to-taste`；估计值推导依据进 PR 模板。
5. **未匹配食材闭环**（G1）：parse_video.py 直接产出"拟新建食材 stub"（name 三语 + baseUnit 猜测）附在 PR 里，师傅一键接受即建 id。
6. **provenance 记录缩放**（G5）：`originalServings`/`scaleFactor` 可选字段或 PR 模板必填项。
7. **技法词表增补**（G4）：`beat`/`wok-season`/`finish-oil`；火候参数另立字段。
8. validate_dish.py 可增一条机器检查：**截帧文件确实存在于 images/ 且 prep.image 的 src 与 provenance 视频一致**（本次人工核对，契约 §4"截帧时间落在 clip 区间内"目前只能靠人工/引擎自觉）。

## 7. 附录：dish JSON 关键片段（完整文件见 poc-video-001/tomato-egg-stir-fry.json）

```json
{
  "schemaVersion": "2",
  "name": { "zh": "番茄炒鸡蛋", "en": "Tomato and egg stir-fry", "uk": "Смажені яйця з томатами" },
  "baseServings": 50,
  "components": [
    { "ingredientRef": "tomato", "qty": { "value": 7500, "unit": "g" },
      "prep": { "techniqueRef": "roll-cut-chunks", "size": "3–4 cm",
                "image": { "src": "images/tomato-egg-stir-fry/prep-tomato.jpg", "license": "own", "sourceUrl": "https://www.bilibili.com/video/BV13p411d7oQ/" } },
      "confidence": { "value": 0.97, "source": "video" } },
    { "ingredientRef": "egg",  "qty": { "value": 75,   "unit": "pcs" }, "confidence": { "value": 0.98, "source": "video" } },
    { "ingredientRef": "salt", "qty": { "value": 37.5, "unit": "g" },   "confidence": { "value": 0.6,  "source": "video" } },
    { "ingredientRef": "cooking-oil", "qty": { "value": 875, "unit": "ml" }, "confidence": { "value": 0.5, "source": "video" } },
    { "ingredientRef": "scallion", "qty": { "value": 125, "unit": "g" },
      "prep": { "techniqueRef": "minced" },
      "confidence": { "value": 0.4, "source": "video" } }
  ],
  "steps": [
    { "text": { "zh": "熟透的西红柿2个（约300克）去蒂，切成大小均匀的滚刀块（可稍大，口感更好）备用。", "…": "en/uk 略" },
      "techniqueRef": "roll-cut-chunks",
      "clip": { "videoUrl": "https://www.bilibili.com/video/BV13p411d7oQ/", "start": 5, "end": 14 } },
    { "text": { "zh": "油温四成热时下蛋液，小火煎1分钟至定型，中途翻面炒香，倒出备用。" },
      "techniqueRef": "pan-fry",
      "clip": { "videoUrl": "https://www.bilibili.com/video/BV13p411d7oQ/", "start": 41, "end": 67 } },
    { "text": { "zh": "番茄烧软后加入适量水淀粉，把汤汁勾成薄芡，再加入少许明油。" },
      "techniqueRef": "starch-thicken",
      "clip": { "videoUrl": "https://www.bilibili.com/video/BV13p411d7oQ/", "start": 98, "end": 112 } }
  ],
  "provenance": { "source": "video", "videoUrl": "https://www.bilibili.com/video/BV13p411d7oQ/" },
  "status": "draft"
}
```

（完整 8 步、三语文本、5 张截帧引用见归档 JSON；复核清单 5 条见 §3。）
