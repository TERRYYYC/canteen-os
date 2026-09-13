/** Standalone Ingredient owner; reusable form and raw conversions live in D modules. */
import { loadLegacyApi, EditorModuleUnavailable, legacyModuleUnavailable, imageModuleUnavailable, moduleUnavailableMessage } from "./editor-actions";
import type { AdminApi } from "../../api/client";
import { getTeamMealsApi, type TeamCatalog, type TeamMealsApi } from "../../api/team-meals";
import { onAuthSessionChange } from "../../admin/token";
import { registerAuxiliaryEdits, type AuxiliaryEditHandle, type AuxiliaryOperation } from "../../view-models/reload-safety";
import { text as teamText } from "../team-ui";
import { ApiError, FIELD_ERROR_CODES, isApiError, type FieldError, type Ingredient } from "../../api/types";
import { adm, apiMessage, button, errorCard, notice, sessionExpired, topBar } from "../../admin/kit";
import { bindDraftStore, type BoundDraftStore } from "../../admin/store";
import { h } from "../../dom";
import type { Lang } from "../../i18n";
import type { PageCtx } from "../../types";
import { adminHref } from "../admin";
import { buildIngredientForm, submitIngredientForm, tt, type IngredientFormHandle, type IngredientFormOpts } from "./ingredient-form";
import { createIngredientDraft, draftFromIngredient, draftToIngredient, type IngredientDraft } from "./ingredient-draft";
export * from "./ingredient-draft";
export { buildIngredientForm, submitIngredientForm, compressImage, IMAGE_MAX_EDGE, IMAGE_MAX_BYTES, type CompressedImage, type IngredientFormHandle, type IngredientFormOpts } from "./ingredient-form";

// ---------------------------------------------------------------------------
// Standalone screen: raw buffers and auxiliary writes belong to a document,
// independently of the current language or mounted view.
// ---------------------------------------------------------------------------

type IngredientPhase = "idle" | "saving" | "saved" | "unknown" | "conflict" | "error";
type IngredientAttempt = { operation?: AuxiliaryOperation; snapshot: IngredientDraft; body: Ingredient; id: string; raw: string; stage: "upload" | "save" };
type IngredientOwner = {
  reload: AuxiliaryEditHandle; operations: Set<AuxiliaryOperation>; authGeneration: number;
  key: string; api: TeamMealsApi; session: number;
  /** Only a real route departure permits a clean completed new record to retire. */
  leftRoute: boolean;
  draft: IngredientDraft | null; returnTo: string | null; generation: number;
  phase: IngredientPhase; tasks: Set<"photo" | "translation">; checking: boolean;
  attempt: IngredientAttempt | null; error: unknown; errors: readonly FieldError[];
  catalog: TeamCatalog | null; catalogError: unknown; catalogLoading: Promise<void> | null;
  sourceLoading: Promise<void> | null; sourceError: unknown; notFound: boolean;
  remote: Awaited<ReturnType<TeamMealsApi["getIngredient"]>>;
  notify(contentChanged?: boolean): void;
  readAuxiliary(): { generation: number; dirty: boolean; phase: "idle" | "busy" | "unknown" };
};
const ingredientOwners = new Map<string, IngredientOwner>();
const ingredientApiIds = new WeakMap<TeamMealsApi, number>();
let ingredientApiSequence = 0;
let viewGeneration = 0;
let ingredientAuthGeneration = 0;
let mountedIngredient: { owner: IngredientOwner; el: HTMLElement; lang: Lang; paint(): void; sync(): void; dispose(): void } | null = null;

const SCREEN_TEXT = {
  session: { zh: "登录会话已变化，请重新打开食材页", en: "Session changed. Open the ingredient again", uk: "Сеанс змінився. Відкрийте інгредієнт знову" },
  busy: { zh: "正在处理，可继续编辑", en: "Working; you can keep editing", uk: "Обробляється; можна редагувати далі" },
  catalog: { zh: "供应商与查重资料未读到，请重新读取后保存", en: "Supplier and duplicate checks are unavailable. Read again before saving", uk: "Постачальники та перевірка дублікатів недоступні. Прочитайте знову перед збереженням" },
  uploadUnknown: { zh: "照片上传结果未知。现有读取接口无法核实，照片与草稿已保留，请先联系维护者核实", en: "Photo upload outcome unknown. The available reader cannot verify it; the photo and draft are retained. Ask the maintainer to verify first", uk: "Результат завантаження фото невідомий. Наявний інтерфейс читання не може його перевірити; фото й чернетку збережено. Спершу зверніться до адміністратора" },
  unmatched: { zh: "远端尚不能确认这次保存，仍保留结果未知状态", en: "The remote content does not confirm this save; its outcome remains unknown", uk: "Віддалені дані не підтверджують це збереження; результат досі невідомий" },
} as const satisfies Record<string, Record<Lang, string>>;
function screenText(lang: Lang, key: keyof typeof SCREEN_TEXT): string { return SCREEN_TEXT[key][lang]; }
function ownerValid(owner: IngredientOwner): boolean { return owner.authGeneration === ingredientAuthGeneration && owner.api.sessionKey() === owner.session; }
function ownerBusy(owner: IngredientOwner): boolean { return owner.phase === "saving" || owner.checking || owner.tasks.size > 0; }
function rawIngredient(d: IngredientDraft): string {
  return JSON.stringify({ ...d, dirty: false, blobSha: null, pending: d.pending ? { ...d.pending, blob: undefined } : null });
}
function sameIngredient(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])) : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
function notifyOwner(owner: IngredientOwner, contentChanged = false): void {
  if (!ownerValid(owner)) return;
  if (mountedIngredient?.owner === owner && mountedIngredient.el.isConnected) {
    if (contentChanged) mountedIngredient.paint();
    else mountedIngredient.sync();
  }
}
function touchOwner(owner: IngredientOwner, contentChanged = false): void { owner.generation++; owner.notify(contentChanged); }
function beginIngredientOperation(owner: IngredientOwner, kind: "read" | "write"): AuxiliaryOperation {
  const operation = owner.reload.beginOperation(kind);
  owner.operations.add(operation); owner.generation++;
  return operation;
}
function finishIngredientOperation(owner: IngredientOwner, operation: AuxiliaryOperation, outcome: "completed" | "failed"): void {
  // Settle the captured owner even after auth changes; never consult or rebind B.
  owner.operations.delete(operation); owner.generation++;
  owner.reload.settleOperation(operation, outcome);
}
function isMyHash(hash: string, key: string): boolean {
  const match = /^#\/?admin\/ingredient\/([^/?#]+)\/?$/.exec(hash);
  try { return !!match?.[1] && decodeURIComponent(match[1]) === key; } catch { return false; }
}
let watchingIngredientBuffers = false;
function watchIngredientBuffers(): void {
  if (watchingIngredientBuffers) return;
  watchingIngredientBuffers = true;
window.addEventListener("hashchange", () => {
  if (mountedIngredient && !isMyHash(location.hash, mountedIngredient.owner.key)) {
    mountedIngredient.owner.leftRoute = true;
    mountedIngredient.dispose(); mountedIngredient = null; viewGeneration++;
  }
});
}
onAuthSessionChange(() => {
  viewGeneration++; ingredientAuthGeneration++;
  for (const owner of ingredientOwners.values()) owner.reload.dispose();
  const current = mountedIngredient;
  mountedIngredient = null;
  current?.dispose();
  if (current?.el.isConnected) current.el.replaceChildren(notice({ kind: "warn", text: screenText(current.lang, "session") }));
  // Old-session records remain quarantined in memory. Their late tasks cannot write
  // through the new session, render into it, or dispose an unresolved operation.
});

function createOwner(key: string, api: TeamMealsApi, drafts: BoundDraftStore): IngredientOwner {
  const hand = drafts.takeHandoff();
  const record: Omit<IngredientOwner, "reload"> = {
    operations: new Set(), authGeneration: ingredientAuthGeneration,
    key, api, session: api.sessionKey(), leftRoute: false,
    draft: key === "new" ? createIngredientDraft(hand.newIngredientName ? { zh: hand.newIngredientName } : {}) : null,
    returnTo: hand.returnTo ?? null, generation: 0, phase: "idle", tasks: new Set(), checking: false,
    attempt: null, error: null, errors: [], catalog: null, catalogError: null, catalogLoading: null,
    sourceLoading: null, sourceError: null, notFound: false, remote: null,
    notify: changed => notifyOwner(owner, changed),
    readAuxiliary: () => ({ generation: owner.generation, dirty: Boolean(owner.draft?.dirty), phase: owner.operations.size ? owner.phase === "unknown" ? "unknown" : "busy" : "idle" }),
  };
  const owner: IngredientOwner = Object.assign(record, { reload: registerAuxiliaryEdits({
    ownerId: `ingredient-input/${key}`, identity: { kind: "ingredient", id: key },
    boundary: api, operationTracking: "tickets", read: () => record.readAuxiliary(),
  }) });
  if (owner.draft?.zh) owner.draft.dirty = true;
  return owner;
}
async function loadIngredient(owner: IngredientOwner): Promise<void> {
  if (!ownerValid(owner)) return;
  if (owner.sourceLoading) return owner.sourceLoading;
  const operation = beginIngredientOperation(owner, "read");
  let outcome: "completed" | "failed" = "completed";
  owner.sourceLoading = (async () => {
    try {
      const source = await owner.api.getIngredient(owner.key);
      if (!ownerValid(owner)) return;
      owner.sourceError = null; owner.notFound = source === null;
      if (source) owner.draft = draftFromIngredient(source.content, owner.key, source.blobSha);
    } catch (error) { outcome = "failed"; if (ownerValid(owner)) owner.sourceError = error; }
    finally { owner.sourceLoading = null; finishIngredientOperation(owner, operation, outcome); touchOwner(owner); }
  })();
  return owner.sourceLoading;
}
async function loadIngredientCatalog(owner: IngredientOwner): Promise<void> {
  if (!ownerValid(owner)) return;
  if (owner.catalogLoading) return owner.catalogLoading;
  const operation = beginIngredientOperation(owner, "read");
  let outcome: "completed" | "failed" = "completed";
  owner.catalogLoading = (async () => {
    try {
      const catalog = await owner.api.getCatalog({ force: !!owner.catalogError });
      if (ownerValid(owner)) { owner.catalog = catalog; owner.catalogError = null; }
    } catch (error) { outcome = "failed"; if (ownerValid(owner)) owner.catalogError = error; }
    finally { owner.catalogLoading = null; finishIngredientOperation(owner, operation, outcome); touchOwner(owner); }
  })();
  return owner.catalogLoading;
}

/** Enter advances fields; only the save button submits. */
function enterToNext(ev: KeyboardEvent): void {
  if (ev.key !== "Enter" || ev.isComposing) return;
  const target = ev.target;
  if (!(target instanceof HTMLInputElement) || ["checkbox", "radio", "file"].includes(target.type)) return;
  const form = target.form;
  if (!form) return;
  ev.preventDefault();
  const fields = [...form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")].filter(x => !x.disabled && x.offsetParent !== null && !(x instanceof HTMLInputElement && ["checkbox", "radio", "file"].includes(x.type)));
  const next = fields[fields.indexOf(target) + 1];
  if (next) next.focus(); else target.blur();
}

export async function render(el: HTMLElement, ctx: PageCtx, rest: string, api: TeamMealsApi = getTeamMealsApi()): Promise<void> {
  const drafts = bindDraftStore(api);
  watchIngredientBuffers();
  const generation = ++viewGeneration;
  if (mountedIngredient && (mountedIngredient.owner.key !== rest || mountedIngredient.owner.api !== api)) mountedIngredient.owner.leftRoute = true;
  mountedIngredient?.dispose(); mountedIngredient = null;
  const session = api.sessionKey();
  const alive = (): boolean => generation === viewGeneration && el.isConnected && api.sessionKey() === session;
  el.replaceChildren();
  if (api.mode === "unconfigured") {
    ctx.setReloadCoverage?.("read-only");
    el.append(h("div", { class: "adm adm-ing" }, topBar({ back: adminHref(), title: tt(ctx.lang, rest === "new" ? "ing.title.new" : "ing.title.edit") }), notice({ kind: "warn", text: teamText(ctx.lang, "unconfigured") })));
    return;
  }
  if (!ingredientApiIds.has(api)) ingredientApiIds.set(api, ++ingredientApiSequence);
  const ownerKey = `${ingredientApiIds.get(api)}:${session}:${ingredientAuthGeneration}:${rest}`;
  let owner = ingredientOwners.get(ownerKey);
  if (owner?.key === "new" && owner.leftRoute && owner.phase === "saved" && owner.draft?.blobSha && !owner.draft.dirty && !ownerBusy(owner) && !owner.attempt && owner.reload.dispose()) {
    // The previous creation was acknowledged and has no later raw work. Starting
    // another creation may consume a new handoff, while language paints stay put.
    owner.generation++;
    ingredientOwners.delete(ownerKey);
    owner = undefined;
  }
  if (!owner) { owner = createOwner(rest, api, drafts); ingredientOwners.set(ownerKey, owner); }
  owner.leftRoute = false;
  ctx.setReloadCoverage?.("tracked");
  try {
    if (!owner.draft) {
      el.append(h("p", { class: "muted" }, adm("adm.loading", undefined, ctx.lang)));
      await loadIngredient(owner);
      if (!alive()) return;
      if (!owner.draft) {
        el.replaceChildren(topBar({ back: adminHref(), title: tt(ctx.lang, "ing.title.edit") }));
        if (isApiError(owner.sourceError) && owner.sourceError.status === 401) { sessionExpired(el, ctx.lang); return; }
        el.append(owner.notFound ? notice({ kind: "warn", text: tt(ctx.lang, "ing.notFound") }) : errorCard(apiMessage(owner.sourceError, ctx.lang), () => void render(el, ctx, rest, api)));
        return;
      }
    }
    if (alive()) paintScreen(el, ctx, owner, generation);
  } finally { ctx.setReloadCoverage?.("tracked"); }
}

function paintScreen(el: HTMLElement, ctx: PageCtx, owner: IngredientOwner, generation: number): void {
  if (!owner.draft || !ownerValid(owner) || generation !== viewGeneration || !el.isConnected) return;
  mountedIngredient?.dispose(); mountedIngredient = null;
  const d = owner.draft, lang = ctx.lang;
  const alive = (): boolean => generation === viewGeneration && ownerValid(owner) && el.isConnected && mountedIngredient?.owner === owner;
  const editing = d.blobSha !== null;
  const notices = h("div", { class: "adm-ing-notices" });
  let form: IngredientFormHandle;
  const onTaskStart: NonNullable<IngredientFormOpts["onTaskStart"]> = kind => {
    if (!ownerValid(owner) || owner.api.mode !== "real" || owner.tasks.has(kind) || owner.phase === "unknown" || owner.phase === "saving") return null;
    const operation = beginIngredientOperation(owner, "read");
    owner.tasks.add(kind); d.dirty = true; touchOwner(owner);
    const names = JSON.stringify([d.zh, d.en, d.uk, d.enTouched, d.ukTouched]);
    return {
      valid: () => ownerValid(owner) && owner.tasks.has(kind) && (kind !== "translation" || names === JSON.stringify([d.zh, d.en, d.uk, d.enTouched, d.ukTouched])),
      finish: () => { owner.tasks.delete(kind); finishIngredientOperation(owner, operation, "completed"); touchOwner(owner); },
    };
  };
  form = buildIngredientForm({ lang, api: loadLegacyApi, draft: d, editing, catalog: owner.catalog,
    onChange: () => { if (!ownerValid(owner)) return; if (owner.phase === "saved") owner.phase = "idle"; touchOwner(owner, !form?.el.isConnected); },
    onTaskStart, onGoEdit: id => { location.hash = adminHref("ingredient", id); },
  });
  const saveBtn = button({ label: owner.returnTo ? tt(lang, "ing.save.return") : adm("adm.save", undefined, lang), kind: "primary", type: "submit", class: "adm-ing-save" });
  const formEl = h("form", { class: "adm-ing-form", novalidate: true }, form.el, h("div", { class: "adm-ing-bottom" }, saveBtn));
  formEl.addEventListener("submit", ev => { ev.preventDefault(); if (alive()) void saveIngredient(owner, form); });
  formEl.addEventListener("keydown", enterToNext);
  el.replaceChildren(h("div", { class: "adm adm-ing" }, topBar({ back: () => { location.hash = owner.returnTo ?? adminHref(); }, title: tt(lang, editing || owner.key !== "new" ? "ing.title.edit" : "ing.title.new") }), notices, formEl));
  let lastCatalog = owner.catalog;
  let lastErrors: readonly FieldError[] | null = null;
  function sync(): void {
    if (!alive()) return;
    const busyNow = ownerBusy(owner);
    saveBtn.disabled = legacyModuleUnavailable() || owner.api.mode !== "real" || !navigator.onLine || busyNow || owner.phase === "unknown" || owner.phase === "conflict";
    // File/translation operations are themselves owned; raw text remains editable during writes.
    for (const control of form.el.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("input, button, select")) {
      if (owner.api.mode === "mock") control.disabled = true;
      else if (control.matches('input[type="file"], .adm-ing-translate')) control.disabled = busyNow || owner.phase === "unknown" || (control.matches(".adm-ing-translate") ? legacyModuleUnavailable() : imageModuleUnavailable());
      else if (control.id === "adm-ing-id") control.disabled = busyNow || owner.phase === "unknown" || owner.phase === "conflict";
    }
    if (lastCatalog !== owner.catalog && owner.catalog) { lastCatalog = owner.catalog; form.setCatalog(owner.catalog); }
    notices.replaceChildren();
    if (owner.api.mode === "mock") notices.append(notice({ kind: "info", text: teamText(lang, "mock") }));
    const status = h("div", { class: "adm-ing-owner-state", role: "status", "data-phase": owner.phase }, busyNow ? screenText(lang, "busy") : owner.phase === "unknown" ? teamText(lang, "unknown") : owner.phase === "conflict" ? teamText(lang, "conflict") : owner.phase === "error" ? teamText(lang, "error") : d.dirty ? teamText(lang, "dirty") : owner.phase === "saved" ? teamText(lang, "saved") : teamText(lang, "clean"));
    notices.append(status);
    if (legacyModuleUnavailable() || imageModuleUnavailable()) notices.append(notice({ kind: "warn", text: moduleUnavailableMessage(lang) }));
    if (!navigator.onLine) notices.append(notice({ kind: "info", text: adm("adm.offline", undefined, lang) }));
    if (owner.catalogError) notices.append(errorCard(screenText(lang, "catalog"), () => void loadIngredientCatalog(owner)));
    if (owner.phase === "unknown") {
      if (owner.attempt?.stage === "upload") status.append(h("p", {}, screenText(lang, "uploadUnknown")));
      else {
        const verify = button({ label: teamText(lang, "recover"), onClick: () => void verifyIngredient(owner) });
        verify.disabled = busyNow || !navigator.onLine; status.append(verify);
        if (owner.remote) status.append(h("p", {}, screenText(lang, "unmatched")));
      }
    }
    if (owner.phase === "conflict") {
      const compare = button({ label: teamText(lang, "compare"), onClick: () => void verifyIngredient(owner) });
      compare.disabled = busyNow || !navigator.onLine; status.append(compare);
      if (owner.remote && !busyNow) {
        status.append(h("details", {}, h("summary", {}, teamText(lang, "remote")), h("pre", {}, JSON.stringify(owner.remote.content, null, 2))));
        status.append(button({ label: teamText(lang, "keep"), onClick: () => {
          if (!alive() || ownerBusy(owner) || owner.phase !== "conflict" || !owner.remote) return;
          d.blobSha = owner.remote.blobSha; d.id = owner.attempt?.id ?? d.id; d.idTouched = true; owner.phase = "idle"; owner.attempt = null; d.dirty = true; owner.error = null; touchOwner(owner, true);
        } }));
      }
    }
    if (owner.error && owner.phase === "error") notices.append(notice({ kind: "warn", text: owner.error instanceof EditorModuleUnavailable ? moduleUnavailableMessage(lang) : apiMessage(owner.error, lang) }));
    if (lastErrors !== owner.errors) {
      lastErrors = owner.errors;
      if (owner.errors.length) form.showErrors(owner.errors); else form.clearErrors();
    }
  }
  const dispose = (): void => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  mountedIngredient = { owner, el, lang, paint: () => paintScreen(el, ctx, owner, generation), sync, dispose };
  window.addEventListener("online", sync); window.addEventListener("offline", sync);
  sync();
  if (!owner.catalog && !owner.catalogError) void loadIngredientCatalog(owner);
}

function acknowledgeIngredient(owner: IngredientOwner, blobSha: string): void {
  const attempt = owner.attempt, d = owner.draft;
  if (!attempt || !d) return;
  d.blobSha = blobSha;
  // A new ingredient's request target is fixed once acknowledged. Later input belongs
  // to this same record and can be explicitly saved with its returned If-Match.
  d.id = attempt.id; d.idTouched = true;
  attempt.snapshot.id = attempt.id; attempt.snapshot.idTouched = true;
  attempt.raw = rawIngredient(attempt.snapshot);
  d.dirty = rawIngredient(d) !== attempt.raw;
  owner.phase = "saved"; owner.attempt = null; owner.error = null; owner.errors = [];
}
async function saveIngredient(owner: IngredientOwner, form: IngredientFormHandle): Promise<void> {
  if (!ownerValid(owner) || owner.api.mode !== "real" || !navigator.onLine || ownerBusy(owner) || owner.phase === "unknown" || owner.phase === "conflict" || !owner.draft) return;
  owner.errors = form.localErrors(); owner.error = null;
  if (owner.errors.length) { touchOwner(owner); return; }
  const d = owner.draft;
  const snapshot: IngredientDraft = { ...d, image: d.image ? { ...d.image } : null, pending: d.pending ? { ...d.pending } : null };
  const pending = d.pending;
  const attempt: IngredientAttempt = { snapshot, id: form.id(), body: draftToIngredient(snapshot), raw: rawIngredient(snapshot), stage: pending ? "upload" : "save" };
  owner.attempt = attempt; owner.phase = "saving"; touchOwner(owner);
  if (!d.blobSha && !owner.catalog) await loadIngredientCatalog(owner);
  if (!ownerValid(owner)) return;
  if (!d.blobSha && (!owner.catalog || owner.catalog.ingredients[attempt.id])) {
    owner.phase = "error"; owner.attempt = null;
    if (owner.catalog?.ingredients[attempt.id]) owner.errors = [{ path: "/id", code: "conflict", message: tt(mountedIngredient?.lang ?? "en", "ing.slug.taken") }];
    touchOwner(owner); return;
  }
  const requireOwner = (): void => { if (!ownerValid(owner)) throw new ApiError(0, "session_changed", ""); };
  // Module loading is a read. No write ticket exists until the actual transport call.
  const loading = beginIngredientOperation(owner, "read");
  let legacy: AdminApi;
  let loaded: "completed" | "failed" = "completed";
  try { legacy = await loadLegacyApi(); }
  catch (error) {
    loaded = "failed";
    if (ownerValid(owner)) { owner.error = error; owner.phase = "error"; owner.attempt = null; }
    return;
  } finally { finishIngredientOperation(owner, loading, loaded); touchOwner(owner); }
  if (!ownerValid(owner)) return;
  // A language repaint or return to this owner may resume. Departure before
  // dispatch is a known unsent attempt, so retain raw and release its saving phase.
  if (mountedIngredient?.owner !== owner || !mountedIngredient.el.isConnected || !isMyHash(location.hash, owner.key)) {
    owner.attempt = null; owner.phase = "idle"; touchOwner(owner); return;
  }
  const submitApi = Object.create(legacy) as AdminApi;
  submitApi.uploadImage = async (...args) => {
    requireOwner();
    const operation = beginIngredientOperation(owner, "write"); attempt.operation = operation;
    try {
      const image = await legacy.uploadImage(...args);
      if (!image || typeof image.src !== "string" || !image.src || typeof image.license !== "string" || !image.license) throw new ApiError(502, "bad_response", "");
      finishIngredientOperation(owner, operation, "completed"); attempt.operation = undefined;
      return image;
    } catch (error) {
      if (ingredientWriteRejected(error)) { finishIngredientOperation(owner, operation, "failed"); attempt.operation = undefined; }
      else owner.reload.markUnknown(operation);
      throw error;
    }
  };
  submitApi.saveIngredient = async (...args) => {
    requireOwner(); attempt.stage = "save"; touchOwner(owner);
    const operation = beginIngredientOperation(owner, "write"); attempt.operation = operation;
    try {
      const result = await legacy.saveIngredient(...args);
      if (!result || typeof result.commit !== "string" || !/^[0-9a-f]{40}$/.test(result.commit) || typeof result.blobSha !== "string" || !result.blobSha || typeof result.unchanged !== "boolean" || !Array.isArray(result.warnings) || result.warnings.some(w => typeof w !== "string")) throw new ApiError(502, "bad_response", "");
      finishIngredientOperation(owner, operation, "completed"); attempt.operation = undefined;
      return result;
    } catch (error) {
      // session_changed may hide an actual Worker ACK in HttpAdminApi. It cannot
      // prove rejection, so its original write ticket must remain unknown.
      if (ingredientWriteRejected(error)) { finishIngredientOperation(owner, operation, "failed"); attempt.operation = undefined; }
      else owner.reload.markUnknown(operation);
      throw error;
    }
  };
  const submittedForm: IngredientFormHandle = {
    ...form, id: () => attempt.id, toIngredient: () => { attempt.body = draftToIngredient(snapshot); return attempt.body; },
    pendingImage: () => snapshot.pending ? { blob: snapshot.pending.blob, meta: { license: snapshot.pending.license.trim(), ...(snapshot.pending.author.trim() ? { author: snapshot.pending.author.trim() } : {}), ...(snapshot.pending.sourceUrl.trim() ? { sourceUrl: snapshot.pending.sourceUrl.trim() } : {}) } } : null,
    setImage: image => {
      if (!ownerValid(owner)) return;
      const matches = d.pending === pending && sameIngredient(d.pending && { license: d.pending.license, author: d.pending.author, sourceUrl: d.pending.sourceUrl }, snapshot.pending && { license: snapshot.pending.license, author: snapshot.pending.author, sourceUrl: snapshot.pending.sourceUrl });
      snapshot.pending = null; snapshot.image = image; attempt.raw = rawIngredient(snapshot);
      if (matches) { if (d.pending) URL.revokeObjectURL(d.pending.previewUrl); d.pending = null; d.image = image; }
      touchOwner(owner, true);
    },
  };
  const outcome = await submitIngredientForm(submitApi, submittedForm, snapshot.blobSha ? { ifMatch: snapshot.blobSha } : {});
  if (!ownerValid(owner)) { owner.phase = "unknown"; owner.generation++; return; }
  if (outcome.ok) {
    acknowledgeIngredient(owner, outcome.result.blobSha); touchOwner(owner, true);
    if (!d.dirty && owner.returnTo && mountedIngredient?.owner === owner && mountedIngredient.el.isConnected) location.hash = owner.returnTo;
  } else {
    owner.error = outcome.error; attempt.stage = outcome.stage;
    const unknown = !ingredientWriteRejected(outcome.error);
    // Upload ref contention is a known rejected upload, so the retained photo may
    // be explicitly retried. Only a document-save conflict has a Source to compare.
    owner.phase = unknown ? "unknown" : outcome.stage === "save" && isApiError(outcome.error) && outcome.error.status === 409 ? "conflict" : "error";
    if (isApiError(outcome.error) && outcome.error.hasFieldErrors) owner.errors = outcome.error.errors;
    touchOwner(owner, true);
    if (isApiError(outcome.error) && outcome.error.status === 401 && mountedIngredient?.owner === owner) sessionExpired(mountedIngredient.el, mountedIngredient.lang);
  }
}
/** Only recognized Worker rejections prove that a file update was not accepted. */
function ingredientWriteRejected(error: unknown): boolean {
  if (!isApiError(error)) return false;
  if (error.status === 400 && (FIELD_ERROR_CODES.has(error.code) || ["bad_id", "bad_path", "bad_json", "bad_image"].includes(error.code))) return true;
  return ({ unauthorized: 401, forbidden: 403, not_found: 404, conflict: 409, too_large: 413, rate_limited: 429, not_configured: 503, worker_unconfigured: 0 } as Record<string, number>)[error.code] === error.status;
}
async function verifyIngredient(owner: IngredientOwner): Promise<void> {
  if (!ownerValid(owner) || ownerBusy(owner) || !navigator.onLine || !owner.attempt || owner.attempt.stage === "upload" || !["unknown", "conflict"].includes(owner.phase)) return;
  const operation = beginIngredientOperation(owner, "read");
  let outcome: "completed" | "failed" = "completed";
  owner.checking = true; touchOwner(owner);
  try {
    const source = await owner.api.getIngredient(owner.attempt.id, { force: true });
    if (!ownerValid(owner)) return;
    owner.remote = source;
    if (source && owner.phase === "unknown" && sameIngredient(source.content, owner.attempt.body)) {
      if (owner.attempt.operation) finishIngredientOperation(owner, owner.attempt.operation, "completed");
      acknowledgeIngredient(owner, source.blobSha);
    }
  } catch (error) { outcome = "failed"; if (ownerValid(owner)) owner.error = error; }
  finally { owner.checking = false; finishIngredientOperation(owner, operation, outcome); touchOwner(owner, true); }
}
