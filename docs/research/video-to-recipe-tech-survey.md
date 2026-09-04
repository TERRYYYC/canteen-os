# 做菜视频 → 结构化菜谱：技术路线调研报告

> 调研日期：2026-09（以搜索结果为时点快照，价格/模型版本可能随时间变动）
> 用途：食堂管理系统「视频解析 skill」的架构决策输入
> 场景：输入做菜短视频（中/英/乌克兰语旁白或字幕），输出标准化结构化菜谱（食材+用量+步骤+工具+份量），打包为可导入菜品知识库的标准包；解析可跑在云端/第三方服务，本地只做导入。

---

## 0. 结论摘要（TL;DR）

- **首选：Google Gemini 2.5/3.x Flash 单调用路线**。原生视频+音频多模态理解，支持 responseSchema 强制 JSON 输出，免费档即可开发验证，生产单条短视频成本约 **$0.02–0.05/条**。已有开源项目（pick-a-recipe）用「Whisper/Gemini → Tandoor/Mealie 导入」跑通了完全相同的业务闭环，可作为可行性证明。
- **备选 A：阿里云百炼 Qwen3-VL 系列**。若团队/数据在国内、或需要中文 OCR/中餐语义优势，qwen3-vl-plus / qwen3-vl-flash 视频理解能力与价格比极佳（flash 输入低至 $0.022/M tokens）。
- **备选 B：自托管 WhisperX + 关键帧 + Qwen2.5-VL/Qwen3-VL 管线**。用于数据合规、批量成本压到极致或离线场景，但工程投入是云端路线的 5–10 倍，且乌克兰语等环节需要额外验证。
- **结构化格式：以 schema.org/Recipe（JSON-LD）为标准包主格式**，它是事实上的行业标准，Mealie/Tandoor/Cooklang 生态均可互转；内部可辅以 Cooklang 便于人工审阅。
- Twelve Labs 视频理解能力强，但其 Pegasus 对非英语只有「部分支持」，且无乌克兰语；对菜谱场景性价比不如 Gemini，仅作为对照参考。

---

## 1. 云端多模态视频理解 API

### 1.1 路线对比表

| 路线 | 提供方 | 能力 | 结构化输出 | 语言支持 | 成本量级（每条约3分钟短视频） | 来源 |
|---|---|---|---|---|---|---|
| Gemini 2.5/3.x Flash 视频理解 | Google | 原生视频+音频+字幕理解，1M token 上下文，可处理长视频；2.5 起支持低分辨率模式（66 tokens/帧，1M 上下文可放约 3 小时视频） | ✅ 原生 responseSchema / JSON mode，可强制输出食材+步骤 JSON | ✅ 视频内音频多语言识别（中/英/乌等），可直接指定输出语言 | 输入 ~46K tokens ≈ $0.014 + 输出 ≈ $0.005 → **$0.02–0.05/条**；有免费档 | [1][2][3] |
| Gemini 2.5/3.x Pro | Google | 同上，视频理解 benchmark SOTA 级 | ✅ | ✅ | $0.10–0.30/条（输入 $1.25–2/M，输出 $10–12/M） | [1][2] |
| Qwen3-VL-Plus / Flash（百炼） | 阿里云 | 视频理解、OCR、时序定位；qwen-vl-max 系列支持视频输入 | ✅ 支持 JSON 输出 | ✅ 中文/英文强；乌克兰语需实测 | flash ≤32K 输入 $0.022/M → **<¥0.5/条**；plus 约 ¥0.1–1/条 | [4][5] |
| 豆包 Seed 1.6 Vision | 字节火山引擎 | 视频理解强、逐镜分析、中文最佳；128K 上下文 | ✅（通过 prompt+JSON 约定） | 中/英强；乌语需实测 | 输入 ¥0.8/M（<32K）/ 输出 ¥8/M → **约 ¥0.1–0.5/条** | [6] |
| Twelve Labs Analyze API（Pegasus 1.5） | Twelve Labs | 视频原生理解，schema-first 的 /analyze API，支持按用户定义 schema 输出带时间戳的结构化分段元数据；最长 2 小时视频 | ✅ schema-first 结构化输出（含时间戳分段） | ⚠️ 仅英语全支持；中/法等 12 种语言部分支持；**无乌克兰语** | $1.75/小时输入 + $7.5/M 输出 tokens → **约 $0.09–0.12/条**（另有一次性索引费 $2.50/小时） | [7][8][9] |

**关键说明：**

- **Gemini 的 token 计费方式**：视频默认按 1 fps 采样，每帧约 258 tokens（高分辨率）或 66 tokens（低分辨率模式）；研究实测 token 数只与时长和帧率有关，与分辨率无关。3 分钟视频 ≈ 180 帧 × 258 ≈ 4.6 万 tokens，用 Flash（$0.30/M 输入）单条成本约 $0.014。音频部分单独计费（约 32 tokens/秒）。[2][3]
- **Gemini 结构化输出可靠性**：支持 `responseSchema` 约束 JSON 输出；历史上非英语 JSON 输出曾出现编码 bug（如 `informaci\n` 代替 `información`），2025 年 8 月起社区反馈已修复，但生产中建议加 JSON 校验+重试。[10]
- **Twelve Labs 的差异化**：它的 /analyze 是「schema-first」设计——你定义分段语义+元数据字段，它返回 `{start_time, end_time, metadata}` 数组，天然适合「把视频切成带标签的步骤段」。但对非英语支持弱、无乌语，这是对本场景的硬伤。[8][9]
- **存在性证明**：开源项目 **pick-a-recipe**（GitHub）做的正是「TikTok/YouTube/Instagram 做菜视频 → Whisper 转写 + Gemini/OpenAI 抽取 → 导入 Tandoor/Mealie」，配置里直接有 Recipe Language、Whisper model size、目标 recipe manager 等选项——与本需求几乎一比一对应，强烈建议先跑通它做 POC 基线。[11]

### 1.2 参考来源
- [1] Gemini API Pricing（2026-05，metacto 汇总）: https://www.metacto.com/blogs/the-true-cost-of-google-gemini-a-guide-to-api-pricing-and-integration
- [2] Gemini 2.5 技术报告（视频 token 化 258/66 tokens/帧、3 小时视频）: https://arxiv.org/html/2507.06261v1
- [3] ActionAtlas 论文（实测 Gemini 视频 1fps 采样、265 tokens/帧）: https://arxiv.org/pdf/2410.05774v1
- [4] 阿里云百炼模型价格（qwen-vl-max 国内 $0.23/M 输入、qwen3-vl-flash $0.022/M 起）: https://help.aliyun.com/zh/model-studio/model-pricing
- [5] 阿里云图像与视频理解文档（token 计算方式）: https://help.aliyun.com/zh/model-studio/vision
- [6] 火山豆包 Seed 1.6 Vision 价格对比（第三方调研汇总）: https://github.com/bistuwangqiyuan/ai-manju-xiaoyunque/blob/main/research-2026-05.md
- [7] Twelve Labs 官方定价: https://www.twelvelabs.io/pricing
- [8] Twelve Labs Pegasus 模型文档（语言支持：英语全支持，12 种部分支持）: https://docs.twelvelabs.io/docs/concepts/models/pegasus
- [9] Pegasus 1.5 schema-first /analyze API: https://www.twelvelabs.io/blog/introducing-pegasus-1-5
- [10] Gemini 结构化输出编码问题 issue: https://github.com/googleapis/python-genai/issues/1238
- [11] pick-a-recipe（视频→菜谱→Tandoor/Mealie 开源项目）: https://github.com/pickeld/pick-a-recipe

---

## 2. 开源 / 自托管路线：Whisper(X) + 关键帧 + VLM 管线

### 2.1 管线成熟度评估

标准管线：`ffmpeg 抽音轨 → WhisperX 转写（词级时间戳）→ 场景检测/均匀抽帧 → VLM 融合「转写文本+关键帧」→ 输出结构化 JSON`。

| 组件 | 候选 | 成熟度 | 备注 | 来源 |
|---|---|---|---|---|
| 语音转写 | Whisper large-v3 / faster-whisper / WhisperX | ⭐⭐⭐⭐⭐ 生产级 | Whisper 训练覆盖 99 种语言（含中、英、乌）；WhisperX 增加词级时间戳（±50ms，wav2vec2 强制对齐）、VAD 预切分、批量推理（RTX 4090 上约 70× 实时速度）、可选说话人分离；BSD 许可 | [12][13] |
| 关键帧抽取 | ffmpeg / decord / PySceneDetect | ⭐⭐⭐⭐⭐ | 纯工程，无风险 | — |
| 视频 VLM | Qwen2.5-VL（3B/7B/32B/72B，Apache 2.0） | ⭐⭐⭐⭐ | 原生支持视频输入、动态帧率、>1 小时长视频、事件时间定位、稳定 JSON 输出；已有教程直接用做菜视频演示「提取菜谱步骤+食材用量」并输出带时间戳 JSON | [14][15] |
| 视频 VLM（更新） | Qwen3-VL 系列（8B–235B，已上百炼且开源） | ⭐⭐⭐⭐ | 第三方 benchmark 中 Qwen3-VL-235B 开源第一梯队；InternVL3.5、GLM-4.5V 亦可备选 | [16] |
| 旧一代视频 LLM | LLaVA-Video / VideoLLaMA3 / VITA-1.5 | ⭐⭐ | 2026 年 benchmark 已明显落后于 Qwen3-VL/InternVL3.5，不建议新项目采用 | [16] |
| 菜谱域微调 | Qwen2.5-VL-7B + LoRA（ms-swift 有官方视频微调脚本） | ⭐⭐⭐ | 可用菜品数据 LoRA 微调提升「用量/火候」等细节抽取准确率；7B 级 2 卡可训 | [15] |

### 2.2 主要风险点

1. **用量精度**：短视频里「适量盐」「一把葱花」无量化信息，VLM 视觉估计用量不可靠——通常靠「视觉估算 + 常识补全 + 人工确认」兜底，这一点云端模型同样存在。
2. **乌克兰语对齐**：Whisper 转写乌语没问题，但 WhisperX 的词级时间戳需要乌语 wav2vec2 对齐模型（HF 上有社区模型，质量需实测）；若只需句子级时间戳，可跳过对齐步骤。
3. **工程复杂度**：部署 vLLM/SGLang 推理服务、GPU 容量规划、失败重试、质量评估，预计 **3–6 人周**起步；边际成本低（单条 <$0.01 电算成本），但需要稳定 GPU 资源（7B 级单卡 24GB 可跑，72B 需多卡或量化）。
4. **无旁白视频**（纯画面+BGM）：必须依赖 VLM 视觉理解，此时 Whisper 管线退化为纯视觉路线，效果上限低于 Gemini 这类原生音视频联合模型。

---

## 3. 结构化菜谱的标准格式

| 格式 | 维护方/生态 | 特点 | 互转 | 来源 |
|---|---|---|---|---|
| **schema.org/Recipe（JSON-LD）** | schema.org / Google 搜索生态 | 事实标准：recipeIngredient、recipeInstructions、recipeYield、prepTime/cookTime（ISO 8601）、tool 等字段齐全；几乎所有菜谱 App 都能从 URL 读 JSON-LD | Mealie/Tandoor 导入导出均支持；CookCLI 可 `--format schema` 输出 | [17][18] |
| **Cooklang（.cook）** | Cooklang 开源生态 | 纯文本标记：`@食材{200%g}`、`#工具`、`~{25%minutes}` 内嵌在步骤文字里；EBNF 语法+15+ 语言解析器；人读/机器读兼备，适合 Git 版本管理和人工审校 | CookCLI 一键转 JSON/YAML/Markdown/schema.org；Tandoor 支持导入 | [19][20] |
| **Open Recipe Format（ORF，YAML）** | 社区 | YAML 结构、食材与步骤分离；生态较小 | MoveMyRecipes 支持互转 | [18] |
| Mealie JSON / Tandoor Default 导出 | 各自项目 | 各自内部模型（Tandoor 支持步骤级食材绑定）；互相有导入器 | Tandoor 官方支持 20+ 格式导入（含 Mealie、Nextcloud Cookbook、Paprika 等） | [21][22] |

**建议**：标准包 = **schema.org/Recipe JSON-LD 为主格式**（兼容性最好、字段权威），可选附带 `.cook` 供人工审阅/版本管理；字段在 schema.org 基础上扩展食堂业务字段（份量折算、过敏原、成本）。注意 Mealie 导出 JSON-LD 时时间字段曾有不合规 bug（"10 minutes" vs "PT10M"），自己做解析器时按 ISO 8601 生成、对第三方数据做容错。[17]

---

## 4. 多语言处理（中/英/乌）

| 方案 | 做法 | 可行性 |
|---|---|---|
| 云端联合（Gemini/Qwen-VL） | 模型直接吃视频音轨，prompt 指定「无论旁白是什么语言，输出中文/英文 JSON」 | ✅ 最简单；Gemini 原生多语言音频理解；省掉转写-翻译两段式误差累积 |
| 自托管两段式 | Whisper 原生语言转写（99 语言含乌/中/英）→ LLM 翻译成目标语言 | ✅ 成熟；**不要**用 Whisper 自带 translate 模式（只能翻成英语且丢失词级对齐）[12] |
| 字幕优先 | 视频若带字幕轨（YouTube/TikTok CC），直接抽字幕文本替代 ASR | ✅ 成本最低、错误最少；作为首选信号源，ASR 兜底 |
| 术语归一 | 翻译后过一层「食材/单位词典」映射（如 cup↔ml、тісто↔面团） | 建议做，菜谱领域单位混乱是主要错误源 |

**实践建议**：不管走哪条路线，都先保留「原文转写」再翻译——结构化菜谱里食材名/单位保留双语对照，便于人工校对与溯源。

---

## 5. 成本与工程复杂度对比

以「3 分钟做菜短视频，输出一份结构化菜谱」为单位估算：

| 路线 | 单条边际成本 | 工程投入 | 质量上限 | 适合阶段 |
|---|---|---|---|---|
| Gemini Flash（首选） | **$0.02–0.05**（免费档可开发） | 低：1 次 API 调用 + JSON schema 校验，**1–2 人周** | 高（音视频联合理解） | POC → 生产全阶段 |
| Qwen3-VL / 豆包（国内备选） | **¥0.1–0.5** | 低，同上；国内合规优势 | 高（中文场景可能更好） | 国内部署/合规要求时 |
| Gemini Pro | $0.10–0.30 | 低 | 最高（复杂长视频） | 疑难样本兜底/精修 |
| Twelve Labs | $0.09–0.12 + 索引费 | 中 | 高，但乌语不支持 | 不推荐本场景 |
| 自托管 WhisperX+Qwen-VL | < $0.01（摊薄后）+ GPU 固定成本 | 高：**3–6 人周**+运维 | 中高（需调优） | 大批量（>数万条/月）/数据不出内网 |

经验法则：**月处理量 < 1 万条时云端 API 全面占优**（月成本 < $500，零运维）；超过此量级或有硬合规要求再评估自托管。

---

## 6. 推荐路线

### 首选：Gemini 2.5 Flash「单调用」云端路线

- 做法：视频文件（或 URL）→ Gemini API + 精心设计的 prompt + `responseSchema`（schema.org/Recipe 子集+扩展字段）→ JSON-LD 标准包 → 本地系统导入。
- 理由：① 原生音视频联合理解，天然覆盖中/英/乌旁白和字幕；② 原生结构化 JSON 输出；③ 成本几乎可忽略，免费档即可完成 POC；④ 工程最小——本质上是一次 API 调用+校验；⑤ 有 pick-a-recipe 开源先例可直接参考甚至 fork。
- 加固措施：JSON schema 校验+自动重试；疑难样本升级 Pro 档二次精修；用量字段标注 `confidence` 供人工确认。

### 备选：阿里云百炼 Qwen3-VL（国内合规/中文优势）或 自托管管线（大批量/离线）

- 若数据不能出境或主体在国内：换 Qwen3-VL-Plus/Flash，接口形态（OpenAI 兼容）与 Gemini 几乎同构，迁移成本低。
- 若月处理量到数万条级或要求离线：落地 WhisperX + 抽帧 + Qwen2.5-VL-7B/32B（必要时 LoRA 微调），格式仍输出 JSON-LD，与云端路线共用下游导入器——**格式先行，解析器可替换**是这次架构设计的关键解耦点。

### 架构决策要点（与路线无关的共性建议）

1. **标准包格式锁定 schema.org/Recipe JSON-LD**，解析引擎做成可插拔（Gemini / Qwen / 自托管同一输出契约）。
2. **保留溯源**：标准包内附原始视频 URL、原文转写、逐段时间戳，便于人工抽检与错误追责。
3. **人机闭环**：用量/份量等易错字段带置信度，知识库导入前设人工确认队列。
4. POC 第一步：拿 10–20 条真实目标视频（含乌语样本）在 Gemini 免费档上跑通，用 pick-a-recipe 做基线对比。

---

## 附：局限性说明

- 价格数据采集于 2026 年 5–9 月的公开页面/第三方汇总，签约前以官方控制台实时价格为准。
- 乌克兰语在 Gemini/Qwen-VL 上的实际抽取质量未见公开 benchmark，需 POC 实测。
- 豆包 Seed 1.6 Vision 价格来自第三方 GitHub 调研文档（权威性 B 级以下），建议以火山引擎官方报价复核。
