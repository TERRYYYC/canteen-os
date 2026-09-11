---
feature_ids: []
topics: [team-meals, fixtures, semantics, references, manual-decisions, estimates]
doc_kind: verification-evidence
created: 2026-09-11
core_commit: ad1f427ae8d7ffc6841bfd2e51c279d2c90381d2
input_commit: 4878a8679b00baade5468fb2df4907fecb2a4f0a
---

# RC-Q：固定样本的 A2 纯 core 验收

8 组本地语义检查通过，复用既有样本，没有新增业务实体 JSON 或改写 core 算法。
这次执行的是正式 core 的收集、判断、复核、估算和 JSON 投影；不是 Worker 准入、真实历史
或端到端完成声明。旧 A1 的 19 份格式样本及语义待验记录保留为该阶段快照。

| 来源 / 归属 | 固定版本 |
|---|---|
| Q A1 已审核输入与分支基点 | `4878a8679b00baade5468fb2df4907fecb2a4f0a`；`codex/team-meals-acceptance-next` 保持冻结 |
| 调度放行、非作者审查通过的 A2 core | `ad1f427ae8d7ffc6841bfd2e51c279d2c90381d2`，RC-A |
| Q 新本地分支 / 机械依赖 merge | `codex/team-meals-acceptance-semantics` / `18efbf4012eb5f127d7f4ee6dd58d9f7ec16d14c` |
| Q 本次代码 | 仅已有 `scripts/validate-contract-fixtures.test.mjs` 增加消费者检查；校验器、core、Worker 未由 Q 改写 |
| 测试元数据 | `test/fixtures/contracts/semantic-expectations.json`；父清单锁定其字节 |

依赖 merge 带入的九个文件（core 实现/出口/测试、已有黄金消费路径、合同与模块文档）均为
已放行 RC-A 上游。新 build target、图片解码、B2、Web 与 L2 不在该依赖中。

输入由已有 base+overlay 物化到临时目录，然后以真实 JSON 对象交给正式函数。A1 组合只把
`pending-a1/valid/menu-plan-v3.json`、`dish-v3.json` 分别装入 team-week、second-dish；其他实体
保持 boundary 输入。每组资料与内存变体在调用 core 前经过正式 `validateEntity`；悬空引用
有意保留，不能把格式有效误称引用可解。生成清单也按正式 ShoppingList schema 验证。

`revisionTokens` 的 a/b/c 分别取已有完整 SHA `3d9f2aa…`、`4878a867…`、`ad1f427…`，
**只用于纯函数输入分组，不表示这些输入是相应提交的生产 data 树。** 本测试不解析 Git，
没有证明可达性、祖先关系或真实 previous 历史。两个版本的对象始终由测试显式分别提供。

| ID / T 子集 | 输入与显式内存变化 | 实际观察 |
|---|---|---|
| A2-S01 / T02 | A1 组合；重复 selection；另重复 first-dish 的 salt 成分及第一条菜单行 | 原始 4 个 ID、6 个来源地址均保留；同名 tomato-other 不合并；未知 qty/份数/base 不补。重复 selection 不放大；原始重复来源保留，oil/salt/tomato/tomato-other 来源数为 2/5/3/1 |
| A2-S02 / T03 | 既有 missing-dish/ingredient/technique overlay；既有 name-only 餐次；不存在计划与已知空餐范围 | 缺菜为 incomplete/unresolved；缺食材/技法仍保留候选，为 complete/unresolved；未录成分为 incomplete/resolved；已知空范围为 complete/resolved；recipeCompleteness 始终 unverified。缺 plan 创建拒绝 basis_unavailable，其他上述缺项可生成 check |
| A2-S03 / T04 | 原 semantic/duplicate-ingredient；原有效清单仅内存删一项/加陌生项 | 三者格式均接受；正式 reconcile 均以 invalid_selection 拒绝，原输入不变。未证明 HTTP 状态码、路径或首次写入规则 |
| A2-S04 / T04 | 从全 check 执行 oil buy+bought、salt available、tomato buy+bought；first-dish 番茄 300 g→301 g；相同 basis 复算；仅倒序/乌语/展示价格/库存更新；显式 check | 只有 tomato 需复核，previous 精确等于原 shopping-decisions 样本参考；原已买/available 保留。纯复算和展示更新保留 previous；明确人工 check 清除 previous，不修改旧对象。非 buy 携带 bought=false 拒绝 |
| A2-S05 / T01/T04 | 扩大到 9/15 午餐、再加 9/14 晚餐这两个已知空范围；装入原 empty-menu-plan；再恢复原计划 | 扩范围使全部存续项 check；再次扩大保留唯一最近判断，不嵌套。清空后 items=[]、removed 保留原 bought；重新加入全 check，不复活旧购买。空范围预算 not-applicable |
| A2-S06 / T09 | 原 480/500/200 三份手算场景，仅沿用已定义首餐份数/范围变体 | 正式 estimate 的包数、Quantity、Money、net/gross 与独立 oracle 比较，分别 1525.50/1554/688 元。200 份的盐无采购行但仍是候选/check，不自动 available |
| A2-S07 / T09 | 保留 v2 显式份数的 boundary + v3 second-dish 未知 qty；加入 name-only、缺菜；对照 A1 缺份数组合 | 番茄包含已知和未知来源时无部分 lines；盐适量、油缺包装、缺基准/份数分别保留原因。未录成分/缺菜使所有候选估算 unavailable，不用 0 或局部合计冒充总量 |
| A2-S08 / T06 子集 | 原 golden 的 clip/provenance/技法/Quantity；原 local-image 的 ImageRef | 投影原 JSON 字段保持且深拷贝；修改返回值不改输入。没有获取、解码或核实同版图片字节，示例视频仍未验证 |

S04 的价格 99 与 onHand 999 仅是展示变化对照，不用于采购计算；不会写入固定业务样本。
S01 来源数直接数原始菜单/成分地址，未从收集算法生成 expected。S06 复用独立手算文件，
不从新估算器重生 expected；原 15 份 golden JSON、19 份 A1 实体 JSON 均保持字节不变。

```sh
npm --prefix packages/core run build
node --test --test-name-pattern='A2-S' scripts/validate-contract-fixtures.test.mjs
node --test scripts/validate-contract-fixtures.test.mjs
node --test packages/core/test/*.test.mjs
node scripts/validate-contract-fixtures.mjs
node scripts/build-data.mjs --root test/fixtures/contracts/valid/golden --check --compare-snapshots --at 2026-09-10T00:00:00.000Z
```

实际结果：新增验收 8/8、Q 全套 64/64、上游 core 87/87；fixture CLI 保持 22/22 v2 和
19/19 A1 格式。CLI 本身不执行 A2 语义，语义证据来自上面的 node:test 命令。golden 构建
5 行一致、0 差异、0 issues/pending，未写文件。本次只验证已实现、已审核行为，首次运行即绿；
没有修改产品行为或发现需修复的回归，不捏造 RED 记录。

仍待：真实 Worker 候选/previous 准入与条件头、路径 ID、历史读取/祖先关系、原子保存与冲突、
同版资产 bytes、新构建 target、浏览器三语/尺寸/离线及真实 L2。纯 core 不负责禁止悬空食材
被人工确认，不能由 S02 可创建 check 推断 Worker 允许 buy/available。未对全部 A0 边界
或 T01–T09 整条验收作通过声明。原三份 `/tmp` 发布材料哈希未变，本分支未推送或建 PR。
