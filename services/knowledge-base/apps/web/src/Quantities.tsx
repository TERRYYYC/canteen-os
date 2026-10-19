import type { Ingredient, LeadTime, PrepAheadAction, Quantity, Recipe, RecipeUnknown, Unit, UnknownKind, ValueSource } from './types';
import { label } from './types';

// recipeFormatVersion 3 (ADR-0012): original and canteen quantities kept apart, plus the located "not clear" entries.
export const isFormatThree = (recipe: Recipe) => recipe.recipeFormatVersion === '3';

const UNITS: Unit[] = ['g', 'kg', 'ml', 'l', 'pcs', 'pack', 'tbsp', 'tsp', 'pinch', 'to-taste'];
const UNIT_LABEL: Record<Unit, string> = { g: '克', kg: '千克', ml: '毫升', l: '升', pcs: '个', pack: '包', tbsp: '汤匙', tsp: '茶匙', pinch: '一撮', 'to-taste': '适量' };
const SOURCE_LABEL: Record<ValueSource['kind'], string> = { measured: '师傅实称', specified: '师傅指定', rule: '师傅规则' };
const LEAD_UNIT: Record<LeadTime['unit'], string> = { min: '分钟', h: '小时', d: '天' };
export const KIND_LABEL: Record<UnknownKind, string> = { 'prep-ahead': '提前多久', amount: '用量', 'net-or-gross': '毛重还是净重', 'cut-size': '切多大', identity: '用哪种', heat: '火候', duration: '做多久', doneness: '做到什么样', other: '别的' };
const ACTION_LABEL: Record<PrepAheadAction, string> = { marinate: '腌', soak: '泡', brine: '卤', rest: '醒', cool: '晾凉', other: '别的' };
const decimal = /^(?:[1-9][0-9]*(?:\.[0-9]+)?|0\.[0-9]*[1-9][0-9]*)$/;

export const quantityText = (q?: Quantity) => !q ? '' : q.unit === 'to-taste' ? '适量' : `${q.value ?? ''} ${q.unit ? UNIT_LABEL[q.unit] : ''}`.trim();
export const sourceText = (s?: ValueSource) => !s ? '' : s.kind === 'rule' ? `${SOURCE_LABEL.rule} ${s.ruleId}` : `${SOURCE_LABEL[s.kind]} · ${s.by} · ${s.date}`;
export const leadTimeText = (t?: LeadTime) => t ? `提前 ${t.value} ${LEAD_UNIT[t.unit]}` : '';
export const unknownKindText = (u: RecipeUnknown) => u.kind ? `${KIND_LABEL[u.kind]}${u.action ? `（${ACTION_LABEL[u.action]}）` : ''}` : '未分类';

export function newRow(recipe: Recipe): Ingredient {
  return isFormatThree(recipe) ? { id: crypto.randomUUID(), name: {}, role: 'unspecified' } : { id: crypto.randomUUID(), name: {}, role: 'unspecified', amount: { kind: 'unknown' } };
}

function quantityProblem(q: Quantity | undefined) {
  if (!q) return false;
  if (!q.unit) return true;
  return q.unit === 'to-taste' ? q.value !== undefined : !decimal.test(q.value ?? '');
}

/** Problems a person must fix before saving a format 3 row; null when the row can be saved. */
export function rowProblem(row: Ingredient, position: number): string | null {
  if (quantityProblem(row.originalQty) || (row.originalQty && !row.originalAmount?.trim())) return `第 ${position} 项食材的原方数需要原话、正数和单位。`;
  if (Boolean(row.qty) !== Boolean(row.qtySource) || quantityProblem(row.qty)) return `第 ${position} 项食材的食堂用量请填写数量、单位和出处。`;
  const s = row.qtySource;
  if (s?.kind === 'rule' && !/^[a-z][a-z0-9-]*$/.test(s.ruleId)) return `第 ${position} 项食材请填写规则编号（小写字母、数字和短横线）。`;
  if (s && s.kind !== 'rule' && (!s.by.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(s.date))) return `第 ${position} 项食材请写明谁给的用量、哪天给的。`;
  return null;
}

/** Removing a step or a row keeps its "not clear" entries and only drops the position that no longer exists. */
export function withoutPosition(unknowns: RecipeUnknown[] | undefined, key: 'stepId' | 'ingredientRowId', id: string) {
  if (!unknowns) return undefined;
  return unknowns.map(entry => { if (entry[key] !== id) return entry; const next = { ...entry }; delete next[key]; return next; });
}
export const countAt = (recipe: Recipe, key: 'stepId' | 'ingredientRowId', id: string) => recipe.unknowns?.filter(entry => entry[key] === id).length ?? 0;

function setOptional<K extends 'originalAmount' | 'originalQty' | 'qty' | 'qtySource'>(row: Ingredient, key: K, value: Ingredient[K] | undefined): Ingredient {
  const next = { ...row };
  if (value === undefined) delete next[key]; else next[key] = value;
  return next;
}

export function QuantityFields({ row, onChange }: { row: Ingredient; onChange: (row: Ingredient) => void }) {
  function quantity(key: 'originalQty' | 'qty', patch: Partial<Quantity>) {
    const merged: Quantity = { unit: '', ...row[key], ...patch };
    if (merged.unit === 'to-taste') delete merged.value;
    if (patch.value === '') delete merged.value;
    const empty = !merged.unit && merged.value === undefined;
    let next = setOptional(row, key, empty ? undefined : merged);
    if (key === 'qty' && empty) next = setOptional(next, 'qtySource', undefined);
    onChange(next);
  }
  function source(kind: string) {
    const prior = row.qtySource;
    const next: ValueSource | undefined = kind === 'rule' ? { kind, ruleId: prior?.kind === 'rule' ? prior.ruleId : '' }
      : kind === 'measured' || kind === 'specified' ? { kind, by: prior && prior.kind !== 'rule' ? prior.by : '', date: prior && prior.kind !== 'rule' ? prior.date : '' } : undefined;
    onChange(setOptional(row, 'qtySource', next));
  }
  const unitSelect = (title: string, value: Quantity | undefined, key: 'originalQty' | 'qty') => <label className="field"><span>{title}</span><select value={value?.unit ?? ''} onChange={e => quantity(key, { unit: e.target.value as Unit | '' })}><option value="">选择单位</option>{UNITS.map(unit => <option key={unit} value={unit}>{UNIT_LABEL[unit]}</option>)}</select></label>;
  const s = row.qtySource;
  return <div className="quantity-fields">
    <div className="quantity-group"><strong>原方（只作参考，不进计算）</strong><div className="amount-fields three">
      <label className="field"><span>原方用量原话</span><input value={row.originalAmount ?? ''} onChange={e => onChange(setOptional(row, 'originalAmount', e.target.value === '' ? undefined : e.target.value))} placeholder="例如 5斤、一点点" /></label>
      <label className="field"><span>原方数</span><input inputMode="decimal" disabled={row.originalQty?.unit === 'to-taste'} value={row.originalQty?.value ?? ''} onChange={e => quantity('originalQty', { value: e.target.value })} placeholder="可留空" /></label>
      {unitSelect('原方单位', row.originalQty, 'originalQty')}
    </div></div>
    <div className="quantity-group"><strong>食堂用量（每份净料）</strong><div className="amount-fields three">
      <label className="field"><span>食堂数量</span><input inputMode="decimal" disabled={row.qty?.unit === 'to-taste'} value={row.qty?.value ?? ''} onChange={e => quantity('qty', { value: e.target.value })} placeholder="未定可留空" /></label>
      {unitSelect('食堂单位', row.qty, 'qty')}
      <label className="field"><span>出处</span><select value={s?.kind ?? ''} onChange={e => source(e.target.value)}><option value="">未写出处</option><option value="measured">师傅实称</option><option value="specified">师傅指定</option><option value="rule">师傅规则</option></select></label>
      {s?.kind === 'rule' && <label className="field"><span>规则编号</span><input value={s.ruleId} onChange={e => onChange({ ...row, qtySource: { kind: 'rule', ruleId: e.target.value } })} placeholder="例如 salt-per-serving" /></label>}
      {s && s.kind !== 'rule' && <><label className="field"><span>谁给的</span><input value={s.by} onChange={e => onChange({ ...row, qtySource: { ...s, by: e.target.value } })} /></label><label className="field"><span>哪天给的</span><input type="date" value={s.date} onChange={e => onChange({ ...row, qtySource: { ...s, date: e.target.value } })} /></label></>}
    </div></div>
    {row.kitchenPrep?.leadTime && <p className="muted small">{leadTimeText(row.kitchenPrep.leadTime)}（保存时保留）</p>}
  </div>;
}

function where(recipe: Recipe, entry: RecipeUnknown) {
  const parts: string[] = [];
  if (entry.stepId) { const n = recipe.steps?.findIndex(step => step.id === entry.stepId) ?? -1; parts.push(n >= 0 ? `步骤 ${n + 1}` : '步骤（已不在）'); }
  if (entry.ingredientRowId) { const row = recipe.ingredients?.find(item => item.id === entry.ingredientRowId); parts.push(row ? label(row.name) || '未命名食材' : '食材（已不在）'); }
  return parts.join(' · ') || '整道菜';
}

/** K7: a chef deletes one entry once it is answered; saving stores a new version and older versions keep it. */
export function UnknownsPanel({ recipe, onChange, readOnly = false }: { recipe: Recipe; onChange?: (recipe: Recipe) => void; readOnly?: boolean }) {
  const entries = recipe.unknowns ?? [];
  function remove(index: number) {
    const kept = entries.filter((_, i) => i !== index);
    const next: Recipe = { ...recipe, unknowns: kept };
    if (!kept.length) delete next.unknowns;
    onChange?.(next);
  }
  if (!entries.length) return readOnly ? null : <p className="muted">原方没有标出没说清的地方。</p>;
  return <ul className="unknown-list">{entries.map((entry, index) => <li key={`${index}-${entry.text}`}><div><span className="tag">{unknownKindText(entry)}</span><small>{where(recipe, entry)}</small><p>{entry.text}</p></div>{!readOnly && <button type="button" className="quiet danger" aria-label={`删掉这一条：${entry.text}`} onClick={() => remove(index)}>删掉这一条</button>}</li>)}</ul>;
}
