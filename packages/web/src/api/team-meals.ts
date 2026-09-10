/** Dual-format API for the new flow. Numeric legacy screens retain AdminApi's strict v2 boundary. */
import type { AnyDish, AnyMenuPlan, Ingredient, ShoppingList } from '@canteenos/core';
import { ApiError } from './types';
import type { ApiMode, Catalog, Source, WriteCondition, WriteResult } from './types';
import { HttpTransport, conditionHeaders } from './transport';
import type { HttpApiOptions } from './transport';
export type { AnyDish, AnyMenuPlan, ShoppingList } from '@canteenos/core';
export type TeamCatalog = Omit<Catalog, 'dishes'> & { dishes: Record<string, AnyDish> };
export interface ReadOptions { revision?: string; force?: boolean }
export interface AssetQuery { revision: string; owner: string; pointer: string; force?: boolean }
export interface RevisionAsset { bytes: Blob; sourceRevision: string }
export interface TeamApiOptions extends HttpApiOptions { mode?: 'real' | 'mock' }
export interface TeamMealsApi {
  readonly mode: ApiMode;
  getPlan(id: string, opts?: ReadOptions): Promise<Source<AnyMenuPlan> | null>;
  getDish(id: string, opts?: ReadOptions): Promise<Source<AnyDish> | null>;
  getIngredient(id: string, opts?: ReadOptions): Promise<Source<Ingredient> | null>;
  getShoppingList(id: string, opts?: ReadOptions): Promise<Source<ShoppingList> | null>;
  getCatalog(opts?: ReadOptions): Promise<TeamCatalog>;
  getAsset(query: AssetQuery): Promise<RevisionAsset>;
  savePlan(id: string, plan: AnyMenuPlan, condition: WriteCondition): Promise<WriteResult>;
  saveDish(id: string, dish: AnyDish, condition: WriteCondition): Promise<WriteResult>;
  saveDishDraft(id: string, dish: AnyDish, condition: WriteCondition): Promise<WriteResult>;
  saveShoppingList(id: string, list: ShoppingList, condition: WriteCondition): Promise<WriteResult>;
  dispose(): void;
}
export function requireRevision(revision: string): void {
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new ApiError(400, 'invalid_revision', '');
}
function checkRevision(commit: unknown, revision?: string): void {
  if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) throw new ApiError(502, 'bad_response', '');
  if (revision !== undefined && commit !== revision) throw new ApiError(502, 'revision_mismatch', '');
}

class TeamHttpApi implements TeamMealsApi {
  readonly mode: ApiMode;
  private readonly transport: HttpTransport;
  private readonly cache = new Map<string, Promise<unknown>>();
  private writeGeneration = 0;
  private readonly unsubscribe: () => void;
  constructor(base: string, opts: TeamApiOptions) {
    this.mode = base.trim() ? opts.mode ?? 'real' : 'unconfigured';
    this.transport = new HttpTransport(base.trim(), opts);
    this.unsubscribe = this.transport.onSessionChange(() => this.cache.clear());
  }
  dispose(): void { this.cache.clear(); this.unsubscribe(); this.transport.dispose(); }
  private query(opts: ReadOptions): string {
    if (opts.revision === undefined) return '';
    requireRevision(opts.revision); return `?revision=${opts.revision}`;
  }
  private async cached<T>(key: string, force: boolean | undefined, load: () => Promise<T>): Promise<T> {
    const session = this.transport.sessionKey();
    // Credential values never appear in keys; the monotonic session generation partitions them.
    const fullKey = JSON.stringify([session, key]);
    let promise = !force ? this.cache.get(fullKey) as Promise<T> | undefined : undefined;
    if (!promise) {
      const generation = this.writeGeneration;
      promise = load();
      this.cache.set(fullKey, promise);
      const pending = promise;
      promise.then(() => {
        if ((generation !== this.writeGeneration || session !== this.transport.sessionKey()) && this.cache.get(fullKey) === pending) this.cache.delete(fullKey);
      }, () => { if (this.cache.get(fullKey) === pending) this.cache.delete(fullKey); });
    }
    const result = await promise;
    if (session !== this.transport.sessionKey()) throw new ApiError(0, 'session_changed', '');
    return structuredClone(result);
  }
  private async source<T>(kind: string, id: string, opts: ReadOptions = {}): Promise<Source<T> | null> {
    const path = `/source/${kind}/${encodeURIComponent(id)}${this.query(opts)}`;
    return this.cached(path, opts.force, async () => {
      try {
        const body = await this.transport.request<Source<T>>({method:'GET',path});
        checkRevision(body.commit, opts.revision);
        if (typeof body.blobSha !== 'string' || !body.blobSha || !body.content || typeof body.content !== 'object') throw new ApiError(502, 'bad_response', '');
        return {content:body.content,blobSha:body.blobSha,commit:body.commit};
      } catch (err) {
        if (err instanceof ApiError && err.status === 404 && err.code === 'not_found') return null;
        throw err;
      }
    });
  }
  getPlan(id: string, opts?: ReadOptions): Promise<Source<AnyMenuPlan> | null> { return this.source('plan',id,opts); }
  getDish(id: string, opts?: ReadOptions): Promise<Source<AnyDish> | null> { return this.source('dish',id,opts); }
  getIngredient(id: string, opts?: ReadOptions): Promise<Source<Ingredient> | null> { return this.source('ingredient',id,opts); }
  getShoppingList(id: string, opts?: ReadOptions): Promise<Source<ShoppingList> | null> { return this.source('shopping-list',id,opts); }
  async getCatalog(opts: ReadOptions = {}): Promise<TeamCatalog> {
    const path = `/catalog${this.query(opts)}`;
    return this.cached(path, opts.force, async () => {
      const body = await this.transport.request<TeamCatalog & {ok?: unknown}>({method:'GET',path});
      checkRevision(body.commit, opts.revision);
      const {ok: _ok, ...catalog} = body; return catalog;
    });
  }
  async getAsset(query: AssetQuery): Promise<RevisionAsset> {
    requireRevision(query.revision);
    const params = new URLSearchParams({revision:query.revision,owner:query.owner,pointer:query.pointer});
    const path = `/asset?${params}`;
    return this.cached(path, query.force, () => this.transport.asset(path,query.revision));
  }
  private async write(path: string, content: unknown, condition: WriteCondition): Promise<WriteResult> {
    const result = await this.transport.request<WriteResult>({method:'POST',path,json:content,headers:conditionHeaders(condition)});
    checkRevision(result.commit);
    if (typeof result.blobSha !== 'string' || !result.blobSha || typeof result.unchanged !== 'boolean') throw new ApiError(502,'bad_response','');
    this.writeGeneration++;
    this.cache.clear();
    return {commit:result.commit,blobSha:result.blobSha,unchanged:result.unchanged,warnings:result.warnings ?? []};
  }
  savePlan(id: string, plan: AnyMenuPlan, condition: WriteCondition): Promise<WriteResult> { return this.write(`/plan/${encodeURIComponent(id)}`,plan,condition); }
  saveDish(id: string, dish: AnyDish, condition: WriteCondition): Promise<WriteResult> { return this.write(`/dish/${encodeURIComponent(id)}`,dish,condition); }
  saveDishDraft(id: string, dish: AnyDish, condition: WriteCondition): Promise<WriteResult> { return this.write(`/dish/${encodeURIComponent(id)}/draft`,dish,condition); }
  saveShoppingList(id: string, list: ShoppingList, condition: WriteCondition): Promise<WriteResult> { return this.write(`/shopping-list/${encodeURIComponent(id)}`,list,condition); }
}
/** Mock mode must be explicitly chosen and supply a mock network; unset Worker never creates a writable list. */
export function createTeamMealsApi(base: string, opts: TeamApiOptions = {}): TeamMealsApi {
  if (opts.mode === 'mock' && !opts.fetch) throw new ApiError(0,'mock_transport_required','');
  return new TeamHttpApi(base,opts);
}
let instance: TeamMealsApi | undefined;
export function getTeamMealsApi(): TeamMealsApi {
  const raw: unknown = import.meta.env.VITE_WORKER_URL;
  return instance ??= createTeamMealsApi(typeof raw === 'string' ? raw : '');
}
