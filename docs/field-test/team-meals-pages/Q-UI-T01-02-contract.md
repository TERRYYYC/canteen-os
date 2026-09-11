---
feature_ids: []
topics: [team-meals, plan, import, q-ui-t01-02]
doc_kind: repair-contract
created: 2026-09-11
---
# Q-UI-T01-02 — retain current Plan draft through unrelated meal import

Dispatch task 01a08d6d-be28-7142-ad8e-3f964658d3f4 authorizes this bounded repair after the independently approved Q-UI-T08-01 copy package was handed back at `f33dd42f1033073329d12579783d470e89dec00d`. This is the clean starting HEAD; its production packages equal approved5049 with tree `b0407a1b761561f03aa07d66a5c6b003687458c8`. The original page_inventory remains author and plan_review remains nonauthor reviewer. Copy's fixed production, evidence and review remain an independent immutable boundary.

## Original requirement and evidence

Original STANDARD-DATA-AND-ACCEPTANCE.md SHA256 6aaff3f33b65aad6f6952297abae9dd2dafef379bcc0fa64066c07f5300f0352: T01 preserves true existing counts and whole-plan edits; T07 protects current drafts across navigation and later responses. Original SCREEN-CONTRACTS.md SHA256 e05d43554181c4ebed52269d7f20cafd8b35d4d687e56c8ae52b127684ce3652: S08 keeps existing plannedServings, optional counts, whole-plan saves, original conditional locks and draft-preserving failure semantics. Source files are in ../canteen-os-design/docs/design/reference-v3/.

Q report, four DOM captures, original RED, its earlier capture-parser failure, the capture assertion and full ledger are fixed at Q 6276f1beacd9bb61c756d1a3974b180f6cbc74ab. The four supplied DOM hashes were independently checked by root; raw capture clearly shows local 11 before import and 8 after. Import adds only 2026-09-15 lunch first-dish with count omitted; it is unrelated to the local 09-14 lunch first-dish edit. The initial same-row 9→8 case is separate and does not establish intended matching-row overwrite semantics.

Ledger has 46 requests. Request39 is last successful POST /plan/team-week, committing saved count8 at modeled revision6f479b8acdd636a10796640833d0a0aafad267c1. Requests44–46 are GET200; 45 and46 contain the actual full saved count8 plan; no POST follows39. Q's script asserts over saved native DOM captures (8 !== 11), not a newly driven browser replay. Its first parser missed the [active] marker and returned undefined; that setup failure is preserved separately. No Worker body mutation or unintended server write caused this failure.

Confirmed call chain: Plan's C1 EditSession owns current local draft11; import.doImport consults C draft-store, which does not contain that session's edits, then force-reads saved8 and merges the imported meal. Returning Plan passes the whole stored imported plan into plan-form.load, whose session.edit replaces draft11 with imported saved8. Fix the D page integration while retaining C1 as the sole save/document owner.

## Required behavior and ownership

- Import another date/meal into the current same API/auth/plan draft, retaining current numeric edits, deliberate omitted counts, existing newly added/deleted rows and whole-plan metadata. Do not force users to save first, disable normal import, silently discard drafts or add another draft/save state system.
- Preserve established matching-row semantics: explicit imported counts and explicit clear-count actions remain intentional; omitted imported count retains the current matching row's value. Determine reachable duplicate-row behavior against existing mergePlan contract and preserve it; no permanent row IDs or broader import redesign.
- Guard handoff/merge/application against stale route, language, auth, plan and in-flight input generations. Older import results cannot replace later Plan edits or apply to another owner's draft. Cancellation, failed reads and repeated application keep current drafts and pending raw input honest.
- Respect original save operation, unknown-outcome and conflict states. No extra write, no unlocked retry, no new persistence. Preserve original C lock/owner and all raw edit/reload-safety claims. Determine whether blocked import must remain pending or be retried through existing mechanisms; never claim application before the owner accepted it.
- Authorized production is D admin/plan.ts, plan-form.ts, import.ts and minimum necessary D page helper. D-prefixed tests and D evidence only. C admin/store, edit-session, reload-safety, API, main, config/dependencies, core/Worker and Q E2E/fixtures/data are read-only. If an actual C interface change is required, provide exact boundary and evidence to dispatch; do not edit C locally.

## Work and proof

First original author reproduces the real page handoff with meaningful D RED using actual C APIs/session. Propose the smallest ownership-safe D integration and review its dependency/cancellation behavior before production edits. Freeze that decision in a concrete source checkpoint. Preserve original RED and all intermediate failures.

Verify the actual minimal browser journey: save8, edit11 without saving, import unrelated next-day lunch, return and observe11 plus the added count-free row with no plan POST during import. Check relevant numeric/omitted-count/add/remove and matching-row semantics, save-in-progress/unknown/conflict and stale auth/route/language/input boundaries according to reachable risk. Use actual main/C/Worker with explicit local FakeRepo for browser evidence, never relabel capture-only assertions or DOM doubles as native replay.

Run necessary Node20 target/full Web/type checks, and actual two-config 11-route SW/no-SW 44 closure budgets ≤60000 gzip with full precache/preloads. The copy repair leaves HTTP Plan at59568 (432 bytes margin); if needed, only the smallest D presentation/module refactor is allowed, with all previous lazy-action owner invariants retained. No budget/config relaxation.

Original nonauthor exact-SHA review, full-report/custody verification and dispatch handback are required. Q independently repeats acceptance after receiving the approved fix. This bounded closure is not full T01–T09 or L2 approval.

## Selected integration direction for RED and design calibration

Read-only investigation by the original author and root establishes that C invalidate() exposes a detached snapshot with closed phase and null operationId; it is not a safe arbitrary-plan query. C open() explicitly resumes the existing document record, and C edit() permits local editing while preserving a pending operation or conflict. Therefore this contract accepts importing as a local edit inside that original operation/phase, without extra POST or changing its lock.

Use a minimal D capability connection keyed to the same API/current auth and requested Plan. The connection holds callbacks only, not another JSON draft. For a known document, its original form resumes that exact C record and synchronously merges into the then-current draft using existing import semantics before calling session.edit. Success is reported only after edit is accepted. A retired/rejecting owner must leave raw import input visible and unapplied; it cannot fall back to a stale saved plan. Only a genuinely absent matching current Plan document keeps the original guarded GET/store/first-load path.

The existing import merge sorts all rows. Preserve duplicates and first-match semantics and produce only a temporary old-index to new-index mapping so D view.invalid follows the same original row before synchronous session subscribers paint. Roll back any raw-map adjustment if edit is refused. Keep Add pending input and selected view range. Do not invent persistent row identifiers or move invalid numeric text into saved JSON.

Do not statically import the full Plan renderer into Import or import parser/CSV into Plan. The shared connection dispatches a tiny synchronous capability; the merge is passed as a callback. Actual budget measurements decide whether an additional minimal D split is necessary. Original nonauthor design calibration follows this fixed contract before production editing; D RED is authorized immediately.
