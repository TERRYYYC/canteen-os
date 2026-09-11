---
feature_ids: [team-meals]
topics: [acceptance, browser, client-worker, T01-T09]
doc_kind: test-plan
created: 2026-09-11
status: executing
---

# 最终页面组合验收矩阵

本轮调度明确授权恢复 Q；准备文件中“Q idle”的旧状态被此次固定版本派工取代。输入实现 `feda0ad68b68a050dc35f579e04b811ec690edf8`，packages tree `dce6d72208652c80d2aa5b40865bef4a56732226`，等于已审 `7920496e06996eedac6e08e862fa097453ed9462` / 生产 `734e295edbfa03b360e0052a782f8b5c6f0c980c`。不采用旧预算工具的 df992 标签。

原始验收来源：设计工作区 `docs/design/reference-v3/STANDARD-DATA-AND-ACCEPTANCE.md`，本轮读取并核验 SHA256 `6aaff3f33b65aad6f6952297abae9dd2dafef379bcc0fa64066c07f5300f0352`。这里只映射既定 T01–T09，不增加业务范围。

## 执行路径

实际 `main.ts` + 原页面 + 正式 C API/editor → 本地 HTTP 转发 → 真实 B `worker.fetch` → 既有 GitHub FakeRepo。公开资料由正式 `runBuild(target:team-meals)` 生成。固定时间 2026-09-10T00:00:00.000Z；临时 fixture Git 的作者/日期固定，映射到 FakeRepo 时核验内容/blob。模型后续写入 revision 不冒充真实 GitHub 历史。

| 编号 | 本轮具体动作 / 断言 | 继承证据及不重做边界 | 结果 |
|---|---|---|---|
| T01 | main 计划页不填份数增加菜；日/周过滤后整份保存、固定回读；保留原 2 份；空计划真实保存回读；导入无份数和原文错误展示 | A/B 对应版本严格校验 | 待执行 |
| T02 | 实际采购页显示四个候选；tomato 多来源；tomato-other 同名独立；salt 适量、oil 缺包装均存在；来源菜品入口可打开 | Q afc 固定来源数组独立断言 | 待执行 |
| T03 | draft、缺基准、未录成分真实可见；覆盖限制不得因非空候选消失；缺引用负例走正式 producer/API 并如实归层 | 不将负例混为合法公开输入 | 待执行 |
| T04 | 从已保存版本读取范围→全 check 原子创建→人工 buy/available/bought；需求变化→单独保存 rebase→再确认；只改清单；非需求资料变化保留判断 | e721 五组 client/handler 证据；本轮补真实页面 | 待执行 |
| T05 | 页面保存 v3、原真值保持、条件头及固定读回；本地复跑既有禁止降级/回退隔离回归 | 不写第二套迁移/回退引擎，不调用真实回退 | 待执行 |
| T06 | 清单 A 打开食材/来源菜品，核对名字、字段、图片字节、版本头；当前 B 明确另入口；缺图不补当前；技法 owner/index 正确 | C/CI reader 与 SW 独立证据按固定来源继承 | 待执行 |
| T07 | 两个实际页面客户端冲突保草稿；真正提交后丢响应、恢复双读、晚 ACK 保留后续编辑；切语/离页与检查更新不清稿 | D 已审更新链/模块晚写修复有界继承 | 待执行 |
| T08 | zh/en/uk × 393×852、1440×900 主流程截图和尺寸检查；缺项/冲突/旧版；复制/导出实际内容；不出现顾客入口 | 离线、无 SW、A/B 交错按已审 C 原件标明是否重跑；截图数量不是用户签收 | 待执行 |
| T09 | 页面未知份数/qty保持未知，适量只显示原适量；部分可算不称总需求，缺包装不隐藏候选；原配方和参考分开 | 原数值黄金独立样本，正式既有数值测试复跑 | 待执行 |

## 证据纪律

以实际 DOM、截图、客户端请求/条件头、真实 Worker 响应、内存仓文件差异和正式构建产物哈希形成证据。测试准备失败原样留档；产品缺陷保留 RED 并交调度指定原 owner，Q 不改生产代码。最终逐格填写实际执行与继承来源，固定提交交原非作者 v2_review。

本轮是 L1/browser 本地验收，不代表 Cloudflare/GitHub 真实往返、L2、部署、完整用户走查或视觉签收。外层 `.DS_Store` / `.poc-venv` 为既有文件，已报调度并保持原状。
