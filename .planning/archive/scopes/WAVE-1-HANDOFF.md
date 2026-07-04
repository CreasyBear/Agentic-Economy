# Wave 1 handoff — Scope 2 02-01 + Scope 3 03-01

**Date:** 2026-07-04

## Status

Wave 1 source-local work is complete for:

- Scope 2 / 02-01 capability model.
- Scope 3 / 03-01 kernel acquisition + Convex runtime spike.
- Wayfinder map issue #1 body now includes Scope 2 decisions #9-#15 and Scope 3 decisions #16-#17.

Production/deployed proof is **not** claimed. Scope 1 deployed/provider evidence remains blocked on user-provisioned inputs in `.planning/scopes/scope-01-production-landing/EVIDENCE-deploy-smokes.md` and issue #5.

## Scope 2 evidence

Artifact: `.planning/scopes/scope-02-capability-registry/02-01-SUMMARY.md`.

Source-local decisions now recorded:

- #9 cron → internal Convex action → mutation, bounded GET/HEAD, SSRF hardening, scheduler retryAfter, no bespoke queue.
- #10 domain-control proof uses signed AE challenge token at `/.well-known/ae-challenge`; DNS TXT only fallback.
- #11 AE-held claimed facts beat business-origin manifest conflicts; clearing `contradicted` requires owner reconfirmation plus later passing check.
- #12 keep v1 `businessCapabilities` plus retained `serviceCapabilities`; no premature fold.
- #13 `operationMode` is self-declared disclosure, not a trust upgrade.
- #14 `ae-endpoint-check:v1` source-local constants are 24h/24h/1h/null freshness windows, 5s timeout, 256KiB cap, 5m/30m/2h backoff.
- #15 `capability` is optional hard filter; locality remains hard only for location-bearing supply and ranking/context for location-neutral capability kinds.

Verified after wave merge:

```text
npx vitest run tests/unit/capabilities tests/types/capability-contracts.test.ts
# 3 files, 12 tests passed

npm run test:ts-standards
# 1 file, 1 test passed
```

Additional earlier wave checks recorded in `02-01-SUMMARY.md`:

```text
npm run typecheck
# PASS
```

## Scope 3 evidence

Artifact: `.planning/scopes/scope-03-handshake-identity-clearance/03-01-SUMMARY.md`.

Source-local decisions now recorded:

- #16 exact-pinned `handshake-protocol-kernel@0.4.0`; no vendored runtime dist copied; root + `/adapter-sdk` resolve; forbidden x402/MCP/http/customer-edge imports are scan-quarantined.
- #17 verdict is `FALLBACK`: full kernel-in-one-Convex-mutation PASS is not proved because npm root does not export self-hosted `HandshakeKernel` and bundles Hono; source-local spike proves real Convex internal mutation crypto/zod/deterministic-hash/root-export evidence and real Convex internal action → terminal internal mutation single-use replay refusal.

Verified after wave merge:

```text
npx vitest run tests/spike/handshake-convex-runtime.spike.test.ts
# 1 file, 5 tests passed
```

Additional earlier wave checks recorded in `03-01-SUMMARY.md`:

```text
npm run check:convex-codegen
# PASS
npm run test:imports
# PASS
npm run test:source-mining
# PASS
npm run typecheck
# PASS
```

## Gate adaptation outputs

Artifacts produced after Wave 1:

- `.planning/scopes/PM-03-launch-wedge-lock.md` — **PM-03 GO**. V1 launch wedge is solo AU home/trade service owners in one metro and 2-3 urgent trades; schemas remain wedge-agnostic.
- `.planning/scopes/PM-05-trust-language-red-team.md` — **PM-05 ADAPT**. Public/demo copy and assistant-visible descriptors remain blocked until rename/scan additions are applied and three uninvolved reviewers pass the PM-05 questions.
- `.planning/scopes/scope-02-capability-registry/S2-G3-wedge-agnostic-contract-pack.md` — **S2-G3 GO for source-local 02-02/02-04 consumption**. The capability-table contract includes allowed generic fields, forbidden local-service fields, fixture matrix, and invariant test targets.
- `.planning/scopes/scope-03-handshake-identity-clearance/S3-identity-preflight.md` — **S3-G2 ADAPT / S3-G4 GO**. 03-02 Task 1 may consume exact-pinned `web-bot-auth@0.1.3`, OpenAI-only initial `ALLOWED_AGENTS`, AE-owned policy checks, and the narrow OpenAI `pretrusted_directory_origin` exception; `agentIdentity` may be threaded only as attribution/quota/audit data.

Additional source-local action completed for Scope 3:

- `package.json` / `package-lock.json` now exact-pin `web-bot-auth@0.1.3`.
- GitHub issue #19 is closed with a resolution comment, and map issue #1 includes the Scope 3 WBA decision line.
- `npm run typecheck` passed after the package pin.

## Current blockers

- Scope 1 deployed/provider evidence: issue #5 remains open; no deployed smoke evidence captured in `EVIDENCE-deploy-smokes.md`.
- PM-01 owner pull: no current artifact proving 20 contacted / 5 claimed / 3 response commitments. This still blocks product/supply claims and deeper S2-S5 product proof.
- PM-02 assistant distribution: no current artifact proving two target assistant/search surfaces discover/cite AE with boundary wording preserved. This still blocks discovery/public-posture/readback/propose expansion.
- PM-04 owner replay: no current artifact proving a real owner/business will replay the thread/receipt demo. This still blocks Scope 4 04-02+ and Scope 5 05-02+ product-demo proof.
- PM-05 remains ADAPT, not GO. Public/demo copy and agent descriptors must first apply the rename/scan rules and pass real reviewer evidence.

## Next safe wave

- Source-local 03-02 Task 2/3 may proceed only under the S3 preflight constraints: identity is not authority, OpenAI-only initial trust anchor, no public Handshake vocabulary, and no new assistant verbs.
- Scope 2 02-02 may proceed only if the orchestrator accepts source-local table work while PM-01/PM-02 remain unproven; it must consume PM-03 GO and S2-G3 GO, add no public copy, and keep deployed/provider proof unclaimed.
- Scope 4 and Scope 5 implementation beyond decision/preflight artifacts remains blocked by PM-01/PM-02/PM-04 and the scope-local gates named in `PHASED-EXECUTION-PREP.md`.
