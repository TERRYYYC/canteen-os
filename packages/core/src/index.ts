/**
 * @canteenos/core — 公共出口。
 * 类型与 schemas/ 一一对应（单一事实源见 ADR-0003）；
 * 引擎骨架见 procurement/engine.ts（v2 五函数契约，ADR-0006）。
 */
export * from "./types.js";
export * from "./procurement/engine.js";
export * from "./sheets.js";
export * from "./render/prep.js";
export * from "./render/menu.js";
export * from "./import/parse-plan-text.js";
