# 场景 H：三语机翻工作流（调研日期 2026-09-05）

需求：CanteenOS 的菜名、食材名、步骤、技法词表 zh→en/uk。技法术语全库一致（"焯水"永远翻成同一个词）；人工改过的译文不被下次机翻覆盖。

## 候选（按推荐顺序）

| 名称 | 链接 | 协议 | 语言/形态 | 最近活跃（核实 2026-09-05） | 能给我们什么 | 不能给我们什么 |
|---|---|---|---|---|---|---|
| **DeepL API（Free/Pro + Glossary v3）** | https://developers.deepl.com/docs/api-reference/glossaries | 商业 SaaS（代码无关） | API，支持 zh→en / zh→uk | 文档现行有效 | 官方术语表在引擎层强制一致（glossary 现在支持 DeepL 全部语言对，含 zh→uk）；API Free 每月 50 万字符免费，小规模菜库基本零成本；译文质量欧洲语向口碑最好 | 免费版译文可能被用于训练（敏感内容勿用）；术语表条目数免费版有限（API Free 为基础档）；长文上下文理解弱于 LLM |
| **LLM 提示层机翻（Gemini 2.5 Pro / GPT-4.1 为主）** | https://www.machinetranslation.com/blog/chatgpt-vs-gemini-vs-mt | 商业 API | API | Intento《State of Translation Automation 2025》：GPT-4.1 单模型综合第一；Gemini 2.5 Pro 在中文、乌克兰语方向领先 | 术语表直接塞进 prompt，技法词逐条锁定；可顺带做"菜名释义式翻译"（拼音+描述）；成本低（Gemini Flash 量级比 DeepL 便宜约 800 倍，据 eesel.ai 2026-06 开发者实测） | 术语遵从是"概率性"的，不是硬约束——同一术语长跑中可能漂移（Lokalise/Lingvanex 均指出此失效模式），必须输出后用脚本回查术语表 |
| **Google Cloud Translation Advanced (v3)** | https://costgoat.com/pricing/google-translate | 商业 SaaS | API，zh/uk 均支持 | 2026-08 价格页核实 | $20/百万字符、每月 50 万字符永久免费档；v3 自带 glossary（免费功能）；还有 Translation LLM 档（$10+$10/百万字符） | 烹饪术语质量无公开对比；中文菜名直译质量历来一般 |
| **Azure Translator** | https://azure.microsoft.com/en-us/pricing/details/translator/ | 商业 SaaS | API，uk 支持（官方语言支持页核实） | 2026-06 官方页核实 | 最便宜大牌：$10/百万字符，免费档每月 200 万字符；Custom Translator 可训领域模型 | 标准档没有真正的"强制术语表"，术语约束要训 Custom Translator（$40/百万字符 + $10/模型/月托管），对本项目过重 |
| **Tolgee（自托管）** | https://github.com/tolgee/tolgee-platform | 核心 Apache-2.0（仓库含 EE 目录，GitHub 标 NOASSERTION，复用时只碰 Apache 部分） | 本地化平台，Web 服务 + CLI | star 4,089；最近提交 2026-09-05（核实当日） | 翻译状态机（untranslated/translated/reviewed）天然解决"人工已改不被覆盖"：机翻只跑未翻译键，reviewed 键不动；可挂自己的 DeepL/Google/OpenAI key 自动预翻；自托管免费（≤10 席）；CLI 可导出 JSON | 是平台不是脚本，要起一个 Docker 服务；对本项目可能偏重 |
| **轻量脚本方案：自建"翻译清单 + 状态标记"（推荐落地形态）** | 自研，参考 md-translator（https://github.com/rockbenben/md-translator，MIT，star 73，最近提交 2026-09-03）与 @llm-translate/cli（MIT） | MIT（可复用思路/部分代码） | Node/Python 脚本 | 2026-09-05 核实 | 每条译文带 `source_hash` + `status: machine\|human` 标记：源文没变且 status=human → 跳过；源文变了 → 只重翻该字段；术语表先查表命中直接用、不命中才送 API，输出后正则回查术语一致性 | 需要自己写，但逻辑 <200 行；没有现成 UI，人工改靠改 JSON/表格 |
| **Weblate（自托管）** | https://github.com/WeblateOrg/weblate | **GPL-3.0（不能复用代码，只能"看模型"）** | 本地化平台 | star 6,054；最近提交 2026-09-05（核实当日） | 参考其工作流模型：源串变更自动标 "needs editing"、译文状态、术语表组件、DeepL/Azure glossary 预翻集成——这套状态设计值得抄思路 | 协议不符硬规则；且对单项目来说比 Tolgee 更重 |

## API 对比表

| API | uk 支持 | 价格（核实 2026-09-05） | 术语表功能 | 中文烹饪术语质量 |
|---|---|---|---|---|
| DeepL API | ✅（官方支持列表含 Ukrainian、Chinese） | Free 档 50 万字符/月；Pro $5.49/月 + $25/百万字符 | ✅ 引擎级强制（v3 多语术语表，支持全部语言对，zh→uk 可用） | 无烹饪领域公开基准；欧洲语质量口碑最好，中文菜名偏直译，需术语表纠偏 |
| Google Translation v3 | ✅ | $20/百万字符，50 万字符/月永久免费 | ✅ v3 glossary（免费） | 无烹饪领域公开基准；菜名直译历史上错误率高（"童子鸡"类笑话即出自无约束机翻） |
| Azure Translator | ✅ | $10/百万字符，200 万字符/月免费 | ⚠️ 标准档无强制 glossary，需 Custom Translator（$40/百万 + $10/月托管） | 同上，无公开烹饪基准 |
| LLM（Gemini 2.5 Pro / GPT-4.1） | ✅ | 量级约 $0.x–x /百万字符输出（Gemini Flash 极便宜；DeepL 实测约为其 800 倍价格，eesel.ai 2026-06） | ⚠️ prompt 注入，概率性遵从，须输出后回查 | Intento 2025：Gemini 2.5 Pro 在 zh、uk 方向领先；GPT-4.1 综合第一。LLM 做"拼音+描述"式菜名翻译明显优于 NMT。**没找到针对"中文烹饪术语 zh→en/uk"的公开专项对比** |

## 术语表约束的机翻（glossary-enforced MT）现状

- **API 层硬约束**：DeepL Glossary（v3 多语、引擎内强制）、Google v3 Glossary 是仅有的两个"便宜且真强制"的方案；Azure 要走 Custom Translator 训练，成本高。
- **LLM 层**：术语表放 prompt 里（"焯水=blanch，禁止其他译法"），业界共识是**概率性遵从、长文会漂移**（Lokalise 2026-04、Lingvanex 2026-03 均指出）；标准做法是"prompt 注入 + 输出后脚本回查"双保险（md-translator、@llm-translate/cli 均这么实现）。学术上也有 NMT 先翻、LLM 再按术语对 post-edit 的两段式管线（arXiv 2511.07461，2025-11）。

## 现成对照表

- **en**：《中文菜单英文译法》（北京市外办/旅游局，2007 讨论稿 2,753 条；2012 正式版《美食译苑》2,158 条）可从北京市外办官网下载 .doc（https://wb.beijing.gov.cn/home/wswm/yyhj/smjwy/202002/t20200207_1626472.html ，2026-09-05 核实可访问）。含翻译原则（主料开头/做法开头/拼音保留）与技法动词译法（Sautéed/Braised/Stewed/Steamed…），可直接转成我们的 en 术语表种子数据。
- **uk**：**没找到**官方或大规模中乌菜名对照表。只有零散资源：LanGeek 乌语中餐词汇表（约 30 条，https://langeek.co/en-UK/vocab/subcategory/681/word-list ）、乌语维基"Китайська кухня"条目及若干菜谱站（klopotenko.com 等）。结论：uk 侧术语表需以 en 为枢轴（zh→en 用官方表，en→uk 机翻+少量人工校）自建。

## 推荐工作流（一段）

菜名/食材/步骤文本用**轻量脚本方案**落地：每条记录存 `{zh, en, uk, source_hash, en_status, uk_status}`，`status` 取 `machine`/`human`；跑机翻时只处理"新增或 source_hash 变了且对应 status≠human"的字段，人工改过的字段永不被覆盖。技法词表单独维护一份三语 glossary（以《美食译苑》en 译法 + 自建 uk 为种子），**翻译引擎首选 DeepL API（Free 档起步）+ Glossary v3 硬约束技法词**——这是唯一"便宜且术语真强制"的组合；步骤长文本如需更自然的表达可降级用 Gemini/GPT 并在 prompt 里注入同一份术语表、输出后正则回查术语命中。uk 侧没有现成对照表，以 en 译文为枢轴机翻 uk，重点词汇人工校一遍即可；若后期想要 UI 和审阅流，再迁到自托管 Tolgee（Apache-2.0）。

## 结论

**一句话**：用"DeepL API + 官方术语表硬约束 + 状态标记脚本（human 不改、增量才翻）"即可零成本起步，en 靠《中文菜单英文译法》做种子，uk 没有现成对照表、以 en 为枢轴自建。

## 风险

- **协议**：Weblate 为 GPL-3.0，只能参考模型不能复用代码；Tolgee 仓库混合许可（核心 Apache-2.0 + EE 目录），复用时需甄别；md-translator / @llm-translate/cli 为 MIT，可放心借鉴。
- **维护**：Tolgee/Weblate 均活跃（2026-09-05 当天有提交）；md-translator 体量小（star 73），借鉴思路即可不宜深度依赖。
- **覆盖率**：uk 对照资源基本空白，术语表需人工冷启动；LLM 术语遵从存在漂移风险，必须保留输出回查环节；DeepL 免费档译文可能被用于训练，涉密内容需走 Pro。
