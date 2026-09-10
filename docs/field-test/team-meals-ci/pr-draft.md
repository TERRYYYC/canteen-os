---
feature_ids: []
topics: [team-meals, ci, worker, pull-request]
doc_kind: pull-request-draft
created: 2026-09-11
---

# build: wire Worker to core with Node and browser package entries

## 改了什么

Worker 没有声明 core 依赖，而 core 的 TypeScript 包入口无法由 Node20 的 Worker 测试产物执行。新增 workspace 依赖和对应锁记录，以条件出口让 Node 读取 core/dist、类型检查和前端继续读取 core/src；Worker build 自动先构建 core。没有新增或升级第三方依赖。

## 怎么验证的

pnpm9.15.0 冻结安装通过。实际 Node20.20.2 的包导入从 ERR_UNKNOWN_FILE_EXTENSION 变绿，Worker NodeNext 发出的 bare import 能执行；清除已生成的 core/dist 后，Web typecheck/build 仍通过，Worker test 自动先构建 core。Node20：core64/64、Worker76/76、Web33/33；锁内 esbuild 的 Worker+core 源码 bundle 可加载；旧黄金5行0差异。详细环境、命令与限制见 [证据](dependency-evidence.md)。非作者审查结论由固定提交交接附上。

## 没做什么

没有修改业务源码、schema、测试、生产数据、fixture、CI target 或部署配置。A2/B 公共函数集成、Wrangler 构建、真实 Worker 模式及隔离环境 L2 待对应 owner 的固定交付；一般打包成功与 mock 测试不代表真实保存或部署可用。本稿不对应已创建的 GitHub issue，不使用虚构 Closes 编号。

## 涉及数字的手算算式

采购算法和输入未变；原数值/单位测试及黄金比对保留，无新增采购算式。
