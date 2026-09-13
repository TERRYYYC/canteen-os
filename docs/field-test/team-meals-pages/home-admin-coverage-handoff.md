---
feature_ids: [team-meals]
topics: [home, admin-navigation, reload-safety]
doc_kind: handoff
created: 2026-09-11
---

What: Home registers its real snapshot owner once and acquires a read ticket before each changes/catalog/plan request. Its metadata has no editable body. Each completion releases only the original read and initial context. Language redraw uses the same registered owner and requests. Auth replaces the private snapshot while old actual reads remain protected until completed. Unconfigured Home declares read-only without registering or requesting.

Admin dispatcher lock/not-found, failed chunk loading and abandoned chunk-loading branches finish their own context as read-only because no child screen started. Normal child pages keep sole responsibility for their own setup declaration; dispatcher never overwrites it. Existing offscreen C1/aux owners are not cleared by a page coverage statement. main/router/shared C files are unchanged.

Why: Purely navigational screens otherwise leave permanent untracked markers, while Home's in-flight reads were invisible to the shared update guard. Home completion, language changes and original old-auth finally must not release another request or new page initialization.

Tradeoff: Existing home snapshot, identity, numbers and transport contracts remain. No extra body/auth map, retry behavior or write was added. Failed reads keep unknown number presentation but end their completed read operation. Only the original PageCtx callback is used.

Evidence: Three new Node cases RED before implementation; 11/11 Home cases pass afterward. Installed TypeScript passes. Actual IAB Home 9/9 includes all three reads, partial completion, same-language-owner reuse and two auth initializations. Actual dispatcher 4/4 covers lock, not-found, abandoning a real dynamic screen import and credential-free summary; its login string is entirely synthetic. The browser JSON records the production Home source hash. No real service call or write occurred.

Open Questions: main's injection and application-wide PWA behavior remain separate C scope. Independent review of this exact D delta is required; author tests do not imply approval or feature completion.

Next Action: Non-author review of Home/admin coverage only, preserving historical Home v2/v3/unconfigured/mixed-language behavior and checking late read/retry/abandoned route boundaries.
