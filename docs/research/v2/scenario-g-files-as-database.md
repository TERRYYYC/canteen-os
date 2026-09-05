# 场景 G：文件即数据库路线（调研日期 2026-09-05）

背景：CanteenOS 阶段 1 不做数据库和 API——知识库 = git 仓库里的 JSON 文件夹 + 图片，静态 PWA 直接读 JSON 渲染，离线可用，同步靠 git pull 或拷贝文件夹。本报告验证这条路有没有人走过、坑在哪。

## 候选（按推荐顺序，5 个可参照项目）

- **Decap CMS** | https://github.com/decaporg/decap-cms | MIT | TypeScript/React，纯静态 admin SPA（扔进 `/admin` 即可） | 19,349★，最近推送 2026-09-04（核实 2026-09-05，活跃） | 能给我们：最贴近"文件即数据库"的成熟先例——无数据库、无自有服务器，编辑表单直接通过 GitHub API 往仓库提交 commit；支持 Markdown/JSON 集合、媒体文件夹、Editorial Workflow（PR 审稿流）；可整套复用也可只看模型 | 不能给我们：编辑是"盲填表单"，预览要自己接；对手机端不友好（无官方移动端优化）；自带媒体库只管上传不管压缩
- **Keystatic** | https://github.com/Thinkmill/keystatic | MIT | TypeScript，Next.js/Astro 内嵌 admin，内容存 JSON/YAML/Markdown | 2,349★，最近推送 2026-08-26（核实 2026-09-05，活跃） | 能给我们：非技术人员表单编辑 JSON → 自动建分支、提交、开 PR 的完整链路（Thinkmill 官方博文专门演示了不会 git 的编辑如何走完 branch→PR）；TypeScript schema 定义即校验规则；UI 是三者里最现代的，支持移动端 | 不能给我们：GitHub 模式下编辑者仍需 GitHub 账号 + 仓库写权限（绕开要用 Keystatic Cloud，免费额度仅 3 人/团队）；官方自述仍偏 experimental；无审批队列/草稿态（草稿只能靠分支约定）
- **PagesCMS** | https://github.com/hunvreus/pagescms | MIT | Next.js 部署的纯 Web 端 GitHub 内容编辑器 | 3,964★，最近推送 2026-06-23（核实 2026-09-05） | 能给我们：零侵入——不改前端项目，部署后直接在浏览器里编辑任意 GitHub 仓库的 JSON 集合和媒体文件，天然支持 PR 工作流；OCA（Odoo 社区）讨论让非技术人员改 README 时点名它做底座 | 不能给我们：社区和文档规模小于 Decap/Keystatic；同样无图片优化管线
- **electron/apps** | https://github.com/electron/apps | MIT | 纯数据仓库（无前端框架）：一人一目录（YAML + PNG 图标） | 1,722★，最近推送 2026-08-11（核实 2026-09-05） | 能给我们：上千名非技术贡献者向一个数据仓库提交的活样本——目录组织（一实体一目录、数据与图片同目录）、CI 校验、提交后 bot 自动压缩/缩放图标并回提交，几乎就是 CanteenOS 知识库的直接模板 | 不能给我们：数据是 YAML 不是 JSON（组织模式可照搬，格式要自己定）；编辑入口就是 GitHub 网页+PR，没有表单 UI
- **SchemaStore/schemastore** | https://github.com/SchemaStore/schemastore | Apache-2.0 | JSON Schema 数据仓库 + 严格 CI | 3,837★，最近推送 2026-09-05（核实当日，极活跃） | 能给我们：JSON schema 校验 CI 的标杆配置（每个 JSON 文件挂 schema、CI 里跑校验、违反即红）；可搭配 sourcemeta/jsonschema CLI 或 ajv 复刻 | 不能给我们：它管的是 schema 本身，业务数据模型、图片资产、编辑工作流都要自己补

配套工具（不计入候选）：**Workbox**（https://github.com/GoogleChrome/workbox，MIT，13,001★，2026-09-02 活跃）——PWA 离线缓存事实标准，precache 应用壳 + 运行时 CacheFirst 缓存图片 + ExpirationPlugin 控制条数/时长；**calibreapp/image-actions**（1,574★，活跃）——PR 内自动压缩 JPEG/PNG/WebP/AVIF 并回提交的 GitHub Action，**但协议是 GPL-3.0，只能看模型不能复用代码**，可平替为 ImgBot 服务或自写 sharp 脚本进 CI。另参考 SPAAM-community/AncientMetagenomeDir（85★，CC-BY-4.0）：学术界"数据即仓库"案例，CI 校验 + 受控词表 + 人工 review 双闸门。

## 已知坑（按严重度排）

1. **图片体积与 git 膨胀（最致命）**：git 从来不是图床。Decap/Tina 官方都承认编辑随手传 8MB PNG 一年后 clone 就变慢、历史膨胀且不可逆（不进 LFS 删了也留在历史里）。必须在源头设防线：CI 图片压缩（见上，注意 calibre 是 GPL-3.0）、单图大小硬上限、必要时大图走外部图床/CDN。Git LFS 不建议用——LFS 与"拷贝文件夹同步"互斥（拷出来的是 pointer 文本文件，PWA 读不到真图），纯 Web 端编辑器对 LFS 支持也差。
2. **非技术人员编辑门槛**：直接让人改 JSON 不现实。三条出路按成本排：GitHub 网页编辑器 + PR 模板（零成本但要培训）；PagesCMS/Decap 部署一个 admin（表单 UI，但仍需 GitHub 账号和仓库权限）；Keystatic Cloud（账号免 GitHub，免费仅 3 人）。无论哪条，师傅/采购都要一次 1–2 小时的上手培训，不存在零培训方案。
3. **merge 冲突与目录组织**：多人编辑集中式大 JSON 文件必冲突。成熟数据仓库（electron/apps、schemastore）的共同解法：一实体一文件/一目录、文件名即 ID、图片与数据同目录。CanteenOS 应按"一道菜/一个供应商一个 JSON"切分，禁止汇总大文件。
4. **离线缓存失效与配额**：Workbox precache 全量图片会拖垮首次访问——只 precache 应用壳，图片走运行时 CacheFirst + ExpirationPlugin（限条数、限 30 天）。数据更新靠 git pull 后 JSON 变化，但 service worker 不知道：需要构建期生成版本化数据清单（manifest 带内容 hash），SW 据此增量失效，否则用户永远看到旧数据。手机端 Cache Storage 有配额，图片全量缓存需设上限并提供"清缓存重载"入口。
5. **schema 漂移**：没有数据库约束，唯一把关是 CI。必须每个 JSON 挂 JSON Schema，PR 里跑校验（sourcemeta jsonschema CLI / ajv），不合规不合并——schemastore 模式。少了这道闸，脏数据进 main 只是时间问题。
6. **无事务、无并发写保护**：两个师傅同时改同一文件就是冲突；git 是事后防线不是事前防线。该路线天然适合"低频、小团队、可分片"的写入场景，高频并发改同一份数据不成立。

## 结论

走得通：git-backed CMS（Decap/Keystatic/PagesCMS）证明了"JSON+图片在 git 里 + 静态站点直读"是成熟路线，electron/apps 证明了非技术贡献者+CI 校验的数据仓库可长期运转——但成立前提是"一实体一文件 + schema 校验 CI + 图片压缩管线"三件套齐备，且图片总量设硬上限。

## 风险：协议/维护

- 可直接复用代码（MIT/Apache-2.0）：Decap CMS、Keystatic、PagesCMS、Workbox、SchemaStore 配置模式、electron/apps 的 CI 模式。
- **只能看模型**：calibreapp/image-actions 为 GPL-3.0，不得复用代码（可用 ImgBot 服务或自写 sharp CI 脚本替代）；simple-icons 数据为 CC0、AncientMetagenomeDir 数据为 CC-BY-4.0，仅作组织模式参考。
- 维护风险：Keystatic 官方自述仍偏 experimental；PagesCMS 社区较小；Decap 由志愿者维护、文档偶有滞后（star 和提交活跃度均已于 2026-09-05 核实为活跃，短期断更风险低）。
