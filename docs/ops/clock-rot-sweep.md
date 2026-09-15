运维 · 日期腐烂（date rot）的主动扫法
=====================================

**问题**：#99、#105、#107 是同一类 bug——测试里写死了日期，某一天起 CI 自己变红，
产品代码一行没动。三条都是「撞上了才发现」，其中 #99 是当天 CI 已经红了才被看见。

**解法**：不等它自己红，用平移进程时钟的方式提前跑一遍。下面这套在沙箱里跑一轮约 30 秒／组合。

## 1. 时钟 shim

Node 没有内置的时钟伪造，`faketime` 沙箱里也没有。用一个 20 行的预加载模块即可，
只劫持**无参** `new Date()` 与 `Date.now()`，显式传参的 `new Date('2026-10-05')` 原样放行
（否则固定夹具会跟着漂，扫出来全是假阳性）：

```js
// clock.mjs —— 用 CLOCK_SHIFT_MS 平移进程时钟
const shift = Number(process.env.CLOCK_SHIFT_MS || '0');
if (shift) {
  const RealDate = Date;
  const now = () => RealDate.now() + shift;
  class ShiftedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(now());
      else super(...args);
    }
    static now() { return now(); }
  }
  Object.defineProperty(ShiftedDate, 'name', { value: 'Date' });
  globalThis.Date = ShiftedDate;
}
```

跑法（`NODE_OPTIONS` 会被子进程继承，所以 `build-data.mjs` spawn 出去的解码子进程也一起平移）：

```bash
export NODE_OPTIONS="--import file:///abs/path/clock.mjs"
export CLOCK_SHIFT_MS=$((86400000*365))   # 往后一年
export TZ=Pacific/Kiritimati              # UTC+14
pnpm -C packages/core test; pnpm -C packages/web test; pnpm -C packages/worker test
node --test scripts/*.test.mjs
node --test packages/web/test/e2e/team-meals/api-contract.test.mjs
node scripts/build-data.mjs --target team-meals --check --revision "$(git rev-parse HEAD)"
```

## 2. 一个必须避开的假阳性

**不要在同一个克隆里并行跑多个组合。** `packages/worker` 的
「ajv standalone 产物：--check 在一致时绿，在漂移时红」这条用例会重新生成
`packages/worker/generated/validators.js`；几个进程同时写同一个文件，必然有人读到半成品，
报出来的是「产物漂移」，看上去像是时钟相关的 bug。要并行就一个组合一个克隆。
（2026-09-16 本轮在这上面绕了一圈，单独复跑即绿。）

## 3. 2026-09-16 的扫描结果

基线 main `3f9360b`，Node 22.23.2，共 19 组时钟 × 时区：

- 时钟：+7 / +14 / +21 / +30 / +45 / +60 / +90 / +120 / +180 / +270 / +365 / +545 / +730 天
- 时区：UTC、Pacific/Kiritimati（UTC+14）、Pacific/Midway（UTC-11）
- 边界点特意取了 2026-11-01（DST）、2026-12-31 / 2027-01-01（跨年）、2027-02-28（非闰年 2 月底）

结果：**每一组的 pass/fail 集合与基线逐条相同**——core 103/0、worker 294/0、web 614/614、
scripts 213/6；CI 的三道闸门（`api-contract`、`build-data --target team-meals --check`、
`build-data --target legacy-numeric --check --compare-snapshots`）在 +2 年内全部通过。

那 6 条 scripts 红是**沙箱固有**、与时钟无关：网络白名单挡掉 libwebp 下载，
`dwebp` 不在 PATH。CI 的 `build-web` 第一步跑 `prepare-team-image-tools.mjs`，那边有工具、不红。

**结论：#100 / #106 / #108 之后，CI 会跑到的套件里没有已知的日期定时炸弹。**
`packages/web/test/e2e/` 下除 `api-contract.test.mjs` 外的用例不进 CI，本次未纳入扫描范围。

## 4. 什么时候重跑

新增写死日期的用例时（`grep -rE "20[2-9][0-9]-[0-1][0-9]-[0-3][0-9]"` 一下就知道有没有），
或者升 Node / 改时间相关逻辑之后。也可以做成每月一次的定时 workflow，
但本仓当前的判断是：这类 bug 出现频率低、扫一次成本也低，先保持手动。
