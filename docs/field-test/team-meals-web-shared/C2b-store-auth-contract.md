---
feature_ids: [team-meals]
topics: [web, draft-store, auth, reload-safety]
doc_kind: interface-contract
created: 2026-09-11
---
# C2b 共享草稿与 handoff 的认证归属

证据：非作者 Home/Import `b45d403` review I-R2 的实际浏览器复现。旧 store 仅 planId key；切换注入 API 的 sessionKey 后，A 的草稿/prev/handoff 可被 B 继续读取，并使 Import 跳过 B 的 Source GET。统一 token 事件本身不足以感知注入 API 身份，晚到旧 callback 也不能只在操作时获取“当前用户”再绑定。

固定新增接口（`src/admin/store.ts`）：

```ts
interface DraftStoreBoundary {
  readonly mode: ApiMode;
  sessionKey(): number; // 非凭据的单调认证代次；同 TeamMealsApi
  peekSessionKey?(): number|null; // 纯验证；缺失/null 时更新检查保持 unknown
}
interface BoundDraftStore {
  getDraftPlan(planId:string):AnyMenuPlan|null;
  getDraftSource(planId:string):DraftSource|null;
  setDraftPlan(planId:string,plan:AnyMenuPlan,source:DraftSource):void;
  clearDraftPlan(planId:string):void;
  undoDraftPlan(planId:string):boolean;
  setHandoff(value:Handoff):void;
  takeHandoff():Handoff;
}
bindDraftStore(boundary:DraftStoreBoundary):BoundDraftStore;
```

D 在有效 render 的同步入口使用 `const drafts=bindDraftStore(api)`，所有按钮和异步 continuation 捕获这同一 handle；用 `drafts.getDraftPlan` 等原签名方法取代裸模块函数。异步回调不得重新 bind。Import、Plan、Dish、Ingredient 的 handoff 两端使用同一 TeamMealsApi 对象；默认应用可用 getTeamMealsApi()，注入测试传同一对象。不同实例即使 sessionKey 数字相同也不共享；不同 mode 也不共享。无需 D 建第二套认证 map。

绑定捕获 API 对象身份、mode、sessionKey 及全局不含凭据的 auth generation。共享 store 仅保留一个当前绑定的草稿/prev/handoff；新绑定身份与当前不同则清除旧内容、递增 store lifetime，原 handle 永久失效。同身份切语/往返返回有效 handle 并保留 clone/一层 undo/take-once 语义。认证退出事件立即使当前 handle 失效并清除内容；实际 API 的 sessionKey 变化也会在每次方法调用及摘要可见性检查中被发现。

所有旧 handle 的 get/source/set/clear/undo/setHandoff/takeHandoff 都抛 `ApiError(0,'session_changed','')`。旧 handle 不能重新绑定，不能清除/覆盖 B 后建的新状态；读取抛错也不能被解释成“服务器 not_found”。新的同步 render 重新绑定后，空草稿仍正常返回 null，handoff 为空对象。调用方沿用已有 live 检查与错误处理。

**裸模块函数不能安全识别异步调用者**。保留原导出/签名以避免隐式编译漂移，但默认 fail closed：调用抛 `ApiError(0,'store_scope_required','')`，不读取或改写任何状态。不能让它们自动取“当前身份”再继续，否则晚到 A 回调仍可写进 B。D 必须迁移实际 store 使用点；这项行为加强随固定接口明确交接，不伪称旧页面已通过。无新增持久层，无 token/哈希进入 key、body 或摘要。

reload 摘要与当前绑定同源，只暴露仍属于当前认证的文档身份、代次和 dirty。handoff 有待消费内容时也计为 dirty，摘要不展示名称/返回路径。身份无法核实时只返回通用 unknown，不能展示旧身份的文档标识或内容。检查不通过 dispose 或复制完整正文探测。

非作者 bb68658 review R1 收紧：摘要不能调用 sessionKey/getToken，因为它们会观察身份变化、触发监听并清除编辑状态。TeamMealsApi 的实现提供 `peekSessionKey()`：只验证已观察的身份，变化/未观察/已释放返回 null，不更新代次或发事件。默认 token 使用无 observe 的纯读取；注入 token/identity getter 也必须无副作用。缺少 pure peek 的注入 boundary 在摘要中只能 unknown，不能偷用 sessionKey。普通显式 store/API 操作仍执行正常认证校验。C1 自定义 adapter 追加 `peekAuthSession:()=>api.peekSessionKey?.()`，与原 `authSession:()=>api.sessionKey()` 并列；缺失/null 则只提供 generic unknown 摘要。D 的所有 C1 controller 需要增加这一行，页面 store handle 方法不变。合成全局凭据及注入 credential/identity 变动有负例：仅 inspect 不能触发 auth listener，未知 C1、draft/prev/handoff 保持，反复 inspect 不会由 unknown 变 clear。

验证：A 草稿/undo/handoff 在 B 下均不可见；API 实例不同但数字 key 相同也隔离；旧 A 延迟 set/clear/undo/take 不能触及 B；同身份切语/返回保持完整 v2/v3 metadata 和一层 undo；默认函数不可绕过；全局 logout 与注入 sessionKey 变化都覆盖。原 non-author c1_review 和 D Import→Plan 实际组合继续验收，此文尚不是实现批准。
