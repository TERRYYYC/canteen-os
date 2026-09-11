---
feature_ids: [team-meals]
topics: [acceptance, import, T01, T07, native-browser]
doc_kind: execution-record
created: 2026-09-11
status: native-green-review-pending
---

# Q-UI-T01-02 原生复测

实际页面的“未保存11→导入另一餐→仍11”已通过，受影响的原始输入、增删、主动留空和迟到保存响应检查也通过。此目录记录新的 Q 原生旅程；关闭问题及最终本地矩阵仍等待原非作者 v2_review 对固定追加提交的批准。原 842 的 11→8 RED、原 repro 和所有旧截图不改写。

## 输入与授权

唯一调度正式放行 D 完整 `fa6d1ab89abf9c0a98d053f5d34734547f4ec0cc`，生产/测试固定 `6bb1ce916c9b4117b6e03db23a78a5d0b9724a10`，packages tree `38957ad074a6b7d102e730023613c9a5bb153ed7`，合同 `docs/field-test/team-meals-pages/Q-UI-T01-02-contract.md@85be50155723114256d8e597160e7db7a8c2995a`。

Q 全文读取合同、handoff、原 plan_review 的 REVIEW/VERDICT/COMMANDS 和4个生产文件完整差异；214项原报告材料的 Git、原路径、尺寸与SHA逐字匹配。报告SHA `832a3db244fd7c924b1b875a6d0f686bf49c08519f469440dc7c2f2cd086f0c8`，manifest SHA `719f10b5691d79cd5ae67356cd3e53bf3f9064a71255927deb3094fb9fc5bc96`。该独立批准包含 Node20 Web539、额外6项、类型/Core、44路由预算及 D 原生15项捕获复算；本轮不将其冒充 Q 重新操作。

保留 c7 的全部 Q 历史，干净合入完整 fa6；执行源为 `9084fcc64689ddb66ef925d97b0e2e4a40433233`。Q packages tree `a39e86a397e6dc94fd91a68638bddd6f58a9903a` 含 Q 测试，不能与批准生产 tree 混用。`source-integrity.json` 中58份 Web源同时匹配执行源与批准6bb。C API/session/store、main、core、Worker、schema、data、冻结fixture相对c7不变。

本机4273，真实main/Plan/Import→正式C client/session→HTTP桥→真实Worker→既有FakeRepo；新建隔离环境，真实Node20.20.2，固定日期2026-09-10，初始正式fixture Git为 `ab3f584656e1c85cad51a0ac3f6193fa2ff5f21d`。只注入既有固定日期/公开测试token及移除外部字体；没有复制控制面板、业务mock、编辑器替换或Worker响应改写。

## 实际旅程

1. 加入原9月15日早餐 first-dish，首道午餐填8，在“一天”筛选下保存全部四条。请求3正文精确等于旧842的请求39（包含原name/dateRange、second-dish空、name-only原2和早餐空），但新历史提交为 `9203f8c29ad0a532699907e92da931f6a20b5a61`。**没有复建旧元数据变化和长保存历史，因此不冒称旧 `6f479b8a...`。**
2. 原午餐改11、不保存，进入粘贴导入，输入完全相同的 `2026-09-15 午 第一道样本菜`。导入后11仍在，原“一天”范围和Add选择仍在；全部日期可见五条，原空值、原2和新空值都保留。`ledger-original-repro-checkpoint.json`为实际前5请求；只有明确Save的请求3是POST，导入只新增一次Catalog GET，没有Source重载或POST。
3. 在原午餐填无效13.7，导入9月13日晚 first-dish，排序后原行从0移至1，13.7仍在该行且保存禁用。切换英语/乌克兰语保留13.7；回中文导入同一午餐但不写份数，仍保留13.7。
4. 本地移除原second-dish，新增9月16日早餐。显式导入原午餐7，恰当替代13.7，增删和其余原值保留。实际删除按键把name-only的2留空；再将原午餐填13.7，在导入预览显式点“清空份数”，仅对应匹配行的原始输入被清掉；六行全部为空，保存可用。
5. 既有HTTP控制hold下一次真实Save响应（请求6）。该请求真实Worker已写入六行；响应暂存期间在实际页面导入9月17日午餐，出现第七行，页面仍“正在保存，可继续编辑”。20秒延迟的本机测试释放命令放行原响应后，版本变为 `ce8ca4c876767ec6cece32d5d49e570a01bdb60e`，第七行仍在且“有未保存的修改”，保存可用。没有超时、二次请求或响应模拟。
6. 再选“一天”仅显示9月14日一行，明确Save请求8仍发送全部七行。刷新页面后从Source GET10回读七行，所有主动空值没有变为零或默认数，原计划多语名称保留、日期范围按既有导入规则扩展，删除的second-dish没有回来，9月16日Add及后续9月17日Import均保留。最终模型head `c3e0fb32b3a924b880baa62e475a5c75de58a1ac`。

## 写入与证据边界

完整 `ledger.json` 共11请求。只有3/6/8三个明确Save POST；六次成功导入无POST。Source只在最初1和最终刷新10读取；所有三个Save均带原C的If-Match，依次等于初始Source blob、首个ACK blob、第二个ACK blob；无If-None-Match、无卸锁重试。请求6保存六行、不含后来第七行；请求8才含第七行。最终11个仓文件只有 `data/menu-plans/team-week.json` 改变，其他知识、图片和旧采购单字节不变。

截图和DOM是本轮真实操作。最终实际viewport为1280×720，整页scrollWidth1280；本轮未设置视口覆盖，也未重跑无关的36组三语双尺寸矩阵。原始11场景、raw排序、显式覆盖、ACK主要以中文操作，raw跨语言有额外EN/UK捕获；auth/unknown/conflict/首次404等扩展消费已审6bb的真实C组合测试，**不增加新的Q原生覆盖**。既有离线/SW/同版图片仍按原842矩阵有界继承。

## 命令与准备差异

PATH首项均为 `/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin`：

```sh
npm --prefix packages/worker run build
RCQ_PAGE_PORT=4273 RCQ_APPROVED_PRODUCTION=6bb1ce916c9b4117b6e03db23a78a5d0b9724a10 node packages/web/test/e2e/team-meals/page-server.mjs
node packages/web/test/e2e/team-meals/import-draft-capture.repro.mjs docs/field-test/team-meals/page-repair-6bb
node --test packages/web/test/e2e/team-meals/import-native-evidence.test.mjs
```

编译通过；原捕获断言打印before11/after11并exit0；新增捕获断言4/4通过。原script不改动，新目录沿用 `T01-import-unrelated-edit-lost.txt` 文件名仅为兼容旧断言参数，其内容明确是本轮保留11的GREEN；不是修改旧文件。4项断言不是4次新浏览器E2E。

准备差异如实保留，均未改业务断言：

- 最初给较早日期选择second-dish，但它是draft，真实预览“没有能导入的行”；旧预览和 `setup-draft-row-not-importable.txt`保留。改用active first-dish完成排序用例，没有绕过draft限制。
- 浏览器`fill('')`返回后实际原2仍显示2（立即DOM见 `T01-explicit-blank-immediate.txt`），故最初“仅一个有数值”捕获断言失败。改用实际全选/Backspace后读取空值，DOM单独记录；后续导入和最终Worker正文证明留空保留。未把未生效的fill当作通过，也不据此宣称产品清空失败。
- REPL第一次用跨环境数组做deep-strict比较报原型不同，但六个值实际全空；以长度与每项字符串值复核并保存真实DOM。正式Node捕获断言使用普通本地数组，无该问题。
- 默认沙箱访问本机控制端点拒绝连接；授权后的同一控制请求成功。hold/release只影响传输时间，原响应字节保持真实。释放由本机进程在20秒后POST执行，实际前后DOM证明落在保存进行中和成功ACK之后。

`preservation.json`再次核验旧150、复制33、两份原review manifest，及不变生产边界。证据封存后4273服务与自建IAB5已停止/关闭，没有保留临时视口覆盖。`EVIDENCE-SHA256.json`列本目录除自身外的文件；当前pending仅待新固定提交的独立复核，不代表整体完成、真实GitHub/Cloudflare、发布部署、L2或用户视觉签收。
