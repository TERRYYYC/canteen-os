# 食堂全链路系统 · 开源项目调研报告

调研日期：2026-09（以 GitHub API 实时数据核实 star 数 / 协议 / 最近提交）
调研范围：GitHub 上食谱管理、菜单计划→采购、食堂点餐、库存成本、AI 菜谱结构化六类项目

---

## 一、食谱/菜谱管理与知识库类

### 1. Mealie
- URL: https://github.com/mealie-recipes/mealie
- Stars: ~13,135（2026-09 核实）｜协议: AGPL-3.0｜技术栈: Python FastAPI + Vue3/Nuxt，SQLite（默认）或 PostgreSQL
- 活跃度: 极高，最近提交 2026-09-03，v3.x 持续迭代
- 核心功能：URL 抓取导入菜谱、日历式菜单计划、自动生成购物清单（食材合并+单位换算）、Cookbook 分组、多用户 Group/Household 两级租户模型、REST API（OpenAPI 文档完整）、Home Assistant/OIDC 集成
- **AI 能力（官方文档证实）**：OpenAI 集成——食材解析器替代 NLP parser（v1.7）、网页抓取失败时用 OpenAI 兜底（v1.9）、手写菜谱照片导入（v1.12）、**视频 URL 导入：Whisper 转写 + LLM 结构化（v3.13）**（https://docs.mealie.io/documentation/getting-started/installation/open-ai/）
- **三语确认**：前端 42 个语言文件，含 `uk-UA.json`、`zh-CN.json`、`zh-TW.json`、`en-US.json`
- 可借鉴：数据模型（Recipe/Ingredient/Food/Unit 分离）、Group/Household 多租户模型、OpenAPI 完整的 API 设计、视频导入管线思路
- 差距：纯家庭场景——无采购单/供应商/成本核算/点餐；AGPL 协议下 fork 衍生必须开源；食材库名称不随 UI 语言翻译（内容层面无多语言，见 Discussion #5448）

### 2. Tandoor Recipes
- URL: https://github.com/TandoorRecipes/recipes
- Stars: ~8,569｜协议: **AGPLv3 + Commons Clause（禁止商用销售，2026-09 核实 LICENSE.md 原文）**——注意：早期资料称 MIT，已变更
- 技术栈: Django + Vue3，仅支持 PostgreSQL；最近提交 2026-09-02，活跃
- 核心功能：500+ 站点 URL 导入、菜单计划+iCal 导出、购物清单按超市货架分区、食材条码扫描、OpenFoodFacts 营养数据、**每餐成本计算（meal cost）**、细粒度权限
- **三语确认**：37 个语言文件，含 `uk.json`、`zh_Hans.json`、`zh_Hant.json`、`en.json`
- 可借鉴：**最成熟的食材/单位/份量数据模型**（Food/Unit/Ingredient/ShoppingListEntry），含价格与超市分类属性——最接近"菜谱→采购"的开源数据模型
- 差距：Commons Clause 下**不能 fork 做商业产品**；无供应商/采购单概念；家庭场景

### 3. Grocy
- URL: https://github.com/grocy/grocy
- Stars: ~9,451｜协议: **MIT**（最宽松）｜技术栈: PHP + Blade；活跃（2026-09-03）
- 核心功能：**家庭库存管理起家**——库存批次/保质期跟踪、菜谱、菜单计划→购物清单、**购物价目历史（price history per store）**、消费记录、条码扫描
- 可借鉴：**菜谱+库存+价格三者联动的数据模型**是全开源生态里离我们"采购单"最近的一个；MIT 协议可以放心借鉴/复用概念甚至代码
- 差距：定位为家庭 ERP，无多人点餐、无多语言内容模型；PHP 技术栈较老

### 4. RecipeSage / KitchenOwl / Recipya（第二梯队）
- RecipeSage: https://github.com/julianpoy/RecipeSage ｜949 stars｜**无 LICENSE 文件（法律上不可复用代码）**｜TypeScript/Ionic PWA｜协作菜谱+菜单计划+购物清单+AI 烹饪助手+离线同步
- KitchenOwl: https://github.com/TomBursch/kitchenowl ｜3,662 stars｜AGPL-3.0｜Flutter 原生 App + Flask｜家庭实时共享购物清单最强
- Recipya: https://github.com/reaper47/recipya ｜411 stars｜GPL-3.0｜Go 单二进制，轻量

来源：https://cooklang.org/blog/42-tandoor-vs-mealie-vs-kitchenowl/ 、https://cooklang.org/blog/18-open-source-recipe-managers-2026/ 、各 GitHub 仓库页

---

## 二、菜单计划 + 自动生成购物/采购清单类

- **Mealie / Tandoor / KitchenOwl / Grocy** 四者都实现"日历菜单计划→聚合购物清单"，但终点都是"家庭购物清单"，不是"采购单"——无供应商、无 MOQ、无库存抵扣、无 PO 状态机
- **Cooklang CLI**（https://github.com/cooklang/cooklang-rs，122 stars，MIT，Rust）：`.cook` 纯文本菜谱 + `.menu` 菜单文件引用多菜谱并整体缩放，`cook recipe --format json/schema` 批量生成购物清单——**"菜单文件引用菜谱+份量缩放"的声明式设计值得借鉴**
- weekly-meal-planner（https://github.com/mymindwentblvnk/weekly-meal-planner）：YAML 菜谱 + 静态站点生成周计划+购物清单，schema.org 标注，思路轻量
- 商业参照：Peel（iOS 闭源，meal pool→grocery list，https://trypeel.app/blog/meal-planning-app-automatic-grocery-list）、Plan to Eat、Mealime

---

## 三、食堂/餐厅点餐与管理系统类

### 1. POSR（React + SurrealDB 餐厅 POS）
- URL: https://github.com/ahmedali5530/restaurant-pos
- Stars: ~49｜协议: **PSAL 自有 source-available 协议（非 OSI 开源，禁止 SaaS 转售）**｜React+TS+Bun+SurrealDB，离线优先
- 核心功能：点餐/KDS 厨房屏/库存/菜谱/员工排班/会计/AI 助手（自然语言报表、采购量预测、"what to buy"）
- 可借鉴：**库存预测→采购建议的 AI 交互设计**、"菜谱用量 vs 实际消耗"对账思路
- 差距：非真正开源；面向餐厅桌台场景而非食堂

### 2. itsHenry35/canteen-management-system（中国学校 AB 餐）
- URL: https://github.com/itsHenry35/canteen-management-system
- Stars: 6｜**已归档（2026-01）**｜Go 后端 + React 前端 + Android 扫码端
- 核心功能：学生提前选餐（A/B 餐）、食堂按班级统计份数、扫码取餐核销、钉钉集成、Excel 导出
- 可借鉴：**"提前订餐→按人头统计→备餐量"正是食堂菜单计划的真实场景**；角色模型（学生/食堂员工/管理员）贴近实际
- 差距：个人项目已归档、许可证限制"仅校园教育免费使用，严禁商用"、无采购链路

### 3. 中国高校食堂毕设类项目（DeepCode66/CampusCanteenOrderSystem、51deep/CampusCanteenIngredientPurchasingSystem 等）
- 特点：功能列表与我们高度重合（菜品管理、点餐、评论、统计分析，甚至有"食材采购订单+配送司机"角色 https://github.com/51deep/CampusCanteenIngredientPurchasingSystem）
- 实质：**毕设倒卖代码**，无协议、无维护、代码质量低，仅可看功能清单/页面结构，不可复用

### 4. OpenMensa（欧洲食堂菜单开放 API）
- URL: https://github.com/openmensa/openmensa ｜AGPL-3.0
- 德国高校食堂（Mensa）菜单数据开放平台，各食堂发布每日菜单的开放 API——可借鉴**食堂菜单数据开放格式**与生态思路

来源：https://github.com/topics/cafeteria-management 、https://github.com/topics/canteen-mangement-system 、https://discuss.frappe.io/t/restaurant-pos-is-this-github-repository-ready-for-production-deployment/79914

---

## 四、食材库存/成本核算/供应链类

### 1. OpenKitchen（clawnify）
- URL: https://github.com/clawnify/OpenKitchen
- Stars: 2（2026 新项目）｜AGPL-3.0｜React + Hono + D1（Cloudflare Workers）
- 核心功能：**递归 BOM（菜品=食材+子菜谱）→ 每份成本/food cost %、供应商发票 OCR 对账、价格历史、库存盘点 vs 理论消耗、补货建议、HACCP 证照管理**，配 AI agent 做判断
- 可借鉴：**开源界唯一正面做"菜谱 BOM→food cost→补货"的项目**，数据模型与我们的"菜谱→采购"最像；自称对标 Apicbase/MarketMan
- 差距：极早期（2 stars）、无点餐、无多语言

### 2. Grocy（见上，MIT，菜谱+库存+价格历史）

### 3. InvenTree
- URL: https://github.com/inventree/InvenTree ｜7,503 stars｜MIT｜Python/Django
- 通用库存+BOM 管理（电子元件起家）：BOM 展开、供应商 SKU、采购订单、库存批次——**BOM→PO 的通用机制可参考**，但无餐饮行业语义（份量、损耗、保质期 FEFO 弱）

### 4. OpenBoxes
- URL: https://github.com/openboxes/openboxes ｜888 stars｜EPL-1.0｜Grails
- 人道主义物资供应链（库存/采购/调拨），机制成熟但领域偏远

### 5. Odoo / ERPNext（平台级参照）
- Odoo（https://github.com/odoo/odoo，54k stars，LGPL+企业版限制）：MRP 的 Kit BOM 展开 + 补货规则可自动生成采购询价单；POS 餐厅模块
- ERPNext（https://github.com/frappe/erpnext，39k stars，GPL-3.0）+ URY 餐厅插件
- 借鉴点：**"BOM 展开×需求数量→按供应商汇总→生成 PO"是 ERP 标准模式**，我们的"菜单→采购单"本质就是它，应参照其数据流而非菜谱软件

---

## 五、"菜单计划→采购单转换"与"多语言餐饮系统"专项结论

- **开源界没有现成项目直接做"周/月菜单 → 按供应商拆分的采购单"**。这条链路只存在于商业产品 Apicbase（"turn BoMs into purchase orders"，https://get.apicbase.com/procurement-management/）和 ERP（Odoo MRP）里。菜谱软件止步于"购物清单"，ERP 止步于"通用 BOM"，中间地带（餐饮菜单周期×库存抵扣×供应商×MOQ×损耗率）无人做开源。
- 多语言：Mealie（42 语言）和 Tandoor（37 语言）UI 层面均覆盖中/英/乌，但**只翻译界面，不翻译内容**——食材库/菜谱名称是单语言字符串（Mealie 社区 Discussion #5448 明确吐槽 ingredients 只有英文）。**内容级三语数据模型（同一食材/菜品挂 zh/en/uk 三个名称）是空白点**。

---

## 六、AI 菜谱结构化：标准与项目

### 标准/格式
- **schema.org/Recipe（JSON-LD）**：Web 事实标准，但 `recipeIngredient` 是纯字符串数组，数量/单位/名称不分字段——适合**导出交换格式**，不适合做内部存储模型（https://cooklang.org/blog/41-recipe-formats-for-developers/ 有代码级分析）
- **Cooklang**：`.cook` 纯文本标记，`@食材{数量%单位}` 内联结构化，15+ 语言解析器、EBNF 文法、规范测试套件；可导出 JSON/schema.org——**适合作为"菜谱的结构化中间表示"或直接做知识库存储格式**（https://cooklang.org/）
- **Open Recipe Format（YAML）**：字段显式但采用者少
- **recipe-scrapers**（https://github.com/hhursev/recipe-scrapers，2,220 stars，MIT，Python）：从 300+ 美食网站提取 schema.org 数据——网页菜谱导入可直接复用

### 视频→结构化菜谱（与我们的核心能力直接相关）
- **Mealie 内置**：视频 URL → Whisper 转写 → LLM 结构化（官方文档，v3.13）
- **pick-a-recipe**（https://github.com/pickeld/pick-a-recipe，MIT）：yt-dlp 下载（TikTok/YouTube/Instagram）→ faster-whisper 转写 + 视觉 LLM 提取屏幕文字 → GPT/Gemini 结构化 → 经 API 写入 Mealie/Tandoor，含 Web UI、PWA、上传前人工确认——**管线最完整，MIT 可借鉴**
- **TsaiHao/recipe-from-video**（https://github.com/TsaiHao/recipe-from-video，0 stars，Python）：**中文场景**——B 站/抖音/YouTube → 语音识别（火山引擎等）→ AI 生成结构化中文食谱（食材表含用量/必需性+步骤+营养估算）——**与我们目标几乎完全同构，重点参考**
- sleeper/recipe-extractor（https://github.com/sleeper/recipe-extractor，7 stars，MIT）：Whisper+GPT，多语言，可跑 REST API 或 **MCP server**，含防幻觉护栏
- social-to-mealie（https://github.com/GerardPolloRebozado/social-to-mealie）：Instagram→Mealie，EXTRA_PROMPT 可指定输出语言
- 学术侧：Recipe1M+ 数据集（100 万菜谱+1300 万图片）；多模态（ASR+OCR+视觉识别+LLM 融合）管线研究（https://nutrola.app/en/blog/science-behind-ai-recipe-extraction-nlp-computer-vision 有五阶段技术拆解，arXiv 2509.00033 有 Whisper+TinyLlama 本地方案）

---

## 七、综合判断：自研 vs 借鉴 vs fork

### 不值得 fork 整体项目
- Mealie/Tandoor 是**家庭场景**：Household 模型、购物清单终点、无点餐/采购/成本，硬改成食堂系统等于重写
- 协议也卡死：Tandoor 是 AGPL+Commons Clause（禁商用）；Mealie AGPL-3.0（fork 衍生须开源，若产品走闭源/私有化收费则不可用）

### 值得借鉴数据模型（按价值排序）
1. **Tandoor 的 Food/Unit/Ingredient/Recipe 模型**：食材与单位解耦、超市分类、价格属性——只借模型不借代码（规避 Commons Clause）
2. **Grocy（MIT）**：菜谱×库存×价格历史联动，协议最友好，可直接读源码参考
3. **OpenKitchen 的递归 BOM+food cost% 模型**：菜品=食材+半成品子菜谱的成本卷积
4. **Odoo MRP 的"BOM 展开→按供应商汇总→PO"数据流**：菜单→采购单的正确范式来自 ERP 而非菜谱软件
5. **Cooklang 格式**：作为菜谱结构化中间表示/导入导出格式；schema.org/Recipe 作为对外交换格式；recipe-scrapers（MIT）直接复用做网页导入

### 必须自研的核心差异化模块
1. **菜单计划→采购单引擎**（周/月菜单×就餐人数预测×份量缩放→食材聚合→扣库存→按供应商/MOQ 拆 PO）：开源空白，是产品护城河
2. **内容级三语数据模型**：菜品/食材/调料实体挂 zh/en/uk 多名称字段（现有项目全是"UI 多语言+内容单语言"，这是真实痛点，Mealie 社区自己都在抱怨）
3. **食堂场景的点餐+评分反馈闭环**（提前订餐、份数统计、取餐核销、评分反哺菜单计划）：参考 itsHenry35 的角色模型与 AB 餐流程
4. **做菜视频→结构化菜谱→知识库打包导入**：管线本身成熟（yt-dlp→faster-whisper→LLM 结构化→人工确认），可参考 pick-a-recipe（MIT）与 TsaiHao/recipe-from-video 的中文实现，做成独立微服务/agent，输出自有 schema；差异化在**中文/乌克兰语视频支持+批量打包导入知识库**（现有工具都是单条导入第三方实例）
5. **运营报告**：评分+点餐+采购+成本数据贯通后的报表层，无开源对应物

### 差异化空间总结
现有开源两端的断点正是我们的产品位：**菜谱软件（Mealie/Tandoor）不懂"食堂"（无采购、无点餐、无成本），ERP（Odoo/ERPNext）不懂"菜谱"（无菜品语义、无三语、无视频导入）**。"菜单→采购单转换"只有闭源的 Apicbase 做到；三语内容模型、中文/乌语视频菜谱导入、食堂评分闭环均无人覆盖。多 agent 协作开发上，视频导入管线天然适合做成独立 agent 服务（已有 MCP server 形态先例）。

---

## 附：全部来源 URL

- https://github.com/mealie-recipes/mealie
- https://docs.mealie.io/documentation/getting-started/installation/open-ai/
- https://docs.mealie.io/documentation/getting-started/features/
- https://github.com/mealie-recipes/mealie/discussions/5448
- https://github.com/TandoorRecipes/recipes （LICENSE.md 原文：AGPLv3+Commons Clause）
- https://github.com/grocy/grocy
- https://github.com/julianpoy/RecipeSage
- https://github.com/TomBursch/kitchenowl
- https://github.com/reaper47/recipya
- https://cooklang.org/blog/42-tandoor-vs-mealie-vs-kitchenowl/
- https://cooklang.org/blog/18-open-source-recipe-managers-2026/
- https://localtonet.com/blog/self-host-your-recipe-manager-mealie-and-tandoor-setup-guide
- https://github.com/mymindwentblvnk/weekly-meal-planner
- https://trypeel.app/blog/meal-planning-app-automatic-grocery-list
- https://github.com/ahmedali5530/restaurant-pos
- https://github.com/itsHenry35/canteen-management-system
- https://github.com/DeepCode66/CampusCanteenOrderSystem
- https://github.com/51deep/CampusCanteenIngredientPurchasingSystem
- https://github.com/topics/cafeteria-management
- https://github.com/topics/canteen-mangement-system
- https://github.com/openmensa/openmensa
- https://github.com/clawnify/OpenKitchen
- https://github.com/inventree/InvenTree
- https://github.com/openboxes/openboxes
- https://github.com/odoo/odoo
- https://github.com/frappe/erpnext
- https://get.apicbase.com/procurement-management/
- https://github.com/cooklang/cooklang-rs
- https://cooklang.org/blog/41-recipe-formats-for-developers/
- https://cooklang.org/cli/commands/recipe/
- https://github.com/hhursev/recipe-scrapers
- https://github.com/pickeld/pick-a-recipe
- https://github.com/TsaiHao/recipe-from-video
- https://github.com/sleeper/recipe-extractor
- https://github.com/GerardPolloRebozado/social-to-mealie
- https://github.com/JoTec2002/InstagramToMealie/
- https://nutrola.app/en/blog/science-behind-ai-recipe-extraction-nlp-computer-vision
- https://arxiv.org/html/2509.00033v1
- https://link.springer.com/article/10.1007/s44163-025-00230-y
- https://flourpower.app/learn/recipe-data-formats
- https://pluckrecipes.com/blog/tested-ai-recipe-extractors/
