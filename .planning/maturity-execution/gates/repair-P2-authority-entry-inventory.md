# Gates: Phase 2 authority-entry inventory and classification

Scope: Freeze every registration/runtime/edge identity, exemption, seam, owner, test and rollback fact before production migration.

- [ ] G1: A TypeScript parser plus symbol resolution enumerates every ordinary, Generic, typed, aliased and factory-produced Convex registration with zero unresolved forms.
  CHECK: cd ../.. && PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npm run test:phase2:registrations -- --inventory-only
  EXPECT: /unresolved=0/
  EVIDENCE: pending

- [ ] G2: The observed direct baseline reconciles 298 declarations across 52 files into 119 public, 172 internal and seven HTTP rows without treating that lower bound as completeness.
  CHECK: cd ../.. && jq -e '.counts.direct == 298 and .counts.files == 52 and .counts.public == 119 and .counts.internal == 172 and .counts.http == 7 and .counts.unresolved == 0' .planning/maturity-execution/contracts/phase-2-convex-registration-migration.json >/dev/null && echo INVENTORY_COUNTS_FROZEN
  EXPECT: INVENTORY_COUNTS_FROZEN
  EVIDENCE: pending

- [ ] G3: Every syntax row joins to reviewed runtime row(s), adapter mode, protection/exemption/dev classification, structural capability contract, test cases, owner leaf and rollback unit.
  CHECK: cd ../.. && PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npm run test:phase2:registrations -- --require-classified
  EXPECT: /classified=.* unresolved=0 duplicate=0/
  EVIDENCE: pending

- [ ] G4: The separate 242/207/35 runtime and 39/14/12 edge namespaces regenerate deterministically with explicit semantic drift, including `runAdmittedAction` symbol identity.
  EVIDENCE: pending

- [ ] G5: Every public, narrow-system and dev-only exemption has an existing policy reference, structural read-only/bounded capability rule and hostile actual-handler test; none is silently excluded.
  EVIDENCE: pending

- [ ] G6: Exact per-family seams, disjoint files, driver-only composition files, type/import/bundle/codegen/release impact and rollback/compatibility metadata are frozen in machine-readable artifacts.
  EVIDENCE: pending

- [ ] G7: Hostile inventory fixtures refute the old 203/208 patterns, typed/Generic omissions, aliases, factories, duplicates, large output truncation and silent runtime-row loss.
  EVIDENCE: pending

- [ ] G8: Four Unlazy passes complete with no additional inventory/classification improvement; worker stops without editing production registrations/handlers or shared driver files.
  EVIDENCE: pending
