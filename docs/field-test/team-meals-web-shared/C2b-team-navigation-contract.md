---
feature_ids: [team-meals]
topics: [web, shell, navigation, publication, i18n]
doc_kind: interface-contract
created: 2026-09-11
---
# Team publication navigation correction

Scope: C shell/i18n, necessary main context, and C verification only. The accepted SCREEN-CONTRACTS S01/S02/T08 target is team meal viewing without a customer entry; S08 already uses the authenticated `#/admin/plan/<planId>` route. D0 assigns global navigation to C. Existing shared/combination approvals remain version-bound.

Root cause at1c7c993: main sends only the manifest to shell.setBuild; shell always renders the legacy guest role and a disabled second-phase placeholder. There is no publication-kind branch or link to an already listed plan. The fixed formal-producer manifest is the evidence source; no floating D code is consumed.

Minimal interface: setBuild keeps its existing manifest argument and accepts the validated Publication.kind as an optional second argument (omitted means the existing legacy caller). main passes both from the same winning loadPublication result, or null on failure. No duplicate data fetch, secondary publication state, catalog read or invented plan ID. setActive optionally accepts the already sanitized route rest so only the exact matching plan route is marked current; the existing one-argument caller remains valid.

- Team: menu label/title becomes 用餐安排 / Meals / Харчування, with role 团队查看 / For the team / Для команди. Existing prep, purchase, menu and plan routes remain.
- Valid team or legacy publication with a listed plan: use the same first verified plans entry that supplies main.planId, linking to `#/admin/plan/<id>`. Team wording is 排每天的菜 / Plan meals / Планування меню; legacy keeps its existing plan wording. The existing admin router retains authentication; the shell neither obtains credentials nor performs a write.
- Team empty plans: retain team viewing semantics, but show an unavailable plan item with “No plan available” in each language. Do not invent week-41 or route to an implicit new plan.
- Failed/not-yet-loaded manifest: neutral viewing role and unavailable plan information; remove any stale plan link. Do not infer a team/legacy publication from the route or the previous successful load.
- Legacy: retain existing reader labels/role and existing data behavior, while exposing the same real listed plan through the existing editor route. Empty legacy also has no invented target. The obsolete “second phase” claim is replaced by current availability.

Drawer refresh/language/publication changes preserve focus on the equivalent link or theme control; if a focused plan disappears, move to an available drawer control. Clicking the plan uses normal hash navigation and closes the drawer with corner focus. No page outlet replacement, draft mutation, save/reload action or coverage declaration is added to shell. Reader-only refresh retains the existing editor protection in main.

Verification: formal team-producer RED for guest wording and the missing real plan link; zh/en/uk team/legacy/empty/failure and auth-route checks, focus and source-change checks, existing main/auth/PWA regression tests, and appropriate actual-main browser navigation. Fixed implementation goes to the original non-author reviewer before release through dispatch. This correction does not approve pending D full-page wiring or L2; no main-branch/remote/production write.
