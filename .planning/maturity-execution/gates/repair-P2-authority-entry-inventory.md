# Gates: Phase 2 authority-entry inventory and classification

Scope: Freeze every registration/runtime/edge identity, exemption, seam, owner, test and rollback fact before production migration.

- [x] G1: A TypeScript parser plus symbol resolution enumerates every ordinary, Generic, typed, aliased and factory-produced Convex registration with zero unresolved forms.
  CHECK: cd ../.. && PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npm run test:phase2:registrations -- --inventory-only
  EXPECT: /unresolved=0/
  EVIDENCE: 2026-08-26 — Node 22 focused suite passed 14/14 hostile identity and provenance tests; production scan printed registrations=298 files=52 public=119 internal=172 http=7 ordinary=208 generic=90 unresolved=0 duplicate=0.

- [x] G2: The observed direct baseline reconciles 298 declarations across 52 files into 119 public, 172 internal and seven HTTP rows without treating that lower bound as completeness.
  CHECK: cd ../.. && jq -e '.counts.direct == 298 and .counts.files == 52 and .counts.public == 119 and .counts.internal == 172 and .counts.http == 7 and .counts.unresolved == 0' .planning/maturity-execution/contracts/phase-2-convex-registration-migration.json >/dev/null && echo INVENTORY_COUNTS_FROZEN
  EXPECT: INVENTORY_COUNTS_FROZEN
  EVIDENCE: 2026-08-26 — `phase-2-convex-registration-migration.json` freezes exact declaration identities, spans and digests at 298/52/119/172/7, including 208 ordinary, 90 Generic and the five typed declarations missed by 203.

- [x] G3: Every syntax row joins to reviewed runtime row(s), adapter mode, protection/exemption/dev classification, structural capability contract, test cases, owner leaf and rollback unit.
  CHECK: cd ../.. && PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npm run test:phase2:registrations -- --require-classified
  EXPECT: /classified=.* unresolved=0 duplicate=0/
  EVIDENCE: 2026-08-26 — 298/298 rows classified with zero classification uncertainty. The checker independently recomputes the classification digest and all 59 declared source digests, and requires every non-empty runtime reference to exist in the exact frozen runtime namespace; hostile stale-digest and stale-runtime-ref cases fail closed. All 607 source-owned implementation findings remain verbatim as 190 owner-leaf migration obligations. The 128 indirect protected internal targets freeze fail-closed workload admission/current-time revalidation; 32 dormant targets have the exact no-ancestor reason and direct actual-registration tests rather than a fabricated 242-row surface.

- [x] G4: The separate 242/207/35 runtime and 39/14/12 edge namespaces regenerate deterministically with explicit semantic drift, including `runAdmittedAction` symbol identity.
  CHECK: cd ../.. && PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH node tools/maturity/phase-2-protected-surfaces.mjs --check-snapshot && jq -e '.actualCounts.serverFunctions==47 and .actualCounts.publicConvex==119 and .actualCounts.convexHttpActions==7 and .actualCounts.convexHttpRoutes==7 and .actualCounts.crons==10 and .actualCounts.backgroundFamilies==52 and .actualCounts.frozenHttp==39 and .actualCounts.frozenMcp==14 and .actualCounts.frozenCli==12 and ([.backgroundFamilies[].ref|select(.=="run_action:convex/workloadCron.ts:runAdmittedAction")]|length)==1' .planning/maturity-execution/contracts/phase-2-protected-surfaces.json >/dev/null && echo RUNTIME_EDGE_IDENTITIES_FROZEN
  EXPECT: RUNTIME_EDGE_IDENTITIES_FROZEN
  EVIDENCE: 2026-08-26 — Identity-only snapshot SHA-256 c8bd3f987e02923f55966f1fc3000148dc8efdfacc9e4016532f1ad11784f16e regenerated 242 rows (207 protected/35 exemptions) and 39/14/12 edges. The sole dynamic helper is the stable symbol `run_action:convex/workloadCron.ts:runAdmittedAction`; no line fallback remains. Legacy 27-sink references are explicitly non-acceptance evidence.

- [x] G5: Every public, narrow-system and dev-only exemption has an existing policy reference, structural read-only/bounded capability rule and hostile actual-handler test; none is silently excluded.
  CHECK: cd ../.. && PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npx vitest run tests/maturity/phase-2-public-exemptions.test.ts --no-file-parallelism && jq -e '[.rows[]|select(.classification!="protected")] as $rows | ($rows|length)==27 and all($rows[]; (.policyReference|length)>0 and (.handlerContract.capabilities|type)=="array" and (.testCases|length)>0)' .planning/maturity-execution/contracts/phase-2-convex-registration-migration.json >/dev/null && echo EXEMPTIONS_FROZEN
  EXPECT: EXEMPTIONS_FROZEN
  EVIDENCE: 2026-08-26 — 23 hostile exemption tests passed through real Convex registrations/server seams. Contract retains 20 public, five narrow-system and two dev-only rows, their structural capability rules, exact policy/test refs and every remaining implementation obligation.

- [x] G6: Exact per-family seams, disjoint files, driver-only composition files, type/import/bundle/codegen/release impact and rollback/compatibility metadata are frozen in machine-readable artifacts.
  CHECK: cd ../.. && jq -e '.format=="phase-2-authority-entry-migration-plan:v1" and ([.ownerGroups[].registrations]|add)==298 and ([.ownerGroups[].files]|add)==52 and (.driverOnly|length)==14 and (.runtimeFamilies|keys|length)==7 and (.impactGates.release|index("npm run test:release:source"))!=null and .rollback.unit=="one atomic owner wave"' .planning/maturity-execution/contracts/phase-2-authority-entry-migration-plan.json >/dev/null && echo MIGRATION_OWNERSHIP_FROZEN
  EXPECT: MIGRATION_OWNERSHIP_FROZEN
  EVIDENCE: 2026-08-26 — Machine plan freezes Convex A/B/C/HTTP at 108/68/115/7 registrations and 13/17/19/3 files, seven established runtime seams, 14 driver-only paths/patterns, exact type/import/bundle/codegen/release commands, compatibility and rollback rules.

- [x] G7: Hostile inventory fixtures refute the old 203/208 patterns, typed/Generic omissions, aliases, factories, duplicates, large output truncation and silent runtime-row loss.
  CHECK: cd ../.. && PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npx vitest run tests/maturity/phase-2-convex-registration-migration.test.ts --no-file-parallelism
  EXPECT: /14 passed/
  EVIDENCE: 2026-08-26 — 14/14 tests cover ordinary/Generic/typed, import/local aliases, bounded factory, conditional/cast unresolved forms, duplicates, 203/208 and same-count drift, compiler diagnostics, missing runtime join, stale provenance/runtime identities, no dominance claim and deterministic output over 64 KiB. `--discover-refs` emitted a complete 70,700-byte document without forced process exit.

- [x] G8: Four Unlazy passes complete with no additional inventory/classification improvement; worker stops without editing production registrations/handlers or shared driver files.
  CHECK: cd ../.. && git diff --check && echo FOUR_PASSES_RECORDED
  EXPECT: FOUR_PASSES_RECORDED
  EVIDENCE: 2026-08-26 — Pass 1 implemented exact scanner/joins; pass 2 separated classification facts from owned migration obligations; pass 3 fixed compiler/digest/runtime-loss hostility, stable dynamic identity and buffered output; pass 4 normalized formatting/lint/determinism and found no further inventory improvement. Both bounded workers explicitly stopped; production registration/handler edits remained untouched.
