---
feature_ids: []
topics: [team-meals, build, assets, fixed-revision]
doc_kind: module-contract
created: 2026-09-11
---

# 小团队构建目标

事实合同见 [team-meals-contract](../specs/team-meals-contract.md)。`scripts/build-data.mjs` 保留同步 `runBuild` 和默认 `legacy-numeric`，新增显式 `team-meals`。先构建 core，再执行所需目标。包依赖与 CI 接线由 RC-CI 维护。

```sh
pnpm install --frozen-lockfile
npm --prefix packages/core run build
node scripts/prepare-team-image-tools.mjs
node scripts/build-data.mjs --target team-meals --check --revision <完整提交SHA>
node scripts/build-data.mjs --target team-meals --revision <同一完整提交SHA> --out packages/web/public/data
node scripts/build-data.mjs --target legacy-numeric --check --compare-snapshots --root test/fixtures/contracts/valid/golden --at 2026-10-03T00:00:00.000Z
```

以上在真实仓库根运行。`--check` 只检查，不输出文件；生产构建省略它才写 `packages/web/public/data`（也是默认输出目录）。CI owner 应将同一个完整提交 SHA 传给生产检查和实际构建；没有 `--revision` 时取各次调用的 HEAD。固定黄金命令明确使用 Q 的 fixture root，不对正常生产菜单做旧快照对比。需要固定产物时间时两次均加 `--at <同一ISO时间>`；该参数不改变 sourceRevision。

team 直接读取真实仓库 Git commit 中的 JSON 和图片，不读取同路径工作副本。显式 revision 必须是 commit 对象且为当前 HEAD 的祖先；短 SHA、分支名、tag 对象、无 Git root 和无法解析的历史均失败。省略 revision 读取 HEAD。本 CLI 不将工作草稿伪装成已保存输入。

每份计划构造实际日期/餐次 selection。空计划显式用 emptyMenuPlanRefs 保留原计划，selection 为 []。纯 core 给出全部配料引用、覆盖状态、来源索引与可选估算；数量不足不丢材料、不补份数或 qty。

| 产物/字段 | 内容与消费约束 |
|---|---|
| build.json | builtAt、commit、plans、target="team-meals"、projectionVersion="1"（字符串）；消费者先核对 target 和版本 |
| team-meals/planId.json | 原 TeamMealsProjection 加 estimates、assets、issues；sourceRevision 等于 manifest commit |
| estimates | core 原样返回；缺价可显示包数但预算 incomplete |
| issues | 全部相关问题，含 kind/code、材料或菜品与可用的 ownerPath/jsonPointer/source；缺价格为 missing-price warning |
| assets | ownerPath、jsonPointer、原 ImageRef 放 source、status；available 项另有 path |
| assets/revision/repoPath | 仅同一 commit 的已核验原始图片字节；不改 JSON ImageRef，不读取当前同路径图 |

静态 JSON 的精确类型如下；被引用的 core 类型均从 `@canteenos/core` 导出，数据保持 JSON 原类型，不转换日期或缺失数量：

```ts
import type {
  Id, ImageRef, TeamMealsProjection, ShoppingEstimate,
  ReferenceIssue, EstimateReasonCode, IngredientSource,
} from '@canteenos/core';

interface TeamBuildManifest {
  builtAt: string;              // ISO timestamp
  commit: string;               // full 40-character lowercase commit SHA
  plans: Id[];                 // sorted plan IDs, possibly []
  target: 'team-meals';
  projectionVersion: '1';       // string, same as TeamMealsProjection
}
type TeamBuildAsset = {
  jsonPointer: string;
  source: ImageRef;             // original object at ownerPath + jsonPointer
} & (
  | {ownerPath: 'data/techniques.json'; techniqueRef: Id}
  | {ownerPath: `data/ingredients/${Id}.json` | `data/dishes/${Id}.json`; techniqueRef?: never}
) & (
  | {status: 'available'; path: string}
  | {status: 'external-unpinned' | 'missing' | 'invalid'; path?: never}
);
interface TeamBuildIssue extends Omit<ReferenceIssue, 'code'> {
  kind: 'warning' | 'error';
  code: ReferenceIssue['code'] | EstimateReasonCode
    | 'invalid-source' | 'invalid-selection' | 'missing-price'
    | 'example-dish-referenced' | 'asset-unavailable' | 'external-unpinned';
  planId?: Id;
  ownerPath?: string;
  jsonPointer?: string;
  message?: string;
  source?: IngredientSource;
  stepIndex?: number;
}
type PublishedTeamPlan = TeamMealsProjection & {
  estimates: ShoppingEstimate;
  assets: TeamBuildAsset[];
  issues: TeamBuildIssue[];
};
```

`team-meals/<planId>.json` 直接是 PublishedTeamPlan，没有 `teamMeals` 外壳（外壳仅在 `runBuild().sheets[planId]` 返回值内）。其中 `sourceRevision` 必须等于 manifest.commit，`projectionVersion` 必须等于 manifest 的字符串 `"1"`，menuPlans 中保留该计划原对象。`estimates.items` 为每个材料的 `complete + lines` 或 `unavailable + reasons`，`budgetStatus` 为 `complete|incomplete|not-applicable`；不能把它当 ShoppingList 的人工判断或重建预算总价。问题字段按实际来源出现，不能假设每条都有 message/ownerPath/jsonPointer。

成功发布的 issues 只会包含 warning，assets 只会包含 available/external-unpinned；missing/invalid 仅可能出现在阻止发布的内存检查结果。available.path 是相对于上述输出根的 `assets/<完整commit>/<规范化data路径>`；静态读取者应以原始 ownerPath + jsonPointer 对齐 ImageRef，核对 source 与原对象以及 path 内 revision，不从 ImageRef.src 猜当前 URL，不用名字匹配图片。`data/techniques.json` 的资产必有 `techniqueRef`，值为原版 technique.id，供筛选后的 projection.techniques 稳定关联；其它 owner 不写该字段。技法 pointer 下标仍为原版完整词表下标，仅作原始定位，不能拿过滤后的数组下标替代。即使两技法的 source/src 全部相同，各自仍保留 techniqueRef 和原 pointer，不合并关联记录；相同路径的图片 bytes 可共用。

空计划照常列入 manifest.plans，写出自己的 PublishedTeamPlan：menuPlans 仍含该空计划，selection、collection.items、estimates.items、assets 均为 []，budgetStatus 为 not-applicable；ingredients/dishes 为空对象，techniques 为 []，issues 为 []，coverage 仍保留原 core 的 recipeCompleteness=unverified。整个资料库没有计划时 manifest.plans=[]，只发布 manifest；不能把这些状态推成加载失败，也不能补一条餐次或份数。

所有输入先走正式 schema。坏引用、示例菜引用、视频来源缺 URL、clip 时间倒置、非法本地图片等阻止发布。缺真实份数/qty/基准/包装/价格、非 active 或成分未录仍可展示，issues 随投影传递。外链保留原始来源并标 external-unpinned，不能作为已固定字节的图片显示。

图片须在 data 内，限制 200 KiB、最长边 1280 px、PNG/JPEG/WebP，许可和署名沿用已有素材约定。拒绝绝对路径、越界和 Git 符号链接。`verify-team-image.mjs` 在独立构建进程检查原始容器，再调用实际像素解码器；metadata/header 通过不等于可发布。解码能力不进入纯 core 或 Worker runtime。

| 格式 | 原始容器与实际解码 |
|---|---|
| PNG/APNG | 检查原始 chunk 边界、CRC、关键顺序、IHDR、动画声明/帧序号/画布范围与数量。每个原始 IDAT/fdAT 压缩流先用 Node 内置 zlib 默认 Z_FINISH 完整解压和校验，输出上限/精确扫描行字节数按帧尺寸、色深和 Adam7 计算；之后保留压缩内容补独立 PNG 外壳，由 pngjs 5.0.0 异步解码为全部 RGBA 像素。默认图不属于动画时也单独解码。|
| JPEG | 检查原始 SOI/EOI、segment 边界、SOF/SOS 声明及相关表结构；jpeg-js 0.4.4 使用 tolerantDecoding=false、尺寸与内存上限解码。坏 SOS 长度不能借 decoder 容错通过。|
| WebP | 检查原始 RIFF 长度/填充、重建 chunk 顺序、画布与每个 ANMF 的原始 offset/声明尺寸，核对压缩帧头尺寸。整体通过后仅给原 ALPH/VP8(L) 压缩 payload 补静态 RIFF 外壳，逐帧交给固定官方 libwebp 1.6.0 的 dwebp 完整解码；每次实际 PAM 像素尺寸和字节数再与原声明核对。|

临时外壳只服务解码，发布的仍是 Git 中的原始图片 bytes。WebP metadata/未知 chunk 的规范允许顺序不因 webpmux 的接受范围而收窄，webpmux 的归一化输出不能代替原始声明；PNG 保留旧官方扩展允许的 IDAT 之后 eXIf，并忽略未来 ancillary chunk 的 reserved 位。规则来源：[PNG 3](https://www.w3.org/TR/png-3/)、[PNG Extensions 1.5.0 §3.7](https://ftp-osl.osuosl.org/pub/libpng/documents/pngext-1.5.0.html#C.eXIf)、[JPEG T.81 Annex B](https://www.w3.org/Graphics/JPEG/itu-t81.pdf)、[WebP 容器规范](https://developers.google.com/speed/webp/docs/riff_container)。

PNG 的 zlib 必须完整结束，缺失/错误 Adler32、缺少/多出解压扫描行都失败。PNG 3 §11.2.3 允许忽略完整流后的末尾 unused bytes；验证器核验实际消费计数的范围，不强求等于所有 IDAT/fdAT 字节，也不把末尾另一段形似 zlib 的数据再当成一帧。Adam7 的空 pass 不增加过滤字节，动画按各帧宽高计算，不按其画布 offset 计算。

原始检查、加载/核验解码器和所有帧共享 29 秒内部期限，构建父进程另设整张图 30 秒硬超时；不会给每帧重新开始 30 秒。缺依赖、未准备/损坏的 native 工具、非零退出、超时、缺输出、像素/尺寸不符或无效 JSON 协议均失败关闭。native 工具通过 CI 的显式 `node scripts/prepare-team-image-tools.mjs` 准备；验证器的 requireTeamImageTools 只核验本地固定版本工具，不能联网补装。

这是列明容器约束加所选 decoder 的构建门禁，不是任意 PNG/JPEG/WebP 的完全规范认证：未实现动画合成/播放正确性、metadata 内容有效性或图像意图校验；实际 decoder 不支持的编码会失败。JPEG 的已知容忍边界是 EOI 前附加冗余熵字节：jpeg-js 即使 strict 也可能返回全部正常像素，本门禁未另写熵解码器来验证每一个压缩字节。像素改动若仍构成合法可解码图片，也不能据此判成损坏。测试具体覆盖正常静态/多帧、坏非首帧压缩数据、声明尺寸/offset 越界、长度/CRC/SOS 错误与原始字节保留；不把任意字节变化都宣称为可检测损坏。

私有 JPEG 测试素材曾有 DQT 长度错误，已明确保留为负例：635 bytes，SHA-256 `354a328154ac316ffcfa467f9b205dd7cccbf86891d041ce01b86f0dc9c8d680`；第二 DQT 起点 89，length=67，下一 marker 应在 158，实际隔着三个 0x32 到 161 才出现 SOF。替换的正例是一次生成后内嵌的 2×2 纯色 JPEG，632 bytes，SHA-256 `ce8384478fc1b6a296420252215241e9ead428b416066eacdd066a71b5031a92`；jpeg-js strict 实际输出 2×2、16 RGBA bytes。两者仅在 A 自有测试内，未改变 Q 共享 fixture 或 expected；正确拒绝旧坏素材不计作实现回归。

发布时先生成同父目录的完整暂存树，再把旧输出移为备份、暂存树换为输出。生成期错误保留原输出；交换错误恢复旧目录；恢复也失败则保留完整备份并报其路径。暂存与目标跨设备导致 rename 失败时不作复制回退。该步骤是离线构建，不作为在线静态文件服务器的热更新接口。

生成目录 prep/purchase/menu/team-meals/assets 与 build.json 由该输出目标拥有，team 成功发布会清理旧内容；输出根其它文件保留。首次输出目录须不存在或为空（可有 .gitkeep），已存在的非空目录须有合法的旧生成 manifest。拒绝文件系统根、仓库根或源目录重叠，也拒绝覆盖任何已跟踪源文件（.gitkeep 除外）。`--check` 或任何 blocking error 都不替换产物。

旧黄金只读 RC-Q 固定 fixture，仍复用原数值引擎和原 expected。上述命令不证明 Worker 保存、浏览器页面、L2 或生产部署通过；这些验收由对应 owner 执行。
