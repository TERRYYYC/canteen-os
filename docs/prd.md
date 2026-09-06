# CanteenOS 产品需求文档（PRD）

> **English summary.** After the v2 scope reduction ([ADR-0006](adr/0006-scope-reduction-v2.md), 2026-09-06) CanteenOS does one job: **a Chinese chef with a Ukrainian helper cooks Chinese food abroad and buys the right ingredients** — one knowledge base (the `data/` directory) producing three sheets a day: prep list (for the helper, Ukrainian-first), purchase order (for the purchaser), and menu (for customers, trilingual). Knowledge enters through cooking-video parsing (skill outputs `dish.json` + `images/` directly; a git PR is the human review queue). Phase 1 editing is single-person (the chef edits JSON via PR — no editing UI). The ordering/rating/feedback module (formerly 模块三) is **deferred**.

- 版本：v0.2（2026-09-06 收窄，见 [ADR-0006](adr/0006-scope-reduction-v2.md)；v0.1 为阶段 0 通用食堂设计）
- 依据调研：[docs/research/research-brief-v2.md](research/research-brief-v2.md) + [v2 八场景报告](research/v2/README.md)；旧报告 [open-source-research-canteen-system.md](research/open-source-research-canteen-system.md)、[video-to-recipe-tech-survey.md](research/video-to-recipe-tech-survey.md)

---

## 1. 产品定位

**一个中国师傅带着本地（乌克兰）帮厨，在海外稳定做出中餐，并且买对料。** 一个知识库（`data/` 目录），每天出三张单：备料单（给帮厨，乌克兰语为主，配图）、采购单（给采购员，按供应商分组、按包装取整、可转微信）、菜单（给顾客，三语菜名+图片）。知识库的输入通道是做菜视频——师傅不会打字，视频解析 skill 产出草稿，师傅只做修改和确认。

三语（zh/en/uk）是前提不是功能：中国师傅写、乌克兰帮厨读；中文权威，英/乌先机翻再在实践中修。**允许不完整**：一道菜只有名字也能导入，缺什么显示成待办，按 readiness 关卡分级（能教/能排/能采）。

（v0.1 的更宽定位——通用食堂全链路、点餐评分运营报告——已收窄，决策与依据见 ADR-0006。）

## 2. 角色（Personas）

v2 收窄后阶段 1 的日常用户只有前两个；后两个随模块三 deferred。

| 角色 | 描述 | 核心诉求 |
|---|---|---|
| 厨师 / 菜品管理员（Chef） | 维护菜品知识库、审核视频导入结果（审 PR） | 菜品录入/修订高效；视频转菜谱省去手工录入；步骤与用量准确 |
| 采购员（Purchaser） | 根据菜单计划生成并执行采购单 | 不用手算；按供应商拆单；起订量/包装规格不用脑补 |
| 顾客（Customer）【deferred】 | 提前订餐、取餐核销、评分评论 | 看到自己语言的菜单；订餐简单；反馈被听见 |
| 管理员（Admin）【deferred】 | 配置与运营报告 | 数据贯通；成本与浪费可视化 |

## 3. 场景故事

1. **菜单到采购（采购员）**：周五下午，采购员跑一遍引擎（输入：下周菜单计划 480 份番茄炒蛋），得到两张采购单快照：绿源农产品配送——番茄 19 件 ×5 kg、鸡蛋 5 箱 ×180 枚、小葱 4 件 ×1 kg；宏达粮油调味批发——食盐按 minPacks 补到 20 袋、食用油 2 桶 ×5 L。每行数字带 trace，可解释。纯文本转发给菜贩微信。
2. **视频建菜（厨师）**：厨师在 B 站看到一道适合食堂的菜品视频，把链接丢给视频解析 skill；解析直出 `data/dishes/<菜>.json`（status=draft）+ 截帧图片，开成 PR：两条低置信度配料（"适量盐"、"一把葱花"被量化成 75 g / 250 g，confidence 0.8/0.72）在 PR 里标出，师傅修正后合并即入库（active）。
3. **帮厨备料（帮厨）**：乌克兰帮厨打开备料单（uk 优先、大字大图）：今天要切的食材、"切成什么样"（滚刀块/末等技法词表译名）、每个配料的截帧配图，点进去可回放对应视频片段。
4. ~~订餐与反馈（顾客）~~ / ~~运营报告（管理员）~~：**deferred**（ADR-0006；原设计稿见 [modules/feedback.md](modules/feedback.md)）。

## 4. 模块需求

### 4.1 模块一：菜品知识库（详见 [modules/knowledge-base.md](modules/knowledge-base.md)）

- 实体（5 实体中的 3 个）：**Ingredient / Technique（单文件词表）/ Dish**；供应商是字符串、pcs↔g 换算内联 `pcsToGram`（原 Supplier/UnitConversion 实体已删）。
- **允许不完整**：Dish 除 name 外全部可选；readiness 三关卡（能教/能排/能采）。
- Dish.components 必须引用 Ingredient（ingredientRef），禁止内联字符串——采购引擎 BOM 展开的前提；techniqueRef 闭集引用词表。
- 状态机 `draft → active → archived`；git PR 即人工确认队列；阶段 1 单人编辑（师傅改 JSON 走 PR），**不做编辑 UI**。

### 4.2 模块二：菜单计划→采购单引擎（详见 [modules/procurement.md](modules/procurement.md)）

- 输入：MenuPlan（日期×餐次×菜品×计划份数 + margin 备量系数，默认 1.1）。
- 管线：BOM 展开 → 按 `plannedServings/baseServings` 缩放 → 聚合净需求 → ÷`yield`（仅 g/ml 食材）×`margin`（**所有食材，含 pcs**）→ 扣 onHand（仅 trackStock）→ `packs = max(minPacks, ceil(需求/packSize))` → 按 supplier 字符串分组出 PO 快照。
- **PO 无状态机**（引擎输出快照）；**每行带 trace**（完整推导链）。
- 确定性核心（纯函数，可测试）；`data/` 现有数字即黄金测试。

### 4.3 模块三：点餐/评分/反馈 —— deferred（ADR-0006）

> 整体推迟，不进入阶段 1–3 路线图。原设计稿保留在 [modules/feedback.md](modules/feedback.md)（已加 deferred 横幅），复活时以新 ADR 为准。

## 5. 内容级三语需求（详见 [i18n.md](i18n.md)）

- **所有可展示实体**（菜品名、食材名、技法名、步骤）携带 `{zh, en, uk}` 结构，至少一种语言。
- fallback 链：`zh → en → uk`。
- 翻译状态走旁文件 `translations.lock.json`（source_hash + status，脚本维护），数据本体只有纯三语文本。
- 食材计量单位本地化显示；内部统一规范单位符号。
- UI chrome（按钮、菜单等界面文案）用 i18next，留给客户端实现，不在本仓库数据模型内。

## 6. 视频导入需求（详见 [video-import.md](video-import.md)）

- 输入：视频文件或 URL（B 站/抖音/YouTube 等，yt-dlp 下载，ADR-0006 裁决其 Unlicense 可用），可带语言提示。
- 引擎：**Gemini 主、Qwen 备**（ADR-0006 裁决）；WhisperX 词级对齐 + PySceneDetect 抽帧。
- 输出（不再有中间包）：**直接产出 `data/dishes/<菜>.json`（status=draft）+ `images/<菜>/`**——每个配料"被切的几秒"截帧写入 `component.prep.image`，每个步骤带 `clip{videoUrl,start,end}`。
- 技法输出必须是 `data/techniques.json` 闭集内的 techniqueRef；易错字段（用量、份量）带 `confidence`，低于 0.85 的在 PR 描述里列出由师傅确认——**git PR 即人工确认队列**。

## 7. 非目标（Non-Goals，本阶段明确不做）

- ❌ 不做完整可运行应用（阶段 0/1 交付 spec、schema、data/、引擎与只读 PWA）。
- ❌ 不做顾客预定点餐驱动份数、评分系统、运营报告（模块三 deferred，ADR-0006）。
- ❌ 不做多食堂/多租户、微信小程序、营养分析、HACCP、排班、支付。
- ❌ 不做编辑 UI（阶段 1 单人编辑：改 JSON 走 PR）。
- ❌ 不做供应商主数据表、PO 状态机、独立量纲换算实体（均已删除）。
- ❌ 不做 UI 层 i18n 资源文件（i18next 资源由客户端项目自理）。
- ❌ 不自建视频解析大模型（用 Gemini/Qwen API；自托管 WhisperX+Qwen-VL 管线仅在大批量/离线时考虑）。

## 8. Open Questions

1. 顾客菜单的过敏原信息落在哪个字段（EU 14 类，v2 模型暂未收录）——阶段 1 出菜单前定。
2. 模块三复活的真实触发条件（有第二家食堂/有订餐需求时）。
3. 多人协作编辑时的工具链（PagesCMS/Decap 候选，场景 G）——单人阶段不投入。
