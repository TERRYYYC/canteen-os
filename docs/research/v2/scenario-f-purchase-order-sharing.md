# 场景 F：采购单生成与分享（调研日期 2026-09-05）

候选（按推荐顺序）：

| 名称 | 链接 | 协议 | 语言/形态 | 最近活跃（核实于 2026-09-05） | 能给我们什么 | 不能给我们什么 |
|---|---|---|---|---|---|---|
| Grocy（抄模型不抄代码） | https://github.com/grocy/grocy | MIT | PHP + SQLite，自托管家庭食材管理 | 9,454 stars；最近提交 2026-09-04 | 完整的"产品→采购单位→库存→购物清单→商店→价格历史"数据模型，直接对应我们的食材/采购/现有量概念 | 它的"供应商"是主数据表而非字符串；没有最小起订量（MOQ）概念；多级单位换算图远超我们需求；整套库存/保质期/条码体系不需要 |
| bomkit（原 pyBOM） | https://github.com/robsiegwart/pyBOM | MIT | Python 单包，核心几百行 | 35 stars；最近提交 2026-06-19 | 最小 BOM→采购量参考实现：多层 BOM 展开 → 跨装配体聚合同名件 → 按包装量（Pkg QTY）向上取整出 Purchase QTY → 算小计。边界处理可抄：Pkg QTY=1 或缺失时按净需求买；数量为 0 不出行 | 无供应商分组、无 MOQ、无单位换算（同件必须同单位）；Excel 输入的形态与我们无关；代码量小但边界情况（换算失败、无供应商）是"不管"而非"处理"，需要我们自己定义 |
| html-to-image | https://github.com/bubkoo/html-to-image | MIT | TS 客户端库（SVG foreignObject 方案） | 7,228 stars；最近提交 2026-05-28 | 手机 PWA 内直接把采购单 DOM 转 PNG/JPEG，配合 `navigator.share({files})` 或长按保存发微信 | 微信内无法直接"分享图片给好友"（任何浏览器方案都不行）；iOS 对超大 canvas 有内存上限，需限宽（如 750px）×2x；外部图片/字体有跨域坑（我们全本地无此问题） |
| satori + resvg-js | https://github.com/vercel/satori · https://github.com/thx/resvg-js | MPL-2.0 / MPL-2.0 | JSX→SVG→PNG，服务端/构建时渲染 | satori 13,911 stars（2026-08-24）；resvg-js 1,983 stars（2026-06-30） | 排版输出像素级稳定，适合"出一张漂亮的采购单图"；字体手动内嵌后中文渲染可控 | 需要服务端或 WASM 运行时；CSS 只是子集（无 Grid、无伪元素）；纯手机端本地 PWA 用它偏重 |
| Playwright 截图 | https://github.com/microsoft/playwright | Apache-2.0 | 服务端无头浏览器 | 95,647 stars；最近提交 2026-09-04 | 保真度天花板，整页 HTML 截图 | 只能跑在服务端（~300MB Chromium），手机 PWA 内不可用；为本场景属于杀鸡用牛刀 |
| html2canvas | https://github.com/niklasvh/html2canvas | MIT | JS 客户端库（DOM 重绘方案） | 31,919 stars；**最后提交 2024-07-18，已两年未动，维护停滞** | 老牌方案、无 foreignObject 兼容性问题 | CSS 支持弱于 html-to-image（复杂排版易错位）；iOS 大 canvas 崩溃报告多；维护停滞，不建议新项目上 |
| ERPNext / Odoo 的 BOM→PO | — | GPL-3.0 / LGPL | 重型 ERP | — | 仅作范式参考：BOM explode → 物料需求 → 按 supplier 分组 → 询价的流水线与我们同构 | 协议不允许抄代码（GPL/LGPL 不在白名单），体量与状态机正是我们明确不做的部分 |

## Grocy 字段 → 我们字段 对照表

数据源：Grocy migrations（0001–0256，master 分支，2026-09-05 稀疏克隆核实）。

| Grocy 字段（表） | Grocy 语义 | 我们字段 | 差异/决策 |
|---|---|---|---|
| `products.shopping_location_id` → `shopping_locations` 表（id, name, description） | 默认购买商店，外键到商店主数据；购物清单按它分组展示 | `ingredient.purchase.supplier`（字符串） | 我们不做供应商主数据表，字符串即可；分组键就是字符串本身。注意重名/改名问题（"老张菜摊"改名后历史单不动） |
| `products.qu_id_purchase` + `qu_id_stock` + `qu_factor_purchase_to_stock` | 采购单位、库存单位、换算系数（1 箱 = 24 瓶） | `ingredient.purchase.packSize` + `packUnit` | 同构：packSize 即 qu_factor，packUnit 即 qu_id_purchase。Grocy 价格按 stock QU 记、展示按 purchase QU 换算——我们 lastPrice 直接按"每包"记，更贴合菜贩报价习惯 |
| `quantity_unit_conversions`（from_qu_id, to_qu_id, factor, product_id 可空=全局） | 单位换算图，v4.0 起支持多级推导（茶匙→毫升→升） | 无（不抄） | 多级换算图对我们过度设计。**换算失败边界**：Grocy 的做法是无路径直接报错阻断；我们降级策略——某行 BOM 单位与采购单位无法换算时，该行进"待人工确认"区，采购单其余行照常生成，不整单失败 |
| 无 MOQ 字段；仅购物清单设置"Round up quantity amounts to the nearest whole number" | 只支持取整到整数，不支持最小起订量 | `ingredient.purchase.minPacks` | 我们的增量：packs = max(minPacks, ceil(净需求 / packSize))。bomkit 同样只有 ceil 无 MOQ，此逻辑需自写（约 3 行） |
| `stock.price` + `stock_log.price` + 视图 `products_price_history`（按时间、商店记录每次采购价） | 完整价格历史，末次价由流水推导 | `ingredient.purchase.lastPrice` | 只记最近一次价（下单纯估价用），不记历史。Grocy 教训（changelog 实证）：0 元/空价格流水会污染末次价——我们更新 lastPrice 时跳过 0 和空值 |
| `stock_current` 视图（`SELECT product_id, SUM(amount)`） | 现有库存聚合视图 | `trackStock` + `onHand` | 我们只对耐放品记一个数，无批次/保质期/位置。缺货公式与 Grocy `recipes_pos_resolved` 视图同构：净需求 = ΣBOM 需求 − onHand（trackStock=false 时不减） |
| `shopping_list`（product_id, amount, qu_id, done, shopping_list_id） | 购物清单按产品聚合；**按店铺分组只是 UI 层按 product 的默认商店做的，不落库** | 采购单生成时按 supplier 分组，同样不落库 | 同构验证：分组是渲染层行为，不是数据结构。无供应商的食材（supplier 为空）：Grocy 归入"未分配商店"组照常显示——我们照抄此行为，归入"未指定供应商"组，标黄提示 |
| `recipes_pos_resolved` 视图的 `need_fulfilled_with_shopping_list` | 需求满足判断会扣除"已在购物清单上的量"，防重复加购 | 无（单次生成，无此问题） | 我们的采购单是一次性快照，天然无重复加购问题，不抄 |

## 图片导出方案对比（一行一个）

- **html-to-image（推荐）**：MIT、维护中、PWA 内同步出 PNG，配合 Web Share API（iOS Safari 15+ / Android Chrome 支持 `navigator.share({files})` 调起系统面板选微信）+ 长按保存兜底，是手机端唯一零服务端方案。
- **纯文本微信消息（并列推荐）**：零依赖、菜贩最爱（可直接复制/语音念），`按供应商分组 + 品名 数量 单位` 的纯文本应作为第一交付物，图片是增强不是必需。
- **satori + resvg-js（有服务端时的精致路线）**：MPL-2.0（白名单内）、排版像素级稳定、中文字体需手动内嵌（Noto Sans SC 子集约 1–2MB），适合后续做"打印版/A4 版"。
- **Playwright 截图（不推荐本场景）**：Apache-2.0、保真最高但必须服务端跑 Chromium，为一张采购单图引入 300MB 依赖不值。
- **html2canvas（不推荐）**：MIT 但 2024-07 后停更，CSS 支持弱、iOS 大 canvas 易崩，同赛道被 html-to-image 替代。
- **微信现实约束（所有方案共有）**：浏览器/PWA 无法直接调起"发图片给微信好友"，落地路径只有两条——Web Share API 系统分享面板，或用户长按保存后到微信发图；文案设计上两条路径都要给按钮。

## 采购单模板样例（中文餐饮）

来源 A：用友畅捷通《厨房采购单表格模板》(https://hsy.chanjet.com/wenku/wk4afe47cf14c5.html)
表头字段：采购日期、采购编号、采购人、供应商名称、采购类别；明细字段：品名、规格型号、单位、数量、预计单价、总价、备注（备注用于"需当日送达""优先有机"等特殊要求）；单位规范建议用"千克/升/包/箱"等标准单位，杜绝"斤/两/桶"等模糊表述（但我们场景恰恰要迁就菜贩习惯，"斤/把/袋"反而要保留）。

来源 B：《餐饮管理》教材采购标准单 (http://oss0.changxianggu.com/book/chapter/269_9787040439564.pdf)
字段：原料编号、产地、品名、等级、大小/个数、色泽、数量要求、最高限价、以往最低价格、填表人、使用部门——"以往最低价格"字段与我们的 lastPrice 用法一致（下单时给采购员一个砍价锚点）。

**我们的落地排版建议（微信图片/文本兼用）**：

```
【采购单】9月6日 · 老张菜摊
────────────────
土豆        10 斤
西红柿      8 斤（要沙瓤）
鸡蛋        2 板（30枚/板）
────────────────
共 3 样 · 预估 ¥85（按上次价）
← 未指定供应商 →
干辣椒      1 袋
```

要点：一个供应商一张图/一段文本（转发动作 1:1）；数量在前单位在后；备注括号跟在品名后；总价标"预估"避免纠纷；未指定供应商的食材单独成组，不混入。

结论：数据模型抄 Grocy（商店=字符串、包装系数、lastPrice 跳 0、分组在渲染层），取整+MOQ 逻辑 3 行自写，导出用"纯文本为主 + html-to-image 出 PNG"双通道。

风险：
- 协议：html-to-image / html2canvas / bomkit / Grocy 均为 MIT，satori / resvg-js 为 MPL-2.0，均在白名单内；ERPNext（GPL-3.0）与 Odoo（LGPL）只能看模型，已按范式参考处理。
- 维护：html2canvas 已停更（2024-07），仅作备选记录；bomkit 体量小（35 stars），只参考思路不引入依赖；Grocy、satori、html-to-image、Playwright 均活跃（2026 年内有提交，核实于 2026-09-05）。
- 未找到：几百行以内、同时覆盖"供应商分组 + MOQ + 单位换算失败降级"的开源实现——没找到现成的，该组合逻辑需自写（估计 <100 行）。
