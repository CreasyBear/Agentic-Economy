# Ox Alpha attributed output — Phase 1 unblock source acceptance

- Process: independent `codex exec --ephemeral`
- Candidate cwd: `/Users/joelchan/.codex/worktrees/7cf7/Agentic-Economy`
- Candidate HEAD reviewed: `ae284871d9d5bad40245182aefd6f2050d53b556`
- Profile/model: `ox-alpha` / `stealth/ox-alpha`
- Provider: `openrouter`
- Sandbox: `read-only`
- Approval: `never`
- Reasoning effort: `low`
- Prompt: `phase-1-unblock-ox-alpha-prompt.md`
- Command: `codex -p ox-alpha -c model_reasoning_effort=low -s read-only -a never -C /Users/joelchan/.codex/worktrees/7cf7/Agentic-Economy exec --ephemeral --color never -o /tmp/phase-1-unblock-ox-alpha-final.txt -`
- First attempt: provider `429 Too Many Requests` before inspection; discarded as non-evidence.
- Deciding attempt: exit `0`; `44,670` tokens reported by Codex CLI.

The content below is the complete final attributed answer written by the deciding independent process.

---

All three repair surfaces have been attacked at their actual trust boundaries. Verdict follows.

**1. Freeze Verification**
- `HEAD`: `ae284871d9d5bad40245182aefd6f2050d53b556`, branch `codex/phase-2-unblock`; tracked worktree clean.
- All five supplied commits are ancestors of `HEAD`; exact expected source-repair HEAD matches.
- Final unblock inventory is exactly 14 files: 2 B1 source files (`src/modules/principal-account/account/convex-schema.ts`, `src/modules/principal-account/account/registry.ts`), 2 B2 source files (`tools/maturity-reset/legacy-identity-reset.ts`, `tools/maturity-reset/public.ts`), and 10 test files for B1/B2/B3. Full repaired-source diff spans 31 files.

**2. Attack Results**
- B1 succession — PASS. Approval source is resolved only through `transaction.getVerifiedRecoveryParticipantApproval`, then structurally bound to Account, incumbent, successor, policy revision, frozen revision/time, active principals, unique participant/verification/idempotency refs, and threshold count (`src/modules/principal-account/account/registry.ts:1080-1127`, mint path `registry.ts:435-509`). Authorization consumption revalidates all bindings, delay, strict expiry, lifecycle, and consumes via revision-pinned replacement inside one transaction (`registry.ts:801-884`). No caller-supplied structural approval substitute exists.
- B1 attribution — PASS. `createdAt`/`createdBy` are validated, frozen, inserted on creation, carried into replacements, and consumed-state attribution is bound (`registry.ts:476-494`, `registry.ts:866-884`).
- B2 reset replay/forgery — PASS. Receipts cannot attest deletion alone: execution must be independently resolved from the evidence ledger by exact execution/transaction refs, then matched on digest, removed facts, post-state counts, timestamp, and full action context; reconciliation uses a separate snapshot port with distinct object identity from mutation/evidence ports (`tools/maturity-reset/legacy-identity-reset.ts:197-238`, `assertIndependentPorts` at `legacy-identity-reset.ts:398-420`). Replay requires the identical context and still passes trusted reconciliation. Zero target counts and unchanged canonical counts are checked from that snapshot (`legacy-identity-reset.ts:262-310`).
- B2 abstraction aliasing — PASS at source-contract level. Object identity separation plus required distinct methods blocks direct same-object renaming. A malicious host could still proxy-wrap distinct objects, but that assumes compromise of the injected trusted adapters themselves; the deferred live Convex adapter owns that boundary.
- B3 hermetic release proof — PASS. The metafile scanner invokes real esbuild bundling of `tools/ae/cli.ts` with the same production-relevant options (`platform`, `format`, `target`, bundle, tsconfig) as `scripts/build-cli.mjs`; only non-closure-affecting output options differ. The synthetic reproducer exercises transitive legacy import detection, and release still runs `build:cli`, `npm pack`, install, byte comparison, and CLI execution via `scripts/test-cli-package.mjs`. No ignored-artifact dependence remains.
- Regression attacks — PASS at inspected boundaries. Active-principal checks, revision-pinned counterparty/account state, context validation, transaction CAS revisions, and protected canonical targets are present in the relevant paths.

**3. Gate Truth**
- B1, B2, B3 repair gates and frozen Phase 1 gates are semantically true for current source. I found no green claim contradicted by code.

**4. Open External Evidence**
- Hosted Clerk/cloud proof remains later-phase evidence.
- The live Convex reset mutation/evidence/reconciliation adapter remains deferred; current abstraction does not itself create a bypass.
- Production cross-surface wiring remains later phase.

**5. Recommendation**
- `SOURCE_ACCEPTED_EVIDENCE_OPEN`
