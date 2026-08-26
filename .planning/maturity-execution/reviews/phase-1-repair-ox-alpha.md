# Ox Alpha attributed output — Phase 1 repaired source acceptance

- Process: independent `codex exec --ephemeral`
- Candidate cwd: `/Users/joelchan/.codex/worktrees/7cf7/Agentic-Economy`
- Candidate HEAD reviewed: `71e2163091ad5cd15259821f82730ebaf6777abf`
- Session: `01a03980-46c2-7351-a2fb-5bb64a927b53`
- Profile/model: `ox-alpha` / `stealth/ox-alpha`
- Provider: `openrouter`
- Sandbox: `read-only`
- Approval: `never`
- Reasoning effort: `low` (bounded retry after high/medium sessions exhausted provider limits before returning a verdict)
- Prompt: `phase-1-repair-ox-alpha-prompt.md`
- Command: `codex -p ox-alpha -c model_reasoning_effort=low -s read-only -a never -C /Users/joelchan/.codex/worktrees/7cf7/Agentic-Economy exec --ephemeral --color never -o .planning/maturity-execution/reviews/phase-1-repair-ox-alpha.md -`
- Completion: exit 0; 93,315 tokens reported by Codex CLI

The content below is the complete final attributed answer written by the independent process.

---

**Verdict**
- Refs/ancestry verified: HEAD `71e2163091ad…`, branch `agent-p1-01-principal`; repair base and Phase 1 baseline are ancestors. Inventory is exactly 23 changed files; all exist at HEAD. Candidate tracked source/gates have no working-tree drift. Two untracked review-owned tests are outside candidate evidence.

**B1 — Account Succession: PASS**
- Fabricated caller authorizations fail: registration resolves approvals only through trusted transaction storage (`src/modules/principal-account/account/registry.ts:443-460`, `1061-1092`).
- Approvals are bound to account, incumbent, successor, policy/freeze revision/time, active unique participants, unique verification refs, threshold, delay, expiry, and strict freeze state (`registry.ts:412-495`, `1071-1089`).
- Consumption revalidates all bindings, strict timing, lifecycle, threshold bounds, then atomically replaces account, ownerships, and authorization with consumed attribution (`registry.ts:791-864`, `1095-1131`). Replay yields `succession_authorization_consumed`.
- Residual hardening opportunity (not a present bypass): the source does not reject multiple active authorizations for the same frozen revision. They cannot be replayed because consumption mutates the account revision, but a uniqueness invariant would make that property structural rather than incidental. Severity: informational / future-phase hardening.

**B2 — Reset Replay: PASS**
- A shape-valid receipt is never proof: both apply and replay call `readTrustedExecution` and fail `reset_receipt_untrusted` if absent (`tools/maturity-reset/legacy-identity-reset.ts:170-194`).
- Trusted execution must match digest, execution ref, transaction ref, removed facts; targets must reconcile to zero; all six canonical counts must match the independently measured plan snapshot (`legacy-identity-reset.ts:204-230`). The forged-receipt exploit now fails closed.
- Same-port collusion remains possible only by also forging the adapter-owned trusted ledger plus live post-state—the abstraction correctly treats that as a distinct trusted capability. Live Convex adapter remains open external evidence, not a current source defect.

**B3 — Hermetic Release: PASS**
- The old test required ignored `packages/cli/dist/ae.js`. The repaired test scans tracked CLI/MCP/HTTP sources including `tools/ae/cli.ts` (`tests/imports/operation-product-legacy-independence.test.ts:5-28`) and no longer depends on an ignored build artifact.
- The packaged CLI remains separately built, packed, installed, byte-compared, and exercised later in release via `test:cli-package` (`package.json`: `prepack`, `test:cli-package`, release ordering). This narrows the import test’s scope to source-level legacy imports; it does not weaken the package proof because that proof still runs explicitly.
- Deleting `packages/cli/dist` does not affect the repaired G3 path.

**Gate Semantics**
- All B1/B2/B3 green repair gates are semantically true at source level.
- Frozen Phase 1 gates remain true subject to their already-declared external evidence boundaries: hosted Clerk/cloud authorization, live deletion adapter/replay, and production cross-surface wiring.

**Open Evidence (not current source defects)**
- Live durable deletion adapter proving atomic delete + ledger + hosted replay.
- Hosted Clerk/cloud deployment authorization and isolation behavior.
- Production cross-surface wiring in P2-02.

**Recommendation: SOURCE_ACCEPTED_EVIDENCE_OPEN**
