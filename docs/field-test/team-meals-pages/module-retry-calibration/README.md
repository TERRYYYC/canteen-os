---
feature_ids: []
topics: [team-meals, pages, native-modules, recovery]
doc_kind: diagnostic-evidence
created: 2026-09-11
status: observed-limitation
---

# Native same-URL module retry calibration

Root operated IAB tab 71 at `http://127.0.0.1:58976/` using the isolated local [server](server.mjs). This is a browser platform calibration, not an application regression result or independent product approval. No production source, browser application state or shared module was substituted. The page imports one real served JavaScript module and records its HTTP requests.

Sequence: click **Try same module** while `/optional.js` responds HTTP 503; observe rejected native import. Click **Restore local module response**, which makes subsequent server responses for that exact URL HTTP 200; observe confirmation. Click **Try same module** again. [Original displayed JSON](same-url-retry.json) records two rejected import attempts and only one GET of `/optional.js`. A later requests read proves the server's restored state. The failed result is retained without rewriting it as a successful retry.

The initial sandboxed server listen exited with EPERM; the same local-only command was authorized and then started under session 43486. After capture, root stopped exactly that session, exit 130. No unrelated service or user tab was modified. Copies and original paths are hashed in [SHA256SUMS.json](SHA256SUMS.json).

This observed browser does not recover the failed native import merely by releasing an application Promise cache and retrying the same URL. It does not establish that every browser/version behaves identically, nor test transitive Vite preloads, Service Worker caches, module evaluation errors or application owner handling. The HTML standard's module-fetch machinery and its [open discussion of non-OK responses](https://github.com/whatwg/html/issues/12657) provide relevant context; the actual local result is the evidence used here.

Dispatch and the non-author reviewer read the evidence. D must not claim a synthetic loader rejection followed by a synthetic success proves real module recovery. A consumer-side recovery proposal and corresponding contract clarification are pending; no query imports, duplicated shared state/API, automatic reload, module rewriting, persistence or cache/config change is authorized by this calibration. Existing dependency extraction and original-owner RED validation may continue.
