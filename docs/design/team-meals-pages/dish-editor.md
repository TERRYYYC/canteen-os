---
feature_ids: []
topics: [team-meals, dish, editor, design]
doc_kind: design-contract
created: 2026-09-11
status: proposed-for-review
---

# 菜品编辑兼容

对应 `#/admin/dish/new` 与 `#/admin/dish/<id>`，保留既有后台字体、卡片、三语名称、配料和步骤布局；本稿是本次范围补充，未有视觉签收。D0 与最新小团队派工优先于历史默认 50 份和旧 readiness 准入文案。

页首为返回、菜名和保存阶段，明确“未连接 / 模拟演示 / 保存未发布”。主表单依次是三语名、文件名、介绍、可选基准份数、图片许可、配料卡、步骤卡。基准份数采用可清空的数字输入，不补默认值。配料用量留空表示未知；只有明确勾选“适量”才写 to-taste。页面提示缺量影响计算参考，不阻挡先保存菜谱。配方真实用量与全部已录引用保留。底部两个独立按钮为“存草稿”和“入库”，各自明确写入 draft/active，不触发发布。视频标签保留现有说明入口，不增加导入平台。

三语字段只改有输入的内容。原 confidence、provenance、prep.image、steps.image、clip 及图片许可字段保留；缺省 provenance 不变成伪造的历史来源，新菜才记 manual。AnyDish 通过 TeamMealsApi 读取并显式保存 v3。组件保留未填量而不强转到旧数值 readiness；顶部改为资料缺项提示，不把 active 视为完整性证明。

| 状态 | 操作与保留规则 |
|---|---|
| clean / dirty | 编辑原始字符串；无 baseServings 或 qty 时省略字段，真实旧值保留 |
| saving | C1 保存整份已提交快照；仍可编辑；新输入留 dirty，按钮禁重复写 |
| saved-but-unpublished | 单独显示已保存与未发布；真实/模拟模式明确 |
| conflict | 保留本地草稿，强读当前资料并展示双方 JSON；显式采用远端或本地稿+新基线后才可再存 |
| outcome-unknown | 只允许核实保存结果，C1 两次固定读取，无直接重试 |
| language / leave / return | refreshView / invalidate / open-resume；不销毁未决操作，迟到回调不能改新页面 |
| unconfigured | 允许本地输入，保存、旧上传、旧机翻、内联食材写入禁用；不显示模拟成功 |

手机单列，桌面沿用既有两列输入组。浏览器集成及 zh/en/uk × 393×852 / 1440×900 由 RC-D root 统一验证。作者测试不等于独立审查；无专用 Worker 时不声明真实保存已验。
