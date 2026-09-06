# CanteenOS 总体架构

> **English summary.** CanteenOS is a spec-first monorepo (pnpm workspaces) where JSON Schemas under `schemas/` are the single source of truth; TypeScript types, the `data/` knowledge base, and docs all derive from them. After the v2 scope reduction ([ADR-0006](adr/0006-scope-reduction-v2.md)) the product does one job — *a Chinese chef with a Ukrainian helper cooks Chinese food abroad and buys the right ingredients* — through three daily sheets (prep list / purchase order / menu) over **5 entities**: `ingredient`, `techniques` (single-file vocabulary), `dish`, `menu-plan`, and `purchase-order` (an engine-output snapshot with a per-line trace; no state machine). The repo directory *is* the knowledge base: one file per entity, filename = ID, sync via git pull or copying the folder. The engine is a deterministic pure function (`expand` / `renderPrepList` / `renderPurchaseOrders` / `renderMenu` / `readiness`); the video-ingest skill outputs `dish.json` + `images/` directly and a git PR is the human review queue. The feedback/ordering module is deferred. Roadmap: engine first, then video POC, then the Phase-1 read-only PWA.

- 关联决策：[ADR-0003 spec-first monorepo](adr/0003-spec-first-monorepo.md)、[ADR-0004 内容级三语](adr/0004-content-level-i18n.md)、[ADR-0006 产品收窄与简化（v2）](adr/0006-scope-reduction-v2.md)

---

## 1. 设计原则

1. **Spec-first**：`schemas/`（JSON Schema draft 2020-12）是单一事实源。类型、数据、文档、未来的实现都从 schema 派生。变更顺序硬性规定为 schema → types → data → docs（见 [CONTRIBUTING.md](../CONTRIBUTING.md)）。
2. **目录即知识库**（ADR-0006，调研场景 G）：知识库 = `data/` 下的 JSON + 图片，一实体一文件、文件名即 ID、禁止汇总大文件（`techniques.json` 词表除外）；阶段 1 无数据库、无 API，静态 PWA 直读 JSON，同步靠 git pull 或拷贝文件夹。
3. **确定性核心 + 可插拔边缘**：引擎是纯函数（同输入必同输出，可单测、可回放）；`data/` 现有数字即黄金测试。
4. **解析器可替换**：视频解析引擎（Gemini 主 / Qwen 备，ADR-0006 裁决）输出同一契约——直接产出 `dish.json` + `images/`；git PR 即人工确认队列。
5. **许可证安全**：不 fork、不复制任何 AGPL/Commons Clause 项目代码（教训见 [ADR-0002](adr/0002-license-apache2.md)）；图片逐图存许可元数据（CC BY-SA 裁决）。

## 2. 仓库布局（pnpm workspaces）

```
canteen-os/
├── schemas/            # JSON Schema（单一事实源，5 实体 + common）
├── data/               # 知识库本体（一实体一文件、文件名即 ID）
│   ├── ingredients/        # 食材/调料（tomato.json, egg.json, …）
│   ├── techniques.json     # 中餐技法受控词表（单文件合集，cut/heat/pretreat）
│   ├── dishes/             # 菜品（允许不完整：只有名字也能导入）
│   ├── menu-plans/         # 菜单计划（日期×餐次×菜品×份数 + margin）
│   └── purchase-orders/    # 引擎输出快照（每行带 trace；目录内 README 有验收基准）
├── packages/
│   └── core/           # @canteenos/core：TS 类型 + 引擎纯函数骨架
│   └── (未来) web/     # 阶段 1：只读静态 PWA（三张单展示）
├── skills/
│   └── video-recipe-ingest/   # 视频解析 skill 契约（云端/agent 实现）
├── scripts/            # 校验脚本（CI 入口，遍历 data/**）
└── docs/               # PRD / 架构 / 模块 / ADR / 调研
```

## 3. 模块边界

```mermaid
flowchart LR
    subgraph KB[知识库 data/]
        Ing[ingredients/*.json]
        Tech[techniques.json]
        Dish[dishes/*.json]
    end

    subgraph ENG[引擎 packages/core（纯函数）]
        MP[menu-plans/*.json]
        CORE[expand / render*]
        PO[purchase-orders/*.json\n输出快照·每行带 trace]
    end

    subgraph VI[视频解析 skill（云端/第三方）]
        VID[做菜视频]
        PARSE[Gemini 主 / Qwen 备]
    end

    PWA[阶段 1 只读 PWA\n备料单 / 采购单 / 菜单]

    MP --> CORE
    Dish --> CORE
    Ing --> CORE
    CORE --> PO
    KB -->|git pull / 拷贝文件夹| PWA
    VID --> PARSE -->|直出 dish.json + images/\nstatus=draft| PR[git PR\n= 人工确认队列]
    PR -->|合并即入库| Dish
```

边界规则：

- **引擎 → 知识库**：只读 ingredients/techniques/dishes/menu-plans；输出只写 purchase-orders/（快照，不回流修改知识库）。
- **视频 skill → 知识库**：只通过 `draft` 菜品 + git PR 入库；skill 无权直接改 active 菜品。
- **deleted 边界**（ADR-0006）：无供应商实体（supplier 是字符串）、无量纲实体（pcs↔g 走 `pcsToGram`）、无反馈模块（deferred）、无 PO 状态机。

## 4. 技术选型与理由

| 决策点 | 选型 | 理由 |
|---|---|---|
| 数据模型规范 | JSON Schema draft 2020-12 | 语言中立、工具链成熟（ajv）、CI 可校验；draft 2020-12 有稳定 `$defs` 语义 |
| 包结构 | pnpm workspaces monorepo | core/web 共享 schema 与 types；轻量 |
| 核心语言 | TypeScript | 前后端同构；类型与 JSON Schema 映射直接 |
| schema→TS | 手写 types.ts 起步，预留 json-schema-to-typescript 生成 | 规模小，手写更可控；实体数 > 15 或嵌套层级 > 4 时切生成 |
| 校验 | ajv (draft 2020-12) + ajv-formats；无 Node 环境用 `scripts/local-validate.py` | 事实标准 + 零依赖兜底 |
| 知识库存储 | git 仓库 `data/`（一实体一文件） | 场景 G：electron/apps 式数据仓库已验证；前提三件套 = schema 校验 CI + 图片压缩管线 + 实体分片 |
| 视频下载/解析 | yt-dlp（Unlicense，ADR-0006 裁决可用）；Gemini 主 / Qwen 备 | 场景 C：全宽松协议链路；Gemini 服务端强制 JSON Schema，Qwen 国内合规 |
| UI i18n | i18next（客户端自理） | 内容级三语在数据模型解决，界面文案用成熟方案 |
| 许可证 | Apache-2.0 | [ADR-0002](adr/0002-license-apache2.md) |

## 5. 关键数据决策（三个必须落实）

1. **可展示文本一律 `I18nString {zh, en, uk}`**（至少其一，fallback zh→en→uk）；翻译状态走旁文件 `translations.lock.json`（脚本维护 source_hash + status），数据本体只有纯三语文本。见 [i18n.md](i18n.md)。
2. **`Dish.components` 引用 Ingredient（ingredientRef），不内联字符串**；`techniqueRef` 只能引用 `data/techniques.json` 闭集词表——这是采购引擎能跑通、视频解析输出可校验的前提。
3. **数量一律 `Quantity {value, unit}`**；单位枚举 `g|kg|ml|l|pcs|pack|tbsp|tsp|pinch`。量纲规则（ADR-0006 收窄）：**g↔kg、ml↔l 是代码常量；pcs↔g 只靠 `ingredient.pcsToGram`**——无独立换算实体、无生效期与优先级链；换算失败进人工确认，引擎绝不猜测。

## 6. 阶段路线图（v2 收窄后）

```mermaid
timeline
    title CanteenOS 路线图（v2）
    阶段0 设计与Schema ✅ : 调研(含 v2 八场景) : 5 实体 Schema + data/ 知识库 : TS 类型骨架
    阶段1 引擎 + 只读 PWA : packages/core 引擎实现(黄金测试=data/ 数字) : 三张单渲染 : 静态 PWA 读 data/ : 单人编辑(改 JSON 走 PR，无编辑 UI)
    阶段2 视频导入 POC : 10–20 条真实视频(含乌语) : skill 直出 dish.json + images/ : PR 审流跑通
    阶段3 词表与数据补全 : techniques 补齐约 80 项 : 刀工 SVG 图集 : 约 300 食材种子拉取(Wikidata)
    deferred 模块三(点餐/评分/反馈) : 订餐驱动份数 : 运营报告 : 详见 modules/feedback.md
```

| 阶段 | 交付物 | 依赖 |
|---|---|---|
| 0 设计与 Schema | 本仓库当前全部内容 | — |
| 1 引擎 + 只读 PWA | `packages/core` 引擎实现 + 单测；备料单/采购单/菜单三张单渲染；单人编辑流程 | schemas 5 实体；data/ 种子 |
| 2 视频导入 POC | 真实视频（含 uk）实测报告；skill 脚本改造 | skills/video-recipe-ingest 契约；ADR-0006 裁决 |
| 3 词表与数据补全 | techniques 约 80 项 + SVG 图；约 300 食材 | 场景 A/B 调研 |
| deferred | 模块三（点餐/评分/反馈）、运营报告、多食堂 | 出现真实需求时以新 ADR 复活 |

执行顺序（ADR-0006 §6）：**先引擎后 POC**——三张单是日常价值主干且不依赖外部 API；视频导入的不确定项集中在 POC，不卡主干。

## 7. Open Questions

1. schema→TS 类型何时从手写切换到生成（json-schema-to-typescript）？切换点建议：实体数 > 15 或嵌套层级 > 4。
2. 静态 PWA 的离线缓存与图片体积控制（Workbox 运行时 CacheFirst + 图片源头压缩 CI，场景 G 已知坑 #1/#4）。
3. translations.lock.json 维护脚本与 CI 一致性检查（旁文件与数据本体漂移兜底）。
4. margin=1.1 在小批量（如 10 份）时是否足够覆盖固定尾料——上线后实测校正。
