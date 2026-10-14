# week-43 真实厨房周（2026-10-19 – 10-25）· 操作指南

> 这周**不开发**，只修当天阻塞（执行简报 §3「真实厨房周」；§7「不在测试周合并非 P0 修复」）。
>
> - 现场记录 + **P0 定义**：[`log.md`](log.md) —— 开工前先读一遍 P0 那一节。
> - 三张码 A4 打印稿：[`print-qr.html`](print-qr.html) —— 双击用浏览器打开，直接打印，不需要装任何东西。
> - 出事怎么办（令牌 / PAT / 回退）：[`ops-checklist.md`](ops-checklist.md)。
>
> **周号**：2026-10-19 是 ISO 第 43 周的周一（`plan-for-terry.md` §3 的「真实厨房周 10/19–10/25」），所以本目录叫 `week-43`。上一次的材料在 [`../week-41/README.md`](../week-41/README.md)（那是 10/05–10/11 那周）。

---

## 0. 网址与二维码

| 角色 | 页面 | 网址 | 码贴哪 |
|---|---|---|---|
| 帮厨 | 备料单 | `https://terryyyc.github.io/canteen-os/#/prep` | 厨房墙上 |
| 采购员 | 采购单 | `https://terryyyc.github.io/canteen-os/#/purchase` | 发给采购员（微信里长按识别） |
| 顾客 | 菜单 | `https://terryyyc.github.io/canteen-os/#/menu` | 档口 · 桌上 |
| 师傅 | 后台 | `https://terryyyc.github.io/canteen-os/#/admin` | **不贴**。带令牌的链接当面给，不进群 |

站点里自带一张打印页 `#/qr`（读构建期生成的 `qr/index.json`，换域名不用改文件）。本目录的 `print-qr.html` 是它的**离线备份**：不需要构建、不需要联网跑命令，双击就能打印。

**遇到问题找谁**

| 谁遇到问题 | 先找 | 找不到人 |
|---|---|---|
| 帮厨 | 师傅（现场） | Terry |
| 采购员 | Terry | — |
| 师傅 | Terry | — |

Terry 联系方式：`____________`（测试周开始前填上；贴墙那份打印稿上也写一遍）

---

## 1. 帮厨 · Помічник кухаря

### 中文

**怎么打开**

1. 用手机相机扫厨房墙上那张「备料单」的码。
2. 页面打开后，右上角下拉选 **UA**（乌克兰语）。选一次就记住了。
3. 只做一次：分享 → 添加到主屏幕。以后从手机桌面点开，断网也能看上一次的。

**看什么**

- 最上面一行是**日期**，点今天。
- 下面一行是**餐次**（早餐 / 午餐 / 晚餐 · 后面的数字是份数），点自己那一顿。
- 再下面是**备料时机**筛选：全部 / 早上 / 出餐前 / 前一天。只想看早上要切的，就点「早上」。
- 列表每行：配料名 + 怎么切 + 数量（кг / шт / г / л）。**点一行**进详情：大图、切法、备注、相关步骤。
- **调料永远在列表最后一节**（「调料 · 备在手边」），不受筛选影响。
- 页面顶上出现「⚠ 本周数据有 N 处问题」——照做当天的活，同时告诉师傅。

**遇到问题找谁**

- 先找师傅；师傅不在找 Terry。
- **今天的活干不下去了 → 立刻说**（这就是 P0，见 [`log.md`](log.md)）。
- 用自己的话说，我们**逐字**记，不要替我们「说得好听一点」。

### Українською (uk)

**Як відкрити**

1. Наведіть камеру телефона на QR-код на стіні кухні.
2. Угорі праворуч виберіть мову: **UA**. Вибір запам'ятається.
3. Зробіть один раз: Поділитися → На екран «Додому». Далі відкривайте з екрана телефона. Без мережі теж працює — покаже те, що завантажилось востаннє.

**Що дивитися**

- Верхній рядок — **день**. Натисніть сьогодні.
- Другий рядок — **прийом їжі**: Сніданок / Обід / Вечеря. Цифра поруч — скільки порцій.
- Третій рядок — **коли готувати**: Усе / Вранці / Перед подачею / Напередодні.
- Список: назва продукту, спосіб нарізки, кількість (кг / шт / г / л).
- Натисніть на рядок — відкриється фото, спосіб нарізки і кроки.
- **Приправи** завжди в кінці списку («Приправи — під рукою»). Фільтр їх не ховає.
- Якщо вгорі є жовтий знак «⚠» — працюйте як завжди і скажіть шефу.

**Якщо щось не так**

- Скажіть шефу. Якщо шефа немає — Террі.
- **Якщо через це ви не можете працювати сьогодні — скажіть одразу.** Це найважливіше.
- Кажіть своїми словами. Ми записуємо дослівно. Не треба казати «гарно».

---

## 2. 采购员 · Закупівельник

### 中文

**怎么打开**

1. 微信里收到二维码图片 → 长按 → 识别图中二维码。或者直接点链接。**这条链接不带钥匙**，直接打开就行。
2. 收藏这一页。页面右上角可以切语言（中文 / English / UA），选一次就记住了。
3. 底部导航你只会看到「备料」「菜单」「采购」三项，**没有「菜单计划」——这是正常的**，那是师傅用的。

**看什么**

> 本周的采购页很可能是**只读版**：能看、能复制，**不能在线保存清单**。是不是只读，以页面最上面那一行为准。

- 最上面一行：「未连接后台 · 这里是已发布版本的只读清单」。看到它就是只读版。
- 标题「本次采购」，下面是这份清单覆盖的日期和餐次。
- 每种材料一张卡：名字、「主料」或「调料」。点「来源与数量参考」能展开：用在哪道菜、哪天哪顿、几份、要多少，以及按哪家供应商买几包（每包多大）、大概多少钱。数字有疑问就点开看，不用问人。
- 每张卡上有「待核对」「待买」「已有」三个按钮和「已买」勾选框。**只读版里这些都是灰的，点不了**，页面上的「保存清单」「读取最新已保存计划」也是灰的。
- 页面上另有一句「保存、判断和打勾都要连上后台。请用师傅链接打开。」——**你不需要师傅链接，不要去找**，不用理它；要保存的话找 Terry。
- 「需要核对的资料」折叠块：列出缺规格、单位换不了等问题，**这些材料算不出几包**——看到就说。
- 「用途未分类」「份数未录」「数量待定」都是资料没填全，不是你点错了，照实说。

**复制给菜贩**

1. 点「**复制给菜贩**」。出现「已复制」就是成功了；如果出现「复制失败，可选取下面文字复制。」，下面会展开一个文本框，手动全选复制。
2. 文字**按供应商分成一段一段**，每段开头是【采购单】+ 日期 + 供应商名，然后每行一种材料（几包 × 每包多大，括号里是合计），最后一行是「共 N 样」和预估金额。
3. 金额**按币种分别合计**；一段里有不同币种时会写「币种不同不合计」，不换算、不相加。没有上次价的写「无上次价记录」。
4. 有一段标着「未指定供应商」：说明这几样没人负责，**先问 Terry 谁来买，再发**。
5. 只读版里复制的是**所选餐次要用的全部材料**，没有「已有」「已买」的标记。按页面上那句提示，**发给菜贩前先把家里已经有的删掉**，再粘进微信。

**以实际部署为准**

如果测试周的网站其实配好了写入服务，那么没有钥匙的链接**保存时会被挡住**（页面会报错）。遇到这种情况不要反复点，先找 Terry；他按 [`ops-checklist.md`](ops-checklist.md) 处理。

**遇到问题找谁**

- 找 Terry。
- 你**改了**什么才发出去（删了哪几行、改了数量、换了说法）——这个最值钱，请把改前改后都说一遍。
- 因为这张单今天下不了单 → 说「今天下不了单」，这是 P0。

### English

**How to open it**

1. Long-press the QR image in WeChat and choose “recognize”, or just tap the link. **This link has no key in it** — open it as is.
2. Bookmark the page. The language switch is at the top right (Chinese / English / UA); pick once and it is remembered.
3. The bottom bar only shows “Prep”, “Menu” and “Shopping”. **There is no “Plan” tab — that is normal.** It is for the chef.

**What you will see**

> This week the shopping page is most likely **read-only**: you can look and copy, but **you cannot save the list online**. The line at the very top of the page tells you which one you have.

- Top line: “Not connected · this is the published version, read only”. If you see it, you are on the read-only version.
- Heading “This shopping list”, then the dates and meals it covers.
- One card per ingredient, marked “Main ingredient” or “Seasoning”. Open “Sources and quantity reference” to see which dish, which day and meal, how many servings, how much is needed, and how many packs from which supplier (pack size, rough price). If a number looks wrong, open it and check — no need to ask anyone.
- Each card has the buttons “Check”, “Buy”, “Available” and a “Bought” tick box. **On the read-only version they are all greyed out**, and so are “Save list” and “Read latest saved plans”.
- The page also says “Saving, decisions and ticks need a connected service. Open with the chef link.” — **you do not need the chef link. Ignore that line**; if something has to be saved, ask Terry.
- The “Information to check” block lists ingredients with missing specs or units that cannot be converted. **Those cannot be turned into a number of packs** — tell us when you see it.
- “Role not classified”, “Servings unspecified” and “quantity to confirm” mean the records are incomplete. It is not your mistake; tell us as it is.

**Copy for suppliers**

1. Tap “**Copy for suppliers**”. “Copied” means it worked. If you see “Copy failed; select the text below to copy.”, a text box opens below — select all and copy by hand.
2. The text is **split into one block per supplier**. Each block starts with 【Purchase order】, the date and the supplier name, then one line per ingredient (packs × pack size, total in brackets), and a last line with the item count and the estimated amount.
3. Amounts are **totalled per currency**. If one block has several currencies it says “currencies differ, not added” — nothing is converted or added together. Items without a last price say “no last price on record”.
4. One block may say “No supplier assigned”: nobody owns those items yet. **Ask Terry who buys them before you send it.**
5. On the read-only version the copy contains **everything the selected meals need**, with no Available / Bought marks. As the page says, **remove what you already have before sending**, then paste into WeChat.

**Depends on the actual deployment**

If the site was in fact set up with a saving service, a link without a key **will be blocked when you save** (the page shows an error). Do not keep tapping — tell Terry, who will handle it following [`ops-checklist.md`](ops-checklist.md).

**Who to ask**

- Terry.
- Tell us what you **changed** before sending (lines deleted, quantities edited, wording replaced) — that is the most valuable thing; give us before and after.
- If you cannot place today’s order because of this list, say “I can’t order today”. That is a P0.

### Українською (uk)

**Як відкрити**

1. У WeChat утримуйте QR-зображення й оберіть розпізнавання, або просто натисніть посилання. **У цьому посиланні немає ключа** — відкривайте як є.
2. Додайте сторінку в закладки. Мова перемикається вгорі праворуч (中文 / English / UA); виберіть один раз — запам'ятається.
3. Унизу ви бачите лише «Підготовка», «Меню» і «Закупівлі». **Вкладки «План» немає — так і має бути.** Вона для шефа.

**Що дивитися**

> Цього тижня сторінка закупівель, найімовірніше, **лише для читання**: дивитися й копіювати можна, **зберегти список онлайн не можна**. Який варіант у вас — видно з найвищого рядка сторінки.

- Верхній рядок: «Немає з’єднання · це опублікована версія лише для читання». Якщо він є — це версія для читання.
- Заголовок «Цей список покупок», нижче — дати й прийоми їжі.
- Одна картка на інгредієнт, позначка «Основний інгредієнт» або «Приправа». Розгорніть «Джерела й кількісні орієнтири»: яка страва, який день і прийом їжі, скільки порцій, скільки треба, скільки упаковок у якого постачальника (розмір упаковки, орієнтовна ціна). Якщо число сумнівне — розгорніть і перевірте, питати не треба.
- На кожній картці кнопки «Перевірити», «Купити», «Є в наявності» і прапорець «Куплено». **У версії для читання вони сірі, натиснути не можна**; «Зберегти список» і «Прочитати останні збережені плани» теж сірі.
- На сторінці ще є рядок «Збереження, рішення та відмітки потребують з’єднання. Відкрийте за посиланням шефа.» — **посилання шефа вам не потрібне, цей рядок ігноруйте**; якщо щось треба зберегти — до Террі.
- Блок «Дані для перевірки» показує інгредієнти без параметрів закупівлі або з одиницями, які не можна перетворити. **Для них не виходить порахувати упаковки** — скажіть, коли побачите.
- «Роль не визначено», «Порції не вказано», «кількість уточнити» — дані заповнено не повністю. Це не ваша помилка, скажіть як є.

**Копіювати для постачальників**

1. Натисніть «**Копіювати для постачальників**». «Скопійовано» — готово. Якщо з'явилось «Не вдалося скопіювати; виділіть текст нижче.», нижче відкриється поле з текстом — виділіть усе й скопіюйте вручну.
2. Текст **розбито на блоки по постачальниках**. Кожен блок починається з 【Замовлення】, дати й назви постачальника; далі по рядку на інгредієнт (упаковки × розмір, у дужках разом), останній рядок — кількість позицій і орієнтовна сума.
3. Суми **рахуються окремо за кожною валютою**. Якщо в блоці різні валюти, буде «різні валюти, не додано» — нічого не конвертується й не додається. Позиції без ціни: «останньої ціни немає».
4. Один блок може мати «Постачальника не вказано»: ці позиції ще ні за ким. **Спитайте Террі, хто їх купує, перш ніж надсилати.**
5. У версії для читання копіюється **усе, що потрібно для вибраних прийомів їжі**, без позначок «Є в наявності» / «Куплено». Як і сказано на сторінці, **перед надсиланням приберіть те, що вже є**, потім вставте у WeChat.

**Залежить від фактичного розгортання**

Якщо сайт насправді має службу збереження, посилання без ключа **заблокує збереження** (сторінка покаже помилку). Не натискайте знову й знову — скажіть Террі, він діятиме за [`ops-checklist.md`](ops-checklist.md).

**Якщо щось не так**

- Террі.
- Скажіть, що ви **змінили** перед надсиланням (які рядки прибрали, які кількості поправили, які слова замінили) — це найцінніше; розкажіть, як було й як стало.
- Якщо через цей список сьогодні неможливо зробити замовлення — скажіть «сьогодні не можу замовити». Це терміново (P0).

---

## 3. 师傅 · Шеф-кухар

### 中文

> 后台现在是真的后台，不是占位页。但**能不能在线保存、发布，取决于测试周的网站有没有配好写入服务**。最近一次部署是只读的——如果开工时仍是这样，你能打开后台、能看，但「保存计划」「发布」做不了（页面会写「未连接后台，不能保存」）。开工前先和 Terry 确认是哪一种。

**怎么打开**

1. 用 Terry 当面给你的**带钥匙的链接**打开（形如 `…/#/admin/t/…`）。这条链接**不要转发、不要进群、不要截图发出去**。打开后地址栏里的钥匙会自动消失；关掉标签页就要重新用链接打开。
2. 打开后标题是「师傅后台」。如果看到「请用师傅链接打开」，说明这次没带钥匙——回去点 Terry 给你的那条链接。
3. 有钥匙时，底部导航会多出「菜单计划」，页面上方的计划栏会出现「排菜 / 编辑」，计划页右上角会出现「导入」。别人的链接看不到这些。

**本周要做的事（按顺序）**

1. **选计划。** 页面上方「所选计划」下拉里选本周的计划；还没有就选「本周计划 · 选择或创建」。
2. **排菜。** 点「排菜 / 编辑」（或后台首页的「排菜单」）。
   - 「查看范围」：一天 / 一周 / 全部日期，再点上面的日期条选哪一天。
   - 每道菜一行：右边填份数（可以留空）；点「编辑」可以换菜，或点「移除」去掉。
   - 要加菜：选菜品，点「加一道菜」；要换日期或餐次，先点开它上面那一行。
   - 排完点「**保存计划**」。顶上的状态条会变成「已保存；发布状态请到发布页查看」。**保存了不等于上线。**
   - 整份文字菜单想一次导入：点右上角「导入」（页面上写作「粘贴导入」）。
3. **发布前核对。** 这时看的是刚保存的计划。
   - 在计划页上逐天看一遍：菜、餐次、份数是不是你要的。
   - 点「查看材料候选」，看这些菜要买哪些材料，有没有「用途未分类」「份数未录」之类的提示。
   - 需要在线采购单时，点「建立采购清单」。它用的是**已保存**的计划，所以先保存。清单建好后只认建立时的那份计划；之后再改计划，要在采购单里点「读取最新已保存计划」，核对后再点「保存清单」。
   - **这一步先别拿三张单（备料、采购、菜单）来核对。** 三张单显示的是**已经发布**的那一版，刚保存的改动在那里还看不到；新建的计划会显示「所选计划尚未在本版发布」。这是正常的，不是没保存上。
4. **发布。**
   - 点「去发布」（或后台首页顶上那条「N 项改动还没发布」）进发布页，看「还没发布的改动」对不对，再点「**发布**」。
   - 进度四步：「检查数据」→「补翻译」→「生成三张单」→「上线」。哪一步出错了，页面会写「卡在「…」」，照提示看；也可以点「打开 Actions 页面」。
   - 看到「上线了 · 大家两分钟内能看到」才算发完。
5. **发布后核对三张单。**
   - 等两分钟，用手机扫三张码（就是帮厨、采购员、顾客用的那三条，不带钥匙），各打开一次。页面上出现「有新版本」时，先点「点此刷新」。
   - 备料单今天的菜和份数对不对；采购单有没有「需要核对的资料」；菜单今天有没有该有的菜。这是核对，不是欣赏。
   - 看到的还是旧菜，或者写着「所选计划尚未在本版发布」：再等两分钟、刷新一次；仍然不对就找 Terry。
6. **发错了。** 发布页下面「发布记录」里，在对的那一版点「回到这版」→「退回」。退回**不会自动上线**，要再点一次「发布」；发完照第 5 步再核对一遍。

**只读构建下怎么办**

后台首页、计划页、发布页都会写「未连接后台，不能保存」，「保存计划」「发布」不能用。**不要反复点，也不要把改动抄在别处当成已经保存。** 先告诉 Terry；他按 [`ops-checklist.md`](ops-checklist.md) 处理（不是写入服务没配，就是要在仓库里直接改数据再发布）。如果是配好了写入服务但页面提示钥匙无效或没有权限，也是找 Terry，换最新那条链接。 Terry 在仓库里改完并发布成功后，你照第 5 步核对三张单。

**遇到问题找谁**

- Terry。
- 你觉得「麻烦」的地方全都要说——嫌麻烦是本周最重要的三类记录之一（`plan-for-terry.md` §3）。

### English

> The back office is a real working page now, not a placeholder. But **whether you can save and publish online depends on whether this week’s site has the saving service set up.** The latest deployment was read-only — if it still is when the week starts, you can open the back office and look, but “Save plan” and “Go to publish” will not work (the page says “Not connected; saving is unavailable”). Check with Terry before the first day.

**How to open it**

1. Use the **link with the key** Terry gives you in person (it looks like `…/#/admin/t/…`). **Do not forward it, post it in a group or screenshot it.** The key disappears from the address bar once the page opens; if you close the tab you need the link again.
2. The title reads “Back office”. If you see “Open with the chef link”, the key was missing — go back to the link Terry gave you.
3. With the key, the bottom bar gains “Plan”, the plan bar at the top shows “Plan / edit”, and the plan page shows “Import” at the top right. Other people’s links do not show these.

**What to do this week (in order)**

1. **Choose the plan.** In the “Selected plan” dropdown at the top pick this week’s plan; if there is none, pick “This week · choose or create”.
2. **Plan the meals.** Tap “Plan / edit” (or “Plan the menu” on the back-office home).
   - “View range”: Day / Week / All dates, then tap a day in the date strip.
   - One row per dish: fill in servings on the right (may stay blank); tap “Edit” to change the dish or “Remove” to drop it.
   - To add a dish: choose it and tap “Add a dish”; to change the date or meal, open the line above it first.
   - When done, tap “**Save plan**”. The status line turns into “Saved; check publication on the publish page”. **Saved does not mean live.**
   - To bring in a whole text menu at once, tap “Import” at the top right (the page itself says “Paste import”).
3. **Check before publishing.** At this point you are looking at the plan you just saved.
   - Go through the plan page day by day: are the dishes, meals and servings what you want?
   - Tap “Preview ingredients” to see what these dishes need to buy, and any notes like “Role not classified” or “Servings unspecified”.
   - If you need an online shopping list, tap “Create shopping list”. It uses the **saved** plan, so save first. Once created, the list keeps the plan it was made from; if you change the plan later, open the list, tap “Read latest saved plans”, check it, then tap “Save list”.
   - **Do not use the three sheets (Prep, Shopping, Menu) for this check yet.** They show the version that is **already published**, so changes you just saved are not there yet; a new plan shows “The selected plan is not in this publication. Save and publish it; other plans do not replace it.” That is normal — it does not mean saving failed.
4. **Publish.**
   - Tap “Go to publish” (or the “N changes not published yet” bar on the back-office home), check “Unpublished changes”, then tap “**Publish**”.
   - Four steps: “Check data” → “Fill in translations” → “Build the three sheets” → “Go live”. If one fails, the page says “Stuck at “…””; follow that. You can also tap “Open the Actions page”.
   - You are done when it says “Live · everyone will see it within two minutes”.
5. **Check the three sheets after publishing.**
   - Wait two minutes, then scan the three QR codes with your phone (the same three links the helpers, the buyer and diners use, without a key) and open each one. If the page says “New version available”, tap “Reload” first.
   - Are today’s dishes and servings right on Prep; any “Information to check” on Shopping; is today’s menu what it should be. This is checking, not admiring.
   - Still the old dishes, or it still says the selected plan is not in this publication: wait two more minutes and reload; if it is still wrong, tell Terry.
6. **Published something wrong?** On the publish page, under “Publish history”, tap “Go back to this version” on the right version, then “Roll back”. Rolling back **does not go live by itself** — press “Publish” once more, then check again as in step 5.

**If this is a read-only build**

The back-office home, plan page and publish page all say “Not connected; saving is unavailable”, and “Save plan” / “Publish” do not work. **Do not keep tapping, and do not copy changes elsewhere and treat them as saved.** Tell Terry first; he handles it following [`ops-checklist.md`](ops-checklist.md) (either the saving service is not set up, or the data has to be changed in the repository and republished). If the saving service is set up but the page says the key is invalid or not allowed, that is also for Terry — use the newest link. Once Terry has changed the data in the repository and the publish has succeeded, check the three sheets as in step 5.

**Who to ask**

- Terry.
- Tell us everything you find “a hassle” — that is one of the three most important kinds of notes this week (`plan-for-terry.md` §3).

### Українською (uk)

> Кабінет шефа — тепер справжній, а не заглушка. Але **чи можна зберігати й публікувати онлайн, залежить від того, чи налаштовано службу збереження.** Останнє розгортання було лише для читання — якщо так і лишилося, кабінет відкриється й усе буде видно, але «Зберегти план» і «До публікації» не спрацюють (сторінка напише «Немає з’єднання; збереження недоступне»). Уточніть у Террі до першого дня.

**Як відкрити**

1. Використайте **посилання з ключем**, яке Террі дає особисто (виглядає як `…/#/admin/t/…`). **Не пересилайте, не кидайте в групи, не робіть скріншотів.** Після відкриття ключ зникає з адресного рядка; якщо закрити вкладку, посилання потрібне знову.
2. Заголовок — «Кабінет шефа». Якщо бачите «Відкрийте за посиланням шефа» — ключа не було; поверніться до посилання від Террі.
3. З ключем унизу з'являється «План», у панелі плану вгорі — «Планувати / редагувати», а на сторінці плану праворуч вгорі — «Імпорт». За іншими посиланнями цього немає.

**Що робити цього тижня (по черзі)**

1. **Виберіть план.** У списку «Вибраний план» угорі оберіть план цього тижня; якщо його ще немає — «Цей тиждень · вибрати або створити».
2. **Складіть меню.** Натисніть «Планувати / редагувати» (або «Скласти меню» на головній кабінету).
   - «Діапазон перегляду»: День / Тиждень / Усі дати, потім натисніть день у смужці дат.
   - Один рядок на страву: праворуч вкажіть порції (можна не вказувати); «Змінити» — замінити страву, «Прибрати» — видалити.
   - Щоб додати страву: виберіть її й натисніть «Додати страву»; щоб змінити дату чи прийом їжі — спершу розгорніть рядок над кнопкою.
   - Готово — натисніть «**Зберегти план**». Статус зміниться на «Збережено; стан публікації на сторінці публікації». **Збережено — не означає опубліковано.**
   - Щоб одразу внести весь текст меню, натисніть «Імпорт» угорі праворуч (на сторінці це «Імпорт тексту»).
3. **Перевірте перед публікацією.** Зараз ви дивитеся на щойно збережений план.
   - Перегляньте сторінку плану день за днем: чи ті страви, прийоми їжі й порції.
   - «Переглянути інгредієнти» — що треба купити для цих страв і чи є позначки на кшталт «Роль не визначено» чи «Порції не вказано».
   - Якщо потрібен онлайн-список покупок, натисніть «Створити список покупок». Він бере **збережений** план, тож спершу збережіть. Створений список тримається того плану, з якого його зробили; якщо потім змінити план, відкрийте список, натисніть «Прочитати останні збережені плани», перевірте й натисніть «Зберегти список».
   - **Поки що не перевіряйте за трьома аркушами (Підготовка, Закупівлі, Меню).** Вони показують **уже опубліковану** версію, тож щойно збережених змін там ще немає; новий план покаже «Вибраного плану немає в цій публікації. Збережіть і опублікуйте його; інші плани його не замінюють.» Так і має бути — це не означає, що зберегти не вдалося.
4. **Опублікуйте.**
   - «До публікації» (або смужка «Змін ще не опубліковано: N» на головній кабінету), перевірте «Неопубліковані зміни», натисніть «**Опублікувати**».
   - Чотири кроки: «Перевірка даних» → «Доповнення перекладів» → «Формування трьох аркушів» → «Вихід онлайн». Якщо крок зупинився, сторінка напише «Зупинилося на «…»»; дійте за підказкою. Можна відкрити «Відкрити сторінку Actions».
   - Готово, коли з'явиться «Онлайн · усі побачать за дві хвилини».
5. **Перевірте три аркуші після публікації.**
   - Зачекайте дві хвилини, потім відскануйте телефоном три QR-коди (ті самі три посилання, що в помічників, закупівельника й відвідувачів, без ключа) і відкрийте кожен. Якщо сторінка пише «Є нова версія», спершу натисніть «Оновити».
   - Чи правильні страви й порції на сьогодні в «Підготовці»; чи є «Дані для перевірки» в «Закупівлях»; чи є в «Меню» те, що має бути. Це перевірка, а не милування.
   - Досі старі страви або напис, що вибраного плану немає в цій публікації: зачекайте ще дві хвилини й оновіть; якщо все одно не так — до Террі.
6. **Опублікували не те?** На сторінці публікації в «Історія публікацій» біля потрібної версії натисніть «Повернутися до цієї версії», потім «Повернути». Повернення **саме не публікує** — натисніть «Опублікувати» ще раз, а потім перевірте знову, як у кроці 5.

**Якщо це збірка лише для читання**

Головна кабінету, сторінка плану й сторінка публікації напишуть «Немає з’єднання; збереження недоступне», а «Зберегти план» і «Опублікувати» не працюватимуть. **Не натискайте знову й знову й не переписуйте зміни кудись, вважаючи їх збереженими.** Спершу скажіть Террі; він діятиме за [`ops-checklist.md`](ops-checklist.md) (або службу збереження не налаштовано, або дані треба змінити прямо в репозиторії й опублікувати). Якщо службу налаштовано, але сторінка пише, що ключ недійсний чи немає прав — теж до Террі, візьміть найновіше посилання. Коли Террі змінить дані в репозиторії й публікація пройде, перевірте три аркуші, як у кроці 5.

**Якщо щось не так**

- Террі.
- Розкажіть про все, що здалося «клопотом» — це один із трьох найважливіших видів записів цього тижня (`plan-for-terry.md` §3).

---

## 4. 每天固定动作

**早上（师傅，3 分钟）**

1. 打开 `https://terryyyc.github.io/canteen-os/data/build.json`，看 `builtAt` 是不是最后一次发布的时间、`plans` 里有没有本周的计划。
2. `#/prep` 切到今天：菜、份数、配料。
3. `#/purchase`：有没有「需要核对的资料」。
4. **让帮厨的手机联网开一次页面。** 这样万一白天线上挂了，他手里那份离线副本是今天的（见 [`ops-checklist.md`](ops-checklist.md) §4）。

**现场（谁听到谁记）**

- 听到「这个我不懂 / 这个不对 / 这个我自己改了」——**当场**按原话记进 [`log.md`](log.md)，不要等下班回忆。
- 顺手判一下是不是 P0（定义在 `log.md`）。是 P0 → 立刻找 Terry；不是 → 记下来，别打断当天的活。

**收工（师傅或 Terry，三行）**

- 今天做不出来的菜：
- 今天绕过去的：
- 明天只修：

---

## 5. 每天要问的问题（复用 week-41）

下面这两组问题原样沿用 [`../week-41/README.md`](../week-41/README.md) 的测试 A / 测试 B。**不做口头讲解，先让人自己看**，然后照着问；答案按原话记进 `log.md`。

### 问采购员（约 5 分钟，微信即可完成）

1. 「这两段文字你能**直接转发**给菜贩吗？如果不能，差在哪一步？」
2. 「缺什么字段你才敢下单？」（重点听：要不要联系方式、送货时间、规格/品牌备注、单价单位『每包』是否歧义——鸡蛋『180 个』菜贩听得懂是『一箱』吗？）
3. 「『预估 ¥…（按上次价）』这句会惹麻烦吗？要保留还是删掉？」

**通过标准**：采购员回答「直接能转」或「只缺一两个字段」。要求加字段的，逐条记——每条都是 schema 缺口的候选。

### 问帮厨（约 10 分钟）

1. 「看得懂吗？明天照这张单子备料，你缺什么信息？」
2. 指着**没写切法**的那一行（如鸡蛋 `(без специфікації нарізки)`）问：「这个提示对你有用吗，还是噪音？」
3. 指着**切法带尺寸**的那一行（如番茄 `Шматки рулонним нарізанням, 3–4 cm`）问：「这个翻译你能照着切吗？需要图吗？」
4. 「数量单位（кг / шт / г / л）都顺手吗？」

**通过标准**：帮厨能复述出「X 月 X 日午餐要 30 кг 番茄切滚刀块」这个级别的信息。切法译名看不懂 → 记原话，回投 `data/techniques.json` 词表修订。

### 本周新增：问「屏幕」而不只是「纸」

week-41 测的是纸（txt / md），本周测的是网页。多问三句：

5. 「昨天这一页你自己打开过吗？还是别人给你看的？」（门 C：帮厨连续 5 天自己打开）
6. 「微信文本是你自己复制的，还是让人帮你生成的？」（门 C：采购员自己复制）
7. 「断网的时候还能看吗？」（离线副本是否真的救过场）

---

## 6. 被问「这数字怎么算的」

不用背。**采购单每一行都能点开看推导**（菜单需求 → 净料率 → 备量系数 → 扣库存 → 取整 → 几包），照着念就行。写法参考 `../week-41/README.md` 的「已知口径」一节，**数字以本周实际数据为准，不要照抄上一周的**。
