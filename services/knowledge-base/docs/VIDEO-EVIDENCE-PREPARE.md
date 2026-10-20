---
feature_ids: []
topics: [video-recipe, evidence, asr, ocr, cache]
doc_kind: runbook
created: 2026-09-30
---

# 全片证据预处理 CLI

`scripts/video-evidence/prepare.py` 把已经取得的完整本地视频变成可复用的原始音视频证据包。当前支持 macOS / Apple Silicon：FFmpeg 提取完整音轨与带实际时间戳的画面，Apple Vision OCR 逐帧识字，MLX Whisper 使用本地模型转写完整音轨。

这一步的完成状态是 `ready_for_analysis`，并始终带 `recipeAnalysisComplete: false`。还需要 agent 核对数字、字幕冲突和画面动作，按 `video-recipe-evidence` 契约整理 `source.json / evidence.json / candidate.json / review.md`，再经 KB 导入器进入候选收件箱。来源确认与厨房核定在 app 外完成，见 [ADR-0011](../../../docs/adr/0011-recipe-review-outside-app.md)。它不下载视频、不访问抖音登录态、不生成或批准菜谱、不修改远程服务。

## 持久环境

需要自行准备 Python 3.12、独立 venv 和本地 MLX Whisper 模型。固定包版本见 `scripts/video-evidence/requirements-macos-arm64.txt`；该文件来自历史 macOS / Apple Silicon 环境，不是 Linux Docker 的通用安装方案。模型目录必须由操作者准备，不随源码分发。

换机时使用已安装的 Python 3.12 创建同类持久环境，再显式安装依赖（会访问 Python 包源）：

```sh
python3.12 -m venv "$HOME/.local/share/canteen-video/env"
"$HOME/.local/share/canteen-video/env/bin/python" -m pip install -r scripts/video-evidence/requirements-macos-arm64.txt
```

FFmpeg/FFprobe 必须已经可执行；`swift` 与系统 Vision 需要 macOS 的 Swift 工具链。CLI 不安装依赖或模型。`--asr-model` 必须是包含 `config.json` 和 `weights.npz` 或 `weights.safetensors` 的本地目录，不接受 Hugging Face repo ID。执行时强制 `HF_HUB_OFFLINE=1`、`TRANSFORMERS_OFFLINE=1`、`HF_DATASETS_OFFLINE=1`。没有云端模型调用或付费接口。

## 执行

在知识库仓库根目录运行：

```sh
python3 scripts/video-evidence/prepare.py \
  --media /absolute/path/to/complete-video.mp4 \
  --cache "$HOME/.local/share/canteen-video/evidence" \
  --asr-python "$HOME/.local/share/canteen-video/env/bin/python" \
  --asr-model /absolute/path/to/existing-mlx-model
```

默认中文 `--language zh`、`--fps 2`；可选 `--fps 1`。`--ffmpeg /path`、`--ffprobe /path`、`--swift /path` 可以指定工具。脚本参数通过数组调用子进程，媒体路径中的引号、空格、`$()` 不会被 shell 执行。

输出 JSON 给出 `manifestPath` 和 `cacheHit`。失败退出码为 1，中断为 130；已创建的 attempt 记录失败阶段、命令、日志和错误，不发布完成标记。SIGKILL 或断电可能留下 `running` attempt，下次也不会命中它。操作系统文件锁在进程退出后释放，重跑使用新的 attempt，旧产物保留供排查。

## 缓存与目录

```text
<cache>/<cacheKey>/
  .lock
  complete.json                      # 成功 manifest 的相对路径与 SHA-256
  attempt-<uuid>/
    manifest.json                    # 来源/流时长、配置、覆盖率、阶段、文件清单
    probe.json
    audio.wav                        # 原片有音轨时才生成；完整 16 kHz mono PCM16
    frames.json                      # 各帧实际 PTS、原始流对齐时间与相对路径
    frames/00000001.jpg ...
    ocr.json                         # 每帧文字、位置、置信度；无字也保留该帧记录
    asr.json                         # 模型原始 segments、完整音轨回执与设置
    logs/<stage>.stdout.log
    logs/<stage>.stderr.log
```

缓存目录必须在整个 CanteenOS Git 仓库外（不只是本模块目录）；识别普通 `.git` 目录和 worktree 的 `.git` 文件。整仓源码归档无 `.git` 时，通过 `pnpm-workspace.yaml`、`packages/core/package.json`、`schemas/dish.schema.json` 的组合识别仓库根。真正独立分发且无主仓结构标记的软件包，仍拒绝本模块内缓存。媒体、模型、WAV、帧和转写不进入 Git。相同媒体字节即便改名，仍可复用相同结果。缓存键包含媒体 SHA-256/字节数、提取契约版本、实际脚本内容、采样与 ASR/OCR 设置、工具路径和可执行文件 SHA、Python venv 包版本元数据、全部本地模型文件 SHA、操作系统版本。

命中前验证完成 manifest 的 SHA，再验证其**全部**派生文件的字节数与 SHA。缺帧、缺转写、同长度篡改、manifest 损坏、模型或配置改变，都不会返回命中。验证命中不启动 FFprobe、FFmpeg、Swift 或 ASR；仍须读取媒体、模型和派生文件计算散列，因而耗时随文件规模变化。缓存契约对安装环境采用包元数据指纹，修改已安装包源码或动态库后，应重建 venv/升级提取契约，不把手改安装目录视为正常依赖更新。

## 覆盖检查与边界

- FFprobe 必须提供正的视频/音频流时长。一个主视频、至多一个音轨；多主轨文件须先明确选择，脚本拒绝默默漏轨。附加封面图不算主视频。
- 完整音轨先解码到 WAV，验证实际采样数与数据长度，和源音轨时长偏差不得超过 250 ms。报告真实处理时长与偏差，不把视频时长当音轨时长。
- 每秒 2 个采样桶选取实际解码帧，通过 FFmpeg `showinfo` 保存实际 PTS；不按文件序号假造采样时间。首帧必须为流起点，最大采样间隔及尾段间隔都不得超过 2 秒。
- `videoProcessedThroughMs` 表示完整解码命令成功且帧覆盖检查通过。`lastFrameMs` 才是最后观察到的画面时间。采样间隙仍可能漏掉闪现字幕。
- OCR 必须返回每一帧且无失败记录。ASR 必须返回与 WAV 一致的完整音轨回执，所有词段时间在音轨范围内；`condition_on_previous_text=False` 防止已观察到的后半段重复污染。
- `speechSpans` 是 ASR 产出文字的区间；`unverifiedAudioSpans` 是补集，**不表示已确认静音**。完整音频送入模型也不能证明每句话都转写正确。
- 帧的 `timeMs` 以视频流起点为零；`sourceTimeMs` 加上视频流在容器中的偏移。ASR 时间以音轨起点为零，建立统一证据账本时加 `audioTimelineOffsetMs`。不要混用两条流的时间原点。
- 成功只是原始证据已就绪。菜谱字段引用、字幕/语音核对、视觉动作、未给出的用量时间与份数仍需后续分析；完整菜谱和原始视频才是师傅阅读界面的主要内容。

## 验证方法

自动化测试：`python3 tests/ops/video-evidence-tests.py`；也接入现有 Node 测试入口：`node --test tests/ops/video-evidence.test.mjs`。行为保护覆盖实际帧时间、命中不调用工具、媒体/模型/配置变化失效、缺失/同长损坏拒绝、五阶段命令失败及安全重跑、不完整结果拒绝、仓库内缓存拒绝、符号链接缓存项不写入其目标。测试使用替身命令，不依赖本机真实 macOS/ASR/OCR 运行环境。

实际原片验收由操作者另行准备授权媒体与本地工具，并核对：

| 检查 | 需要验证的依据 |
| --- | --- |
| 原片身份 | 原文件字节数和 SHA，与来源记录一致 |
| 音轨覆盖 | 实际处理时长、采样数和相对源音轨偏差 |
| 画面覆盖 | 帧数、实际 PTS、最后帧、最大/尾段间隔 |
| 文字边界 | ASR 区间与未核验音频补集；OCR 不漏输入帧 |
| 首跑 | 各阶段成功，完成 manifest 及派生文件的字节数/散列匹配 |
| 重跑 | 相同完整输入命中同一个 manifest，不重新调用工具 |

真实原片文件名、媒体散列、时长/数量与本机性能回执属于仓外运行资料，不随源码迁入。不要把本页的方法说明当成真实 ASR/OCR 已运行的结论；预处理成功也不代表 F2 下载、菜谱正确率、厨房确认或自动发布已完成。
