# 场景 B：中餐技法词表（刀工 / 加热法 / 预处理）（调研日期 2026-09-05）

目标：为 CanteenOS 组建 ≤80 项受控技法词表（中文权威 + 定义 + 可选英文对应 + 可选图片来源），同时作为视频解析 AI 的输出约束（闭集标签）。
star 数 / 最近提交等时效信息均标注核实日期 2026-09-05。

---

## 一、候选来源（按推荐顺序）

### 1. 《中式烹调师国家职业技能标准》（人社部，职业编码 4-03-02-01）——中文权威骨架 ★首选
- 链接：PDF 镜像 https://hls.zjwison.cn/pdffile/中式烹调师.pdf ；全文转录 https://www.chinaadec.com/n/19024.html ；腾讯文库版 https://wenku.docs.qq.com/detail?docId=KHVZWAq3DA
- 协议：政府公文/国家职业技能标准，可引用原文（引用时注明出处）
- 语言/形态：中文，PDF 文本
- 最近活跃：现行版本（2018 版编制规程体系，2024-01 仍有网站转载全文）
- 能给我们什么：**官方分类体系 + 可引用原文**：
  - 刀法三大类："直刀法、平刀法、斜刀法的使用方法"（初级工相关知识，原文）
  - 切割成形："能将植物原料切割成片、丝、丁、条、块、段等形状"（原文）
  - 花刀："能根据菜肴要求将动物性原料切割成麦穗花刀等形状……植物性原料切割成兰花花刀等形状；剞刀的技术要求及方法；花刀的分类及成形方法"（中级工，原文）
  - 预处理/着衣："能对照料进行直接拍粉处理、拖蛋液拍粉处理"；浆糊清单原文："水粉浆、全蛋浆……全蛋糊、蛋清糊、蛋黄糊"，高级工扩展"致嫩浆、酱料浆、蛋泡糊、脆皮糊、酥糊、蜂巢糊"
  - 预熟处理："能对照料进行走油、走红预熟处理"、"冷水锅和热水锅预熟处理"（=焯水的官方表述）
  - 烹调方法："能运用煮、汆、烧、炸、炒、蒸等烹调方法制作常见菜肴"、"炝、拌、腌等常见烹调方法"；相关知识含"烹调方法的分类与特征"、"水导热、油导热、汽导热的概念"
  - 干货涨发：水发、油发（"蹄筋、肉皮等干货原料……油发加工的概念及原理"）
- 不能给我们什么：没有逐条术语的精确定义（只有"相关知识"点名称）、无英文、无图。定义需用教材/百科补，但词表"收录哪些词"以它为准最有权威背书。

### 2. 英文维基百科 "Chinese cooking techniques" —— 现成的中英对照结构化分类 ★最佳对照底本
- 链接：https://en.wikipedia.org/wiki/Chinese_cooking_techniques
- 协议：CC BY-SA 4.0（**有传染性**：改写进自家文档需署名+同协议；只当"参照物"内部使用、逐条自写定义则不受影响）
- 语言/形态：英文主述 + 中文/拼音对照表，MediaWiki 表格，可直接解析成 JSON
- 最近活跃：页面最后编辑 2026-08-30（核实 2026-09-05）
- 能给我们什么：已按"湿热速浸 / 湿热久浸 / 蒸 / 干热-空气 / 干热-油 / 无热 / 组合技法"分好类的双语表，逐项带一句话定义。可引用的对照（原文摘）：
  - 烧 Shāo = Braising；汆 Cuān = Quick boiling；焯/烫 Chāo/Tàng = Blanching；煨 Wēi = Bake stewing；焖 Mèn = Steam stewing；炖 Dùn = Gradual simmering（double steaming）；卤 Lǔ = Slow red cooking；熬 Áo = Decoction
  - 蒸 Zhēng = Steaming；汽锅（醇 Chún）= Distillation simmering
  - 烤 Kǎo = Baking/roasting；炙 Zhì = Grilling；熏 Xūn = Smoking
  - 炸 Zhá = Deep frying；煎 Jiān = Pan frying；炒 Chǎo = Stir frying；爆 Bào = Flash-frying / High heat stir frying
  - 炒的五个子类（引 Kian Lam Kho）：清炒 qīngchǎo = Plain stir-fry、煸炒 biānchǎo = Dry stir-fry、滑炒 huáchǎo = Moist stir-fry、干煸 gānbiān = Dry-fry/Extreme-heat stir-fry、软炒 ruǎnchǎo = Scramble stir-fry
  - 无热技法：拌 Bàn = Dressing；腌/酱 Yān/Jiàng = Marinating or pickling；冻 Dòng = Jellifying；**上浆 Shàng Jiāng = Velveting**（正是我们场景需要的词，且有公认英文）
  - 组合技法：烩 Hùi（勾荧收汁）、溜/熘 Liū（先炸后烧）、焖 Mèn（先炒后焖）
- 不能给我们什么：刀工成形（丝/丁/块）没有、预处理体系不全、部分拼音/术语带个人色彩（引自 Pei Mei、Kho 的书），权威性低于官方标准。适合做"英文对应 + 分类参照"，不适合当中文权威来源。

### 3. 深圳市《公共服务领域英文译写规范（商业服务）》表 B.3 —— 官方双语对照表（39 条）
- 链接：https://www.publicsigns.cn/article/523
- 协议：地方标准/政府公示文本，可引用（注明出处）
- 语言/形态：中英对照表格，网页已结构化
- 最近活跃：页面 2026-08-27 仍可访问（核实 2026-09-05）
- 能给我们什么：39 条官方烹饪方式译名，原文示例：蒸 Steamed、煮 Boiled、煎 Fried in Shallow Oil 或 Pan-Fried、炒/爆 Stir-Fried、炸 Deep-Fried、炖/扒/焖 Braised、熘 Sautéed 或 Quick-Fried with Starch Extract、汆 Quick-Boiled、炝 Quick Stir-Fried then Cooked with Sauce and Water、烩 Braised with Meat, Vegetables and Water、熏 Smoked、腌 Pickled、拔丝 Coated with Molasses Made of Boiled Sugar、蜜汁 Honey-Glazed、拌 With、冻 Frozen。
- 不能给我们什么：只有译名没有定义；译名面向菜单（菜名级别），粒度比"厨房指令"粗；无刀工。

### 4. DB51/T 2502-2018《中国川菜烹饪技术用语及菜名翻译规范》—— 唯一"技法术语"级多语官方标准
- 链接：PDF 镜像 http://www.mydoc123.com/p-1491413.html
- 协议：四川省地方标准，标准文本可引用（注明标准号）
- 语言/形态：**中/英/法/日四语**对照表（表 6 烹调工艺技术用语等）
- 能给我们什么：术语级官方译名，原文示例：爆 = explosive stir frying、滑炒 = sliding stir frying、焦炒 = scorching stir frying、生炒 = raw stir frying、熟炒 = re-stir frying、软炒 = soft stir frying、炸收 = deep frying and reducing、红烧 = brown braising、白烧 = white braising、烩 = multi-ingredient braising、焖 = pressure simmering、煨 = simmering、炖 = stewing、煮 = boiling、卤 = simmering in spiced broth、汆 = blanching、蒸 = steaming、烤 = roasting、烙 = pan roasting、粉蒸 = steaming with rice flour、水煮 = water boiling、泡制 = pickling。装盘造型也有译名（拼盘、一封书、三叠水、风车形、扇面形）。
- 不能给我们什么：川菜口径，不含刀工规格定义；无乌克兰语（但法语列可辅助理解）；PDF 在第三方文库站，需自行核对标准全文。

### 5. 北京 2008《中文菜单英文译法》（北京市旅游局/外办，后成书《美食译苑》2011）—— 菜单译法体系鼻祖
- 链接：原则全文镜像（阮一峰博客，2007-10-05）http://www.ruanyifeng.com/blog/2007/10/chinese_food_menu_translation.html ；1900+ 条全表镜像 http://www.sotranslation.com/html/big5/guanyongyifa/520.html
- 协议：官方出版物讨论稿的网络镜像；转载站版权状态不明，**建议只引用原则与个别条目、注明来源为北京市官方文件本身**
- 能给我们什么：翻译方法论——"做法（动词过去式）+ 主料 + with/in 配料/汤汁"的菜名公式，决定了机翻 en/uk 时技法词的词形（Sautéed / Stewed / Braised / Deep-Fried / Steamed / Quick-Boiled…），与候选 3/4 的译名互相印证。
- 不能给我们什么：定义与图；镜像站无协议。

### 6. FoodOn（食物本体，OBO Foundry 成员）—— 英文烹饪过程标准名对齐目标 ★本体对齐首选
- 链接：https://github.com/FoodOntology/foodon ；浏览 https://www.ebi.ac.uk/ols4/ontologies/foodon ；论文 https://pmc.ncbi.nlm.nih.gov/articles/PMC6550238/
- 协议：**CC-BY-4.0（无传染性，可用，需署名）**（GitHub license 字段核实 2026-09-05）
- 语言/形态：OWL/JSON，英文术语 + 定义 + LanguaL xref；有稳定 IRI，适合做词表条目的 `alignment_iri`
- 最近活跃：stars 236、forks 42、最近 push 2026-08-10（GitHub API 核实 2026-09-05）；OBO Foundry 在册，生态活跃（>24000 词）
- 能给我们什么：cooking process 分支的英文标准名+定义+IRI，可直接挂到我们的词条上。已核实条目（OLS API，2026-09-05）：
  - FOODON:03450004 "cooking by dry heat"（干热）——子类：FOODON:03450005 food baking(=roasting)、FOODON:03450006 broiling or grilling(=barbecuing)、FOODON:03450008 griddle cooking、FOODON:03450009 cooked by popping、FOODON:03450010 food toasting
  - FOODON:03450026 "cooking in small amount of fat or oil"（≈煎/炒上位）；FOODON:03470150 sous vide cooking；FOODON:00003912 teriyaki cooking method；FOODON:03450025 cooking with added fat or oil
- 不能给我们什么：**西餐视角，没有 stir-fry/braise 的中式细分（无"爆、熘、焯、上浆"对应类）**，刀工切法也不覆盖。只能做"上位对齐"（我们的 爆炒 → cooking in small amount of fat or oil / dry heat 的近似映射），不能指望它有现成中文技法类。

### 7. Wikipedia "List of culinary knife cuts" + 西餐刀工术语 —— 仅供英文对齐
- 链接：https://en.wikipedia.org/wiki/List_of_culinary_knife_cuts
- 协议：CC BY-SA 4.0（有传染性）
- 能给我们什么：julienne（≈3mm 细丝）、fine julienne、brunoise（3mm 方丁）、fine brunoise（1.5mm）、batonnet（6mm 条）、small/medium/large dice（6/12/20mm 丁）、chiffonade、paysanne 的标准英文名+精确尺寸。可用来给中式"细丝/丁/条/块"找最近的英文锚点（注意：尺寸体系不同，只能标"近似"）。
- 不能给我们什么：中式体系（滚刀块、花刀无对应）；按任务要求不单独采用。

### 8. 百度百科"刀工"词条 + 中职教材 —— 中文定义素材，只能"看模型"
- 链接：https://baike.baidu.com/item/刀工/8827638 ；教材体系见《中式烹调技艺》（高教社，李刚/王月智）考试大纲 https://max.book118.com/html/2019/0906/8133020102002046.shtm ；江苏省中职中餐烹饪人才培养方案 http://przyq.njsyxy.com/folder1089/folder1096/folder1099/folder1127/2016-04-11/9533.html
- 协议：百度百科为用户内容（版权归作者/平台），教材为付费出版物——**都只能"看模型"（理解分类后用自己的话重写定义），不可复制原文入库**
- 能给我们什么（"看"到的分类，供自建词表参考）：
  - 刀法四分法（与国家标准一致）：直刀法（切：直切/推切/拉切/锯切/铡切/滚切；劈：直劈/跟刀劈/拍刀劈；斩：排斩）、平刀法（平刀批/推刀批/拉刀批）、斜刀法（正斜批/反斜批）、剞刀法/混合刀法（推刀剞/直刀剞）
  - 滚刀块定义口径："改刀小而脆的圆形/椭圆形蔬菜原料块，边切边滚动原料"（百度百科原文表述，仅供理解）
  - 成形规格谱系：块（大方块/小方块/长方块/菱形块/滚刀块）、片（月牙片/菱形片/长方片/蝴蝶片/厚薄片）、丝、丁、条、段、末、粒、茸/泥、球；花刀（麦穗/荔枝/菊花/兰花/十字/梳子/松鼠鱼）
  - 传统"八大类"加热法归纳（民间教材口径，供覆盖度自检）：炒爆熘 / 炸烹 / 煎溻贴瓤 / 烧焖煨焗扒烩 / 烤盐焗熏泥烤 / 汆熬炖煮蒸 / 拔丝蜜汁糖水 / 涮锅砂锅类
- 不能给我们什么：可合法复制的文本与图片。

### 9. RecipeDB / 食谱 NLP 词表 —— 只能"看模型"
- 链接：论文 https://pmc.ncbi.nlm.nih.gov/articles/PMC7687679/ ；动词分级参考 arXiv:2212.05093 https://arxiv.org/pdf/2212.05093
- 协议：学术资源，数据许可不明 → **只看不取**
- 能给我们什么：RecipeDB 标注了 268 个烹饪 process 词、69 个器具词（全菜系，英文）；arXiv 文把食谱动词分为 7 阶段（Pre-processing / Mixing / Transferring / Cooking / Post-processing / Final / General），可借鉴给我们词表加分组字段（stage）。
- 不能给我们什么：中文；可下载的结构化文件与许可。

### 10. Wikidata / Wikibooks / Commons —— 结构化条目与图，结论：基本没找到
- Wikidata：**没有"刀工"条目**（API 搜索 2026-09-05，仅命中 side dish 的别名和一部 2017 电影）；"stir frying" 有条目 Q8980672，可作 ID 挂接。中文技法在 Wikidata 覆盖太稀，不能当词表来源，只能个别条目挂 QID。
- 中文维基百科：无独立"刀工"词条（2026-09-05 访问 404）；有 Category:烹调方法（焯/煨/煮/煸/熬/蒸/爆炒/爆香/炝/焖烧/腌/舒肥/陶罐炖煮等零散页面），可作词条存在性参考。
- 中文 Wikibooks《食谱/刀工》：不存在（404）。
- Commons：**没找到专门的刀工/切法图集**（Category:Knife_cuts、Category:Vegetable_cuts 均不存在；文件搜索只命中公版老食谱扫描书）。Wikipedia 词条配图散见于 Commons，需逐张核对协议后才能用。
- 图片来源结论：**开放许可的中式刀工图集没找到**。可行路径（按优先级）：a) 自绘 SVG 示意图（丝/片/丁/条/块/段/滚刀块/花刀，尺寸明确、零版权问题，推荐）；b) 引用英文维基"List of culinary knife cuts"主图等 Commons 单图（逐张核协议，多为 CC BY-SA，有传染性）；c) 拍摄自有操作照片。

---

## 二、建议的词表组建方式（≤80 项骨架）

组建原则：**收录范围以《中式烹调师国家职业技能标准》(候选1) 为权威骨架；英文对应以深圳译写规范(3)/DB51-T-2502(4)/en.wiki(2) 三角互证；定义用自己的话重写（参考 8/9 的"模型"）；每条挂 FoodOn IRI 或 Wikidata QID（6/10）做机器可读对齐。**

- A. 刀法/运刀（约 16 项）：直切、推切、拉切、锯切、铡切、滚切、劈（直劈/跟刀劈/拍刀劈可合并为 1 项 + 3 别名）、斩（排斩）、剁、平刀批、推刀批、拉刀批、正斜批、反斜批、剞刀（直刀剞/推刀剞）、旋/削
- B. 刀工成形（约 22 项）：细丝、粗丝、薄片、厚片、菱形片、月牙片、蝴蝶片、大丁、小丁、米/粒、条、段、方块、长方块、菱形块、**滚刀块**、末、茸/泥、球、花刀（麦穗/荔枝/菊花/兰花/十字/梳子，可 1 项 + 6 别名）
- C. 预处理与着衣（约 18 项）：清洗/摘选、腌制、**焯水**（冷水锅/热水锅 2 子型）、过油（走油/滑油）、走红、预蒸、酱制预熟、**上浆**（水粉浆/全蛋浆/蛋清浆/致嫩浆）、挂糊（水粉糊/全蛋糊/蛋清糊/蛋黄糊/脆皮糊/酥糊/蛋泡糊）、拍粉、勾芡、水发、油发、制汤、泡/浸、沥水
- D. 加热烹调法（约 24 项）：炒（生炒/熟炒/滑炒/清炒/干煸/软炒 作别名或子型）、**爆炒**、熘（焦熘/滑熘/软熘/醋熘/糟熘）、炸（清炸/干炸/软炸/酥炸/脆炸/纸包炸）、烹、煎、贴、溻、烧（红烧/白烧/干烧/葱烧）、焖、煨、炖（含隔水炖）、煮、汆、熬、烩、蒸（清蒸/粉蒸/扣蒸）、烤（明炉/暗炉）、熏、焗（盐焗/砂锅焗）、扒、卤、酱、炝、拌、冻、拔丝、蜜汁
- 合计约 80 项（一级词），子型/别名挂在词条下不占名额。视频解析 AI 输出约束用"一级词 + 子型枚举值"两层。

与英文本体对齐建议：每条填 `en_label`（优先级：DB51/T 2502 或深圳规范 > en.wiki > 直译）、`foodon_iri`（能找到上位类才填，如 烤→FOODON:03450005、炙烤→FOODON:03450006、煎炒类→FOODON:03450026）、`wikidata_qid`（如 炒→Q8980672，有则填）。找不到上位类就留空，不要硬映射。

---

## 三、结论

**用《中式烹调师国家职业技能标准》定中文词表骨架（权威性），用 en.wiki "Chinese cooking techniques" + DB51/T 2502-2018 + 深圳译写规范三源互证填英文对应，定义自写、FoodOn/Wikidata 做机器可读对齐，刀工示意图自绘 SVG——这条路完全可行，且全部关键事实均有 2026-09-05 核实的在线原文。**

## 四、风险

- 协议：FoodOn CC-BY-4.0 无传染（可用）；Wikipedia CC BY-SA 4.0 有传染性（定义必须改写，不能直接进代码库）；百度百科/教材/RecipeDB 只能"看模型"；转载镜像站（阮一峰博客、sotranslation、mydoc123）无协议，引用时注明原始官方文件。
- 维护：FoodOn 活跃（2026-08-10 push）；Wikipedia 词条社区维护；国家标准更新慢（2018 体系在用），词表一旦冻结需自行版本化。
- 覆盖率：英文对应在"爆/熘/焯/上浆/剞花刀"等中式特有技法上没有真正等价词（现有官方译名是解释性短语，如 熘 = "Quick-Fried with Starch Extract"），机翻 uk 时同样只能给解释性翻译；FoodOn 无中式细分类，只能上位对齐；刀工图需自绘。
- 没找到（如实记录）：结构化 JSON/CSV 的中餐技法词表（无人整理过）、Wikidata 刀工子类体系、开放许可中式刀工图集、中-乌对照的烹饪术语资源。
