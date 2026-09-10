# Baseline and blast-radius record

## Git boundary

- Source worktree: `codex/package4-closure`
- Source checkpoint: `03b91be001f2481b49194c4490113392ba87e190`
- Spike worktree: `codex/package4-formance-spike`
- Source index at creation: empty
- Dirty manifest SHA-256: `1d00104ce935329732fd37a029be61152f14f189e9469ea7f93debd02461e12b`
- Dirty entries at creation: 154 modified, 6 deleted, 23 untracked

The complete path-level manifest is in `dirty-worktree-manifest.txt`. Its hash
lets the source worktree be rechecked without copying any untracked content.

## Governing inputs

| Input | SHA-256 |
|---|---|
| checkpoint `PRODUCT.md` | `01a8a4137dd1e838c15020d677e6931e878b8873c7816cf8e6d03f1a20d2c185` |
| dirty Package 4 atomic plan | `f5b9396ea5c5b8e309245ccf30b6e0588d2d9bdb17a7d054cb6c222095e188a6` |
| AU prepaid-ledger research | `50a064f3e16958f944465593c8697fc2e9ad64075b6806d6d69b13db94468f5e` |
| operations reconstruction research | `d10acf4ceb551f9961f55516b4e5b7ec5b0b8e08edbd1dd03e739be168f9c94a` |
| Formance handoff | `4b5470efa6d30a987465bbc2dbf8398b31dddb661ee09b57616a9246f20ed070` |

## Existing custom-ledger baseline

Command, under Node `v22.22.0`:

```sh
npx vitest run \
  tests/unit/money/balanced-journal.test.ts \
  tests/unit/convex/money-journal.test.ts \
  tests/unit/convex/money-managed-call.test.ts \
  --no-file-parallelism
```

Result on 2026-09-02: 3 files passed, 9 tests passed, 84 ms test time,
1.38 s Vitest duration, 1.97 s wall time.

These tests are comparison evidence only. Their implementation remains paused
and is not copied into the spike.
