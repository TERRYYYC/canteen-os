/**
 * 稳定序列化（契约 §3.1 / D-05）：键排序 + 2 空格缩进 + 末尾换行。
 *
 * 内容幂等就靠它：请求体稳定序列化后与目标文件当前内容**逐字节**比较，
 * 相同就一个 commit 都不产生（「师傅连点两次保存」「网络抖动重发」都不会污染 main）。
 * 数组顺序是数据的一部分，不排序。
 */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) out[key] = sortKeysDeep(source[key]);
    return out;
  }
  return value;
}

export function stableSerialize(value: unknown): string {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}
