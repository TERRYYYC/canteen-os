#!/usr/bin/env node
/** Fixed test inputs only. No business schemas and no production writes.
 * Schema: execute the unchanged official Ajv CLI in a temporary fixture root.
 * References and clip/source checks: call existing Python APIs, never their
 * fallback schema validators. RC-A owns extraction of the reusable Ajv API.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CONTRACTS_ROOT = path.join(REPO_ROOT, "test/fixtures/contracts");
const LAYERS = ["none", "json", "schema", "reference", "asset"];

function within(root, relative) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative)) throw new Error("Expected a relative fixture path");
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) throw new Error(`Fixture path escapes root: ${relative}`);
  return resolved;
}

function filesUnder(root) {
  return readdirSync(root).sort().flatMap((name) => {
    const abs = path.join(root, name);
    if (lstatSync(abs).isSymbolicLink()) throw new Error(`Fixture symlinks are not supported: ${abs}`);
    return statSync(abs).isDirectory() ? filesUnder(abs) : [abs];
  });
}

export function readManifest(contractsRoot = CONTRACTS_ROOT) {
  return JSON.parse(readFileSync(path.join(contractsRoot, "manifest.json"), "utf8"));
}

/** Inventory protects frozen bytes; changing a baseline needs an explicit manifest diff. */
export function verifyManifest(contractsRoot = CONTRACTS_ROOT) {
  const manifest = readManifest(contractsRoot);
  if (manifest.manifestVersion !== 1 || !Array.isArray(manifest.cases) || !manifest.cases.length) throw new Error("Invalid fixture manifest");
  const ids = new Set();
  for (const c of manifest.cases) {
    if (!/^[a-z][a-z0-9-]*$/.test(c.id) || ids.has(c.id)) throw new Error(`Invalid/duplicate fixture ID: ${c.id}`);
    ids.add(c.id);
    if (!/^[0-9a-f]{40}$/.test(c.sourceCommit) || c.entityFormat !== "2" || !LAYERS.includes(c.expectedFailureLayer)) throw new Error(`Invalid provenance/format/layer: ${c.id}`);
    if (new Date(c.fixedAt).toISOString() !== c.fixedAt) throw new Error(`Invalid fixed time: ${c.id}`);
    for (const rel of [c.base, c.root].filter(Boolean)) {
      const data = within(contractsRoot, `${rel}/data`);
      if (!existsSync(data) || !statSync(data).isDirectory()) throw new Error(`Missing fixture data: ${rel}`);
    }
  }
  const actual = filesUnder(contractsRoot).map(f => path.relative(contractsRoot, f).split(path.sep).join("/"))
    .filter(f => f !== "manifest.json" && !f.endsWith(".md"));
  const expected = Object.keys(manifest.sha256 ?? {}).sort();
  if (JSON.stringify(actual.sort()) !== JSON.stringify(expected)) throw new Error("Fixture inventory drift");
  for (const file of expected) {
    const digest = createHash("sha256").update(readFileSync(within(contractsRoot, file))).digest("hex");
    if (digest !== manifest.sha256[file]) throw new Error(`Fixture hash mismatch: ${file}`);
  }
  return manifest;
}

function findCase(id, contractsRoot) {
  const fixture = readManifest(contractsRoot).cases.find(c => c.id === id);
  if (!fixture) throw new Error(`Unknown fixture: ${id}`);
  return fixture;
}

/** Materialize base + whole-file overlays in a caller-owned EMPTY test directory. */
export function materializeFixture(id, targetRoot, { contractsRoot = CONTRACTS_ROOT } = {}) {
  const fixture = findCase(id, contractsRoot);
  if (existsSync(targetRoot) && readdirSync(targetRoot).length) throw new Error("Fixture target must be empty");
  mkdirSync(targetRoot, { recursive: true });
  for (const rel of [fixture.base, fixture.root].filter(Boolean)) {
    const source = within(contractsRoot, `${rel}/data`);
    filesUnder(source);
    cpSync(source, path.join(targetRoot, "data"), { recursive: true });
  }
  return fixture;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.signal) throw new Error(`Validator infrastructure failure: ${result.error?.message ?? result.signal}`);
  return result;
}

const PYTHON_CHECKS = String.raw`
import importlib.util, json, sys
from pathlib import Path
sys.dont_write_bytecode = True
repo, root = map(Path, sys.argv[1:3])
def load(name, file):
    spec = importlib.util.spec_from_file_location(name, file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
lv = load('fixture_refs', repo / 'scripts/local-validate.py')
lv.ROOT, lv.DATA_DIR = root, root / 'data'
loaded = {}
for rel, _, is_dir in lv.TARGETS:
    target = lv.DATA_DIR / rel
    for file in sorted(target.glob('*.json')) if is_dir else [target]:
        loaded[str(file.relative_to(root))] = (file, json.loads(file.read_text()))
lv.errors.clear()
lv.check_references(loaded)
result = {'references': lv.errors[:], 'sourceErrors': [], 'sourceReview': []}
if not lv.errors:
    source = load('fixture_sources', repo / 'skills/video-recipe-ingest/scripts/validate_dish.py')
    techniques = {t['id'] for t in json.loads((lv.DATA_DIR / 'techniques.json').read_text())}
    ingredients = {p.stem for p in (lv.DATA_DIR / 'ingredients').glob('*.json')}
    for label, (file, data) in loaded.items():
        # Ingest-specific checks apply to video/clip-bearing fixtures only.
        if file.parent.name != 'dishes' or not (data.get('provenance', {}).get('source') == 'video' or any(s.get('clip') for s in data.get('steps', []))):
            continue
        report = source.Report()
        source.contract_checks(data, report, techniques, ingredients)
        result['sourceErrors'].extend(label + ': ' + e for e in report.errors)
        result['sourceReview'].extend(label + ': ' + e for e in report.review)
print(json.dumps(result, ensure_ascii=False))
`;

/** Byte/metadata checks absent from existing CLIs. No remote fetch or rights verification. */
function checkAssets(root, documents) {
  const errors = [], review = [];
  const coverage = { imageRefs: 0, localImages: 0, remoteImagesUnverified: 0 };
  const licenses = /^(own|CC0(?: 1\.0)?|Public domain|CC BY(?:-SA)?(?: [1-4]\.0)?)$/;
  function visit(value, label, file) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      const pointer = `${label}/${key}`;
      if (key === "videoUrl" && typeof child === "string" && /example/i.test(child)) review.push(`${pointer}: source-placeholder (not verified media)`);
      if (key === "image" && child && typeof child === "object") {
        coverage.imageRefs++;
        const { src, license, author, sourceUrl } = child;
        if (!licenses.test(license)) errors.push(`${pointer}: image-license is outside the fixture license policy`);
        if (/^CC BY/.test(license) && (!author || !sourceUrl)) errors.push(`${pointer}: image-attribution requires author and sourceUrl`);
        if (/^https?:\/\//.test(src)) {
          if (!sourceUrl) errors.push(`${pointer}: image-source missing sourceUrl`);
          coverage.remoteImagesUnverified++;
          review.push(`${pointer}: remote-image-unverified`);
        } else {
          const abs = src.startsWith("data/") ? path.resolve(root, src) : path.resolve(path.dirname(file), src);
          const dataRoot = path.join(root, "data") + path.sep;
          if (!abs.startsWith(dataRoot)) errors.push(`${pointer}: image-path escapes fixture data`);
          else if (!existsSync(abs) || !statSync(abs).isFile()) errors.push(`${pointer}: image-missing ${src}`);
          else if (!realpathSync(abs).startsWith(realpathSync(path.join(root, "data")) + path.sep)) errors.push(`${pointer}: image-path escapes fixture data`);
          else if (statSync(abs).size === 0 || statSync(abs).size > 200 * 1024) errors.push(`${pointer}: image-size invalid`);
          else coverage.localImages++;
        }
      }
      visit(child, pointer, file);
    }
  }
  for (const [file, data] of documents) visit(data, path.relative(root, file), file);
  return { errors, review, coverage };
}

export function validateFixtureCase(id, { contractsRoot = CONTRACTS_ROOT, repoRoot = REPO_ROOT } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "canteenos-contract-"));
  try {
    const fixture = materializeFixture(id, root, { contractsRoot });
    const finish = (layer, diagnostics = [], extra = {}) => ({
      id, actualFailureLayer: layer, expectedFailureLayer: fixture.expectedFailureLayer,
      matched: layer === fixture.expectedFailureLayer && (!fixture.diagnosticIncludes || diagnostics.join("\n").includes(fixture.diagnosticIncludes)),
      diagnostics, ...extra,
    });
    const documents = [];
    for (const file of filesUnder(path.join(root, "data")).filter(f => f.endsWith(".json"))) {
      try { documents.push([file, JSON.parse(readFileSync(file, "utf8"))]); }
      catch (error) { return finish("json", [`${path.relative(root, file)}: ${error.message}`]); }
    }
    mkdirSync(path.join(root, "scripts"));
    copyFileSync(path.join(repoRoot, "scripts/validate-schemas.mjs"), path.join(root, "scripts/validate-schemas.mjs"));
    symlinkSync(path.join(repoRoot, "schemas"), path.join(root, "schemas"), "dir");
    symlinkSync(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"), "dir");
    const schema = run(process.execPath, [path.join(root, "scripts/validate-schemas.mjs")]);
    if (schema.status !== 0) {
      if (!/^FAIL\s/m.test(schema.stderr)) throw new Error(`Official Ajv validator could not run: ${schema.stderr}`);
      return finish("schema", [schema.stderr.trim()]);
    }
    const python = run(process.env.PYTHON ?? "python3", ["-c", PYTHON_CHECKS, repoRoot, root]);
    if (python.status !== 0) throw new Error(`Reference/source validator could not run: ${python.stderr}`);
    const checks = JSON.parse(python.stdout);
    if (checks.references.length) return finish("reference", checks.references);
    const assets = checkAssets(root, documents);
    const errors = [...checks.sourceErrors, ...assets.errors];
    return finish(errors.length ? "asset" : "none", errors, { review: [...checks.sourceReview, ...assets.review], assetCoverage: assets.coverage });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function main(argv = process.argv.slice(2), out = console.log) {
  const manifest = verifyManifest();
  if (argv.length && (argv.length !== 2 || argv[0] !== "--case")) throw new Error("Usage: node scripts/validate-contract-fixtures.mjs [--case ID]");
  const ids = argv.length ? [findCase(argv[1], CONTRACTS_ROOT).id] : manifest.cases.map(c => c.id);
  const results = ids.map(id => validateFixtureCase(id));
  for (const result of results) {
    out(`${result.matched ? "PASS" : "FAIL"} ${result.id}: expected=${result.expectedFailureLayer}, actual=${result.actualFailureLayer}`);
    for (const note of result.review ?? []) out(`  REVIEW ${note}`);
    if (!result.matched) for (const error of result.diagnostics) out(`  ${error}`);
  }
  out(`${results.filter(r => r.matched).length}/${results.length} fixture expectations matched; local validation only, no real save or media provenance verified.`);
  return results.every(r => r.matched) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
