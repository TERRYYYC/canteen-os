---
feature_ids: [team-meals]
topics: [acceptance, browser, client-worker, T01-T09]
doc_kind: test-plan
created: 2026-09-11
status: executing
---

# 最终页面组合验收矩阵

本轮调度明确授权恢复 Q；准备文件中“Q idle”的旧状态被此次固定版本派工取代。输入实现由 `feda0ad68b68a050dc35f579e04b811ec690edf8` 快进到预算元数据修正 `842b778bd352c0dba8921584ce142d94665e5ca2`，生产 packages tree 始终为 `dce6d72208652c80d2aa5b40865bef4a56732226`，等于已审 `7920496e06996eedac6e08e862fa097453ed9462` / 生产 `734e295edbfa03b360e0052a782f8b5c6f0c980c`。不采用旧预算工具的 df992 标签。后续 Q 测试提交会改变 packages tree，不能冒称该完整 tree 仍等于生产输入。

原始验收来源：设计工作区 `docs/design/reference-v3/STANDARD-DATA-AND-ACCEPTANCE.md`，本轮读取并核验 SHA256 `6aaff3f33b65aad6f6952297abae9dd2dafef379bcc0fa64066c07f5300f0352`。这里只映射既定 T01–T09，不增加业务范围。

## 执行路径

实际 `main.ts` + 原页面 + 正式 C API/editor → 本地 HTTP 转发 → 真实 B `worker.fetch` → 既有 GitHub FakeRepo。公开资料由正式 `runBuild(target:team-meals)` 生成。固定时间 2026-09-10T00:00:00.000Z；临时 fixture Git 的作者/日期固定，映射到 FakeRepo 时核验内容/blob。模型后续写入 revision 不冒充真实 GitHub 历史。

| 编号 | 本轮具体动作 / 断言 | 继承证据及不重做边界 | 结果 |
|---|---|---|---|
| T01 | 实际日筛选保存全部四餐，无自动份数，保留原2；新空v3保存/刷新回读；导入无份数与错误原文可见 | 本轮 Node20 Worker/Core/夹具严格格式回归通过；周筛选保全由既有测试覆盖，未另操作第二次浏览器周保存 | **未通过：Q-UI-T01-02** 导入丢失其他餐次11份草稿，待原D修复复验 |
| T02 | 四候选全部可见；tomato两来源，tomato-other同名独立；salt适量、oil缺包装存在；可点来源菜品 | 本轮复跑Q64的独立来源/数值断言 | 本地已执行通过 |
| T03 | draft、缺基准、未录成分实际可见；已有候选仍保留完整性限制；缺引用补充负例2/2 | 实际Worker保存发dangling-ref警告；正式producer按missing-dish/ingredient阻止发布且旧输出字节不变；负例未装到浏览器公共数据 | 本地已执行通过 |
| T04 | 真实保存范围→全check创建→buy/available/bought；元数据rebase保留判断；改份数rebase先保存check+previous，再单独确认保存；其他知识/PO字节不变 | 实际52条handler流水及7个捕获断言；本轮另复跑正式client/handler5/5 | 本地已执行通过 |
| T05 | 页面v3原值/空值与强条件头正确；本轮Worker team118/118（含禁止降级、并发、回退隔离） | 本地真实handler+FakeRepo，不是GitHub/Cloudflare往返；没有浏览器/远端回退 | 本地已执行通过 |
| T06 | A同版材料/菜谱/技法字段与红图，当前B另入口且可返回A；B basis详情/蓝图另验证；技法owner=data/techniques.json、index=1 | C published reader源码等于已审3dd9；自动64项reader/update检查本轮重跑；公共图是1×1合法像素夹具，非设计图签收 | 本地已执行通过 |
| T07 | 实际双客户端旧锁409保5；成功后丢响应，服务端6/本地7经current+pinned双读保7；超时保8；短延迟ACK服务端8/本地9离页返回保9；三语留稿 | 更新/离线原生证据有界继承，详见执行记录；当前更新自动检查通过，未新发原生SW更新 | **保存/冲突分支通过；导航到导入的丢稿归T01-02，未整格宣称通过** |
| T08 | 六主页面×三语×双尺寸36组及actual innerWidth；冲突三语；缺项/旧版；实际复制已操作；导航无顾客入口 | 离线/部署交错原生继承3dd9独立原件；no-SW只消费现有自动/预算边界，未新做原生no-SW；截图非用户签收 | **未通过：Q-UI-T08-01** 具体缺项和来源未进入复制，待原D修复复验 |
| T09 | unknown份数/qty保持未录；盐为原适量；部分来源未知不出总需求；缺包装仍在候选；原配方300g/20ml与参考区分 | 本轮Core103/103、Q64/64含独立黄金和部分数值语义；不把未知字段变零或适量 | 本地已执行通过 |

## 证据纪律

以实际 DOM、截图、客户端请求/条件头、真实 Worker 响应、内存仓文件差异和正式构建产物哈希形成证据。测试准备失败原样留档；产品缺陷保留 RED 并交调度指定原 owner，Q 不改生产代码。最终逐格填写实际执行与继承来源，固定提交交原非作者 v2_review。

本轮是 L1/browser 本地验收，不代表 Cloudflare/GitHub 真实往返、L2、部署、完整用户走查或视觉签收。外层 `.DS_Store` / `.poc-venv` 为既有文件，已报调度并保持原状。

实际操作、请求编号、日志命令与继承来源见 [842执行记录](page-run-842.md)。两个RED及其修复前证据保持独立；整体仍 executing，不因其他自动检查绿色而通过。
