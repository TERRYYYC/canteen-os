# 场景 D：净料率与批量缩放（调研日期 2026-09-05）

## 一、数据表来源（净料率 / 出成率 / норми відходів）

### 1. USDA Food Buying Guide（FBG，食品采购指南）★ 首选
- 链接：https://foodbuyingguide.fns.usda.gov/ （在线交互工具 + 分节 PDF，如 Section 2 蔬菜表 https://foodbuyingguide.fns.usda.gov/files/Reports/USDA_FBG_Section2_VegetablesYieldTable.pdf ）
- 协议：美国政府出版物（USDA FNS），公有领域，无传染性，可自由引用
- 覆盖：按 6 节组织（肉/肉替代品、蔬菜、水果、谷物、乳制品、其他），覆盖儿童营养餐项目常用食材数百种，每行 6 列：`Food As Purchased (AP) | Purchase Unit | Servings per Purchase Unit (EP) | Serving Size | Purchase Units for 100 Servings | Additional Information`
- 能给我们什么：**它的表结构本身就是"净用量 → 份数 → 按包装向上取整"的官方建模范例**（第 5 列直接给出 100 份需要买几个 purchase unit）；AP/EP 同时出现
- 不能给我们什么：以美式食材和美式预处理为主；中式食材（茭白、蒜苔、空心菜等）无覆盖
- 核实：2026-09-05 访问正常，权威评级 S

### 2. USDA Agriculture Handbook No. 102《Food Yields Summarized by Different Stages of Preparation》
- 链接：https://www.ars.usda.gov/SP2UserFiles/Place/80400525/Data/Classics/ah102.pdf （USDA ARS，权威评级 S）
- 协议：美国政府出版物，公有领域
- 覆盖：约 2,900 个条目，按"制备阶段"给出 AVG% 和 RANGE%（重量百分比），含去皮、去骨、烹调失重/吸水等
- 能给我们什么：**多步净料率链式建模的官方依据**——手册自己演示了土豆泥 = 去皮 81% × 微波 95% × 加料 120% = 92% 的连乘模型，与 CanteenOS"配方净用量 ÷ 净料率"的公式完全同构；数值带范围（可做上下界）
- 不能给我们什么：1975 年版，数据老；同样缺中式食材
- 补充：USDA ARS 2012《Table of Cooking Yields for Meat and Poultry》（肉类烹调出成率专项表，公有领域），被 FAO/Intake 2026-01 指南列为推荐来源（https://www.intake.org/sites/default/files/2026-01/Intake-GDQS-Data-Collection-Tabulation-Guidelines-Jan2026.pdf ）

### 3. 乌克兰/俄语 норми відходів（废弃物率规范表）
- 来源 A（数字最具体）：https://studfile.net/preview/9031436/page:5/ （2019-08-26，权威评级 C，为教材转录页）
  - 直接可用数字（占毛重 %）：土豆分季节 20/25/30/35/40（8 月→3 月递增）；胡萝卜、甜菜 20（1 月前）/25（1 月后）；洋葱 16；青葱 20；鲜卷心菜 20；酸卷心菜 30；鲜黄瓜 5；**鲜番茄 15**；大蒜 22；牛肉 I 类 26 / II 类 31；羊肉 28/30；猪肉 14/17；带骨鱼出肉率示例若干
- 来源 B（出处说明）：https://naurok.com.ua/lekciya-na-temu-ponyattya-vagi-netto-brutto-vidhodiv-pri-mehanichniy-vtrat-pri-teploviy-obrobci-169342.html （2020-04-09）——明确指出规范出自《Збірник рецептур страв і виробів》1982 版表 32（第 651 页），且给出"100 g 净土豆需毛重 137/147/159/172 g"的反算示例
- 协议：底层是苏联/乌克兰官方配方集（规范性技术数据，乌克兰法下官方文件不受版权保护）；但网页是二手转录，引用时应标注"转引自"
- 能给我们什么：**"净料率随季节变化"的现成建模范例**（同一食材多个 yield 值 + 生效时段），这是 USDA 表没有的特性；番茄 15% 损耗 ≈ 中文"去皮去蒂"口径可互验
- 不能给我们什么：数据源是 1982 年配方集，品种与现代商超规格有差距

### 4. 中文净料率/出成率表
- 定义与公式（可引用）：百度百科《净料成本》https://baike.baidu.com/item/净料成本/22489806 （2026-03-08 更新，评级 B）——净料率 = 加工后可用重量 ÷ 加工前总重量 × 100%，并给出冰冻虾仁 ≈80%、整条三文鱼 ≈46%、熟五花肉 ≈60% 等参考值
- 范围参考（评级 C，弱权威）：当餐网 https://www.dangcan.com/fangan/10433.html （2026-03-28）——胡萝卜 70–80%、土豆 75–85%、羊肉 46–70%、叶菜简单清理 70–90%、带骨肉去非食部 50–70%、干货涨发 500–650%
- 满堂红菜品配方成本网 https://www.mth517777.com/h-col-235.html （2021-11-25，评级 NA）——**中文世界里最接近"逐食材净料率数据库"的东西**：按 J303 海味/J304 畜肉/J306 蔬菜/J310 调料编码，含"番茄烧皮去皮净料率""小葱去根须净料率""大葱原料分解"等几百张实测卡——但数字在付费图片里（1 块 1 张图），**不能批量复用，只能买图或参考其分类编码体系**
- 诚实结论：**中文系统性的、带数字、可自由引用的公开净料率表——没找到**。教材（中职《餐饮成本核算》高教版）有体系但不开放；网络数字多为菜谱题库/营销文的零散参考值，建议只作交叉校验用，主数据用 USDA + 乌表 + 自测

## 二、开源库（star / 协议 / 最近提交均核实于 2026-09-05，GitHub API）

| 库 | 链接 | 协议 | star | 最近提交 | 怎么用 |
|---|---|---|---|---|---|
| grocy | https://github.com/grocy/grocy | **MIT（可复用）** | 9,454 | 2026-09-04 | 最相关：每个 product 有"库存单位↔采购单位"换算（QU conversion），菜谱按份数线性缩放，采购侧天然按 purchase unit 计数——与我们"按包装向上取整"同构，可参考其数据模型 |
| cooklang-rs | https://github.com/cooklang/cooklang-rs | **MIT（可复用）** | 123 | 2026-07-11 | 纯文本菜谱标记语言，ingredient 带 qty/unit，按 servings 元数据整体缩放；解析器可复用，建模极简值得抄 |
| Mealie | https://github.com/mealie-recipes/mealie | AGPL-3.0（**只能看模型**） | 13,144 | 2026-09-05 | 份数 × 倍数线性缩放解析后的 ingredient quantity，无 yield 概念 |
| Tandoor Recipes | https://github.com/TandoorRecipes/recipes | AGPLv3+Common Clause（**有传染性，只看**） | 8,573 | 2026-09-02 | 线性缩放 + 单位换算，无 yield 概念 |
| KitchenOwl | https://github.com/TomBursch/kitchenowl | AGPL-3.0（只看） | 3,662 | 2026-08-29 | 线性缩放 |
| vanilla-cookbook | https://github.com/jt196/vanilla-cookbook | GPL-3.0（只看） | 152 | 2026-07-27 | 份数加减缩放 |
| rviscomi/scale-recipe | https://github.com/rviscomi/scale-recipe | **无协议（不可复用代码）** | 9 | 2016-08-10 | JS 线性缩放 + 单位自动升降档，仅看思路 |

**关键发现：所有开源菜谱库都只做了"份数 × 线性倍数"，没有任何一个开源库内建 AP/EP 净料率模型**——yield 这块必须我们自己建（数据源见第一节），这既是空白也是差异化点。

## 三、标准化配方（standardized recipe）格式

- **USDA Standardized Recipe Template**（50/100 份两栏，Weight+Measure 分列；附 Marketing Guide：把 50 份的 EP 需求换算成 AP 采购量；附营养信息）：模板原文 https://apply07.grants.gov/grantsws/rest/opportunity/att/download/293777 （2019，USDA Team Nutrition，公有领域）；明尼苏达州教育厅同款模板 https://education.mn.gov/mdeprod/idcplg?IdcService=GET_FILE&dDocName=057472&Rendition=primary
- **USDA Recipes for Child Care**（整本 25/50 份标准化菜谱 + 换算工作表）：https://kncinc.org/wp-content/uploads/2019/04/usdarecipes.pdf ——明确规则："配料表里的重量是 EP（不带修剪损耗）；Marketing Guide 里才是 AP 采购量"；缩放用 factor method（目标份数 ÷ 原份数），且"只许向上取整"（rounded up）
- **中文批量实例**：
  - 满堂红 SOP 菜品标准配方成本卡（番茄鱼片汤）：https://28147635.s21i.faiusr.com/61/ABUIABA9GAAghYnQxAYomOCv0gE.pdf （2025-08-01）——按 1/2/5/10/15/20 斤六档批量给出投料、成品率 89.3%、300ml 餐盒出品盒数；**这是中餐"标准配方卡 + 成品率 + 批量分档"的最完整公开实例**（商业出品，看格式，不抄数据）
  - 15 元食堂菜谱（每人份量 × 三餐一周）：http://www.wangji888.com/stcaipu/115.html ——中式食堂"每人每菜几两"口径的真实样本（评级 NA，仅作格式参考）

## 四、能直接抄的建模建议

`ingredient.yield` 建为**分阶段记录 + 损耗类型枚举**，不要建单一百分比字段：

```json
{
  "ingredient": "番茄",
  "stages": [
    { "stage": "去皮去蒂", "yield_rate": 0.85, "loss_kind": "proportional_by_weight", "basis": "weight" },
    { "stage": "切块去尾料", "loss_abs_g": 20, "loss_kind": "fixed_per_batch", "basis": "batch" }
  ],
  "source": "USDA AH-102 item xxx / норми відходів 15% / 满堂红 J306755",
  "source_date": "2026-09-05"
}
```

- `proportional_by_weight`（去皮、去根、出骨）：损耗与重量成正比，**批量放大时线性缩放**——用 yield_rate 连乘（学 USDA AH-102 的多步链乘）
- `fixed_per_batch`（每锅/每盆固定损耗，如挂壁、试味、锅边尾料）：**不随份数放大**，缩放时保持常数
- `fixed_per_item`（按个数的损耗，如每个番茄去蒂 ≈X g）：随"个数"缩放而非重量缩放，件数 = 净重 ÷ 单件重，向上取整
- 采购侧学 USDA FBG：先算 EP 需求 → ÷ 每 purchase unit 的 EP 产出 → **purchase unit 数向上取整**（FBG 第 5 列就是这个逻辑）；乌表学"yield 带季节生效区间"

## 结论

净料率数据直接用 USDA（FBG + AH-102，公有领域、约 2,900 条、自带链式模型）打底、乌克兰 норми відходів 补"季节区间"维度、中文只找到零散参考值（满堂红逐食材卡最全但付费，系统性免费中文表**没找到**）；代码层 grocy（MIT，采购/库存单位换算）和 cooklang-rs（MIT）可复用，其余开源库只有线性缩放且多为 AGPL，yield 模型须自建。

## 风险

- **协议**：USDA 全部公有领域无风险；乌克兰表为官方规范数据的二手转录，引用需标"转引自"；满堂红/百度百科等中文来源商业或低权威，不可批量抓取；Mealie/Tandoor/KitchenOwl 是 AGPL、scale-recipe 无协议，代码一律不可复制
- **维护**：AH-102（1975）与苏联配方集（1982）数据老，品种规格与现代供应链有偏差，上线前需对高频食材做本地实测校准
- **覆盖率**：USDA/乌表对中式食材（绿叶菜细分、豆制品、干货涨发）覆盖薄，这恰是满堂红收费卡存在的理由——长期需要自测数据回填
