# v2 调研总索引（2026-09-05）

> 按 [research-brief-v2.md](../research-brief-v2.md) 执行的 8 场景调研汇总。每份场景报告含候选清单（协议/star 数/最近提交均于 2026-09-05 经 GitHub API 核实）、结论与风险。硬规则已执行：代码复用仅 MIT/Apache-2.0/BSD/MPL；数据协议标传染性；找不到就写"没找到"。

## 各场景结论一览

| 场景 | 报告 | 结论（一句话） |
|---|---|---|
| A 食材三语种子数据 | [scenario-a](scenario-a-ingredient-seed-data.md) | **Wikidata（CC0）为主源**：30 个抽样食材 uk 标签实测 **83.3%**（达标 ≥70%），zh 96.7%，图片 90%；缺的恰是中国特有条目（小葱/生抽/老抽）留给师傅补。OFF（ODbL 传染、uk 仅 9.5%）只作同义词参考；乌克兰官方食品词表**没找到**开放版 |
| B 中餐技法词表 | [scenario-b](scenario-b-technique-vocabulary.md) | **必须自建**：以《中式烹调师国家职业技能标准》定中文骨架，英文维基+DB51/T 2502+深圳译写规范三源互证英文，FoodOn（CC BY 4.0）做机器对齐；四层约 80 项（刀法 16/成形 22/预处理 18/加热 24）。结构化现成词表、刀工开放图集**均没找到**（图建议自绘 SVG） |
| C 视频→菜品包+关键帧 | [scenario-c](scenario-c-video-to-dishpack-keyframes.md) | **宽松协议可拼出 MVP**：yt-dlp → WhisperX（large-v3，中/英/乌）词级对齐 → Qwen3-VL-7B+/Gemini（JSON Schema 约束+时间窗） → PySceneDetect+Laplacian 清晰度+pHash 去重抽帧。关键帧双路定位：VLM temporal grounding ∪ 语音关键词时刻，±2s 交叉校验。待裁决：yt-dlp 为 Unlicense |
| D 净料率与缩放 | [scenario-d](scenario-d-yield-data.md) | **USDA（公有领域，约 2900 条，链式 AP/EP 模型）打底** + 乌克兰 норми відходів 补季节分档；中文系统性免费净料率表**没找到**；所有开源库均无 AP/EP 模型，**须自建**（`yield` 分阶段记录+损耗类型枚举：按重量连乘/按批次固定/按个数缩放） |
| E 备料单形态 | [scenario-e](scenario-e-prep-list-ui.md) | 形态答案：**一屏/一纸 A4 = 一个站点今天的任务**，超大字+成品图，点进去一屏一步防熄屏 cook mode，print CSS 直出 A4。最值得抄：meez 培训卡（闭源只看形态）、Mealie cook mode（AGPL 只看形态）。可复用代码仅 Grocy/Cooklang/html-to-image/jsPDF 等 MIT 系 |
| F 采购单生成与分享 | [scenario-f](scenario-f-purchase-order-sharing.md) | **数据模型抄 Grocy**（供应商用字符串、qu_factor 包装系数、按供应商分组只在渲染层做）；"按包装取整+起订量"组合逻辑无现成开源，**自写 <100 行**。分享双通道：纯文本微信消息为第一交付物，图片用 html-to-image（MIT）在 PWA 内出 PNG |
| G 文件即数据库 | [scenario-g](scenario-g-files-as-database.md) | **走得通**：Decap/Keystatic/PagesCMS 与 electron/apps 式"一实体一文件+CI 校验"数据仓库均验证过。前提三件套：schema 校验 CI、图片压缩管线、实体分片。**不能用 Git LFS**（与"拷贝文件夹同步"互斥） |
| H 三语机翻工作流 | [scenario-h](scenario-h-translation-workflow.md) | **DeepL API + Glossary v3 术语硬约束 + 状态标记脚本**（human 不覆盖、source_hash 增量才翻）近零成本起步；en 有《中文菜单英文译法》做种子；uk 菜名对照表**没找到**，以 en 为枢轴自建 |

## 跨场景发现（影响架构决策）

1. **AGPL 陷阱比预想的多**：Mealie/KitchenOwl/Tandoor（菜谱）、Weblate（本地化）、calibreapp/image-actions（图片压缩）、EPIC-KITCHENS 动作模型（CC BY-NC）全部只能看模型——形态参考丰富，代码复用必须自写或用 MIT 系。
2. **"没找到"清单本身就是结论**：乌克兰官方食品词表、结构化中餐技法词表、刀工开放图集、中文免费净料率表、uk 菜名对照表——这 5 个空白均需自建，且都是我们的差异化资产（词表/净料率/uk 对照一旦建出来就是壁垒）。
3. **图片许可警示**：Wikidata Commons 食材图 77.8% 是 CC BY-SA（有传染性），种子图片策略需单独决策（署名方案 or 只用 PD/CC0 的 23%）。
4. **三件套是阶段 1 的隐形门槛**：schema 校验 CI（已有）、图片源头压缩+硬上限（需自建 Action，现成的 GPL）、实体分片目录——文件即数据库路线成立，但这三件套不齐就会翻车。
5. **中国特有食材恰好是 Wikidata 缺口**：小葱/生抽/老抽无 uk 标签——我们的知识库从第一天起就是在补公共数据的洞，这些修正应回传 Wikidata（CC0 互利）。

## 附带产物（本目录）

- `wikidata_probe.py` / `wikidata_probe2.py` / `off_probe.py` + `*_result.json`：场景 A 的实测脚本与原始结果，300 种食材正式拉取时改 QID 清单即可复跑。
- `ingredients.txt`（2.7MB，OFF taxonomy 原始 dump，ODbL）：**不入库**（已 gitignore），仅本地参考。
