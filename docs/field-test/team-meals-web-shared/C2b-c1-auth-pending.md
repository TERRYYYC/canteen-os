---
feature_ids: [team-meals]
topics: [web, edit-session, auth, pending-write, reload]
doc_kind: implementation-contract
created: 2026-09-11
---
# C1：认证结束不等于旧写入结束

调度在完整 C2b 消费链发现：此前 seal 会清除 documents 并注销 reload provider，使实际已发出的 held save / outcome-unknown 在正常 auth observe/logout 后变成 clear。这不是 d8 的 pure inspect 缺陷，而是 PWA 新依赖全生命周期摘要时暴露的退出缺口。新测试在旧代码 4 失败/1 通过；其中包含真实 Team API 的已发送请求后 session invalidation。

认证变化仍立即清掉可见私有正文/文档身份并封闭旧 editor；新身份不能编辑、读旧正文或代为 reconcile。仅已送入 adapter.save 的操作在共享层留下不含正文、File、文档 ID 或凭据的内部 operation 编号集合。通知期间身份变化、尚未调用 adapter.save 的情况不登记外部写入，不制造假 unknown。

sealed editor 仍有编号时，provider 只返回 previous-session-save 通用 unknown。新 B 的 provider、正文和操作独立；dispose、timeout、切语、重复认证或新 B 的成功不能解除旧 A 标记。自定义 adapter 的身份之外，C1 也绑定全局认证生命周期，不能用恒定的注入 identity 忽略正常登出。

只有原操作闭包的明确结果能删除其编号：形状合法的 WriteResult（commit 必须完整小写 40 位 SHA），或明确 HTTP 拒绝。4xx 中 timeout/499、bad_response 与 session_changed 不作为未生效证明；网络/5xx 仍未知。结束一个不能删除其它旧操作；最后一个确定结束时才注销旧 provider，不恢复旧正文，也不写新 B。原 real transport 为保护身份把旧响应转成 session_changed 时，C1 不能反向猜测被丢弃的响应是否成功。

已经丢失响应又失去原认证的操作可能无法在该会话内获得更多证据；保留通用 unknown，不新增跨认证读取、恢复平台或手动伪结算入口。PWA 对这类状态使用“先前会话仍有未核实工作”的通用提示，不把用户送回已封闭的私有编辑器，不提供强制弃稿更新。浏览器强制关闭/刷新仍会结束内存会话，不宣称持久恢复。

回归：A held→B→A ACK 只清 A；A 已 unknown→logout/dispose 仍未知；409/401/429 拒绝可确定结束；session_changed/bad_response/503/408 不可；在 saving 通知中认证变化但尚未发请求无 phantom marker；真实 Team API 的 session invalidation 仍未知；注入恒定 adapter identity 不能绕过全局 auth；actual pwa.ts 的通用提示不含旧 ID、不提供弃稿且不触发 save/activate/reload。此为本地模拟与共享实现证据，不是生产写入或 D 页面组合通过。

审查补验：同认证真实 Team API 的 409 malformed/bad_response 也保留 unknown，不能走明确 conflict 分支清掉编号；自定义 adapter 返回空白、非 revision、短/长 SHA、大小写错误或分支名 ACK 均不能解除当前或旧认证写入保护。两项先红后绿。
