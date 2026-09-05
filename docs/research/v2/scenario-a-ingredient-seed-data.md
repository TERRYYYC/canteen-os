# 场景 A：食材三语名 + 图片的种子数据（调研日期 2026-09-05）

目标：约 300 种中餐常用食材/调料的 zh/en/uk 三语名 + 照片，师傅只改不对的。
实测方式：Wikidata `wbsearchentities` + `wbgetentities` + SPARQL 端点（https://query.wikidata.org/sparql ）三线实测；Open Food Facts taxonomy 全量下载实测；GitHub API / 仓库页实测。所有数字均为 2026-09-05 当天跑出来的原始结果（脚本与原始 JSON 存于本目录 `wikidata_probe*.py`、`wikidata_probe*_result.json`、`off_probe.py`、`ingredients.txt`）。

## 候选（按推荐顺序）

| 名称 | 链接 | 协议 | 语言/形态 | 最近活跃 | 能给我们什么 | 不能给我们什么 |
|---|---|---|---|---|---|---|
| **① Wikidata + Wikimedia Commons（主推）** | https://www.wikidata.org | Wikidata 数据 **CC0 1.0**（可商用无署名义务）；Commons 图片**逐文件**协议（本次抽样分布见下，77.8% CC BY-SA **有传染性**） | 结构化实体（QID），zh/en/uk 标签 + P18 图片 | 持续活跃（本次为 2026-09-05 实时数据） | 三语名（抽样 uk 83.3%、zh 96.7%）、每物一图、QID 主键、SPARQL/API 批量拉取、无配额费的公开端点 | 生抽/老抽/小葱等中国专属条目 uk 缺失；部分实体需人工消歧；图片 CC BY-SA 需署名 |
| ② Open Food Facts ingredients taxonomy | https://github.com/openfoodfacts/openfoodfacts-server → `taxonomies/food/ingredients.txt` | 数据库 **ODbL 1.0（有传染性）**、内容 Database Contents License、产品图 CC BY-SA（据 https://ua.openfoodfacts.org/data ，2026-09-05 核）；仓库代码 AGPL-3.0 | 平铺 DAG 文本，6678 个条目 | 仓库日更（GitHub org 页显示 2026-09-05 有更新） | 6678 条目的多语对照（en 70.5%）；已有 uk 翻译 632 条、zh 789 条；`wikidata:en: Qxx` 属性可回链 Wikidata | uk 覆盖仅 **9.5%**、zh 11.8%；**中国酱料几乎空白**（oyster sauce / hoisin / douban / fermented black bean 实测 0 条）；ODbL 传染性 |
| ③ Anduin2017/HowToCook（程序员做饭指南） | https://github.com/Anduin2017/HowToCook | **Unlicense**（可商用） | Markdown 菜谱，中文 | ★102,146、最近提交 2026-09-03（GitHub API，2026-09-05 核） | 高质量中文食材名 + 用量语料，可抽取 300 种清单的 zh 侧种子与常用性排序 | 只有中文，无 en/uk、无图片；是菜谱不是食材库 |
| ④ WikiFCD | https://wikifcd.wikibase.cloud | **CC0**（据 CEUR-WS Vol-2969 论文原文） | Wikibase 实例（同 Wikidata 软件栈），英文为主 | 2021–2024 论文持续发表；站点在线（2026-09-05 核） | 形态参考：Wikibase + 联邦 SPARQL + 与 Wikidata/FoodOn 映射；未来接营养成分时是 CC0 数据源 | 无 zh/uk 名称；定位是食物成分而非食材名录 |
| ⑤ ngl567/CookBook-KG（爱食光） | https://github.com/ngl567/CookBook-KG | **无 LICENSE 文件**（master/main 均 404，2026-09-05 实测）→ 只能看模型 | 中式菜谱知识图谱（mini 50 菜品 / pro 宣称 8000+） | 项目自 2020 年起，pro 版"开发中"；最近提交未核实（GitHub API 限流） | 看形态：菜品-主料/辅料/配料关系建模、实体对齐思路 | 无协议不能复用数据/代码；无 en/uk；star 数未核实 |
| ⑥ Sanotsu/china-food-composition-data | https://github.com/Sanotsu/china-food-composition-data | README 明示"所有版权归原书作者所有，脚本仅用于个人学习研究"→ **不能商用，只能看模型** | 《中国食物成分表标准版（第6版）》1677 条 JSON | 2025-07 仍有更新（README）；star 未核实（API 限流） | 看形态：中文食物分类体系（61 类）、营养成分字段设计 | 版权归原书，不可入库；无 en/uk、无图片 |
| ⑦ FoodOn 本体 | https://github.com/FoodOntology/foodon | 仓库根 LICENSE 文件 404（2026-09-05 实测），协议状态存疑 | OWL 本体（foodon.owl 40 MB，2026-09-05 实测） | 有持续维护（2026 年仍被第三方引用） | 食物分类层级形态参考 | 实测多语言标签：uk 仅 **3** 个、zh 14 个、ru 6 个、fr 30 个 → uk/zh 覆盖≈0，不可用 |
| ⑧ 乌克兰官方/民间食品词表 | — | — | — | — | **没找到**结构化开放的乌克兰官方食品成分表或 uk 食品分类词表 | 搜到的只有文章型清单（MICHELIN Guide、GUkraine 等，非结构化、非开放协议）与乌克兰食品标签法规（要求 uk 语标签，USDA FAS 报告）。规模化 uk 名称实际只有 Wikidata 与 OFF 两个来源 |

## ① Wikidata 30 个抽样食材实测表（2026-09-05）

方法：先用中文检索词 `wbsearchentities`（language=zh）定位实体（top1 撞错实体的在 top3 内人工纠正），再 `wbgetentities`（languages=zh|en|uk）取标签与 P18 图片，最后 SPARQL `VALUES` 查询交叉验证 uk 标签（端点返回 30/30，与 API 结果一致）。

**uk 覆盖：25/30 = 83.3% 有真正乌克兰语译名；27/30 = 90% 含拉丁学名占位；3 个完全缺失（小葱、生抽、老抽）。zh 29/30 = 96.7%。P18 图片 27/30 = 90%。**

| # | 食材 | QID | en 标签 | zh 标签 | uk 标签 | uk 有/无 | P18 图片许可 |
|---|---|---|---|---|---|---|---|
| 1 | 番茄 | Q23501 | tomato | 番茄 | помідор | 有 | CC BY-SA 3.0 |
| 2 | 小葱 | Q11458750 | —（三语均无标签） | — | — | **无**（专属条目无任何标签；替代方案：用葱属 Allium fistulosum） | 无图 |
| 3 | 香菜 | Q41611 | Coriandrum sativum | 芫荽 | коріандр | 有 | CC BY-SA 3.0 |
| 4 | 生抽 | Q8529545 | light soy sauce | 生抽 | — | **无** | 无图 |
| 5 | 老抽 | Q8484030 | dark soy sauce | 老抽 | — | **无** | CC BY-SA 4.0 |
| 6 | 蚝油 | Q780827 | oyster sauce | 蠔油 | Устричний соус | 有 | CC BY-SA 3.0 |
| 7 | 豆瓣酱 | Q3273096 | doubanjiang | 豆瓣醬 | Доубаньцзян | 有 | CC BY 3.0 |
| 8 | 五香粉 | Q1051492 | five-spice powder | 五香粉 | П'ять спецій | 有 | CC BY-SA 2.0 |
| 9 | 木耳 | Q107506789 | Auricularia heimuer | 黑木耳 | Auricularia heimuer（拉丁占位） | 弱（无真译名） | 无图（错误实体 Q321342 欧洲黑木耳有图，勿用） |
| 10 | 粉丝 | Q840448 | cellophane noodles | 粉丝 | Фунчоза | 有 | Public domain |
| 11 | 豆腐 | Q177378 | tofu | 豆腐 | Тофу | 有 | CC BY-SA 3.0 |
| 12 | 腐竹 | Q107036060 | fu zhu | 腐竹 | Фучжу | 有 | CC BY-SA 2.0 |
| 13 | 花椒 | Q756800 | Sichuan pepper | 四川花椒 | Сичуанський перець | 有 | CC BY-SA 4.0 |
| 14 | 八角 | Q2878644 | Illicium verum | 八角 | Бодян справжній | 有 | CC BY-SA 4.0 |
| 15 | 料酒 | Q175245 | Shaoxing wine | 绍兴酒 | Шаосинське вино | 有 | CC BY-SA 2.0 |
| 16 | 香油 | Q212317 | sesame oil | 芝麻油 | Кунжутова олія | 有 | Public domain |
| 17 | 生姜 | Q35625 | ginger | 薑 | Імбир садовий | 有 | CC BY-SA 3.0 |
| 18 | 大蒜 | Q23400 | Allium sativum | 蒜 | часник | 有 | CC BY-SA 4.0 |
| 19 | 洋葱 | Q23485 | onion | 洋蔥 | цибуля ріпчаста | 有 | CC BY-SA 3.0 |
| 20 | 土豆 | Q10998 | potato | 马铃薯 | картопля | 有 | CC BY-SA 2.0 |
| 21 | 大白菜 | Q13360268 | Napa cabbage | 大白菜 | капуста пекінська | 有 | CC BY-SA 3.0 |
| 22 | 茄子 | Q7540 | —（en 标签缺） | 茄 | баклажан | 有 | CC BY-SA 3.0 |
| 23 | 青椒 | Q201959 | Capsicum（属级实体） | 辣椒属 | стручковий перець | 有 | Public domain |
| 24 | 鸡蛋 | Q15260613 | chicken egg | 雞蛋 | яйця курячі | 有 | CC BY-SA 3.0 |
| 25 | 大米 | Q5090 | rice | 稻 | рис | 有 | CC BY-SA 3.0 |
| 26 | 糯米 | Q115443 | glutinous rice | 糯稻 | клейкий рис | 有 | CC BY-SA 4.0 |
| 27 | 白糖 | Q11002 | sugar | 糖 | цукор | 有 | CC BY-SA 3.0 |
| 28 | 干辣椒 | Q165199 | chili pepper | 辣椒 | перець чилі | 有 | CC BY-SA 4.0 |
| 29 | 桂皮 | Q204148 | Cinnamomum cassia | 肉桂 | Cinnamomum cassia（拉丁占位） | 弱（无真译名） | Public domain |
| 30 | 香叶 | Q2370943 | bay leaf | 月桂葉 | лавровий лист | 有 | Public domain |

消歧教训（实测踩坑）：直接拿英文词搜 top1 会撞实体——"tofu" 撞生化危机角色 Q69669862、"yuba" 撞加州 Yuba County、"rice" 撞姓氏、"ginger" 撞女性名字、"scallion" 撞姓氏。必须用中文检索词 + 看 top3 的 description 人工确认。

### Commons 图片许可分布（27 张 P18 图，2026-09-05 实测 LicenseShortName）

| 许可 | 数量 | 占比 |
|---|---|---|
| CC BY-SA（3.0 ×11、4.0 ×6、2.0 ×4） | 21 | 77.8% |
| Public domain | 5 | 18.5% |
| CC BY（3.0 ×1） | 1 | 3.7% |
| CC0 | 0 | 0% |

CC BY-SA 与 CC BY 均允许商用，但 CC BY-SA **有传染性**（演绎作品需同协议共享 + 署名）；需在图片元数据里逐张存 license/author/来源 URL。

### 能跑的示例查询 / 拉取脚本片段

```sparql
# https://query.wikidata.org/sparql （实测 2026-09-05 返回正常）
SELECT ?item ?zhLabel ?enLabel ?ukLabel ?img WHERE {
  VALUES ?item { wd:Q23501 wd:Q177378 wd:Q3273096 }   # 换成你的 QID 清单
  OPTIONAL { ?item rdfs:label ?zhLabel . FILTER(LANG(?zhLabel)="zh") }
  OPTIONAL { ?item rdfs:label ?enLabel . FILTER(LANG(?enLabel)="en") }
  OPTIONAL { ?item rdfs:label ?ukLabel . FILTER(LANG(?ukLabel)="uk") }
  OPTIONAL { ?item wdt:P18 ?img }
}
```

```python
# 精简版批量拉取（完整版见本目录 wikidata_probe.py，实测可跑）
import json, time, urllib.request, urllib.parse
UA = {"User-Agent": "CanteenOS-seed/1.0"}
def get(url):
    req = urllib.request.Request(url, headers=UA)
    return json.load(urllib.request.urlopen(req, timeout=40))
# 1) 中文词 → QID（注意限速：间隔 ≥0.8s，429 时指数退避）
q = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(
    {"action":"wbsearchentities","search":"豆瓣酱","language":"zh","format":"json","limit":3})
# 2) QID → 三语标签 + P18（可一次传 50 个 QID）
q = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(
    {"action":"wbgetentities","ids":"Q3273096","props":"labels|claims",
     "languages":"zh|en|uk","format":"json"})
# 3) P18 文件名 → 许可（Commons API，可批量 50 个）
q = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(
    {"action":"query","titles":"File:Doubanjiang.jpg","prop":"imageinfo",
     "iiprop":"extmetadata","format":"json","formatversion":"2"})
# 图片原图 URL: https://commons.wikimedia.org/wiki/Special:FilePath/<文件名>?width=800
```

## 结论

种子数据主源用 **Wikidata（CC0）+ Commons 图片**：中文食材清单 → `wbsearchentities` 定位 QID（top3 人工确认）→ 批量拉三语标签与 P18，抽样实测 uk 覆盖 83.3% 达标（≥70%），缺失的生抽/老抽/小葱和拉丁占位的木耳/桂皮留给师傅人工补；OFF taxonomy 仅作同义词补充（uk 9.5% 且中国酱料空白），其余来源（HowToCook、CookBook-KG、Sanotsu、FoodOn、WikiFCD）或无 uk 或协议不可用，只作形态参考。

## 风险

- **协议**：Wikidata 数据 CC0 无风险；Commons 图片 77.8% 为 CC BY-SA（有传染性，需署名 + 演绎同协议），种子库必须逐图存 license/author 字段；OFF 数据 ODbL 有传染性，混入种子库会污染整体协议，建议只读参考不直接导入；CookBook-KG 无协议、Sanotsu 版权归原书，二者均不可复用数据。
- **维护**：Wikidata/OFF/HowToCook 均活跃（2026-09 仍有提交）；CookBook-KG 停滞（2020 年起）；WikiFCD 为学术项目，长期维护力度一般。
- **覆盖率**：83.3% 是 30 个高频食材的抽样值；扩大到 300 种时，中式酱料/加工品（生抽、老抽、蚝油近亲、豆豉、甜面酱类）uk 缺失率会显著升高，预计需师傅人工补 20–40 个 uk 名；约 10% 条目 P18 无图需另找（Commons 分类页或自摄）。
