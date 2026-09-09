/**
 * git blob sha（sha1("blob <len>\0" + bytes)）。
 *
 * 契约 §3.1 的幂等判定是「请求体稳定序列化后与目标文件当前内容**逐字节**比较」。
 * 直接比 blob sha 与逐字节比较等价（sha1 的入参就是那串字节），但有两个好处：
 * 图片这种二进制不用先解码成字符串（解码会毁掉字节），而且比较对象正好是 GitHub
 * 返回的 `sha` 字段本身 —— 同一个值也是 `If-Match` 的乐观锁凭据。
 */
const HEX = "0123456789abcdef";

export async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const payload = new Uint8Array(header.length + bytes.length);
  payload.set(header, 0);
  payload.set(bytes, header.length);
  const digest = await crypto.subtle.digest("SHA-1", payload);
  let out = "";
  for (const b of new Uint8Array(digest)) {
    out += HEX[b >> 4];
    out += HEX[b & 0x0f];
  }
  return out;
}

export async function gitBlobShaOfText(text: string): Promise<string> {
  return gitBlobSha(new TextEncoder().encode(text));
}
