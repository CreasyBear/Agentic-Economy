# Phase 1 final unblock acceptance

## Source verdict

`SOURCE_ACCEPTED_EVIDENCE_OPEN`

The final Phase 1 source repairs are accepted. The three prior blockers are closed in source, every frozen and repair gate remeasures green, the exact Node 22 release is hermetic from a fresh checkout with no prebuilt CLI artifact, and a new Ox Alpha refutation attempt found no present bypass. Phase 2 may start. The remaining hosted/runtime proof is explicitly later-phase evidence, not a Phase 1 source blocker.

## Frozen refs and ancestry

- Branch: `codex/phase-2-unblock`
- Accepted source commit: `ae284871d9d5bad40245182aefd6f2050d53b556`
- Prior rejection/report commit and direct source-repair parent: `7a592ccedefeb2282bbfc1b34b14368012a481b3`
- Repaired candidate before final unblock: `71e2163091ad5cd15259821f82730ebaf6777abf`
- Original repair base: `028d07bba2508f79a6815f47eb7cb4da4484834a`
- Original Phase 1 baseline: `868c2fc673f35340dd2079176ab7f913ca665efb`

Every named baseline is an ancestor of the accepted source commit. The tracked worktree was clean at source review and before the acceptance artifacts were added.

## Exact final repair inventory

The source-repair commit changes exactly 14 files:

1. `src/modules/principal-account/account/convex-schema.ts`
2. `src/modules/principal-account/account/registry.ts`
3. `tools/maturity-reset/legacy-identity-reset.ts`
4. `tools/maturity-reset/public.ts`
5. `tests/imports/operation-product-legacy-independence.test.ts`
6. `tests/imports/support/operation-product-dependency-closure.ts`
7. `tests/maturity/leaf-P1-02.test.ts`
8. `tests/maturity/leaf-P1-04.test.ts`
9. `tests/review/phase-1-release-import-closure.test.ts`
10. `tests/review/phase-1-reset-forged-receipt.test.ts`
11. `tests/review/phase-1-reset-lying-execution-port.test.ts`
12. `tests/review/phase-1-succession-missing-attribution.test.ts`
13. `tests/unit/principal-account/account/account-registry.test.ts`
14. `tests/unit/principal-account/workload-context/legacy-identity-reset.test.ts`

No Phase 2 production code is included.

## Repair findings and closure

### B1 — succession authority and attribution

Verified participant approvals now carry immutable creation time and action context. Registration validates canonical creator/account context, requires the creator to be the participant, checks the creator is active, binds creation time to the freeze/verification interval, and rejects duplicate participant, verification, and creation-idempotency identities. Succession authorizations and participant records retain the validated registration context plus the frozen policy and Account revisions.

The trusted approval source remains transaction-owned. Registration and consumption continue to bind Account, incumbent, successor, policy revision, Account revision/freeze, delay, expiry, lifecycle, threshold, and CAS replacement. The active-stranger, cross-Account, lifecycle/race, no-transfer, stale-policy, duplicate, inactive, replay, and strict-expiry attacks remain rejected.

### B2 — reset execution, replay, and attribution

The reset contract now separates mutation, durable evidence, and reconciliation into three required capabilities and rejects missing/malformed or same-object aliases. Apply and replay require a canonical action context. Receipt and durable execution must match the exact digest, execution, transaction, removal set, creation time, and full action attribution.

Success additionally requires one independently obtained reconciliation snapshot containing every legacy target and protected canonical table in exact order. All target counts must be zero and every canonical count must equal the plan snapshot. Forged receipt/execution pairs, live-count contradictions, partial/retry/mismatch cases, replay drift, and canonical drift cannot return removed facts.

### B3 — hermetic transitive CLI closure

The production legacy-independence gate now invokes esbuild with `write:false` and `metafile:true` using the CLI's real entrypoint, bundling mode, platform, format, target, and tsconfig. The prohibition is applied to every transitive input. A synthetic clean CLI entrypoint that imports a clean bridge which imports a prohibited legacy module is detected by the production helper.

The release sequence is unchanged: it builds the CLI at `test:cli-package`, packs it, installs the tarball, checks package/bin identity, byte-compares installed and freshly built executables, and exercises CLI help before success.

## Measured evidence

| Measurement | Result |
|---|---:|
| Repair leaf gates | 20/20 |
| Repair integration gates | 9/9 |
| Frozen Phase 1 gates | 34/34 |
| Operational `ABANDON:` | 0 |
| Exact combined Phase 1 suite | 122/122 in 10 files |
| Focused acceptance reproducers | 7/7 in 5 files |
| Schema + Phase 1 integration | 14/14 |
| Import boundary / transitive closure | 29/29 |
| Account targeted coverage | 357/357 statements; 224/224 branches; 73/73 functions; 332/332 lines |
| Reset targeted coverage | 166/166 statements; 196/196 branches; 48/48 functions; 151/151 lines |
| Schema inventory | 63 tables; all 9 principal/Account tables present |
| Convex authz four-shape scan | 0 candidates after foundation check |
| Lint / typecheck / diff | pass / pass / pass |

The raw Phase 1 suite covers principal lifecycle, Account lifecycle/succession, credential rotation and principal-generation mutation, explicit workload context/no-superuser behavior, reset planning/execution/replay, schema composition, and integration. The review reproducers are now safety assertions rather than accepted exploits.

## Fresh hermetic release

A genuinely fresh checkout at `ae284871d9d5bad40245182aefd6f2050d53b556` was installed with `npm ci`. `packages/cli/dist` was absent before frozen G3 and remained absent after G3 passed 29/29. No manual CLI build was run.

Using a supported local-only Convex deployment configuration and placeholder Clerk issuer, the unchanged Node 22 `npm run test:release:source` passed end to end:

- conformance 421/421 and chat conformance 85/85;
- unit 2,577/2,577 and integration 570/570;
- type 4/4, imports 29/29, standards 1/1, SEO 32/32, UI contract 1/1;
- browser E2E 20/20, accessibility 10/10, paid-operation 7/7;
- packaged CLI `CLI_PACKAGE_PASS`;
- maturity/coverage 2,781/2,781 across 403 files and `COVERAGE_RATCHET_PASS files=708`;
- generated-source integrity, maturity release integrity, and final production build.

The release itself created `packages/cli/dist/ae.js` only at its declared package-test position. The deciding checkout remained tracked-clean.

## Independent Standards and Spec axes

The previously preserved independent Standards axis identified missing creation attribution on succession authority and reset evidence as hard findings; both are now closed by required validators, exact persistence, and negative tests. Its raw-reference/value-object judgment remains non-blocking because every security-relevant reference is pattern-validated and exact-bound at the acceptance boundary; it creates no present bypass.

The independently preserved Spec axis identified same-port reset collusion and source-only CLI scanning. Both are closed: the reset requires three distinct capabilities plus independent state reconciliation, and the CLI gate analyzes the actual bundled transitive input graph with the synthetic counterexample enforced.

## Ox Alpha attribution

The first new process attempt received provider 429 before inspection and was discarded. The deciding process used the installed `ox-alpha` profile, `stealth/ox-alpha` model, read-only sandbox, approval `never`, candidate worktree cwd, and an ephemeral session. It exited 0 after 44,670 reported tokens.

Ox independently verified the exact refs, ancestry, clean state, 14-file inventory, and all three trust boundaries. It returned B1 PASS, B2 PASS, B3 PASS, regression PASS, found no semantically false green gate, and recommended `SOURCE_ACCEPTED_EVIDENCE_OPEN`. The full prompt and complete attributed answer are preserved in `phase-1-unblock-ox-alpha-prompt.md` and `phase-1-unblock-ox-alpha.md`.

## Open external evidence

These are not current Phase 1 source defects and do not block Phase 2:

- Hosted Clerk/cloud authorization and isolation proof — owning later hosted/cloud gate.
- Live Convex reset mutation/evidence/reconciliation adapter and real deletion/replay proof — owning migration/runtime gate.
- Production cross-surface Account/context wiring — Phase 2 integration gate, including P2-02.

If later wiring supplies colluding or incorrectly owned adapters, bypasses the typed context, or fails hosted isolation, that later gate must fail closed. The present Phase 1 source does not create such a bypass.

## Exact handoff

Accepted source: `ae284871d9d5bad40245182aefd6f2050d53b556`.

Verdict: `SOURCE_ACCEPTED_EVIDENCE_OPEN`.

Phase 2 is unblocked and may start from the committed acceptance ref. No Phase 2 implementation was started by this task.
