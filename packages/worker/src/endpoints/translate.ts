/**
 * POST /translate（契约 §1.0：「仅见于 #19，ADR §5 未列」）。
 * 即时机翻单条中文，给 #24 的「机翻由 worker 调 translate 逻辑即时返回」用。
 *
 * 请求体 `{ text: "红烧肉", targets?: ["en","uk"] }`（也接受 `{ zh: ... }`）。
 * 响应 `{ ok: true, translations: { en?, uk? }, warnings: [] }` —— 与前端契约的
 * `translate(zh, targets) => { en?, uk? }` 对得上。
 *
 * **不落盘**：不写 data/**，也不碰 data/translations.lock.json（那份 lock 由
 * build-deploy.yml 的机翻步骤写，路径白名单里本来就没有它，契约 §7.1）。
 * 没配 DEEPL_API_KEY 时不报错，返回空译文 + warning，让后台退化成「自己填英文/乌克兰文」。
 */
import type { Ctx } from "../context.js";
import { validationFailure } from "../http.js";

const TARGET_LANG: Record<string, string> = { en: "EN-US", uk: "UK" };
const DEFAULT_TARGETS = ["en", "uk"] as const;

export async function handleTranslate(ctx: Ctx): Promise<unknown> {
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text : typeof body.zh === "string" ? body.zh : null;
  if (text === null) {
    throw validationFailure([{ path: "/text", code: "required", message: "这项必须填：text" }]);
  }
  if (text.trim().length === 0) {
    throw validationFailure([{ path: "/text", code: "minLength", message: "这项不能是空的" }]);
  }

  const requested = Array.isArray(body.targets)
    ? (body.targets as unknown[]).map(String)
    : [...DEFAULT_TARGETS];
  const targets = requested.filter((t) => t in TARGET_LANG);
  if (targets.length === 0) {
    throw validationFailure([{ path: "/targets", code: "enum", message: "只能选：en / uk" }]);
  }

  const apiKey = ctx.env.DEEPL_API_KEY;
  if (!apiKey) {
    return { ok: true, translations: {}, warnings: ["translate-unavailable"] };
  }

  const base = apiKey.trim().endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const translations: Record<string, string> = {};
  for (const lang of targets) {
    const res = await ctx.rt.fetch(`${base}/v2/translate`, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: [text], source_lang: "ZH", target_lang: TARGET_LANG[lang] }),
    });
    if (!res.ok) {
      // 机翻挂了不该让「保存」这条路也断掉：照实回空 + warning，前端自己填。
      return { ok: true, translations, warnings: ["translate-failed"] };
    }
    const json = (await res.json()) as { translations?: Array<{ text?: string }> };
    const value = json.translations?.[0]?.text;
    if (typeof value === "string") translations[lang] = value;
  }

  return { ok: true, translations, warnings: [] };
}
