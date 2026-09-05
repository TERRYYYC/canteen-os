# CanteenOS 开源信息收集任务书（v2，2026-09-05）

> 给调研 agent 的说明：本文档先用一页说清我们要做什么、数据长什么样，再列 8 个具体场景。每个场景写明"要找什么、什么算好、搜索关键词、回报格式、排除条件"。请**按场景逐个回报**，不要写综述。本文件替代 `open-source-research-canteen-system.md` 的旧框架（旧报告结论仍有效：不 fork Mealie/Tandoor 整体、不复用 AGPL/Commons Clause 代码）。

---

## 0. 项目一页纸

**目标**：让一个中国师傅带着本地（乌克兰）帮厨，在海外稳定做出中餐，并且买对料。

**一个知识库，每天出三张单**：

| 单 | 给谁 | 内容 |
|---|---|---|
| 备料单 | 帮厨（乌克兰语为主） | 今天/明天要准备哪些食材、切成什么样、提前多久、配图 |
| 采购单 | 采购员 | 按供应商分组的食材/调料清单，已按包装取整，可转发到微信 |
| 菜单 | 顾客 | 三语菜名、图片、过敏原 |

**知识库的输入通道**：做菜视频。师傅不会打字，视频解析 skill 在云端跑，输出一个"菜品包"（我们自己的 JSON + 图片），师傅只做修改和确认。

**三语（zh / en / uk）是前提，不是功能**：中国师傅写、乌克兰帮厨读。中文是权威版，英/乌先机翻，在实践中修。

**允许不完整**：一道菜只有名字也能导入。缺什么显示成待办，不拒绝。按用途设关卡：有备菜规格 → 能教帮厨；有配料用量 → 能排菜单；配料都有采购规格 → 能算采购。

### 简化后的数据模型（5 个实体，全部是仓库里的 JSON 文件 + 图片）

```
ingredients/*.json    食材/调料
  name{zh,en,uk} · image · externalId(Wikidata QID) · baseUnit(g|ml|pcs)
  pcsToGram?(一个多少克) · yield?(净料率 0–1，只对按重量算的食材)
  purchase{supplier(字符串), packSize, packUnit, minPacks, lastPrice}
  trackStock(bool，只有耐放品为 true) · onHand?

techniques.json       中餐技法词表（一个文件）
  [{id, kind: cut|heat|pretreat, name{zh,en,uk}, image?, note{zh,en,uk}?}]
  例：cut/丝、cut/滚刀块、pretreat/焯水、pretreat/上浆、heat/爆炒

dishes/*.json         菜品
  name{zh,en,uk} · image · baseServings(食堂尺度，如 50)
  components[{ingredientRef, qty{value,unit}, prep{techniqueRef, size?, note?, image?, timing?}, confidence?}]
  steps[{text{zh,en,uk}, techniqueRef?, image?, clip?{videoUrl,start,end}}]
  provenance{source: manual|video, videoUrl?} · status: draft|active|archived

menu-plans/*.json     日期 × 餐次 × 菜品 × 份数，margin(备量系数，默认 1.1)

purchase-orders/*.json  引擎输出的快照（含每行的推导过程）
```

### 代码（一个包，纯函数，无数据库、无 API）

```
expand(menuPlan, dishes, ingredients) → lines[]   每行带 trace（为什么是这个数）
renderPrepList(lines, lang)                       备料单
renderPurchaseOrders(lines)                       按 supplier 分组、按 packSize 向上取整、minPacks
renderMenu(menuPlan, lang)                        顾客菜单
readiness(dish)                                   能教 / 能排 / 能采
```

阶段 1 的"应用"是一个读 JSON 的静态网页（PWA，可离线）。线上线下同步 = git pull 或拷贝文件夹。

### 已经决定不做的（调研时不要在这些方向花时间）

顾客预定点餐驱动份数、多食堂/多租户、运营报告、微信小程序、评分系统（后续再说）、营养分析、HACCP、排班、支付。

---

## 1. 场景清单

### 场景 A：食材三语名 + 图片的种子数据

**背景**：约 300 种中餐常用食材和调料（含生抽/老抽/蚝油/豆瓣酱这类中国特有调料），需要 zh/en/uk 三语名和一张照片。我们不想手填，想从公开数据拉种子，师傅只改不对的。

**要找什么**：
1. Wikidata：确认常见食材条目的 uk 标签覆盖率（抽 30 个测：番茄、小葱、香菜、生抽、老抽、蚝油、豆瓣酱、五香粉、木耳、粉丝、豆腐、腐竹、花椒、八角、料酒、香油……），以及 Commons 图片可用性和各自的许可（CC0 / CC BY / CC BY-SA 分别占多少）。
2. Open Food Facts 食材 taxonomy（`ingredients.txt`）：uk 和 zh 翻译覆盖率，是否有中国调料条目。
3. 有没有现成的中文食材数据集（中文食材库、食材分类表、CSV/JSON），协议是什么。
4. 有没有现成的 uk 食品词表（乌克兰 USDA 类食品成分表、乌克兰语食品分类）。

**什么算好**：能用脚本批量拉、协议允许商用、uk 覆盖 ≥ 70%、有图片。

**搜索关键词**：`Wikidata SPARQL food ingredient labels uk zh` · `Open Food Facts ingredients taxonomy ukrainian` · `中文 食材 数据集 json github` · `chinese ingredients dataset` · `FoodOn multilingual labels` · `WikiFCD` · `українська база продуктів харчування`

**回报**：数据源 · 协议 · 覆盖率（按上面 30 个抽样） · 拉取方式（API/dump） · 图片许可分布 · 一段能跑的示例查询。

**排除**：需要付费的 API；协议禁止商用；没有 uk 的来源只作备选记一笔。

---

### 场景 B：中餐技法词表（刀工 / 加热法 / 预处理）

**背景**：帮厨要看懂"切丝、滚刀块、焯水、上浆、爆炒"。我们要一份受控词表：中文权威、带定义、最好带图，然后机翻成 en/uk。这个词表也是视频解析 skill 的输出约束（模型只能从词表里选）。

**要找什么**：
1. 中国官方/教材来源：中式烹调师国家职业技能标准、中职/高职中餐烹饪专业教学标准、烹饪教材里的刀法与烹调法分类体系（完整列表 + 定义）。找到能引用的原文。
2. 已经结构化的版本：有没有人整理成 JSON/CSV/Wikidata 条目（例如 Wikidata 上"刀工"子类、"烹调方法"子类），有没有中英对照表（如北京 2008《中文菜单英文译法》里的技法译名）。
3. 英文烹饪本体：FoodOn 的 cooking process 分支、Cooking Ontology、RecipeDB/FoodKG 的 cooking action 词表——看有没有可对齐的英文标准名。
4. 刀工示意图：有没有开放许可的刀工/切法图集（Commons、教材配图、开源烹饪教程）。

**什么算好**：一份 ≤ 80 项的清单，每项有中文名、定义、可选英文对应、可选图片来源。

**搜索关键词**：`中式烹调 刀法 分类 丝 片 丁 块 条 末 段 滚刀` · `中式烹调师 国家职业技能标准 pdf` · `中餐烹饪 教学标准 烹调方法` · `中文菜单英文译法 烹饪方法 术语` · `FoodOn cooking process` · `cooking ontology cutting techniques` · `knife cuts vocabulary julienne brunoise dataset` · `RecipeDB cooking actions`

**回报**：来源 · 完整清单（或链接） · 协议/引用方式 · 与英文本体的对齐建议 · 图片来源。

**排除**：西餐刀工体系单独不要（只用于对齐）；付费教材。

---

### 场景 C：做菜视频 → 结构化菜品包 + 关键帧

**背景**：输入 B 站/抖音/YouTube 视频（中/英/乌语），输出我们自己的 `dish.json`（配料 + 用量 + 每个配料的备菜规格 + 步骤）和图片。关键需求：**每个配料被切的那几秒截成图当备菜照片，每个步骤带视频时间段**。旧调研已找到 pick-a-recipe、recipe-from-video、Mealie 内置管线，这次要往"视频片段对齐 + 关键帧"深挖。

**要找什么**：
1. 转写-视频对齐：把 ASR 转写按句子对齐到时间戳（WhisperX 等），以及把"步骤"对齐到视频片段的工具或论文实现。
2. 关键帧/动作片段抽取：给定时间段抽代表帧、去重、挑清晰帧的库；食物/烹饪动作检测模型（cutting/stirring 检测）。
3. 多模态 LLM 直接吃视频出 JSON 的开源封装：Gemini / Qwen-VL / InternVL 的视频输入示例，带 JSON Schema 约束输出。
4. 下载：yt-dlp 对 B 站/抖音的当前支持状况（2026-09），有没有更稳的替代。
5. 乌克兰语 ASR：Whisper large-v3 对 uk 的公开评测数据，或更好的 uk 模型。

**什么算好**：MIT/Apache 协议、Python、能在云端函数里跑、有近 12 个月提交。

**搜索关键词**：`whisperx word timestamps` · `video recipe extraction keyframe github` · `cooking video step segmentation dataset YouCook2` · `scene detection keyframe extraction python pyscenedetect` · `Qwen2.5-VL video json output` · `Gemini video understanding recipe json schema` · `yt-dlp bilibili douyin 2026` · `whisper ukrainian WER benchmark`

**回报**：每个工具一行（协议/语言/最近提交/能做什么/不能做什么），加一个推荐管线图（下载 → ASR 对齐 → VLM 结构化 → 关键帧）。

**排除**：只做单条导入到 Mealie/Tandoor 的工具（旧报告已覆盖）；商业 SaaS。

---

### 场景 D：净料率（yield）与批量缩放的公开数据

**背景**：采购量 = 配方净用量 ÷ 净料率 × 备量系数，再按包装向上取整。净料率（番茄去皮、葱去根、带骨肉出肉率）需要一份公开的参考表；缩放要区分"按重量的食材线性放大"和"按个数的不放大损耗"。

**要找什么**：
1. 公开净料率/出成率表：USDA yield tables、中文"食材净料率表 / 出成率表"、乌克兰或俄语的 "нормы відходів" 表。
2. 开源库：实现了 yield / AP-EP / 批量缩放的代码（任何语言），看它们怎么建模。
3. 餐饮标准化配方（standardized recipe）的通用格式或模板，特别是"批量 50 份"的中餐标准化菜谱资料。

**什么算好**：有出处、有数字、能引用。

**搜索关键词**：`USDA food yields table AP EP` · `食材 净料率 表 出成率` · `нормы відходів при кулінарній обробці` · `recipe yield calculation library github` · `standardized recipe batch 50 servings template` · `中餐 标准化 菜谱 批量 份`

**回报**：数据表来源 + 协议 + 覆盖的食材数；开源库一行一个；一个能直接抄的建模建议。

---

### 场景 E：备料单 / 培训卡的展示形态

**背景**：帮厨在厨房看手机或平板：今天要切什么、切成什么样、配图、乌克兰语。要大字、大图、少操作、可离线、可打印。我们想看看别人怎么做的，不打算 fork。

**要找什么**：
1. 开源厨房显示系统（KDS）、prep sheet、recipe card 生成器：界面截图、打印样式。
2. 闭源参照：meez 的培训卡和 prep list 界面、Galley/Apicbase 的 production sheet 截图或演示视频——只看形态。
3. "步进式"做菜界面（cook mode、step-by-step with images）的开源实现，尤其是离线 PWA。
4. 打印/导出：从 HTML 生成 A4 备料单或图片的轻量方案（用于贴在墙上、发微信）。

**什么算好**：截图或 demo 链接 + 一句话说它哪里适合厨房场景。

**搜索关键词**：`open source kitchen display system` · `prep sheet template restaurant` · `meez prep list screenshot` · `recipe cook mode pwa github` · `html to image print recipe card`

**回报**：5–10 个参照，每个一张图/链接 + 借鉴点。

---

### 场景 F：采购单生成与分享

**背景**：BOM 展开 → 按食材汇总 → 按供应商分组 → 按包装向上取整（含最小起订量）→ 出一张能转发给菜贩的微信消息或图片。不做 ERP、不做状态机、不做库存管理（只对耐放品记一个"现有量"）。

**要找什么**：
1. 极简开源实现：几百行以内的 BOM→PO 逻辑（任何语言），看边界处理（单位换算失败、无供应商、起订量）。
2. Grocy（MIT）里"菜谱 → 购物清单 → 按店铺分组"和"价格历史"的数据模型，抄模型不抄代码。
3. HTML → 图片（用于微信转发）的库：html2canvas / satori / Playwright 截图，各自在手机 PWA 内的可用性。
4. 采购单模板：中文餐饮采购单常见格式（字段、排版）。

**搜索关键词**：`bill of materials explode purchase order minimal github` · `grocy shopping list store grouping data model` · `satori html to png` · `html2canvas mobile pwa share image` · `餐饮 采购单 模板`

**回报**：模型对照（Grocy 字段 → 我们的字段）；图片导出方案对比一行一个；1–2 个采购单模板样例。

**排除**：Odoo/ERPNext 整体（旧报告已覆盖，只作范式参考）。

---

### 场景 G：文件即数据库——git 里的 JSON + 图片知识库，静态 PWA 读取

**背景**：阶段 1 不做数据库和 API。知识库就是仓库里的文件夹，网页直接读 JSON 渲染，离线可用，同步靠 git 或拷贝文件夹。要验证这个路线有没有人走过、坑在哪。

**要找什么**：
1. git-backed / 文件型 CMS 和"静态数据 PWA"案例（Decap CMS、TinaCMS、Obsidian-as-database 一类），特别是有图片资产的。
2. 在 GitHub 上以 JSON 文件为数据源、带校验 CI 的"数据仓库"项目（任何领域），看目录组织和 schema 校验方式。
3. 静态 PWA 离线缓存图片资产的最佳实践（Workbox 等），以及仓库图片体积控制（图片压缩 CI、LFS 要不要用）。
4. 非技术人员通过表单编辑 JSON 并提交 PR 的工具（让师傅/采购能改数据）。

**搜索关键词**：`git based cms json data` · `data repository json schema validation ci github` · `pwa offline images workbox` · `image compression github action` · `form based json editor github pr non-technical`

**回报**：3–5 个可参照项目 + 一段"这条路线的已知坑"。

---

### 场景 H：内容三语机翻工作流（zh → en/uk）

**背景**：菜名、食材名、步骤、技法词表都要 en/uk。人工翻译成本太高，先机翻，再在实践中改。要求：技法词表术语在全部文本里一致（"焯水"每次都翻成同一个词）；改过的翻译不被下次机翻覆盖。

**要找什么**：
1. 支持 uk 的翻译 API 及价格（DeepL、Google、Azure、LLM），对中文烹饪术语的质量有没有公开对比。
2. 术语表约束的机翻（glossary-enforced MT）：API 层面支持（DeepL glossary）或 LLM 提示层面的做法。
3. 开源本地化工作流工具：能标记"人工已改"、只翻新增/变更字段的（Weblate、Crowdin 类，或更轻的脚本）。
4. 中餐菜名英译/乌译的现成对照表（《中文菜单英文译法》有 en；uk 有没有类似资源）。

**搜索关键词**：`DeepL glossary ukrainian chinese` · `glossary enforced machine translation llm` · `weblate json translate only changed` · `中文菜单英文译法 pdf` · `китайська кухня назви страв українською`

**回报**：API 对比表（uk 支持/价格/术语表功能）；一个推荐工作流（哪些字段机翻、怎么标记人工修改）。

---

## 2. 回报总格式

每个场景一个小节，结构固定：

```
### 场景 X
候选（按推荐顺序）：
- 名称 | 链接 | 协议 | 语言/形态 | 最近活跃 | 能给我们什么（数据 / 模型 / 代码 / 只看形态） | 不能给我们什么
结论：一句话（用哪个、怎么用）
风险：协议 / 维护 / 覆盖率
```

**硬规则**：
- 代码复用只接受 MIT / Apache-2.0 / BSD / MPL；AGPL、GPL、Commons Clause、无协议的只能"看模型/看形态"，必须标出来。
- 数据复用要写清协议（CC0 / CC BY / CC BY-SA / ODbL），CC BY-SA 和 ODbL 要标"有传染性"。
- 所有 star 数、最近提交日期要写核实日期。
- 找不到就写"没找到"，不要用相近的东西凑。
