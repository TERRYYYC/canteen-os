---
feature_ids: []
topics: [team-meals, schema, validation, migration]
doc_kind: module-contract
created: 2026-09-11
---

# 小团队格式读取与升级

目标合同：[team-meals-contract](../specs/team-meals-contract.md)。A1 只交格式、类型、显式升级和正式校验入口；Worker 保存、强制条件头、降级保护、同版读取与页面接线由各自 owner 实现，不能从本模块测试推断真实端点可用。

| 输入 | 正式 schema | TypeScript |
|---|---|---|
| MenuPlan v2 | menu-plan.schema.json | MenuPlan / MenuPlanMeal |
| MenuPlan v3 | menu-plan-v3.schema.json | MenuPlanV3 / MenuPlanMealV3 |
| Dish 缺版本或 v2 | dish.schema.json | Dish / DishComponent |
| Dish 显式 v3 | dish-v3.schema.json | DishV3 / DishComponentV3 |
| ShoppingList v1 | shopping-list.schema.json | ShoppingList / ShoppingBasis / ShoppingItem |

`AnyMenuPlan` 和 `AnyDish` 仅为双读联合，分别对应 any-menu-plan.schema.json 和 any-dish.schema.json。旧数值入口继续接收严格 v2 类型。新菜单可省 plannedServings，meals:[] 表示取消全部安排；菜谱 v3 的 component 可省 qty 表示未知；给出的 Quantity 仍必须满足旧单位/正数条件。缺用量与来源记载适量是不同事实。

`upgradeMenuPlan` / `upgradeDish` 从 core 主出口导出。调用前应通过源格式校验；函数纯粹深拷贝并改为显式版本 3，保留全部字段、真实数值、原顺序和缺省。返回对象可独立编辑；函数不改 data、网络、库存或清单。

正式 Ajv 入口在 scripts/validate-schemas.mjs：

- `createSchemaValidators({schemaDir})` → `{validateEntity(kind,value)}`；返回 `{valid,schema,errors}`，errors 是 Ajv 的 instancePath/keyword/message/params。
- `validateData({root,dataDir?,schemaDir?})` → `{passed,failed,total,results}`；results 的 file 是绝对路径。默认 dataDir=root/data，schemaDir=root/schemas；import 不执行 CLI、不读取默认 data，不退出进程。
- `main(argv?)` 保留 PASS/FAIL 与成功 0/失败 1；支持 --root、--data-dir、--schema-dir。坏 JSON、缺 techniques 文件也是失败，不能静默略过。

该入口只证明正式格式。重复 ingredientRef、清单与候选集合一致、路径 ID、dateRange 跨字段关系、引用/资产、revision 可达性由 core/Worker/构建各自语义检查，不能称为 Ajv 已通过这些行为。Q 共享样本使用本入口，不能复制一个弱校验器。

check-types-vs-schema 覆盖 oneOf/anyOf 联合成员和分支内定义；required-only 分支和 allOf/if/then 条件仍由正式 Ajv 行为测试保护。Python 本地子集新增 oneOf 恰好一个分支约束、按版本选择 MenuPlan/Dish 及 ShoppingList 注册；它继续不等同完整 Ajv format 校验。

验证：新格式拒绝/接受、空计划、未知 qty、Quantity 非法输入、ShoppingList previous/bought 条件、旧值深拷贝、Python oneOf 反例和联合类型缺分支反例均有目标测试。v2 黄金数值 expected 不变；固定样本和生产 data 的隔离由 A2 消费 Q 精确提交完成。
