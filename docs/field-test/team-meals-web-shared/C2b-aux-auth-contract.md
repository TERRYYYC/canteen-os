---
feature_ids: [team-meals]
topics: [web, auxiliary-edits, auth, reload-safety]
doc_kind: implementation-contract
created: 2026-09-11
---
# 辅助缓冲与异步操作的认证边界

本合同追加到 C2b-aux-contract；不复制正文、不新增持久平台。注册在页面正常同步入口捕获认证，摘要仅使用 pure peek。显式认证切换可放弃旧身份纯本地缓冲，但不能把未决外部操作变成“已结束”。

```ts
interface AuxiliaryAuthBoundary {
  readonly mode: ApiMode;
  sessionKey(): number;
  peekSessionKey?(): number|null;
}
interface AuxiliaryEditOptions {
  // 原 ownerId / identity / read 保留
  boundary?: AuxiliaryAuthBoundary; // 同页 TeamMealsApi；省略则仅绑定全局认证
  operationTracking?: 'tickets'|'local-only';
}
interface AuxiliaryEditHandle {
  dispose(): boolean;
  beginOperation(kind:'read'|'write'): AuxiliaryOperation; // 不含 ID/正文的 opaque 对象
  markUnknown(ticket: AuxiliaryOperation): boolean;
  settleOperation(ticket: AuxiliaryOperation, outcome:'completed'|'failed'): boolean;
  cancelRead(ticket: AuxiliaryOperation): boolean;
}
```

`local-only` 是页面作者的明确声明：该 owner 仅有尚未提交的本地缓冲，绝不启动外部操作。上传、文件读取、源查询、POST 发布、轮询/恢复等 owner 使用 `tickets`，**每次异步操作开始前**同步领取票据，不能等返回或 auth 事件后登记。并发操作各有票据；同一发布操作的轮询/只读核实沿用原票据，不能用发出一个 GET 替代终态证明。已登记在 C1 的保存仍由 C1 负责，不重复领取辅助票据。

未声明 operationTracking 的旧适配器保留同认证内旧行为；换认证后按 unknown 处理，不能据此宣布页面认证保护接入完成。注入 boundary 缺 pure peek 或纯验证失败同样 unknown。默认全局认证检查、boundary 检查、注册/退出均不把凭据放进 owner/key/stamp/DOM。

同一个 ownerId 在同一全局认证、同 boundary 对象/模式/代次内重复注册仍拒绝；不同认证或不同 boundary 生命周期由共享层区分，允许旧未决 owner 与新 owner 并存。D 继续使用稳定 ownerId，不自造凭据/hash/auth map。所有摘要的辅助 ownerId 使用共享层生成的不含私有身份的内部序号；只有验证为当前认证时才附文档 kind/id。

| 事件 | 共享层和页面的责任 |
|---|---|
| beginOperation | 只允许注册时身份仍有效；票据属于唯一 handle，进入 busy；页面必须在启动操作前持有它。read 包含本地解码/文件读取/只读 GET；write 包含可能生效的上传/发布等外部写入 |
| 本地读取结束或取消 | read 票据可 settle 或 cancelRead；取消立即结束其本地责任，不制造永久 unknown。cancelRead 拒绝 write 票据；外部写入不能凭 AbortSignal/取消 UI 推断未生效 |
| 响应丢失、超时、关联不明 | markUnknown 保留原票据。普通 catch 不能自动当作明确失败；本地读失败、服务端明确拒绝等具有确定证据时才 settle failed |
| 确认成功或明确失败 | 原闭包凭原票据 settle；每票据一次，伪造、重复、其它 handle 的票据拒绝。结束一个不能解除另一个未决票据 |
| auth 变化 | 摘要不调用旧 read，不读旧身份。仍有票据只显示无私有标识的通用 unknown；auth handler、清空局部 operation、切语/离页、timeout/dispose 均不能结束票据 |
| 新身份打开同页 | 获得独立 handle；旧回调/票据不能操作新 handle。旧未决标记仍保护整页更新 |
| 旧操作获得确切结果 | 只 settle 原 handle 的原票据。所有旧票据确定结束后退休该旧记录；不更新新身份 DOM、草稿或 owner，不要求恢复旧私有正文 |
| 旧纯本地 owner 或票据已全结束 | 显式认证切换后没有未决外部操作；旧记录可 dispose，摘要不再带旧身份。检查本身不触发退休副作用 |
| 同身份 dispose | 仍要求 clean+idle 且无票据；不作为探测器或强制丢弃入口 |

`tickets` 模式下票据是异步未决状态的依据，read 仍是本地输入、dirty、generation 的来源；页面不能宣称使用 tickets 却漏登记异步操作。每次输入/结果更新原 generation，票据变化另外使更新确认失效。检测到 read 声称 busy/unknown 但没有票据时按不完整登记处理，阻止更新，不能伪装清态。

发布终态尤其遵守 B 的固定合同 5100ffa0：已知 runId 精确相同且 runCompleted 是 boolean true 才能结束该运行票据；runConclusion 的 null/陌生值仅代表结论未知，不可标成成功。步骤 failure、旧 status failure/timeout/unmapped、时间经过以及 latest 返回均不能替代精确关联的整体结束证据。未知 POST 没有 runId 时不靠 latest 清票据。

`settleOperation(..., 'completed')` 只表示操作确定已结束，不是发布成功信号。即使 runConclusion 为 null/陌生值，精确关联的 runCompleted=true 仍可证明运行结束；D 必须另行把结果显示为结论未知，不能据票据结算显示发布成功。

页面 coverage 也绑定 render 当时的全局认证。旧认证的 untracked 页仅以通用 unknown 留在摘要，原 route ID 不进入 record/stamp；旧 tracked/read-only 身份不再输出。检查不清 Map。旧 render 的完成回调只能完成它捕获的旧认证/旧 generation，不能解除新认证同页的 untracked；同认证被新 render 替代的旧回调仍忽略。这样既保留旧未完成页的阻断，也允许它实际完成登记后结束该阻断。

初始化的提前返回/取消也必须结算本次 coverage：若仍有编辑缓冲或未决外部写入，先登记其 C1/aux owner，再用本次 ctx 回调声明 tracked；若仅本地/只读初始化已经结束或明确取消、没有遗留编辑状态/外部操作，声明 read-only。用该旧 ctx 的回调可完成旧认证记录，即使新认证已经打开同页。不能在 auth handler 中无条件声明 read-only，也不能先因 stale 检查 return 后永远不结算；D 在初始化 finally/取消路径复用本次回调，实际组合需覆盖 A 初始化中→B→A 取消→B 同页。共享层不会仅凭 auth/超时推断初始化已结束。

验证边界：合成身份 A→B；busy/unknown 在 auth handler 把旧 read 改成 clean 后仍阻断；摘要不读旧 read、不含旧身份、不发 auth 事件；两个旧票据只结束一个仍阻断；旧票据不能动 B；确切结束全部旧票据才退休旧标记；无票据的合法纯本地 owner 可正常换身份。页面是否确切取得终态由 D 及其非作者 review 验证，C 不把共享票据测试写成真实发布通过。
