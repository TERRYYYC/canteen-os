/**
 * @canteenos/core — 公共出口。
 * 类型与 schemas/ 一一对应（单一事实源见 ADR-0003）；
 * 采购引擎骨架见 procurement/engine.ts（ADR-0005）。
 */
export * from "./types.js";
export * from "./procurement/engine.js";
