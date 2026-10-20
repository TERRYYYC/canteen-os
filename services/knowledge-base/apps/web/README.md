---
feature_ids: [knowledge-base]
topics: [historical-implementation]
doc_kind: historical-note
created: 2026-09-19
---

> 历史记录（2026-09-19），不代表本次源码迁入的 review、测试或部署结论。当前操作入口见[模块 README](../../README.md)；以下保留当时范围与验证边界。

# 前端实施与联调说明

**状态：前端源码已冻结，可进入最终集成。** 本任务不再修改源码或 dist；最后生产构建为 `index-CfEmq8uX.js` / `index-Lo6rXSFR.css`。根可重新构建并复制到隔离目录验收，避免 Vite emptyOutDir 与测试同时使用 dist。

所有实现位于本目录，仅使用真实 `/api/v1`。根目录运行 `npm run dev:web`、`npm run typecheck`、`npm run build`；端口 5177，开发代理到 4390，生产输出 `apps/web/dist`。

## 已实现入口

- 顶部「收藏菜谱」→「菜名 *」→「收藏这款菜谱」。仅名称可保存；同名各自独立。
- 列表搜索标签「搜索菜名或食材」，标签按钮过滤，「加载更多」游标分页。
- 「添加食材或调料」「添加一个步骤」生成稳定 UUID，移动/编辑不变 ID。
- 用量明确分「未知 / 暂未填写」「准确用量」「适量」「按原文描述」；准确数量是字符串。
- 「其他语言」可维护 en/uk；原文、预处理、ingredientId、来源 evidence、视频 clip 都随完整 PUT 保留。
- 「上传图片」、视频链接「添加视频」、资料来源「添加来源」「添加这份资料」先登记再关联。异步完成只函数式追加 refs，期间标题/配料编辑不会被旧 props 覆盖；保存和导航等待素材请求完成。
- 「保存修改」带 X-KB-Client / Idempotency-Key / If-Match；409/412 保留输入；「放弃输入并加载最新版本」再次确认后替换。
- 响应丢失/网络错误/5xx 保存原请求；「核对保存结果」复用原 key、body、版本。未确认期间锁定编辑；请求在发送前存 sessionStorage，刷新可恢复。浏览器禁用存储时仍可在当前页面重试。
- 「查看历史版本」只使用该历史接口返回的 recipe/media/sources，绝不拼接当前素材。
- 删除已关联素材的步骤会确认，并把素材改成 reference；不会留下失效 stepId。

## 来源读取字段对齐

`docs/API-CONTRACT.md` 最初未定义来源正文如何读取；recipe.sources 只有 sourceId/evidence。已读到后端实际返回 sourceRecords，前端已优先兼容此字段（也兼容 sources）。请主调度在 API-CONTRACT.md 补齐同级返回字段：

```ts
sourceRecords: Array<{ id: string; kind: 'web'|'video'|'text'|'file'; title?: string; author?: string; url?: string; textContent?: string; assetId?: string }>
```

detail 与 revision 的 sourceRecords 必须来自该版本快照。缺失时界面保留关联并明确说明服务未返回来源内容，不伪造 URL/原文。

跨任务回报工具在本线程被权限策略拒绝（需要审批，但 approval policy 为 never），故通过此所有权目录内文档交接。尚未由此线程部署远程，也不把编译通过当成真实联调通过。

## 编译验证

2026-09-19：`npm run typecheck` 和 `npm run build` 均通过。构建不依赖外部字体或 CDN。主调度拥有 tests/browser，正在进行真实 SQLite 浏览器验收。

## 最后审查修复与额外回归

- 独立子 agent 两轮代码审查通过。归档在素材请求进行中禁用，函数入口也保护。
- 未点击添加的 video/source 内容已提升到父级，纳入 sessionStorage 草稿、dirty 和离开提醒；总保存会提示先添加或清空，避免路由切换丢输入。上传图片保留待加视频文字。
- 根目录可运行 `node apps/web/tests/regressions.mjs`：创建提交成功但响应丢失后刷新恢复原请求、待加来源刷新保留、完整 PUT 字段保真、删步骤改素材引用、历史正文及手机宽度。该额外脚本在本线程受 listen EPERM 限制，**尚未执行通过**，请由有本地监听权限的主调度运行；不会触碰远程或正式数据。
- 本线程读到主调度浏览器报告已有 10 项通过（含刷新与历史来源显示）；最后媒体草稿保护是在该报告之后修复，需最终再跑回归。
- `npm run typecheck`、`npm run build` 在最终修改后均通过。
