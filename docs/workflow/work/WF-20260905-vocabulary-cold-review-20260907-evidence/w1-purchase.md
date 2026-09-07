# Wave 1 purchase / Quote→Call cold audit

Scope: read-only review of the current Tool→Quote→Call purchase path at HEAD
`a51e17b22` (source vocabulary refactor `3770b43ba`). Inspected:
`src/modules/capability-execution` purchase contracts/actions and route callers;
`convex/capabilityQuotes.ts`, `convex/capabilityCalls.ts`; and
`convex/lib/callLifecycle/{admission,authorityHandlers,callActions,contracts,dispatch,reconciliation,workComplete}.ts`.
Also traced the treasury observation adapter and relevant schema/docs. No files
outside this report were changed. No tests, compiler, or live deployment checks
were run, per the cold-audit constraint.

## Confirmed findings

### P2 — a second treasury observation disables all managed-x402 Quotes for an environment

- **Evidence:** `convex/capabilityQuotes.ts:286-291` queries
  `moneyTreasuryObservations` by environment, orders newest first, takes two,
  then sets `observation` only when `observations.length === 1`. The same
  function computes the x402 treasury subject from that value at
  `convex/capabilityQuotes.ts:297-325`. When live inspection observes an x402
  requirement but this value is absent, the public Quote action unconditionally
  refuses with `treasury_capacity_unavailable` at
  `convex/capabilityQuotes.ts:718-719`.
- **Trigger:** any routine refresh that leaves two rows in one environment.
  `convex/moneyTreasury.ts:41-72` is append-only: it deduplicates only by
  `observationRef` and inserts a new row for every new observation. The
  operating guide explicitly directs operators to “record a fresh custody
  observation” (`docs/guides/package-4-operations.md:104-112`). A second row
  therefore makes `prepareFinancialSubjects` omit treasury capacity, and every
  managed-x402 Quote in that environment fails even if the newest observation
  is healthy and has sufficient spendable units.
- **Impact:** the terminal refusal is retryable, but retrying without an
  operator deleting/repairing historical rows cannot succeed. This blocks the
  normal Quote→Call chain for the environment and can strand an otherwise
  usable corporate treasury. It also conflates “multiple historical
  observations” with “ambiguous active custody”.
- **Minimal correction:** resolve one active custody identity/generation first,
  then select the newest valid observation for that identity (or maintain an
  explicit current-observation projection). Preserve fail-closed behavior when
  multiple active custody identities are genuinely present; do not use row
  count as the freshness/ambiguity test.
- **Provenance:** the query and append-only observation behavior predate the
  current source refactor (`81da40217` / earlier Package 4 cutover), so this is
  a retained current-cutover defect rather than a refactor-only regression.
- **Counterevidence/qualification:** the historical production census had zero
  treasury rows and intentionally kept production x402 fail-closed. This finding
  applies once an environment is activated and observations are refreshed, which
  the current operating guide and schema support.

### P2 — the repository has no runtime path from the CDP treasury observer to the observation table

- **Evidence:** `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts:192-260`
  exports `observeCdpX402Treasury`, which reads the configured CDP wallet and
  returns a bounded observation. Repository-wide references show only that
  definition and its unit test; no Convex action, cron, route, or workflow calls
  it. The only writer for `moneyTreasuryObservations` is the internal mutation
  `convex/moneyTreasury.ts:9-72`, and no production function invokes that
  mutation either.
- **Trigger:** a fresh deployment or an activated environment with a configured
  CDP wallet but no manually pre-seeded `moneyTreasuryObservations` row.
  `capabilityQuotes.quote` first performs live x402 inspection, then
  `prepareFinancialSubjects`; with no observation, the guard at
  `convex/capabilityQuotes.ts:718-719` refuses `treasury_capacity_unavailable`.
  Thus the implemented CDP read capability cannot make the Quote→Call path
  usable by itself.
- **Impact:** managed-x402 purchases remain permanently unavailable until an
  out-of-band operator writes an internal table row. That undermines the
  documented stale/low treasury recovery step (“record a fresh custody
  observation through the existing adapter”) and makes normal balance refresh
  impossible through the application boundary.
- **Minimal correction:** add a bounded internal action/workflow that invokes
  the observer, validates the returned evidence, and calls
  `moneyTreasury.recordObservation` with a stable observation reference; expose
  only the intended operator/scheduler entrypoint and retain fail-closed
  behavior on observer failure. Coordinate this with the multiple-observation
  selection fix above.
- **Provenance:** the observer and writer were introduced in the earlier Package
  4 cutover and survived the current source refactor; this is a missing
  integration path, not caused by `3770b43ba`.
- **Counterevidence/qualification:** this may be intentionally deferred because
  the product charter says production seller identity and related activation
  work remain explicit implementation work. If treasury rows are populated by
  an external deployment process outside this repository, verify that process
  before classifying the gap as release-blocking; no such process is present in
  the inspected source/docs.

## Unverified leads / coverage limits

- `convex/capabilityQuotes.ts:812-831` checks Quote expiry before replaying a
  consumed Quote. A retry of an already accepted Call after the Quote expires
  may therefore return `invocation_not_current` instead of the existing Call
  result, despite the historical gateway contract describing same-key replay.
  Product text also requires an unexpired Quote for Call, so this needs an
  explicit contract decision and a focused test before filing as a defect.
- The owner status projection synthesizes `version: Date.now()` for
  reconciliation-required results (`convex/lib/callLifecycle/callActions.ts:199-211`)
  and does not accept `afterVersion` on the owner path. This is low-impact and
  may be deliberate because owner UI polling has no unchanged-status contract.
- The list handler filters rows after a credential-indexed Convex page
  (`callActions.ts:64-94`); this is safe only while credential identity is
  globally stable. I found no current source path that reuses a credential for
  different principal/application/environment, so this remains a verification
  gap rather than a finding.

No test or compiler commands were run. Live Convex scheduling, deployment
configuration, and any external treasury-ingestion process remain unverified.
