# Offline application upgrades

This procedure changes the application revision and active app bundle without
publishing private Git saves. The old public commit, all public `data/**` bytes,
private repository state, jobs and authorization tokens are preserved. Run the
CLI from the **new fixed release checkout**; its location need not match the old
checkout. Keep the old release, its dependencies and every old build directory:
existing snapshot `node_modules` links are left unchanged.

## Prepare and upgrade

1. Commit the complete reviewed application (including this CLI) and record its
   full Git SHA. Prepare the new release with complete Git objects, a frozen
   dependency install, the core and Worker builds, generated icons and image
   tools. Do not edit files or move HEAD while the CLI runs. The CLI verifies
   HEAD and actual tracked source bytes against `--to`, rejects extra source
   files, and repeats verification after the build. `sourceDigest` attests source bytes; it
   does not attest generated Worker/core dist or installed dependencies, which
   must be built from this same fixed release before running the CLI.
2. Stop `canteen-os-test.service` explicitly, rather than killing its process
   under an automatic restart policy. Archive the full state directory and
   private runtime config with owner-only permissions. Do not print/cat them.
3. From the new release run (substitute recorded full SHAs and absolute paths):

   ```sh
   node scripts/remote-test/upgrade-app.mjs \
     --config /absolute/private/runtime.json \
     --from OLD_FULL_GIT_SHA --to NEW_FULL_GIT_SHA
   ```

   `--from` must match both runtime config and checkpoint. The CLI refuses a
   missing/corrupt checkpoint, changed source revision/bytes, a live service
   owner, artifact corruption, or any build error. It builds **the old active
   public commit**, with the old manifest timestamp, then requires every
   generated public data byte to match. It preserves the private head even
   when it differs from the public head. No reseeding or publication occurs.
4. Save the receipt printed to stdout. It contains only revisions, heads,
   digests, operation and transaction ID. Config/backups contain tokens and
   must remain private. Update the service unit's WorkingDirectory and ExecStart
   to the new release, keep `CANTEEN_TEST_CONFIG` pointing at the same absolute
   private config, daemon-reload, and start. Check `/_test/status`: application
   revision changed, private/public heads did not. Verify the new UI, old menu
   data and a second restart.

The new adapter sets `KNOWLEDGE_BASE_URL=http://127.0.0.1:4390`. Trusted runtime
`knowledgeBaseUrl` or environment `KNOWLEDGE_BASE_URL` may explicitly repeat
that value, or `http://127.0.0.1:4391` for isolated recovery/testing; other addresses are rejected. No browser-controlled upstream exists.
JSON requests below `/__q/worker/knowledge/` allow 4 MiB, asset uploads allow
8 MiB + 64 KiB, and all old paths retain 256 KiB. Overflows return 413. Worker
still owns authentication, KB routing, media validation and upstream credentials.

## Transaction and crash recovery

An owner-only `state/application-upgrades/<receipt-id>/` directory retains exact
before/after checkpoint and config bytes, their hashes and a safe receipt.
All payloads are fsynced before `application-upgrade.pending.json` is written.
Checkpoint and config are each replaced atomically. Two separate files cannot
be replaced atomically together, so the shared service lock prevents readers
during the operation, and the pending journal makes startup fail closed after
an interrupted pair of renames. A caught I/O error attempts to restore both
original files. It never acknowledges a partial upgrade.

If the process/power failed mid-upgrade, repair the storage problem, keep the
service stopped and run from the retained new release:

```sh
node scripts/remote-test/upgrade-app.mjs --config /absolute/private/runtime.json --recover
```

Recovery restores both pre-transaction files, checks the retained old artifact,
and removes the journal only after syncing and verifying the restored pair.
It refuses unknown on-disk bytes instead of overwriting an unrelated change.
Restore the old service unit/release before starting, or retry the upgrade from
its original `--from`. The new server refuses a pending transaction; an old
server does not know that journal, so never start the old server until recovery
has completed. The CLI never changes a service unit or starts/stops services.

## Rollback

For a completed upgrade, before further saves/publications/config edits:

```sh
node scripts/remote-test/upgrade-app.mjs \
  --config /absolute/private/runtime.json \
  --from NEW_FULL_GIT_SHA --rollback RECEIPT_ID
```

This uses retained old artifacts, checks both current files still equal the
recorded after-state, and restores the exact before-state with the same journal
protocol. Select the retained old release in the service unit before restarting.
A later save, publication or changed job/counter/config causes rollback to refuse;
restoring an old checkpoint at that point could discard acknowledged work.
Instead, prepare a new reviewed rollback-code commit and run an ordinary app
upgrade against the currently active public data. Keep all backups/builds until
acceptance; the CLI deliberately does not garbage-collect them.

## Isolated verification

These tests use only disposable directories, generated role tokens and a local
clone. The upgrade test does not contact the running service or read its config.
The adapter test binds a disposable loopback port.

```sh
npm --prefix packages/worker run build
node packages/web/scripts/gen-icons.mjs
node scripts/prepare-team-image-tools.mjs
node --test scripts/remote-test/http-adapter.test.mjs scripts/remote-test/upgrade-app.test.mjs
CANTEEN_TEST_REVISION=$(git rev-parse HEAD) node --test scripts/remote-test/persistence.test.mjs scripts/remote-test/service.test.mjs
```

Existing tests retain their historical revision default. Set
`CANTEEN_TEST_REVISION` to the committed integration revision for changed sources;
fixed source checks remain enabled.
