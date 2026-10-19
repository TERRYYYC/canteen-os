---
feature_ids: [douyin-favorites-ingest]
topics: [video-recipe, f2, acquisition, cache, visitor-session]
doc_kind: runbook
created: 2026-10-01
---

# F2 完整视频获取与缓存

`scripts/video-evidence/f2-acquire.py` 使用官方 F2 获取公开作品的详情，再调用其 `DouyinDownloader` 保存完整 MP4。默认先使用 `TokenManager.gen_ttwid()` 初始化平台签发的游客身份；值只在当前进程内传入，不写入配置、回执或日志。这个入口没有调用 `--auto-cookie`，没有读取用户浏览器，没有账户登录或浏览器下载回退。

## 获取前的核验

固定使用下方上游提交。检查游客初始化、详情返回的作品 ID 和下载产物；HTTP 200 不代表一定有有效 JSON，空正文不能记为详情成功。游客 Cookie 与用户登录 Cookie 分开，不能把平台签发的游客身份当成账户授权。

历史私有样本标题、作品 ID、时长、字节数、媒体散列和运行回执不随源码迁入。公开文档描述验证步骤，不用私人收藏记录充当示例或当前平台可用证明。

旧生产提交 `5f01ae1` 的 Argus HTTP 403 与新版空正文是不同层级。官方 [403 修复提交](https://github.com/Johnserf-Seed/f2/commit/9b759fc178237b35cd531c635fd1176e4a9873e7)及 [Issue #443](https://github.com/Johnserf-Seed/f2/issues/443)解释了网关请求头变化；增加请求头后仍需有效游客初始化，不能把 HTTP 200 空正文视作详情成功。

官方分支名称含 `pw3`，但当前 [抖音 crawler](https://github.com/Johnserf-Seed/f2/blob/a30feaf92a40f421273b01b6ef36aa83a93f63c0/f2/apps/douyin/crawler.py#L102)仍使用 httpx，没有自动创建 Playwright 网页会话。[TokenManager](https://github.com/Johnserf-Seed/f2/blob/a30feaf92a40f421273b01b6ef36aa83a93f63c0/f2/apps/douyin/utils.py#L333)提供正常游客 ttwid 获取；[单作品 handler](https://github.com/Johnserf-Seed/f2/blob/a30feaf92a40f421273b01b6ef36aa83a93f63c0/f2/apps/douyin/handler.py#L390)和[下载器](https://github.com/Johnserf-Seed/f2/blob/a30feaf92a40f421273b01b6ef36aa83a93f63c0/f2/apps/douyin/dl.py#L69)是本入口实际调用的路径。

## 环境

支持 macOS / Linux、Python 3.10+、可执行的 FFprobe。F2 包与干净官方源码 checkout 必须一致；不以仍显示为 `0.0.1.7` 的包版本字符串代替 Git SHA。

使用独立目录安装，不替换现役容器：

```sh
git clone --branch v0.0.1.8-pw3 https://github.com/Johnserf-Seed/f2.git /absolute/path/to/f2-source
git -C /absolute/path/to/f2-source checkout a30feaf92a40f421273b01b6ef36aa83a93f63c0
python3.12 -m venv /absolute/path/to/f2-env
/absolute/path/to/f2-env/bin/python -m pip install /absolute/path/to/f2-source
```

使用上述独立环境及固定提交的干净 checkout。入口对安装目录全部运行时 `.py/.yaml/.js/.json` 计算 SHA，并核对文件被该源码 HEAD 追踪且与其字节一致；有未追踪注入文件、源码改动或安装错配时在联网前失败。

## 执行

先把 `WORK_ID` 替换为你有权处理的作品 URL 中的 19 位 ID；下面是占位值，不对应真实作品。

```sh
WORK_ID=REPLACE_WITH_19_DIGIT_WORK_ID
/absolute/path/to/f2-env/bin/python scripts/video-evidence/f2-acquire.py \
  --work-id "$WORK_ID" \
  --cache /absolute/path/to/media-cache \
  --f2-source /absolute/path/to/f2-source
```

`--work-id` 必须为 19 位 ID；`--ffprobe /absolute/path/to/ffprobe` 可选。源 URL 固定由 ID 构造。每个进程处理一条作品，详情最多一次业务请求，TLS 校验开启。未对作品失效、权限限制或验证挑战做额外身份切换、验证码处理或重试循环。

输出 JSON 含 `status / cacheHit / cacheKey / manifestPath / mediaPath`。失败退出码 1，输出失败阶段、异常类型和已创建的 attempt 回执；异常文本可能含签名 URL，因此不保存。预检失败同样非零，标为 `preflight`。中断退出 130。

## 缓存与副作用隔离

```text
<cache>/f2/<work-id>/<identity-sha256>/
  .lock
  complete.json
  attempt-<uuid>/
    manifest.json
    <work-id>_video.mp4
    ffprobe.json
    douyin_users.db             # F2 官方下载器保存 last_aweme_id 的相对状态库
```

缓存必须在整个 CanteenOS Git 仓库外（不只是本模块目录）；识别普通 `.git` 目录和 worktree 的 `.git` 文件。整仓源码归档无 `.git` 时，通过 `pnpm-workspace.yaml`、`packages/core/package.json`、`schemas/dish.schema.json` 的组合识别仓库根。真正独立分发且无主仓结构标记的软件包，仍拒绝本模块内缓存。每次未命中都在全新的 attempt 中执行 F2；其工作目录也隔离到该 attempt，进程结束恢复原目录。官方下载器的 `handler_download → save_last_aweme_id → AsyncUserDB('douyin_users.db')` 因此不会在项目根目录掉数据。入口禁止写 Python 字节码；没有使用 `.gitignore` 遮住副作用。

缓存身份包含作品 ID/URL、入口脚本 SHA、实际 F2 Git SHA/运行文件 SHA、FFprobe 路径和可执行文件 SHA。命中前验证 manifest SHA、来源 ID、媒体字节数和 SHA；同大小篡改、缺文件、配置/版本变化均不命中。命中直接返回同一媒体路径，不启动 F2 请求、下载器或 FFprobe。失效后的旧 attempt 保留，新 attempt 不会把旧 MP4 当本次成功。

成功门槛是本次实际返回匹配作品 ID，并取得新 attempt 的非空 MP4；FFprobe 无 error 输出、一个主视频轨和一个音轨都有正时长、轨道时间线在容器内；F2 详情提供视频时长时，下载视频时长与其误差不得超过 1 秒。回执保存独立音频/视频起点与时长、完整文件大小及 SHA。

这些是音视频轨、容器、详情时长与文件完整性检查，没有声称逐帧解码或每句话已解析正确。后续使用[完整音画预处理](./VIDEO-EVIDENCE-PREPARE.md)读取原片，并由 agent 形成菜谱和必要原帧。个人收藏列表仍需另行验证授权路径；单作品下载的验证不能替代收藏同步验收。

## 验证

```sh
PYTHONDONTWRITEBYTECODE=1 python3 tests/ops/f2-acquire-tests.py
node --test tests/ops/f2-acquire.test.mjs
```

离线行为测试覆盖游客状态遗漏、无音轨/无视频/短文件、源 ID 错配、空下载、FFprobe 失败/错误输出、同大小缓存损坏、失败脱敏与重跑、无网络缓存命中、未追踪伪源码归属、相对 DB 工作目录隔离和 CLI 缺失工具预检。CLI 阶段测试显式使用可执行的测试工具路径，不依赖系统已安装 FFprobe；生产入口仍保留工具存在性检查。

真实单作品验收需要操作者另外执行，不属于上述替身测试的结果：

1. 使用自己授权的作品首次运行，核对 `cacheHit=false`、详情匹配 ID、正的音视频轨时长、媒体字节数和 SHA。
2. 原参数重跑，核对 `cacheHit=true`、缓存键和原片路径保持一致，媒体 SHA 再次匹配。
3. 核对完成清单 `adapterSha256` 对应当前脚本；调用目录没有新增状态数据库，F2 相对状态库位于 attempt 内。
4. 将个人媒体和真实回执保存在仓外；公开回报只提供必要的步骤/计数/通过或失败边界，不粘贴收藏记录。

通过离线测试不能声明已在当前平台完成真实下载；历史私有实跑也不替代换环境后的验收。
