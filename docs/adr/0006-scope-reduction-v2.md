# ADR-0006: 产品收窄与大幅简化（v2）——一个师傅的三张单，5 个实体

> **English summary.** After the v2 eight-scenario research (`docs/research/v2/`, 2026-09-05), CanteenOS narrows from a "general-purpose full-chain canteen system" to one concrete job: **a Chinese chef with Ukrainian helper cooks Chinese food abroad and buys the right ingredients** — three sheets a day (prep list / purchase order / menu). The data model shrinks from 9 schema entities to 5 (`ingredient`, `techniques`, `dish`, `menu-plan`, `purchase-order` as engine-output snapshot) plus the repo-directory-as-knowledge-base (`data/`, one file per entity). **Deleted outright** (kept in git history, no compatibility layer): `supplier`, `unit-conversion`, `feedback` schemas and all their examples, the `dishpack` interchange layer, and the five-state PO state machine. Three simplifications: a single `yield` number per weight-tracked ingredient (pcs items skip yield only; `margin` — an anti-underbuy buffer — applies to **all** ingredients including pcs, correcting the original "pcs skip both" text, see §3) plus margin absorbing fixed tail losses; translation status moves to a sidecar `translations.lock.json` (source_hash + status; data itself carries only `{zh,en,uk}`); the video-ingest skill outputs `dish.json` + `images/` directly and a git PR *is* the human review queue. Three rulings: yt-dlp (Unlicense) is accepted; CC BY-SA images are accepted with per-image license metadata `{license, author?, sourceUrl}`; video parsing uses Gemini as primary engine with Qwen as fallback. Editing in Phase 1 is single-person (the chef edits JSON via PR; no editing UI). Execution order: procurement engine first, video POC second.

- Status: Accepted（2026-09-06）
- Deciders: @TERRYYYC
- Supersedes（部分）：ADR-0005 中的 PO 状态机与七步管线口径（本文 §Decision 2/3）；ADR-0004 内容级三语不变（数据本体仍是 `{zh,en,uk}`）

## Context

阶段 0 按"通用食堂（团餐）全链路系统"设计：9 个 JSON Schema 实体、点餐/评分/运营报告模块、供应商主数据 + SKU、量纲三元组实体、dishpack 视频导入中间包、PO 五态状态机。

2026-09-05 完成的 v2 八场景调研（[总索引](../research/v2/README.md)）迫使重新对焦：

- **真实用户画像远比"通用食堂"具体**：一个中国师傅 + 本地（乌克兰）帮厨，在海外稳定做中餐、买对料（[research-brief-v2.md](../research/research-brief-v2.md) §0）。每天的核心产出是三张单：给帮厨的**备料单**、给采购员的**采购单**、给顾客的**菜单**。
- **多个原设计组件被调研证伪或证重**：没有任何开源库内建 AP/EP 净料率模型，但我们自己也只需要一个数字（场景 D）；供应商主数据表对"两三家菜贩"是过度设计，Grocy 对照表明供应商用字符串即可（场景 F）；结构化技法词表不存在、必须自建闭集（场景 B）；"文件即数据库 + PR 审流"路线成熟，不需要服务端与编辑 UI（场景 G）；翻译状态管理只需 <200 行脚本 + 旁文件，不需要平台（场景 H）。
- **协议现实**：Wikidata Commons 食材图 77.8% 是 CC BY-SA（场景 A），不用就没图；yt-dlp 是 Unlicense，不在旧硬规则白名单内但无可替代（场景 C）——两个协议问题必须正式裁决。

## Decision

### 1. 产品定位收窄

CanteenOS v2 的定位：**让一个中国师傅带着乌克兰帮厨，在海外稳定做出中餐，并且买对料。** 一个知识库，每天出三张单（备料单 / 采购单 / 菜单），知识库输入通道是做菜视频。三语（zh/en/uk）是前提不是功能；**允许不完整**——一道菜只有名字也能导入，缺什么显示成待办，按 readiness 关卡分级（有备菜规格 → 能教；有配料用量 → 能排；配料都有采购规格 → 能采）。

**明确不做**（依据 research-brief-v2 §0"已经决定不做的"）：顾客预定点餐驱动份数、多食堂/多租户、运营报告、微信小程序、评分系统、营养分析、HACCP、排班、支付。

### 2. 删除清单（git 历史保留，不留兼容层）

- schema 实体（4 个）：`supplier.schema.json`、`unit-conversion.schema.json`、`feedback.schema.json`、`dishpack.schema.json`，及 `examples/` 中对应全部样例；`examples/` 目录整体由 `data/` 取代。
- **供应商降级为字符串**：`ingredient.purchase.supplier` 就是分组键，无供应商主数据表；按供应商分组是渲染层行为，不落库（场景 F，Grocy 字段对照）。
- **量纲三元组实体删除**：pcs↔g 只靠 `ingredient.pcsToGram`（一个多少克）；g↔kg、ml↔l 是代码常量；无独立换算规则实体、无生效期/优先级链。
- **PO 五态状态机删除**（`draft→confirmed→ordered→received→settled`，原 ADR-0005 §Decision 5）：PurchaseOrder 降级为**引擎输出快照**，每行带 trace 推导链；确认/下单/收货动作发生在线下（微信/电话），不进数据模型。
- **模块三（点餐/评分/反馈）整体 deferred**：`docs/modules/feedback.md` 保留并加 deferred 横幅；`docs/modules/unit-conversion.md` 随实体一并删除。
- `Dish` 状态机收窄为 `draft | active | archived`（去掉 review/published：git PR 本身就是 review）；删除 `version` 字段（git 历史即版本）；`provenance.source` 收窄为 `manual | video`。
- 目录即知识库：**一实体一文件、文件名即 ID**（场景 G 结论），实体文件内不再重复 `id` 字段；禁止汇总大文件（techniques.json 是受控词表的唯一例外，它本身就是一个词表实体）。因模型破坏性变更，全部实体 `schemaVersion` 升为 `"2"`。

### 3. 三处简化决策

1. **yield 单一数字 + pcs 不套 yield + margin 吸收固定尾料**（收窄场景 D 的分阶段损耗模型）：
   - `ingredient.yield` 是 0–1 单一数字（净料率），**仅对按重量/体积（g/ml）计的食材有意义**；初始值用 USDA FBG/AH-102（公有领域）与乌克兰 норми відходів（如鲜番茄 15% → 0.85、青葱 20% → 0.80）打底，本地实测后回填。
   - **pcs 计数食材不套 yield，但照常乘 margin**。margin 是"防少买系数"：个数虽是离散精确计数、无挂壁损耗，但同样会买少（破损、次品、临时加量）——基准算术：480 份 × 1.5 枚/份 = 720 pcs → ×1.1 = 792 → ÷180 枚/箱 = 4.4 → ceil **5 箱**（900 枚）。
     > **2026-09-06 修正**：本节原稿写作"pcs 计数食材既不套 yield 也不套 margin（720 pcs → 4 箱整）"，经跨 agent 评审认定为设计错误——"不套 yield"成立，"不乘 margin"不成立。教训：**黄金测试锁的是"写下来的数字"而不是"正确的数字"，基准表每一行都必须逐格手算后再锁入测试**（本次修正后鸡蛋行 = 5 箱 900 枚 ¥750.00，全部数字已逐行手算重核）。
   - 场景 D 的 `fixed_per_batch`（挂壁、试味、锅边尾料）不单独建模，由 `menu-plan.margin`（备量系数，默认 **1.1**）统一吸收。margin 的作用点在文档与 trace 中统一为：**净需求聚合后 ÷ yield（仅 g/ml 食材）、× margin（所有食材，写法固定为 `净需求 ÷ yield × margin`），再扣 onHand，最后 ÷ packSize 向上取整并与 minPacks 取大**。分阶段链式 yield 记录保留为未来扩展，需要时以新 ADR 引入。
2. **翻译状态走旁文件 `translations.lock.json`**（场景 H）：数据本体只有 `{zh,en,uk}` 纯文本；机器/人工状态（`source_hash` + `status: machine|human`）由脚本维护在旁文件里——源文未变且 status=human 的字段永不重翻；技法词表作为 glossary 术语硬约束注入机翻（DeepL Glossary v3 起步，LLM 路线需输出后回查）。不引入 Weblate/Tolgee 平台。
3. **删 dishpack 中间层，git PR 即人工确认队列**（场景 C/G）：视频解析 skill **直接输出 `data/dishes/<dish>.json`（status=draft）+ `images/<dish>/` 目录**，不再有独立的交换格式实体；schema.org/Recipe 仍可作为解析引擎的内部中间产物，但不再是仓库契约。置信度保留在 `components[].confidence`；人工确认 = 审 PR（低置信字段在 PR 描述里列出），合并即入库。理由：阶段 1 只有师傅一个审核人，"打包—队列—导入"三段式是为一不存在的多租户平台付的税。

### 4. 三个裁决

1. **yt-dlp（Unlicense）可用**。Unlicense 是公有领域奉献，宽松度等同 MIT；旧硬规则白名单（MIT/Apache-2.0/BSD/MPL）未列出纯属枚举不全。cobalt 等替代均为 AGPL 不可用，yt-dlp 是 2026 年唯一稳的开源下载底座（场景 C）。使用策略：锁版本 + CI 定期升级 + 失败回放。
2. **CC BY-SA 图片可用，逐图存许可元数据**（场景 A：抽样 77.8% 为 CC BY-SA，全弃则种子图库残废）。落实为 schema 约束：`image` 字段（ingredient/technique/dish/prep/steps 通用）若存在必须是 `{src, license, author?, sourceUrl}` 结构，license/sourceUrl 必填；展示层按 license 渲染署名。OFF（ODbL）数据仍只读参考不入库。
3. **视频解析 Gemini 主、Qwen 备**（场景 C）：Gemini（`response_schema` 服务端强制 JSON 结构、免自托管 GPU、成本 $0.02–0.05/条）为主引擎；Qwen3-VL（Apache-2.0、可自托管、中文/B 站场景强、原生 temporal grounding）为备选与国内合规路径。WhisperX（BSD-2）词级对齐 + PySceneDetect（BSD-3）+ Laplacian/pHash 挑帧构成关键帧链路；uk ASR 用 Whisper large-v3（FLEURS uk WER ≈ 9.5%，无更优开源对手）。

### 5. 编辑入口决策

阶段 1 **单人编辑**（师傅本人）：直接改 `data/` 的 JSON、提 git PR，配 `scripts/local-validate.py` 与 CI 校验兜底；**不做编辑 UI**（不引入 Decap/Keystatic/PagesCMS）。依据场景 G：非技术编辑工具链的真实成本是账号与培训，单人场景不划算；多人协作出现时再以新 ADR 引入。

### 6. 执行顺序

**先引擎，后 POC**：先实现 `packages/core` 采购引擎（`expand → renderPrepList/renderPurchaseOrders/renderMenu/readiness`，纯函数，`data/` 现有数字即黄金测试），跑通"菜单 → 三张单"主干；再做视频导入 POC（10–20 条真实视频，含乌克兰语样本，实测 uk ASR 与用量抽取质量）。理由：三张单是日常价值主干且不依赖外部 API；视频导入的不确定项（uk 质量、时间戳精度）集中在 POC，不该卡住主干。

### 决策 ↔ 依据对照

| 决策 | 依据 |
|---|---|
| 三张单 / 允许不完整 / readiness 关卡 | research-brief-v2 §0 |
| 供应商字符串化、packs = max(minPacks, ceil(净需求/packSize))、lastPrice 跳 0、分组在渲染层 | 场景 F（Grocy/bomkit 对照） |
| yield 单数字 + pcs 特例 + margin 吸收固定尾料 | 场景 D（USDA AH-102 链式模型收窄；乌表季节分档留作扩展） |
| translations.lock.json 旁文件 + source_hash/status | 场景 H（轻量脚本方案 vs Weblate/Tolgee） |
| 删 dishpack、skill 直出 dish.json、PR 即队列 | 场景 C（管线）+ 场景 G（PR 审流） |
| yt-dlp / CC BY-SA 元数据 / Gemini 主 Qwen 备 | 场景 C §4 + 风险节、场景 A 图片许可分布 |
| 一实体一文件、文件名即 ID、禁止汇总大文件、不用 Git LFS | 场景 G 已知坑 #1/#3 |
| 阶段 1 单人编辑无 UI | 场景 G 已知坑 #2 |
| techniques 闭集词表（cut/heat/pretreat） | 场景 B（四层骨架 + DB51/深圳/en.wiki 三源互证英文） |

## Consequences

- 正面：
  - 实体数 9 → 5，删除约 60% 的 schema 表面积；`data/` 现有番茄炒蛋全链路数字（480 份 → 鸡蛋 792 pcs → 5 箱等）即为引擎黄金测试。
  - 阶段 1 无数据库、无 API、无编辑 UI、无状态机——落地路径只剩"引擎 + 静态 PWA 读 JSON"。
  - 协议风险全部显性化：yt-dlp 有裁决、CC BY-SA 有逐图元数据 schema 约束、视频引擎双轨。
- 负面 / 代价：
  - 删 supplier 主数据 ⇒ 供应商改名不影响历史单（字符串快照），同名歧义靠人；删 PO 状态机 ⇒ 收货差异/对账不进系统（模块三 deferred 的连带损失）。
  - 删量纲实体 ⇒ 历史 PO"按当时口径复算"能力放弃（快照内的 trace 已含全部数字，可解释但不可重算调价）；pcsToGram 变更不回溯。
  - margin 吸收固定尾料是近似：批量极小时（如 10 份）1.1 可能不足以覆盖固定损耗，需要师傅经验校正——接受此近似，实测后再调。
  - translations.lock.json 与数据本体可能漂移——由维护脚本 + CI 一致性检查兜底（脚本待写）。
- 跟进事项：① `packages/core` 引擎实现（本 ADR 的算术即验收用例）；② 翻译锁文件维护脚本；③ 视频 skill 脚本（`skills/video-recipe-ingest/scripts/`）改造为直出 dish.json + images/；④ techniques 词表补全至约 80 项并自绘 SVG 刀工图。
