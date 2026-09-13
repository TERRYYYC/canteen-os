/** Deferred access to the original legacy singleton; owns no auth or transport state. */
import type { AdminApi } from "../../api/client";
import type { Lang } from "../../i18n";
export class EditorModuleUnavailable extends Error {
  constructor(readonly feature: "legacy" | "image", readonly cause: unknown) { super("editor_module_unavailable"); }
}
export function moduleUnavailableMessage(lang: Lang): string {
  return ({ zh: "这项功能的模块未能加载，输入仍保留。当前页面可以继续编辑。", en: "This feature module could not load. Your input is retained and you can keep editing.", uk: "Модуль цієї функції не завантажився. Введені дані збережено, редагування доступне." })[lang];
}
let legacyFailure: EditorModuleUnavailable | null = null;
export function legacyModuleUnavailable(): boolean { return legacyFailure !== null; }
export async function loadLegacyApi(): Promise<AdminApi> {
  if (legacyFailure) throw legacyFailure;
  let module: typeof import("../../api/client");
  try { module = await import("../../api/client"); }
  catch (error) { throw legacyFailure = new EditorModuleUnavailable("legacy", error); }
  return module.getApi();
}

let imageFailure: EditorModuleUnavailable | null = null;
export function imageModuleUnavailable(): boolean { return imageFailure !== null; }
export async function loadEditorImage(): Promise<typeof import("./editor-image")> {
  if (imageFailure) throw imageFailure;
  try { return await import("./editor-image"); }
  catch (error) { throw imageFailure = new EditorModuleUnavailable("image", error); }
}
