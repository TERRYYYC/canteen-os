export class BodyTooLarge extends Error {}

/** Stop reading at the bound instead of allocating an unbounded arrayBuffer. */
export async function boundedBytes(body: ReadableStream<Uint8Array> | null, limit: number, signal?: AbortSignal): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    if (signal?.aborted) { abort(); throw new Error("Body read aborted"); }
    while (true) {
      const part = await reader.read();
      if (signal?.aborted) throw new Error("Body read aborted");
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        throw new BodyTooLarge();
      }
      chunks.push(part.value);
    }
  } finally { signal?.removeEventListener("abort", abort); reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
