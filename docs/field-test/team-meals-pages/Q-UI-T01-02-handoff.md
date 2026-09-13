---
feature_ids: []
topics: [team-meals, plan, import, q-ui-t01-02]
doc_kind: approved-repair-handoff
created: 2026-09-11
---
# Q-UI-T01-02：导入保留当前排菜稿，交回 Q 复验

本项获得原非作者 plan_review 对固定 `6bb1ce916c9b4117b6e03db23a78a5d0b9724a10` 的 **APPROVE**，无 open P1/P2。Root 已全文读取[原审查报告](review-receipts/q-ui-t01-02-6bb1ce9/REVIEW.md)、VERDICT 和 COMMANDS，并核验全部原件。仅闭合 D 本次导入修复，不代表 Q T01–T09 或 L2 完成。

## What / Why

原问题是导入另一餐时，Import 从保存版8合成整份计划，返回 Plan 后覆盖 C1 仍持有的未保存11。[固定契约](Q-UI-T01-02-contract.md)内容版本 `85be50155723114256d8e597160e7db7a8c2995a`；原 STANDARD/S08/T01/T07 和 Q 固定 `6276f1beacd9bb61c756d1a3974b180f6cbc74ab` 的报告、四份 DOM、46请求账本及 capture-only RED 均保留在 [intake](q-ui-t01-02/Q-UI-T01-02.md)。Q 首次捕获解析器失败独立保存，不冒称业务失败或新浏览器重放。

原作者 page_inventory 通过最小 D 回调连接，让原 C1 文档将导入同步合入当时最新稿。连接仅持有同 API/auth/mode/plan 的能力，明确区分 absent/applied/rejected；拒绝的旧 owner 不回退到保存版。只有真正尚未访问的文档保留原有受保护读取及交接路径。原保存请求、锁、未知结果恢复和冲突状态继续由 C 管理。

本地数值、明确留空、新增/删除和计划元数据得以保留；无效原始输入随原行排序迁移。匹配行明确导入数量或明确清空时，只替代首个匹配行的对应原始输入。同步编辑被拒绝时恢复原始输入映射；成功后清掉旧的整份导入缓存，防止返回时再覆盖新稿。

## Tradeoff / 证据

生产固定 `6bb1ce916c9b4117b6e03db23a78a5d0b9724a10`。相对已批准 copy 包 f33，仅4个D生产文件与1个D组合测试改变。没有第二套稿件/保存系统，没有C/shared、core/Worker、main、Q、配置或依赖修改。

- [作者完整证据](q-ui-t01-02-import-fix/README.md)归档 `af115810c2097d51e021f1437ef7580eff236d20`：Node20.20.2目标86/86（原56+新30），完整Web539/539，type通过。真实C及两页面组合的原始RED1/9、校准RED3/16及中途结果全部保留。首次setup错误和首次过宽构建检查失败单独标注，不伪装成产品回归。33项及固定5份源码对Git核验。
- [root新原生RED](q-ui-t01-02-browser-red/RED-README.md)归档 `a49f79e5c1d7cea71f703ba6a844c63c61b989ec`：原批准copy生产、固定Q fixture下实际保存8→未保存11→导入新日期，返回8，保留11断言实际exit1。14份原件独立保存。
- [root原生GREEN](q-ui-t01-02-browser-green/README.md)归档 `fb00e8292bc5e531d1e7c3432516bdb6b7a4ecf7`：真实main→C/API→本地HTTP→真实Worker→固定Q FakeRepo，固定6bb的58份Web源对Git一致。实际操作后11保留、新餐数量仍空；13.7无效输入随原行0→1；显式导入7清除对应无效输入；保存响应延迟期间导入新日期，放行原ACK后仍dirty。15/15是该真实旅程的捕获断言，非15次独立E2E。26份原件对原路径与Git逐字核验。
- GREEN账本仅7个Worker请求、2次明确Save POST。第二次If-Match精确为首次ACK blobSha `7d562d54526a05b8ebb53d834832fa09270a967a`，未去掉锁或自动重试；原发出请求含5行，不含之后导入的新日期。4次导入没有新POST，原ACK不会清掉之后的本地编辑。
- 原非作者独立 Node20 Web539/539、type/core通过，另6/6真实页面/C组合探针覆盖404新文档及原创建锁、旧catalog迟到、重复匹配的两种顺序和unknown原source存在/缺失恢复。独立复算原生15/15，核对两次POST的原条件头、五行原请求及迟到ACK后第六行仍dirty。214份原审查件完整归档；固定229份packages文件一致。
- 作者及原审查者独立重建两配置、11入口、SW/no-SW共44/44体积预算；24/24实际preload闭包及每配置24/24应用JS预缓存通过，均保留52条预缓存。HTTP Plan **59887 gzip，余113字节**，Import51345；default Plan59864，Import51323。未放宽60000上限、删除预缓存或引入额外优化。

原批准5049已经通过日期函数共享 parse-plan-text-DBZQVSv5.js。该既有chunk在两种配置的新旧文件名与字节完全一致，SHA256 `3ec90be07feaf1b63802d229cdbac8ba78820fb6791ef81e72355d41c84a5c98`；本修复只新增最小回调连接，没有新增反向parser或页面依赖。作者首次假设Plan完全没有旧parser模块的检查失败原样保留。

## 原件与后续

作者33项原日志首次直接写入 D evidence目录，该处即原件；manifest SHA256 `771ab1a3ea81465569fa9f99f67570e776b0f46b2d1ccdfd021a33ef14f4d45f`。default/http graph经过JSON格式化，不声称与tmp图文件逐字相同；实际构建产物有单独哈希。root GREEN原路径 `/private/tmp/canteen-q-t01-browser-green-author/`，README SHA256 `cffb6ba38a6628f4faac659ef998d06b82d7934bb6ebed11fa824b873f29de51`，26项manifest SHA256 `432cbdb4e1593589250722087178f6db84a3a48134bd3f16967dffcb833a9a9f`。

审查身份 `Codex /root/plan_review`；Subject `task:01a08db7-43f3-7952-adb5-75106389e557/Q-UI-T01-02`；AcceptedSource为85be契约；verdict `APPROVE`。原路径 `/private/tmp/canteen-q-t01-review-6bb1ce9/`，原报告SHA256 `832a3db244fd7c924b1b875a6d0f686bf49c08519f469440dc7c2f2cd086f0c8`，VERDICT SHA256 `a7b31444216b401c43afaf50de91e7efa41d3536ae4f25ff6c15e20bee7546d0`；[214项原清单](review-receipts/q-ui-t01-02-6bb1ce9/reviewer-artifact-manifest.json) SHA256 `719f10b5691d79cd5ae67356cd3e53bf3f9064a71255927deb3094fb9fc5bc96`。全部214项与清单逐字保留，包含作者、原生RED/GREEN、原始工具失败及构建证据；root对原路径及Git blob逐项核验。原清单不自包含，验证该清单的派生日志亦不进入其自身哈希范围。

本交接 packages tree 与6bb相同：`38957ad074a6b7d102e730023613c9a5bb153ed7`；所有后续仅为证据和交接文档。root中文原生旅程与作者/审查者Node中的语言、auth、unknown、conflict等边界分别标注，不合并为未执行的native场景。

Next Action：经唯一授权 dispatch task `01a08d6d-be28-7142-ad8e-3f964658d3f4` 转交Q，针对其原始未保存11/导入另一餐现场独立复验，并继续Q完整T01–T09。前项copy固定f33批准保持独立；调度已通知Q的原午餐复测810获原v2_review APPROVE，并在完整c7b403b闭合T08-01。该Q结论由调度接球，本导入包不重新审查或扩大该结论，也不代表完整Q验收或L2完成。root的本地原生服务均已停止，没有远程推送、发布、部署或正式外部服务写入。
