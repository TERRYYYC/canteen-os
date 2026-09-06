# CanteenOS 产品需求文档（PRD）

> **English summary.** After the v2 scope reduction ([ADR-0006](adr/0006-scope-reduction-v2.md), 2026-09-06) CanteenOS does one job: **a Chinese chef with a Ukrainian helper cooks Chinese food abroad and buys the right ingredients** — one knowledge base (the `data/` directory) producing three sheets a day: prep list (for the helper, Ukrainian-first), purchase order (for the purchaser), and menu (for customers, trilingual). Knowledge enters through cooking-video parsing (skill outputs `dish.json` + `images/` directly; a git PR is the human review queue). Round 1 (v0.1 → v1.0, 2026-09-07 → 10-30) ships one URL with four pages: `/prep` `/purchase` `/menu` (read-only, PWA, offline) and `/admin` — a chef back office to plan the week, add ingredients/dishes by hand, and publish (static page → cloud function → GitHub API; no backend database, no login; ADR-0007). Video import stays a CLI in Round 1. The ordering/rating/feedback module (formerly 模块三) is **deferred**.

- 版本：v0.3（2026-09-07：加入师傅后台与产品形态，见 [roadmap-v2.md](roadmap-v2.md) §2 与 [plan-for-terry.md](plan-for-terry.md)）；v0.2 为 2026-09-06 收窄（[ADR-0006](adr/0006-scope-reduction-v2.md)）；v0.1 为阶段 0 通用食堂设计
- 依据调研：[docs/research/research-brief-v2.md](research/research-brief-v2.md) + [v2 八场景报告](research/v2/README.md)；旧报告 [open-source-research-canteen-system.md](research/open-source-research-canteen-system.md)、[video-to-recipe-tech-survey.md](research/video-to-recipe-tech-survey.md)

---

## 1. 产品定位

**一个中国师傅带着本地（乌克兰）帮厨，在海外稳定做出中餐，并且买对料。** 一个知识库（`data/` 目录），每天出三张单：备料单（给帮厨，乌克兰语为主，配图）、采购单（给采购员，按供应商分组、按包装取整、可转微信）、菜单（给顾客，三语菜名+图片）。知识库的输入通道是做菜视频——师傅不会打字，视频解析 skill 产出草稿，师傅只做修改和确认。

三语（zh/en/uk）是前提不是功能：中国师傅写、乌克兰帮厨读；中文权威，英/乌先机翻再在实践中修。**允许不完整**：一道菜只有名字也能导入，缺什么显示成待办，按 readiness 关卡分级（能教/能排/能采）。

（v0.1 的更宽定位——通用食堂全链路、点餐评分运营报告——已收窄，决策与依据见 ADR-0006。）

## 2. 角色（Personas）

第一轮的用户是四个人，各开一个页面（详见 §4.4）：

| 角色 | 页面 | 描述 | 核心诉求 |
|---|---|---|---|
| 帮厨（乌克兰人，Prep cook） | `/prep` | 每天按备料单切配 | 看得懂：切什么、切成什么样、切多少；有图；离线能开 |
| 采购员（Purchaser） | `/purchase` | 按周采购单向菜贩下单 | 不用手算；按供应商分组、按“包”计；一键复制成微信文本；能看懂“为什么是这个数” |
| 顾客（Customer） | `/menu` | 看今天有什么、里面有什么 | 自己的语言；照片；过敏原。**点餐、评分 deferred** |
| 师傅（Chef） | `/admin` | 排菜单、加菜、建食材、按发布 | 不写代码、不碰 JSON；一只手能操作；改了什么两分钟后大家看到 |

管理员（多食堂配置、运营报告）随模块三 deferred。第一轮不做登录，每个角色一条带钥匙的链接。

## 3. 场景故事

1. **菜单到采购（采购员）**：周五下午，采购员跑一遍引擎（输入：下周菜单计划 480 份番茄炒蛋），得到两张采购单快照：绿源农产品配送——番茄 19 件 ×5 kg、鸡蛋 5 箱 ×180 枚、小葱 4 件 ×1 kg；宏达粮油调味批发——食盐按 minPacks 补到 20 袋、食用油 2 桶 ×5 L。每行数字带 trace，可解释。纯文本转发给菜贩微信。
2. **视频建菜（厨师）**：厨师在 B 站看到一道适合食堂的菜品视频，把链接丢给视频解析 skill；解析直出 `data/dishes/<菜>.json`（status=draft）+ 截帧图片，开成 PR：两条低置信度配料（"适量盐"、"一把葱花"被量化成 75 g / 250 g，confidence 0.8/0.72）在 PR 里标出，师傅修正后合并即入库（active）。
3. **帮厨备料（帮厨）**：乌克兰帮厨打开备料单（uk 优先、大字大图）：今天要切的食材、"切成什么样"（滚刀块/末等技法词表译名）、每个配料的截帧配图，点进去可回放对应视频片段。
4. **排菜单与发布（师傅）**：周五师傅用手机打开后台，把微信里那条“周一午番茄炒蛋200”粘进去，系统认出 3 行、标出 1 行没有的菜；他改了周三的份数（步进器 ±10，旁边写着上周实际 176），点“采购单预览”看这周要买多少，再点“发布”。两分钟后帮厨的备料单、采购员的采购单、顾客的菜单同时更新，没有人转发任何东西。
5. ~~订餐与反馈（顾客）~~ / ~~运营报告（管理员）~~：**deferred**（ADR-0006；原设计稿见 [modules/feedback.md](modules/feedback.md)）。

## 4. 模块需求

### 4.1 模块一：菜品知识库（详见 [modules/knowledge-base.md](modules/knowledge-base.md)）

- 实体（5 实体中的 3 个）：**Ingredient / Technique（单文件词表）/ Dish**；供应商是字符串、pcs↔g 换算内联 `pcsToGram`（原 Supplier/UnitConversion 实体已删）。
- **允许不完整**：Dish 除 name 外全部可选；readiness 三关卡（能教/能排/能采）。
- Dish.components 必须引用 Ingredient（ingredientRef），禁止内联字符串——采购引擎 BOM 展开的前提；techniqueRef 闭集引用词表。
- 状态机 `draft → active → archived`；视频导入的草稿以 git PR 为确认队列（第一轮命令行）；**编辑入口是师傅后台**（§4.4，v0.3 起）：排菜单、粘贴导入、新食材、手动加菜、发布/回退。JSON 直接编辑仍可用于 Terry 与 agent。

### 4.2 模块二：菜单计划→采购单引擎（详见 [modules/procurement.md](modules/procurement.md)）

- 输入：MenuPlan（日期×餐次×菜品×计划份数 + margin 备量系数，默认 1.1）。
- 管线：BOM 展开 → 按 `plannedServings/baseServings` 缩放 → 聚合净需求 → ÷`yield`（仅 g/ml 食材）×`margin`（**所有食材，含 pcs**）→ 扣 onHand（仅 trackStock）→ `packs = max(minPacks, ceil(需求/packSize))` → 按 supplier 字符串分组出 PO 快照。
- **PO 无状态机**（引擎输出快照）；**每行带 trace**（完整推导链）。
- 确定性核心（纯函数，可测试）；`data/` 现有数字即黄金测试。

### 4.3 模块三：点餐/评分/反馈 —— deferred（ADR-0006）

> 整体推迟，不进入阶段 1–3 路线图。原设计稿保留在 [modules/feedback.md](modules/feedback.md)（已加 deferred 横幅），复活时以新 ADR 为准。

### 4.4 产品形态：一个网址、四个页面、一个后台（详见 [roadmap-v2.md](roadmap-v2.md) §2、[design/](design/)）

- **不做 app**：PWA + 二维码进入，加到主屏幕即离线可用（Expirenza 模式）；无应用商店、无登录、无后端数据库。
- **前台只读**（v0.2）：`/prep` 备料单（A 清单为主，点开 B 大图详情，按“早上 / 出餐前”筛选）、`/purchase` 采购单（按供应商分组、每行可展开推导 trace、复制微信文本）、`/menu` 菜单（一周日期条、菜品行三语并列 + 成分句 + ≈克重 + 过敏原、点开详情）。左上角统一目录角标切换页面，右上角语言下拉；抽屉底部显示数据更新时间与离线状态。
- **师傅后台**（v0.3）：`/admin` 工作台、排菜单（周视图 ±10 步进器 / 日周月 / 复制上周 / 粘贴导入 / Excel 上传 / 采购单预览）、新食材（一屏填完、即时机翻、拍照或 Wikidata 取图）、手动加菜、发布（四步进度、回退、二维码打印）。
- **写入通道**：静态后台页 → 一个云函数（持仓库 token，只准写 `data/**`）→ GitHub API 提交 → CI 校验、机翻缺失 en/uk、构建期跑引擎、部署。师傅拿到带钥匙的链接（ADR-0007，第一轮唯一新 ADR）。
- **第一轮不做**：帮厨勾选完成、采购员改包数、视频导入界面（命令行先顶着）、登录与权限、评分、报告。

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

- ❌ 不做原生 app / 小程序（第一轮是 PWA；小程序壳留待第二个厨房出现时）。
- ❌ 不做顾客预定点餐驱动份数、评分系统、运营报告（模块三 deferred，ADR-0006）。
- ❌ 不做多食堂/多租户、微信小程序、营养分析、HACCP、排班、支付。
- ❌ 不做后台里的：帮厨勾选、采购员改包数、视频导入界面、登录与权限细分（第一轮；见 plan-for-terry §7）。
- ❌ 不做供应商主数据表、PO 状态机、独立量纲换算实体（均已删除）。
- ❌ 不做 UI 层 i18n 资源文件（i18next 资源由客户端项目自理）。
- ❌ 不自建视频解析大模型（用 Gemini/Qwen API；自托管 WhisperX+Qwen-VL 管线仅在大批量/离线时考虑）。

## 8. Open Questions

1. 顾客菜单的过敏原信息落在哪个字段（EU 14 类，v2 模型暂未收录）——阶段 1 出菜单前定。
2. 模块三复活的真实触发条件（有第二家食堂/有订餐需求时）。
3. ~~多人协作编辑时的工具链~~ → 已定为“静态后台 + 云函数 + GitHub API”，细节在 ADR-0007（v0.3）。第二个编辑者出现时再评估 PagesCMS/Decap。
