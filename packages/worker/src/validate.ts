/**
 * schema 校验（ADR-0007 §5：「worker 内置 schemas/*.schema.json 的预编译产物，
 * 构建期生成，运行时零解析开销；校验不过就不产生任何 commit」）。
 *
 * 产物由 scripts/gen-validators.mjs 生成（ajv standalone），**不入库**。
 * 之所以必须预编译：Workers 禁止 eval / new Function，ajv 默认模式正是靠 new Function 编译。
 *
 * 错误映射（契约 §1.8 / D-02）：code 逐字用 ajv 的 keyword，path 用 ajv 的 instancePath
 * （JSON Pointer，前端按它把输入框标黄）。
 */
import type { CompiledValidator, ValidatorError } from "../generated/validators.js";
import { validateDish, validateIngredient, validateMenuPlan } from "../generated/validators.js";
import type { FieldError } from "./types.js";

export const VALIDATORS = {
  plan: validateMenuPlan as CompiledValidator,
  ingredient: validateIngredient as CompiledValidator,
  dish: validateDish as CompiledValidator,
};

/** 契约 §1.8 的示例文案是绑在具体字段上的（「份数至少 1」「净料率不能超过 1」）。
 *  能通用照拄的照拄，不能的按同样口吻参数化。 */
const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
};

const TYPE_LABELS: Record<string, string> = {
  integer: "应为整数",
  number: "这里要填数字",
  string: "这里要填文字",
  boolean: "这里只能是「是」或「否」",
  array: "这里应该是一组内容",
  object: "这里应该是一组字段",
};

const SERVICE_WINDOW_PATTERN = "^\\d{2}:\\d{2}-\\d{2}:\\d{2}$";

function labelEnum(values: readonly unknown[]): string {
  return values.map((v) => MEAL_TYPE_LABELS[String(v)] ?? String(v)).join(" / ");
}

function messageFor(err: ValidatorError): string {
  const params = err.params as Record<string, unknown>;
  switch (err.keyword) {
    case "type":
      return TYPE_LABELS[String(params.type)] ?? "这一项的格式不对";
    case "required":
      return `这项必须填：${String(params.missingProperty)}`;
    case "enum":
      return `只能选：${labelEnum((params.allowedValues as unknown[]) ?? [])}`;
    case "pattern":
      return params.pattern === SERVICE_WINDOW_PATTERN
        ? "格式不对，例如 12:00-14:00"
        : "格式不对，只能用小写字母、数字和短横线";
    case "minimum":
      return `不能小于 ${String(params.limit)}`;
    case "exclusiveMinimum":
      return `必须大于 ${String(params.limit)}`;
    case "maximum":
      return `不能超过 ${String(params.limit)}`;
    case "exclusiveMaximum":
      return `必须小于 ${String(params.limit)}`;
    case "minItems":
      return `至少要有 ${String(params.limit)} 项`;
    case "minLength":
      return "这项不能是空的";
    case "additionalProperties":
      return `有一项系统不认识，先删掉再存：${String(params.additionalProperty)}`;
    case "const":
      return `这里只能是 ${JSON.stringify(params.allowedValue)}`;
    case "anyOf":
      return "中 / 英 / 乌至少填一个";
    case "format":
      return params.format === "date" ? "日期格式应为 2026-10-19" : "这里要填一个网址";
    default:
      return err.message ?? "这一项填得不对";
  }
}

/** ajv 的 errors[] → 契约 §1.8 的 errors[]。path 用 instancePath，非字段级为 ""。 */
export function toFieldErrors(errors: readonly ValidatorError[] | null | undefined): FieldError[] {
  const list = errors ?? [];
  const out: FieldError[] = [];
  const seen = new Set<string>();
  for (const err of list) {
    const path = err.instancePath;
    const code = err.keyword;
    const key = `${path}|${code}|${JSON.stringify(err.params)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path, code, message: messageFor(err) });
  }
  return out;
}

export interface ValidationOutcome {
  valid: boolean;
  errors: FieldError[];
}

export function validateEntity(kind: keyof typeof VALIDATORS, data: unknown): ValidationOutcome {
  const validate = VALIDATORS[kind];
  const valid = validate(data);
  return { valid, errors: valid ? [] : toFieldErrors(validate.errors) };
}
