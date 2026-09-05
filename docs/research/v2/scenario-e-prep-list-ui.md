# 场景 E：备料单/培训卡展示形态（调研日期 2026-09-05）

> 场景：乌克兰帮厨在厨房看手机/平板上的备料单——今天切什么、切成什么样、配图、乌克兰语。要求大字、大图、少操作、可离线、可打印。
> star 数与最近提交日期均于 2026-09-05 通过 GitHub API 核实。协议硬规则：代码复用只接受 MIT/Apache-2.0/BSD/MPL，其余只"看形态"。

## 候选总表（按推荐顺序）

| # | 名称 | 链接 | 协议 | 语言/形态 | 最近活跃（核实 2026-09-05） | 能给我们什么 | 不能给我们什么 |
|---|------|------|------|-----------|------------------|--------------|----------------|
| 1 | meez（闭源） | getmeez.com | 闭源 SaaS | Web/平板，培训卡+备料单 | 活跃（官网 2026 在售，$19–119/月） | 只看形态：步进培训卡 slideshow、按站点汇总的 prep list、打印菜谱 | 一切代码与数据 |
| 2 | Mealie | github.com/mealie-recipes/mealie | AGPL-3.0 ⚠️ | Python+Vue 自托管 Web，13,144★ | 2026-09-05（当天有提交） | 只看形态：cook mode 大字步进、菜谱打印视图、份量缩放、多语言 i18n 做法 | 代码不可复用（AGPL）；无离线模式 |
| 3 | Cooklang（spec + cooklang-rs） | cooklang.org / github.com/cooklang/spec | MIT ✅ | 纯文本菜谱标记语言 + Rust 解析器，spec 695★ / rs 123★ | spec 2026-06-25 / rs 2026-07-11 | 数据模型：步骤文本内嵌 @配料{数量%单位}、#工具、~计时器——"切什么、怎么切"直接写进步骤里；解析器代码可复用 | 现成 UI 质量参差，cook mode 在各端 App 里要自己拼 |
| 4 | Grocy | github.com/grocy/grocy | MIT ✅ | PHP/Blade 自托管 Web，9,454★ | 2026-09-04 | 代码/模型可复用：菜谱-配料-单位换算-购物清单的数据模型、菜谱打印视图实现 | UI 是管理后台密度，不适合厨房大字；非真正离线 PWA |
| 5 | KitchenOwl | github.com/TomBursch/kitchenowl | AGPL-3.0 ⚠️ | Flutter App + 自托管后端，3,662★ | 2026-08-29 | 只看形态：离线优先架构（本地 SQLite + 服务端同步）、手机端大按钮清单交互 | 代码不可复用（AGPL）；备料单/培训卡不是其核心 |
| 6 | 经典纸质 prep sheet 模板（WebstaurantStore / Qwick / Chefs-Resources） | webstaurantstore.com/article/583 | 免费模板（非代码） | Excel/PDF 打印模板 | 文章 2021-2026 均可访问 | A4 打印版列结构直接照抄：Date / Name / Station / Item / On Hand / Par / Need | 无代码；无图片位，需要我们自己加"切法图"列 |
| 7 | Galley / Apicbase（闭源） | galleysolutions.com / apicbase.com | 闭源 SaaS | Web，production planning | 活跃（2026 在售） | 只看形态：按日期+站点汇总的生产单（production sheet）、一键从菜谱生成 prep list | 一切代码与数据；面向中央厨房，形态偏重 |
| 8 | 打印/出图技术栈：print CSS · html2canvas+jsPDF · Puppeteer · WeasyPrint | 见下 | MIT / MIT / Apache-2.0 / BSD-3 ✅ | JS/Python 库 | 均维护中 | 全部可复用：浏览器 @page 直打 A4；前端 PNG 长图（发微信）；服务端 A4 PDF | —（这是方案不是参照） |
| 9 | RecipeSage | github.com/julianpoy/RecipeSage | 无标准协议文件（源码可见）⚠️ | TS/ionic PWA，950★ | 2026-09-05 | 只看形态：离线优先 PWA 菜谱 + cook mode | 未见 OSI 协议文件，默认不可复用代码 |
| 10 | URY Mosaic（开源 KDS） | github.com/ury-erp/mosaic | AGPL-3.0 ⚠️ | Python/Frappe，46★ | 2025-11-04（维护减弱，仓库已迁址） | 只看形态：工单卡片网格、状态色块（进行中/完成）、KOT 小票打印 | 是"接单"形态不是"备料"形态，弱相关；AGPL 且维护弱 |

## 逐项：图/链接 + 借鉴点

### 1. meez —— 培训卡 + 备料单的形态标杆（闭源，只看）
- 形态链接：[Recipe training app](https://www.getmeez.com/recipe-training-app)（"Train teams 70% faster with visual recipes"，每步可嵌照片和视频）；界面截图：[guideflow 评测里的 meez 截图](https://cdn.prod.website-files.com/66ccf78be99d9f56e3f51096/6a79cab58900af4f0898ac5b_screenshot_3ef63f76.webp)；定价页确认含 "Prep step slideshow" 与 "Print recipes & sub-recipes"（[Back of House 评测](https://backofhouse.io/vendors/meez)）。
- 借鉴点：**"菜谱即培训卡"**——每个 prep step 一张图 + 一句话，平板上步进播放；prep list 按站点汇总当天任务；菜谱可直接打印。这正是 CanteenOS "切成什么样+配图"的商用标准答案。

### 2. Mealie —— 开源 cook mode 的最佳形态（AGPL，只看）
- 链接：[github.com/mealie-recipes/mealie](https://github.com/mealie-recipes/mealie)（13,144★，2026-09-05 核实当天仍有提交）；在线 demo：demo.mealie.io。
- 借鉴点：cook mode 一屏一步、字号大、防熄屏；菜谱打印视图干净；多语言用 Crowdin 众包（乌克兰语社区翻译可借鉴其 i18n 组织方式）；份量一键缩放滑块。注意：评测明确指出**无离线模式**，离线要我们自己做（[cooklang.org 的 Mealie 评测](https://cooklang.org/blog/40-mealie-review/)）。

### 3. Cooklang —— 最值得抄的数据模型（MIT，可复用）
- 链接：[cooklang.org](https://cooklang.org/)、[github.com/cooklang/spec](https://github.com/cooklang/spec)（MIT，695★）、[github.com/cooklang/cooklang-rs](https://github.com/cooklang/cooklang-rs)（MIT，123★）。
- 借鉴点：把配料、数量、工具、计时器**内嵌进步骤纯文本**（`把 @土豆{2%kg} 切成 1cm 丁`）。一份文本同时渲染出：步骤视图（cook mode）、配料汇总（备料单）、购物清单。对"今天要切什么、切成什么样"这种"文本+结构化注解"的场景是天然数据格式；MIT 解析器可直接用。

### 4. Grocy —— 可直接抄代码的 MIT 实现
- 链接：[github.com/grocy/grocy](https://github.com/grocy/grocy)（MIT，9,454★，2026-09-04 有提交）。
- 借鉴点：菜谱↔配料↔单位换算↔清单的完整数据模型与打印视图都是 MIT，可抄实现（尤其单位换算与"按份量缩放数量"的算法）。不抄 UI：它是仓库管理式密集表格。

### 5. KitchenOwl —— 离线优先架构形态（AGPL，只看）
- 链接：[github.com/TomBursch/kitchenowl](https://github.com/TomBursch/kitchenowl)（3,662★，2026-08-29）。
- 借鉴点：Flutter 端"本地 SQLite 先读写、后台同步"的离线优先模式，厨房断网照常看单；清单勾选按钮特大、误触少。我们 Web/PWA 可用同样思路（IndexedDB + Service Worker）。

### 6. 经典纸质 prep sheet 模板 —— A4 打印版的列结构
- 链接：[WebstaurantStore: Kitchen Prep Lists](https://www.webstaurantstore.com/article/583/kitchen-prep-lists.html)（免费模板下载）；[Qwick 模板](https://www.qwick.com/blog/kitchen-prep-list-template/)列结构：Date / Name / **Station** / Item / On Hand / Par / Need；[Chefs-Resources prep sheets](https://www.chefs-resources.com/kitchen-forms/prep-sheets/)（Excel 下载）。
- 借鉴点：打印版照抄行业既有列结构，厨师零学习成本；**On Hand / Par / Need 三列**直接回答"还要切多少"。需要我们在 Item 旁加一列"成品图/切法图"，这是传统模板没有的。

### 7. Galley / Apicbase —— 生产单形态（闭源，只看）
- 链接：[Galley CRP 平台](https://www.galleysolutions.com/crp-platform-overview)（"one-click prep lists"、按时间/库存排产）；[Apicbase](https://www.get.apicbase.com)（production planning 模块）。
- 借鉴点：备料单本质是一张"按日期 × 站点汇总的生产任务单"——这点与商用 CRP 一致，验证我们的信息架构方向；其批量/中央厨房形态偏重，不照抄。

### 8. 打印/出图技术栈（全部宽松协议，可复用）
- **浏览器直打**：`@page { size: A4; margin: 0 }` + `media print` 打印样式，零依赖——贴墙 A4 首选。
- **html2canvas + jsPDF**（均 MIT）：前端 5 行代码把备料单 DOM 转 PNG/PDF——"生成图片发微信"首选（[实现示例](https://itnext.io/javascript-convert-html-css-to-pdf-print-supported-very-sharp-and-not-blurry-c5ffe441eb5e)）。
- **Puppeteer**（Apache-2.0）：服务端 headless Chrome 出 A4 PDF/长图，排版最稳（[教程](https://ricoberger.de/blog/posts/convert-html-to-pdf-png-with-puppeteer/)）。
- **WeasyPrint**（BSD-3）：若后端用 Python，HTML+CSS→A4 PDF 质量高、支持 @page。
- 借鉴点：同一份 HTML 模板，屏幕端是卡片、打印媒体查询切成 A4 黑白大字版，一次维护两种输出。

### 9. RecipeSage —— 离线 PWA 菜谱形态（协议不明，只看）
- 链接：[github.com/julianpoy/RecipeSage](https://github.com/julianpoy/RecipeSage)（950★，2026-09-05 有提交；仓库未见标准 LICENSE 文件，按"只看形态"处理）。
- 借鉴点：self-hosted PWA，装到手机主屏、离线可看菜谱——证明"菜谱 PWA 离线"在家用场景已被验证，我们厨房场景照搬交互即可。

### 10. URY Mosaic —— KDS 工单形态（AGPL，弱相关，只看）
- 链接：[github.com/ury-erp/mosaic](https://github.com/ury-erp/mosaic)（46★，2025-11-04 后维护减弱，官方标注迁址）。
- 借鉴点：工单卡片网格 + 高对比状态色块 + KOT 小票打印。但 KDS 是"实时接单队列"，与"今日备料静态清单"不同，仅借其大色块工单视觉。

## 结论（一句话）

备料单界面该长什么样：**一屏（或一纸 A4）= 一个站点今天的任务清单，每行一项 = 超大字名称+数量（Need 列）+ 切法成品图；点开任意一项进入一屏一步的 cook mode（大图占半屏、一句话乌克兰语、特大上/下一步按钮、防熄屏），同一份 HTML 用 print CSS 直接打出 A4 黑白大字版贴墙——形态对标 meez 培训卡 + Mealie cook mode，数据格式用 Cooklang 式"步骤内嵌配料"，打印列结构照抄经典 Station/Item/On Hand/Par/Need。**

## 风险

- **协议**：形态最好的三个（Mealie、KitchenOwl、URY Mosaic、Tandoor）均为 AGPL-3.0（Tandoor 还叠加 Commons Clause），只能看形态，抄代码会污染 CanteenOS；RecipeSage 未见标准协议文件，同样只看。可复用代码仅限 Grocy（MIT）、Cooklang spec/rs（MIT）、html2canvas/jsPDF（MIT）、Puppeteer（Apache-2.0）、WeasyPrint（BSD）。
- **维护**：URY Mosaic 已停止原仓库维护（2025-11 后迁址）；receptik 等小型离线菜谱 PWA 星数极低（1★），仅作交互参考不可依赖。Cooklang 解析器提交频率中等（2026-06/07），需评估是否自维护 fork。
- **形态缺口**：所有现成方案都没有"切法图示"这一列/这一步的现成设计——meez 的步骤图最接近，但"切丁 vs 切丝"的规格化图示需要 CanteenOS 自行定义，这是差异化点也是工作量。
