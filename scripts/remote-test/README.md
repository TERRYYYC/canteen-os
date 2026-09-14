---
feature_ids: []
topics: [remote-test, persistence, deployment]
doc_kind: runbook
created: 2026-09-14
---

# Isolated remote test model

This opt-in adapter serves the fixed 0.3.0-alpha.1 Web production build and actual
Worker handler. GitHub API, Actions and Pages hosting are modeled using the
existing workflow fixture. There is no real GitHub publication, Cloudflare write
channel, translation credential or production data. It seeds the fixture once,
retaining its original video provenance and explicit demo/unverified notices.
The placeholder video is not evidence of human or kitchen validation.

Run from a fixed Git checkout after a frozen pnpm install, Worker build, icon
generation and explicit Linux image-tool preparation. Set `CANTEEN_TEST_CONFIG`
to a private JSON file containing `port`, `storageRoot`, `productionRevision` and
`tokens: {chef, buyer, admin}`. Generate three independent random tokens of at
least 40 URL-safe characters; do not use the public fixture token constants.
Keep the config and state directories private to the service account.

The service binds only `127.0.0.1`. The app, Worker path and generated QR URLs use
`http://127.0.0.1:<port>/canteen/`; use the same local port in an SSH forward.
Changing to a public host or HTTPS requires a separate reviewed configuration.
The app has no test controls or diagnostics page. `/_test/status` reports build
identity and separate private/public revisions without role tokens or file paths.
The application still uses its standard role-token links. Rollback is not enabled
by this test adapter; saving and publication are enabled.

A single atomic, fsynced `checkpoint.json` is the persistence commit point. It
contains private Git maps/head, counters, runs and a separate active immutable
artifact with hashes. Real Git objects are fsynced before the checkpoint. Static
responses and Worker calls share a queue, so an uncheckpointed publication is
never served. A checkpoint failure stops the process before acknowledging a
write. On restart the checkpoint takes precedence over an advanced Git ref.
Interrupted publication is marked failed and the previous public artifact stays
active. Orphan build directories are retained for inspection, with fresh numbers
used on subsequent builds. Corrupt/missing state or artifact bytes stop startup;
they never trigger automatic reseeding. Archive the whole state directory, not
only its JSON, to preserve real Git objects and published bytes.

The service uses a directory owner lock. A killed owner can be recovered, with
stale-lock recovery serialized separately. A crash during lock recovery fails
closed: verify no process owns the directory before removing `service.lock` and
`service.lock.recovery`. Never run two instances against the same state.

Install the supplied user unit only after adapting its Node path if necessary.
Enable linger for the service account and verify `Linger=yes`, then
`systemctl --user enable --now canteen-os-test.service`. Verify actual survival
through all SSH sessions ending, then reconnect independently and read/save data.
A successful `enable` alone does not prove session-independent operation.
Use `systemctl --user restart canteen-os-test.service` for restart, and
`journalctl --user -u canteen-os-test.service` for logs. Stopping/disabling this
unit preserves the state directory. This is an enduring test service, not a
short-lived local preview lease. Checkpoint size, Git history and retained build
directories grow with use; this adapter is for an isolated test fixture.

Targeted checks:

```sh
npm --prefix packages/worker run build
node packages/web/scripts/gen-icons.mjs
node scripts/prepare-team-image-tools.mjs
node --test scripts/remote-test/persistence.test.mjs scripts/remote-test/service.test.mjs
```

The HTTP test uses a separate disposable directory and port 4281 by default;
`CANTEEN_SERVICE_TEST_PORT` can select another free nonreserved port.
