# 模块一：菜品知识库（Knowledge Base）

> **English summary.** After the v2 scope reduction ([ADR-0006](../adr/0006-scope-reduction-v2.md)) the knowledge base is simply the `data/` directory — one file per entity, filename = ID — holding **3 of the 5 entities**: `ingredients/*.json` (trilingual name, baseUnit, optional `pcsToGram`/`yield`, `purchase` spec with a plain-string supplier, `trackStock`/`onHand`), `techniques.json` (a single-file controlled vocabulary of Chinese cutting/heating/pre-treatment techniques, closed set for the video skill), and `dishes/*.json` — where **incomplete dishes are allowed** (a name alone imports fine) and a `readiness` gate reports what each dish can do: *teach* (prep specs) / *plan* (quantities) / *buy* (purchase specs). Editing: from v0.3 the chef uses the `/admin` back office (plan the week, add ingredients/dishes, publish) which commits JSON through a cloud function (ADR-0007); direct JSON edits via PR remain available to Terry and agents, and a PR is still the review queue for video-imported drafts. Supplier/UnitConversion/DishPack entities are deleted (git history keeps them).

- schema：`schemas/ingredient.schema.json`、`techniques.schema.json`、`dish.schema.json`、`common.schema.json`
- 数据：`data/ingredients/`、`data/techniques.json`、`data/dishes/`

---

## 1. 数据模型表

### Ingredient（食材/调料）——`data/ingredients/<id>.json`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| schemaVersion | `"2"` | ✅ | 实体 schema 版本（v2 收窄后升 2） |
| name | I18nString | ✅ | 三语名；种子数据来自 Wikidata（场景 A，uk 抽样覆盖 83.3%） |
| image | Image | | `{src, license, author?, sourceUrl}`——CC BY-SA 裁决的落实，许可元数据必填 |
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
| image | Image | | 刀工示意图（计划自绘 SVG，场景 B：开放图集没找到） |
| note | I18nString | | 一句话定义/操作要点（自写） |

首批 32 个高频条目已入库（滚刀块、丝、丁、片、焯水、上浆、爆炒等），按场景 B 四层骨架（刀法 16/成形 22/预处理 18/加热 24）逐步补到约 80 项。**本词表是视频解析 skill 的输出闭集**：解析输出的 `techniqueRef` 只能是表内 id。

### Dish（菜品）——`data/dishes/<id>.json`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| schemaVersion | `"2"` | | 建议带；缺省兼容 |
| name | I18nString | ✅ | **唯一必填**——一道菜只有名字也能导入 |
| image | Image | | 成品图 |
| baseServings | int ≥1 | | 配方基准份数，食堂尺度（如 50） |
| components[] | object | | `ingredientRef + qty{value,unit} + prep?{techniqueRef,size?,note?,image?} + confidence?` |
| steps[] | object | | `text(I18nString) + techniqueRef? + image? + clip?{videoUrl,start,end}` |
| provenance | object | | `{source: manual\|video, videoUrl?}`；视频来源必填 videoUrl |
| status | enum | | `draft`（缺省）/ `active` / `archived`；只有 active 参与菜单与采购推导 |

## 2. 允许不完整与 readiness 关卡

数据不拒绝不完整；按用途设关卡（research-brief-v2 §0），引擎侧 `readiness(dish)` 计算（见 [procurement.md](procurement.md) 与 `packages/core`）：

| 关卡 | 含义 | 判据 |
|---|---|---|
| 能教（teach） | 能出备料单教帮厨 | 所有 component 带 `prep.techniqueRef`，steps 非空 |
| 能排（plan） | 能排进菜单算份数 | `baseServings` 与全部 `components[].qty` 齐备 |
| 能采（buy） | 能算采购 | 所有 `ingredientRef` 指向的食材都有 `purchase` |

缺什么在 PWA/PR 里显示成待办，不阻断入库。

## 3. 状态与编辑（v0.3 起师傅后台编辑；ADR-0006 §5 的“单人改 JSON”仅为过渡）

- 状态机收窄为 `draft → active → archived`：**git PR 即人工确认队列**——视频导入的菜一律 `draft`，师傅审 PR、合并即 `active`；无独立 review 状态、无 `version` 字段（git 历史即版本）。
- 编辑入口（2026-09-07 更新）：**v0.3 起师傅用 `/admin` 后台**（排菜单、新食材、手动加菜、发布/回退），后台通过云函数把 JSON 提交进 `data/`（ADR-0007，只准写 `data/**`）；Terry 与 agent 仍可直接改 JSON 提 PR；`python3 scripts/local-validate.py` 与 CI 双闸兜底（schema 校验 + 跨文件引用检查）。视频导入的草稿第一轮仍走命令行 + PR。设计稿：`docs/design/backoffice-v1.html`。
- 同步：线上 = git pull；线下/无网 = 拷贝整个 `data/` 文件夹。**不用 Git LFS**（与拷贝文件夹同步互斥，场景 G 已知坑 #1）；图片源头压缩 + 单图硬上限。

## 4. 视频导入（skill 直出，无中间包）

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
| 图片许可 | image 必须带 `{license, sourceUrl}`；CC BY-SA 图展示时按许可署名（ADR-0006） |
| 多语言名称缺失 | I18nString anyOf 保证至少一语言；展示走 fallback 链（见 i18n.md）；翻译状态查 translations.lock.json |

## 6. 开放问题（Open Questions）

1. 半成品/子菜谱（递归 BOM，如高汤）是否引入 components 的 `dishRef` 分量类型？当前只支持 ingredientRef。
2. 约 300 种食材的 Wikidata 种子拉取批次与师傅校对工作流（场景 A 脚本即改 QID 清单可复跑）。
3. 词表从 32 补到约 80 项的节奏；刀工 SVG 图集谁来画。
4. 顾客菜单需要的过敏原信息落在哪个字段（EU 14 类，v2 模型暂未收录）——阶段 1 出菜单前定。
