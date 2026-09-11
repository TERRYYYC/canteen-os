---
feature_ids: [team-meals]
topics: [web, reload, auxiliary-edit-state]
doc_kind: module-contract
created: 2026-09-11
---
# C2b 页面辅助状态登记接口

接口目标：`src/view-models/reload-safety.ts`。与 C1 自动全记录摘要进入**同一**应用更新聚合器，页面不实现全局更新算法。依据调度确认的 D Dish review `6ca272d`：raw 图片文件、内联食材输入尚未进入 C1 JSON；辅助上传可能先于 C1 save，单看 C1 dirty/pending 不足。

```ts
interface AuxiliaryEditState {
  generation:number; // 非负整数，每次输入/开始操作/结果到达/显式放弃均递增
  dirty:boolean;      // 存在未序列化或尚未保存的本地缓冲
  phase:'idle'|'busy'|'unknown'; // busy 包含上传等辅助操作；unknown 为结果未核实
}
interface AuxiliaryEditOptions {
  ownerId:string; // 应用生命周期内稳定唯一，如 dish-buffer/<docId>；不是渲染实例ID
  identity:{kind:string;id:string}; // 用户可识别的页面/文档，不含正文/凭据
  read():AuxiliaryEditState; // 同步、只读、无副作用，读页面owner的实际状态
}
interface AuxiliaryEditHandle {
  dispose():boolean; // 仅 read 成功且 !dirty && phase==='idle' 时卸载；否则 false
}
registerAuxiliaryEdits(options:AuxiliaryEditOptions):AuxiliaryEditHandle;
```

登记在页面状态 controller 的应用/文档生命周期建立一次，不能每次 render 建一份。重复 ownerId 拒绝；必须复用原 controller/handle，不覆盖旧 provider 或把尚未完成的状态替换为初始空状态。generation 不倒退；不合法、读取抛错或身份不完整均按未知阻断，不能按 clean 处理。

示意（D 负责真实状态与事件）：

```ts
const reloadHandle = registerAuxiliaryEdits({
  ownerId:`dish-buffer/${docId}`,
  identity:{kind:'dish',id:docId},
  read:()=>({generation:bufferGeneration,dirty:hasUnsavedBuffer,phase:auxPhase}),
});
```

这里不传 File、Blob、正文、token，不往 Dish/MenuPlan JSON 塞假字段。状态为派生摘要，真实缓冲与上传结果仍只有 D owner 管理。C1 文档不要重复手动登记，其所有离页记录由共享层自动汇总；只登记 C1 不拥有的缓冲/操作。

| 事件 | owner/聚合器责任 |
|---|---|
| 选图片、改内联输入 | D 递增 generation，并按真实缓冲设置 dirty；不能因 C1 dirty=false 而抹掉辅助 dirty |
| 上传/辅助请求开始 | D 设 busy；更新检查延后，不允许弃稿强刷 |
| 返回成功/失败/结果未知（包括晚到） | D 递增 generation，更新实际 phase/dirty；unknown 在明确核实前保持。旧弃稿确认因此失效 |
| 语言切换/离页 | 保留同一 controller/provider，不在 render cleanup 中卸载；dirty/busy/unknown 时 dispose 返回 false，owner 必须继续持有 |
| 明确保存或放弃本地缓冲 | D 先按实际结果更新摘要，确认 idle 且无 dirty 后才可 dispose；结果未知不能靠“放弃”删除保护 |

聚合器优先级：unknown/登记异常 → busy（与 C1 saving 合并）→ dirty → clear。弃稿确认绑定全部 C1 与辅助记录的身份、generation、phase、dirty/pending；任何新事件都使旧确认失效。应用更新提示本身不保存、不上传、不核实、不刷新；用户选择核实后回到对应 owner 的已有恢复流程。整页更新前再次同步检查。

实现与验收并入 C2b：C1 clean + raw buffer dirty、辅助 busy/unknown、切语离页、旧操作晚到、新输入使弃稿确认过期、重复登记和拒绝卸载全部有测试。此文固定接口目标，不声称代码/页面/PWA 已通过；由调度分发给 D，最终组合与独立 review 仍必需。

## 页面覆盖声明与恢复路径

`PageCtx` 追加可选方法：`setReloadCoverage?(value:'tracked'|'read-only'):void`。
D 调用 `ctx.setReloadCoverage?.('tracked')` 的前提是该屏所有可丢失的编辑输入及未决操作都已由 C1 或辅助 provider 覆盖；声明不读取/清除任何 provider。明确只读的 admin home、导航/说明/结果页可声明 `read-only`；有名称预填、File、内联输入或启动中的异步工作不能仅因 C1 尚未打开就声明只读。

main 以 `page:${route}/${rest}` 为稳定页面身份；语言不参与身份，每次 render 有单调 render generation。admin 和 purchase render 默认 `untracked`；只有明确只读的 menu/prep/qr 默认 `read-only`，未知路由也保守 untracked。purchase 的 listId/planIds/selected 等输入在 create/rebase 前尚未进入 C1，D 需先登记这些辅助状态才能声明 tracked；不能按“非 admin”推断只读。coverage 状态属于每个已访问的稳定身份，不是一个离页时清空的全局布尔值。untracked 在全局检查中阻止刷新，并显示页面身份，用户可返回该入口完成初始化/处理后重新检查。reader-only 更新同样不会重画 admin 或 purchase 的编辑 DOM。

| 场景 | 声明/恢复语义 |
|---|---|
| 同身份重进或切语 | 新 render 先恢复 untracked；D 复用原 C1/aux owner，完成接线后再次声明。前一 render 回调不能覆盖该身份的新声明 |
| 离页时异步初始化尚未结束 | 该身份仍 untracked。若此身份尚未有更新的 render，原 callback 在真正注册好 provider 后仍可声明 tracked，解除这一覆盖阻断；它不重画页面、不释放 provider。若已有更新 render，旧 callback 被忽略，由新 render 负责声明 |
| 从未完成注册或初始化失败 | 保持 untracked；重进同身份重试。错误页只有确实没有保留缓冲/未决操作时才可声明 read-only，不能丢失数据后借此声称安全 |
| 曾 untracked 的同身份现在只读 | 当前有效 render 可声明 read-only，解除该页面的覆盖阻断；同身份及其他身份仍存活的 C1/aux dirty/busy/unknown 继续阻断，不被声明覆盖 |
| 导航到另一个只读页面 | 只设置新身份；不会清掉旧身份的 untracked，也不会注销任何编辑 owner |
| owner 正常结束/注销 | 辅助 owner 必须先满足既有 dispose 的 clean+idle 条件；C1 按原 app 生命周期。coverage 不负责 dispose，不提供强制清空接口 |

因此不需要 D 保存 route generation 或手动注销页面声明；使用本次 `ctx` 的回调即可。main 只保留每身份最新 render generation，不是所有 render 的历史。这里细化此前“晚到旧 render 忽略”为**同身份已被新 render 替代时忽略**，允许离页后完成的真实注册解除阻断，避免无从恢复的 unknown。未登记状态不提供弃稿强刷；优先级为 unknown → busy/saving → untracked → dirty → clear。完整 provider/coverage 集合变动均使旧弃稿确认过期。
