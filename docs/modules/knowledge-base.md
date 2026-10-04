---
feature_ids: [team-meals, knowledge-base]
topics: [sqlite, recipes, materialization, compatibility]
doc_kind: module-contract-index
created: 2026-10-05
---

# 菜谱知识库：日常写入与固定发布资料

**当前真源：** 日常来源捕获、候选、Recipe 及不可变修订由独立 SQLite 知识库维护；Git 中的 `data/` 保存明确采用版本后的固定依赖与旧资料。日常编辑不需要 Git commit，合并工程 PR 不等于厨师批准菜谱。现行边界见 [当前工作合同](../current-contract.md)、[ADR-0009](../adr/0009-sqlite-knowledge-base.md) 和叠加候选的 [ADR-0010](../adr/0010-knowledge-source-access.md)。

**English.** SQLite owns everyday recipe/candidate edits, immutable revisions and source evidence. Git owns explicitly frozen publication dependencies and legacy records. Engineering PR acceptance is separate from chef approval; editing a recipe does not silently update an old published menu.

知识库源码、服务和数据库属于独立本地工程；CanteenOS PR #120/#121 提供接入和固定桥，不代表其包含完整配套源码或已经部署。发行的私有配套源码白名单包、manifest 与实际版本由发布负责人独立核对，具体边界见当前工作合同。

## 当前使用合同与待完成通路

- 菜谱身份和版本独立；同名菜不自动合并。来源原文、媒体 hash、原方与厨房修订可追溯。`needs_review` 候选须师傅阅读确认，不能由 agent 批量批准来生成正式菜单。
- 正式采用以 `recipeId + version` 和完整依赖快照为核心；收藏来源、手工新建和旧导入应有等价核定/采用入口。当前集成仅有收藏候选特例，正式编辑器下一步与版本采用由 [#124](https://github.com/TERRYYYC/canteen-os/issues/124) 跟踪，不声明通用路径已完成。
- 标准食材需显式映射，稳定身份与依赖快照版本分开；采购规格、必要换算、净料率和厨房技法/准备时机/切配规格需合法核定。当前转换存在身份/规格断点，由 [#125](https://github.com/TERRYYYC/canteen-os/issues/125) 跟踪；同名字符串不能代替材料身份。
- 份数、用量、时间缺失继续未知；已录食材和调料全部进入人工采购判断。旧 readiness 的“能算”不能变成“能人工排菜”的门槛。
- 已发布菜单固定旧 Recipe 版本和依赖；新 KB 修订不原地改变旧菜单。已有采购清单保留自己的 basis 和人工状态，来源变化由用户复核。
- Recipe 列表、明细、历史、来源正文及原片参考图按 ADR-0010 的候选权限仅师傅/管理员可读；采购/帮厨使用已发布投影。参考图与公开菜照分开，使用权未确认不公开。

当前工程/部署/厨师审批分别验收，整体入口为 [#128](https://github.com/TERRYYYC/canteen-os/issues/128)。下面保留第一轮 Git v2 模型与流程以供旧数据/数值引擎兼容；旧“PR 即审核”“Git 历史即 Recipe 版本”“目录即日常知识库”不再是 SQLite 日常工作规则。schema 具体字段始终以仓库 `schemas/` 为准。

---

## 1. Git v2 历史模型与兼容参考

### Ingredient（食材/调料）——`data/ingredients/<id>.json`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| schemaVersion | `"2"` | ✅ | 实体 schema 版本（v2 收窄后升 2） |
| name | I18nString | ✅ | 三语名；种子数据来自 Wikidata（场景 A，uk 抽样覆盖 83.3%） |
| image | ImageRef | | `{src, license, author?, sourceUrl?}`（`common.schema.json#/$defs/ImageRef`，v0.1 统一）——CC BY-SA 裁决的落实，`license` 必填；Commons 来源须填 `sourceUrl` |
| externalId | `Q\d+` | | Wikidata QID |
| baseUnit | `g\|ml\|pcs` | ✅ | 聚合基准单位：按重量 / 按体积 / 按个数 |
| pcsToGram | number >0 | | 一个多少克（pcs↔g 唯一换算依据；无独立量纲实体） |
| yield | 0–1 | | 净料率单一数字，**仅按重量/体积食材**；pcs 食材不得设置。初始值参考 USDA/乌表（场景 D），实测回填 |
| purchase | object | | `{supplier(字符串), packSize, packUnit, minPacks?, lastPrice?}`；缺失 = 不能算采购 |
| trackStock | bool | ✅ | 仅耐放品为 true |
| onHand | number ≥0 | | 现有量（baseUnit 计），仅 trackStock=true 时有意义 |

### Technique（中餐技法词表）——`data/techniques.json`（单文件合集）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | Id | ✅ | 词表内唯一，被 `techniqueRef` 引用 |
| kind | enum | ✅ | `cut`（刀法与成形）/ `heat`（加热烹调法）/ `pretreat`（预处理与着衣） |
| name | I18nString | ✅ | 中文权威（《中式烹调师国家职业技能标准》骨架）；英文三源互证（DB51/T 2502 · 深圳译写规范 · en.wiki） |
| image | ImageRef | | 刀工示意图（计划自绘 SVG，场景 B：开放图集没找到）；schema 仍经 `Image` 兼容别名引用，结构同 ImageRef |
| note | I18nString | | 一句话定义/操作要点（自写） |

首批 32 个高频条目已入库（滚刀块、丝、丁、片、焯水、上浆、爆炒等），按场景 B 四层骨架（刀法 16/成形 22/预处理 18/加热 24）逐步补到约 80 项。**本词表是视频解析 skill 的输出闭集**：解析输出的 `techniqueRef` 只能是表内 id。

### Dish（菜品）——`data/dishes/<id>.json`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| schemaVersion | `"2"` | | 建议带；缺省兼容 |
| name | I18nString | ✅ | **唯一必填**——一道菜只有名字也能导入 |
| description | I18nString | | 一句话简介（v0.1 新增，可选）；菜单页抽屉展示 |
| image | ImageRef | | 成品图 `{src, license, author?, sourceUrl?}` |
| baseServings | int ≥1 | | 配方基准份数，食堂尺度（如 50） |
| components[] | object | | `ingredientRef + qty{value,unit} + prep?{techniqueRef, size?, timing?, note?, image?(ImageRef)} + confidence?`；`prep.timing` ∈ `day-before \| morning \| before-service`（v0.1 新增，可选），备料单按它分组，缺省归「早上」 |
| steps[] | object | | `text(I18nString) + techniqueRef? + image?(ImageRef) + clip?{videoUrl,start,end}` |
| provenance | object | | `{source: manual\|video\|example, videoUrl?}`；视频来源必填 videoUrl；`example`（v0.1 新增）= 设计稿/演示示例菜，构建时排除、不得当真实数据发布 |
| status | enum | | `draft`（缺省）/ `active` / `archived`；只有 active 参与菜单与采购推导 |

## 2. 旧数值引擎的 readiness 关卡

数据不拒绝不完整；按用途设关卡（research-brief-v2 §0），引擎侧 `readiness(dish)` 计算（见 [procurement.md](procurement.md) 与 `packages/core`）：

| 关卡 | 含义 | 判据 |
|---|---|---|
| 能教（teach） | 能出备料单教帮厨 | 所有 component 带 `prep.techniqueRef`，steps 非空 |
| 能排（plan） | 能排进菜单算份数 | `baseServings` 与全部 `components[].qty` 齐备 |
| 能采（buy） | 能算采购 | 所有 `ingredientRef` 指向的食材都有 `purchase` |

这些判据描述旧数值引擎能否计算，不是当前人工排菜/采购的必填门槛。缺量、适量和缺规格仍须保留在人工清单，具体合同见上方当前入口。

## 3. 历史 Git 状态与编辑流程（2026-09-07）

- 状态机收窄为 `draft → active → archived`：**git PR 即人工确认队列**——视频导入的菜一律 `draft`，师傅审 PR、合并即 `active`；无独立 review 状态、无 `version` 字段（git 历史即版本）。
- 编辑入口（2026-09-07 更新）：**v0.3 起师傅用 `/admin` 后台**（排菜单、新食材、手动加菜、发布/回退），后台通过云函数把 JSON 提交进 `data/`（ADR-0007，只准写 `data/**`）；Terry 与 agent 仍可直接改 JSON 提 PR；`python3 scripts/local-validate.py` 与 CI 双闸兜底（schema 校验 + 跨文件引用检查）。视频导入的草稿第一轮仍走命令行 + PR。设计稿：`docs/design/backoffice-v1.html`。
- 同步：线上 = git pull；线下/无网 = 拷贝整个 `data/` 文件夹。**不用 Git LFS**（与拷贝文件夹同步互斥，场景 G 已知坑 #1）；图片源头压缩 + 单图硬上限。

## 4. 历史 JSON 视频导入契约

视频解析 skill **直接输出 `data/dishes/<dish>.json`（status=draft）+ `images/<dish>/` 目录**（契约见 [skills/video-recipe-ingest/SKILL.md](../../skills/video-recipe-ingest/SKILL.md)）：

- 每个配料"被切的几秒"截帧 → `component.prep.image`；每个步骤带 `clip{videoUrl,start,end}`；
- 置信度留在 `components[].confidence`（<0.85 的字段在 PR 描述里列出，人工确认）；
- 技法输出必须是 techniques.json 闭集内的 `techniqueRef`；
- 解析引擎 Gemini 主 / Qwen 备（ADR-0006 裁决），格式与引擎解耦。

## 5. 边界情况

| 情况 | 处理 |
|---|---|
| 菜只有名字 | 合法入库（draft）；readiness 三关卡全红，显示为待办 |
| component 引用不存在的食材 | 本地校验/CI 直接报错（跨文件引用检查）；导入时先补食材或改映射 |
| techniqueRef 不在词表 | 校验报错；解析 skill 必须先扩词表（走 PR）再引用 |
| 食材缺 purchase | readiness「能采」不过；采购引擎归入「未指定供应商」单并告警（procurement.md §4） |
| pcs 食材设了 yield | 校验报错（pcs 不套 yield） |
| 供应商改名 | 改 `ingredient.purchase.supplier` 字符串即可；历史 PO 快照不受影响（这正是字符串化的目的） |
| 图片许可 | image 必须带 `license`（ImageRef；Commons 等外部图另填 `sourceUrl`，自摄/截帧 `own` 可省略）；CC BY-SA 图展示时按许可署名（ADR-0006） |
| 多语言名称缺失 | I18nString anyOf 保证至少一语言；展示走 fallback 链（见 i18n.md）；翻译状态查 translations.lock.json |

## 6. 第一轮开放问题（历史，不直接成为本轮任务）

1. 半成品/子菜谱（递归 BOM，如高汤）是否引入 components 的 `dishRef` 分量类型？当前只支持 ingredientRef。
2. 约 300 种食材的 Wikidata 种子拉取批次与师傅校对工作流（场景 A 脚本即改 QID 清单可复跑）。
3. 词表从 32 补到约 80 项的节奏；刀工 SVG 图集谁来画。
4. 顾客菜单需要的过敏原信息落在哪个字段（EU 14 类，v2 模型暂未收录）——阶段 1 出菜单前定。
