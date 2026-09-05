# 场景 C：做菜视频 → 结构化菜品包 + 关键帧（调研日期 2026-09-05）

背景：输入 B 站/抖音/YouTube 做菜视频（中/英/乌语），输出 dish.json（配料+用量+备菜规格+步骤时间段）+ 每个配料"被切的那几秒"的关键帧图片。本次聚焦"视频片段对齐 + 关键帧"深挖；Mealie/Tandoor 导入类工具与商业 SaaS 已按规则排除。所有 star 数 / 最近提交均经 GitHub API 于 2026-09-05 核实。

---

## 候选（按推荐顺序）

### 1. 转写-视频对齐（ASR → 句/词级时间戳）

- **WhisperX** | https://github.com/m-bain/whisperX | **BSD-2-Clause** | Python / CLI+库 | 23,899★，最近提交 2026-08-30（v3.8.5，2026 年持续维护） | 能给我们：faster-whisper 转写 + wav2vec2 强制对齐产出**词级时间戳**（93%+ 对齐精度），99 语种转写；中文有内置对齐模型，乌克兰语可挂 HF 上的 wav2vec2 XLSR uk 对齐模型（如 `Yehor/wav2vec2-xls-r-300m-uk-with-lm`，具体模型卡需实测验证）；可把外部转写喂给 `whisperx.align()` 只做对齐 | 不能给我们：对齐只到词/句级，**不知道哪句是"步骤"**——步骤语义切分要交给 LLM；说话人分离依赖 pyannote（HF 门控模型，另有协议条款，本场景不需要）
- **stable-ts** | https://github.com/jianfch/stable-ts | MIT | Python | 2,283★，最近提交 2026-05-30 | 能给我们：不依赖外部音素模型，用 Whisper 自身注意力做词级时间戳稳定化，字幕级精度，轻量 | 不能给我们：无说话人分离；生态小于 WhisperX
- **faster-whisper** | https://github.com/SYSTRAN/faster-whisper | MIT | Python | 25,246★，最近提交 2025-11-19 | 能给我们：CTranslate2 加速的 Whisper 推理（WhisperX 的底座），段级时间戳 | 不能给我们：词级时间戳（需配 stable-ts 或 WhisperX 的对齐器）
- **学术步骤定位（YouCook2 / COIN / CrossTask 一脉）** | Drop-DTW / SRPOW 等（Neurocomputing 2024 综述，hal-04956335） | 各 repo 协议不一 | PyTorch 研究代码 | 能给我们：把步骤文本序列对齐到视频时间窗的方法论（YouCook2 上 IoU ~48-53%，仍非生产级） | 不能给我们：开箱即用的工具；**没找到**任何一个"步骤→视频片段"的成熟开源产品。结论：此环节没有现成轮子，走"WhisperX 句级时间戳 + LLM 归组"即可覆盖

### 2. 关键帧 / 动作片段抽取

- **PySceneDetect** | https://github.com/Breakthrough/PySceneDetect | **BSD-3-Clause** | Python / CLI | 5,148★，最近提交 2026-08-28（v0.7.1，2026-07-21 发布） | 能给我们：Content/Adaptive/Threshold 三种镜头检测器，可对 ASR 对齐出的时间窗**在窗内切镜头**，`save-images` 直接导出每镜头代表帧，ffmpeg 切片，官方 Docker 镜像可跑云端函数 | 不能给我们：不理解"切菜"语义——只是镜头边界；清晰帧挑选要自己做（Laplacian 方差评分 + pHash 去重，几十行代码）
- **ffmpeg select/showinfo 滤镜** | https://ffmpeg.org | LGPL/GPL（作为外部进程调用无传染问题） | CLI | 持续维护 | 能给我们：在任意时间窗内按帧间差异或 I-frame 抽帧，零依赖兜底方案 | 不能给我们：语义
- **烹饪动作识别模型（cutting/stirring）** —— 结论：**没找到可直接复用的生产级开源模型**
  - EPIC-KITCHENS 系列（epic-kitchens/action-models、C2-Action-Detection、SlowFast 预训练）：模型可下载，但**数据集与模型为 CC BY-NC 4.0（非商业）**，按硬规则只能"看模型"自训或参考，不能直接商用复用
  - arXiv 2509.00033（2025-08）：MediaPipe 手部关键点 + LSTM 分 8 类厨房动作（chopping/cutting/stirring 等）的完整论文管线，可照着重现，但非开箱库
  - 替代思路（推荐）：不用专用动作模型，直接让 VLM 做时序定位——Qwen2.5/3-VL 原生支持"返回某动作发生的 JSON 时间窗"（见下节），或用 VLM 对 PySceneDetect 抽出的候选帧打"是否正在切 X"标签

### 3. 多模态 LLM 直接吃视频出 JSON

- **Qwen2.5-VL / Qwen3-VL** | https://github.com/QwenLM/Qwen3-VL | **Apache-2.0** | Python / HF Transformers | 19,900★，最近提交 2026-01-30 | 能给我们：**视频时序定位（temporal grounding）直接输出 JSON 时间窗**（官方 `relevant_windows: [[start, end], ...]` 格式），MRoPE 对齐绝对时间，能回答"'切土豆'发生在第几秒"；同时可做整视频菜谱抽取（配料+步骤）；7B/72B 可自托管，中文视频表现强（B 站/抖音场景首选） | 不能给我们：3B 小模型时间定位不可靠（PyImageSearch 2025-06 实测，需 7B 起步）；云端函数部署需 GPU；约束输出靠 prompt+解析，无服务端 JSON Schema 强制
- **qwen-video-chapters（Backblaze 官方样例）** | https://github.com/backblaze-b2-samples/qwen-video-chapters | MIT | Python(FastAPI)+Next.js | 0★（新仓库），最近提交 2026-09-02 | 能给我们：**端到端参考实现**——ffmpeg 抽关键帧 → Qwen2.5-VL 本地推理 → 章节 JSON（时间戳+标题+摘要），工程结构（懒加载 ML 栈、Pydantic 校验）可直接抄 | 不能给我们：菜谱/配料领域逻辑；是 demo 不是库
- **Gemini API + 结构化输出** | https://github.com/google-gemini/cookbook（Apache-2.0，17,748★，2026-09-04 提交）；https://github.com/GoogleCloudPlatform/generative-ai（Apache-2.0，17,669★，2026-09-05 提交，含 `youtube_video_analysis.ipynb`） | Apache-2.0 | Python SDK | 活跃 | 能给我们：视频文件/YouTube URL 直接输入 + `response_mime_type: application/json` + `response_schema`（Pydantic `list[Recipe]` 可用）**服务端强制 JSON Schema**，官方 notebook 演示视频分析出结构化 JSON；免自托管 GPU | 不能给我们：模型非开源（API 调用，菜品包核心逻辑绑定 Google）；时间戳精度靠模型自觉，需与 WhisperX 时间轴交叉校验
- **InternVL（OpenGVLab）** | https://github.com/OpenGVLab/InternVL | MIT | Python | 10,150★，最近提交 2025-09-22 | 能给我们：开源视频理解备选，权重开放 | 不能给我们：视频 JSON/时序定位示例和生态明显少于 Qwen；近一年活跃度低于 Qwen3-VL

### 4. 下载（B 站 / 抖音 / YouTube，2026 现状）

- **yt-dlp** | https://github.com/yt-dlp/yt-dlp | **Unlicense**（公有领域奉献；宽松度等同 MIT，但严格说不在 MIT/Apache/BSD/MPL 白名单内，按硬规则标注待裁决） | Python / CLI | 189,099★，最近提交 2026-08-30 | 能给我们：约 1,800 站点；**B 站提取器 2026-07-03 刚修复 API 抽取（#13730）**；抖音提取器在册（v.douyin.com 短链可解析视频文件）；YouTube 持续跟进 | 不能给我们：**抖音/B 站大量视频无字幕轨**——本来就要走 ASR，不影响；YouTube 与 Google 的对抗是常态，偶发 403 需更新版本/带 cookies；高清晰度 B 站视频需登录 cookies
- 替代品核查：cobalt.tools 等更稳的开源替代**没找到**符合协议的（cobalt 为 AGPL，排除）；市面 GUI（ViralMint 等）只是 yt-dlp 套壳。结论：yt-dlp 仍是 2026 年唯一稳的开源底座，靠"锁版本 + 高频升级"策略消化站点变动

### 5. 乌克兰语 ASR

- **Whisper large-v3** | https://github.com/openai/whisper | MIT | Python | 108,477★，最近提交 2026-08-31 | 公开评测：FLEURS 乌克兰语 **WER ≈ 9.5%**（ElevenLabs 对标页，2025-02，第三方口径）；Whisper 官方语言表中 uk 在 <50% WER"可用"档 | 结论：uk 没有榜单级开源对手——ElevenLabs Scribe 自称 3.5% WER 但属商业 SaaS 已排除；Qwen3-ASR 多语均值优于 Whisper 但未见 uk 单项公开 WER（未验证）；如需再降 WER，可用 Common Voice uk 子集对 large-v3 微调（HF 社区成熟路径） | **没找到**明确优于 large-v3 的开源 uk 专用模型
- 对齐配套：WhisperX 对 uk 可挂 HF wav2vec2 XLSR uk 强制对齐模型，词级时间戳链路可闭环（具体模型卡质量需实测）

---

## 推荐管线图

```
视频 URL
  │
  ▼
[1] yt-dlp 下载（B站/抖音/YouTube，锁版本+自动升级）      ──► video.mp4
  │
  ├─────────────────────────────────────────────┐
  ▼                                             ▼
[2] WhisperX large-v3                        [4] PySceneDetect
    转写(zh/en/uk)+词级强制对齐                  全片镜头切分+代表帧
  │                                             │
  ▼                                             │
[3] LLM 归组（Gemini response_schema 或          │
    Qwen3-VL-7B+ prompt 约束）：                 │
    句子 → 步骤段 + 配料表 + 用量 + 备菜规格       │
    输出 dish.json 骨架（每步骤带 start/end）     │
  │                                             │
  ▼                                             ▼
[5] 关键帧定位（两路并行，取并集）                  [5b] 时间窗内帧挑选
 5a Qwen3-VL temporal grounding：                  Laplacian 清晰度评分
    "切{配料}" → JSON 时间窗                       → pHash 去重 → 最清晰帧
 5b ASR 句命中"切/切丁/切片…"的词级时间戳    ◄──────┘
  │
  ▼
dish.json（步骤含 start/end + 关键帧路径）
+ prep/*.jpg（每配料被切瞬间的备菜照片）
```

## 结论（一句话）

没有"视频→菜品包"的开箱开源件，但 **yt-dlp → WhisperX 词级对齐 → Qwen3-VL（或 Gemini）JSON 结构化与时间窗定位 → PySceneDetect+清晰度评分抽帧** 这条全宽松协议链路在 2026-09 已完全可拼出 MVP，关键帧环节用"VLM 定位时间窗 + 窗内挑最清晰镜头帧"即可落地。

## 风险

- **协议**：EPIC-KITCHENS 动作模型 CC BY-NC（只能看）；cobalt 等下载替代品 AGPL（排除）；yt-dlp 为 Unlicense，公有领域奉献，宽松但不在硬规则白名单，需裁决；其余主力组件（WhisperX BSD-2、PySceneDetect BSD-3、Qwen3-VL Apache-2.0、Gemini cookbook Apache-2.0、whisper/faster-whisper/stable-ts MIT）全部合规。WhisperX 的说话人分离依赖 pyannote 门控模型（本场景不启用）。
- **维护**：抖音提取器最近一次实质重写是 2021 年（2026-09-05 核实），靠 yt-dlp 高频发版兜底，需"锁版本+CI 定期升级+失败回放"策略；qwen-video-chapters 为 0★ 新样例，只抄思路不依赖。
- **覆盖率/精度**：乌克兰语 ASR（FLEURS WER ~9.5%）是三语中最弱环，数字/用量识别错误会传导进 dish.json，建议 uk 视频加一道数值校验；Qwen 3B 时间定位不可靠，必须 7B+；VLM 给出的时间戳需与 WhisperX 时间轴交叉校验（±2s 容差）；"步骤→片段"学术方案（YouCook2 系）IoU 仅 ~50%，不要押注，语义归组交给 LLM。
