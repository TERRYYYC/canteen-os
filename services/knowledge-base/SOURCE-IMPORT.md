---
feature_ids: [knowledge-base]
topics: [source-import, provenance, privacy, compatibility]
doc_kind: source-manifest
created: 2026-10-19
---

# 知识库源码迁入说明

来源是已有独立 Git 工程 `canteen-kb-sqlite` 的固定提交：

```text
08d6effeed2c6a56f088820c3d45bc80593ab044
```

应用版本 `0.1.2`，迁移版本 `6`。迁入其 tracked API、独立前端、schema、001–006 迁移、锁文件、测试、导入/视频证据/运维脚本和方法文档；没有导入原仓 `.git` 或提交历史。

## 迁入时的整理

- 不迁入旧现场调度合同 `COORDINATION.md` 和历史独立审查记录 `tests/ops/review.md`；协作规范以本仓根 `AGENTS.md` 和当前合同为准。
- README 改为同仓源码入口；原 M1 状态及审查记录明确标为历史，不冒充这次验证。
- 测试中的真实平台作品 ID 替换为固定合成 19 位 ID，保留校验/错配语义；合成一像素测试图片保持不变。
- 文档中的个人绝对路径、真实主机别名、收藏标题/作品 ID、私有样本时长/字节数/媒体散列和运行回执定位均移除或替换为中立占位说明；旧外部现场附件不作为 clone 后的依赖。
- systemd 模板使用 `%h/canteen-kb`。远端脚本使用执行用户 `$HOME/canteen-kb`，要求显式 `KB_DEPLOY_USER`，prepare 另要求 `KB_SOURCE_RUNTIME`。保留旧服务保护和发布确认参数，不默认操作某个真实用户服务器。此次未执行部署。
- 浏览器测试证据默认写入模块内已忽略的 `test-results/browser/`，可用 `KB_BROWSER_EVIDENCE_DIR` 指向仓外，避免旧相对路径在主仓 `services/` 留下运行证据。
- 视频缓存排除边界由模块根扩为包含它的整个 Git 根（普通 checkout 与 worktree 均适用），无 `.git` 的整仓源码归档按 workspace/core/schema 标记保护整个主仓，真正独立分发的模块包才回落模块根；模块内 ASR/OCR 脚本定位不变。此脚本修正会改变其内容指纹和新缓存键，本次不迁移或重跑既有私有缓存。
- CLI 失败测试显式指定替身工具路径，并在空 PATH 下验证，避免 CI 依赖系统 FFprobe；生产工具缺失预检保持不变并增加保护用例。
- 应用 API、数据库迁移、不可变修订和菜单采用语义不因迁入改变。Node/SQLite 最低版本、独立 npm 锁文件保持不变。

## 未纳入 Git

SQLite/WAL/SHM、视频/音轨/截帧、OCR/ASR 原文、候选产物、模型、缓存、上传、备份、凭据、运行环境、`node_modules`、生成包、部署回执及私人证据均不随源码迁入。合成测试 fixture 保留；它们不代表真实厨房内容。

F2 与音画工具仍需按运行说明单独准备。完整 50 条批量调度和现有业务数据同步不在这次迁入范围；现有部署也不会因仓库新增目录自动升级。

## 后续范围

迁入提交 `2224e6a` 时，原方与食堂用量拆分、带位置的未知项还没实现。这次迁入只提供源码和测试入口，不关闭 [#182](https://github.com/TERRYYYC/canteen-os/issues/182)。

之后 #182 在本模块实现了格式 3，接口见 [API 合同](docs/API-CONTRACT.md#菜谱格式-3原方和食堂用量分开记没说清带位置adr-0012canteen-os182)。还没完成的验收：真实资料和远端部署。
