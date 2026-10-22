---
feature_ids: [video-recipe-working-example]
topics: [synthetic-fixture, video-recipe]
doc_kind: fixture-guide
created: 2026-10-19
---

# 合成契约样例

本目录由项目自行编写，所有内容均为合成测试输入，没有第三方视频、图片或转写。`media.txt` 不是视频，`reference.bin` 不是图片；JSON 中的时长、音画覆盖和尺寸仅用于检查字段与边界。运行时必须传 `--synthetic-fixture`，输出模式为 `synthetic_reference_replay`。这些测试不证明解码、下载、AI 理解或厨师确认。
