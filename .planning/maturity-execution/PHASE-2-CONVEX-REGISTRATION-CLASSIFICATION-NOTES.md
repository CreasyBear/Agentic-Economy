# Phase 2 Convex registration classification notes

Status: `INVENTORY_CLASSIFICATION_ACCEPTED_IMPLEMENTATION_OBLIGATIONS_RED`

This note accompanies
`contracts/phase-2-convex-registration-classifications.json`. Registration
identity, classification, binding and fixed adapter policy are accepted. It does
not claim control-flow dominance, completed migration obligations, actual-handler
execution, or Phase 2 acceptance.

## Method boundary

- Registration identity comes from the TypeScript `Program`/`TypeChecker` scanner
  and its canonical Convex builder provenance.
- Public and HTTP registrations exact-join by source file and exported symbol to
  the reviewed runtime inventory. The 43 directly registered internal targets use
  only unanimous candidate bindings from those exact runtime rows.
- The other internal registrations are traced through symbol-resolved generated
  `api`/`internal` references and registered ancestors. These paths establish only
  identity reachability; they do not establish order, dominance, or absence of a
  pre-boundary consequence. The 128 unjoined protected internal rows freeze the
  accepted `workload_account` / `protected_workload_account` policy: the admitted
  source must materialize a server-derived durable workload snapshot and the
  target must revalidate it. Caller identity never owns the snapshot and mode is
  never selected dynamically.
- HTTP edge refs are recorded only when the frozen route source's real `Route`
  declaration reaches the registration by symbol identity. MCP and CLI counts are
  not projected onto Convex rows without an exact composition seam.
- Existing exemption tests are retained as `legacy_candidate`. Planned tests name
  the actual registration and required authority/hostile cases, but are not
  represented as executed evidence.

## Measured result

- 298 rows across 52 files: 119 public, 172 internal, seven HTTP.
- 298 rows classified: 271 protected, 20 public-exemption candidates, five
  narrow-system-exemption candidates, and two explicit `dev_only` rows.
- 266 rows have an exact registered runtime ancestor; 32 dormant internal targets
  do not and remain runtime-empty with the reviewed fail-closed reason.
- 43 internal rows join directly to 50 cron/background runtime rows. The remaining
  129 internal rows retain exact caller/ancestor metadata. The 128 protected rows
  use the fixed accepted workload policy; the remaining row is explicit
  `dev_only`.
- Handler closure shape is 117 inline q/m/a handlers plus seven inline HTTP
  handlers, represented together as 124 `inline` rows, 50 same-file named
  handlers, and 124 imported named handlers. Imported closures remain red under the accepted
  design until a locally inspectable structural capability closure exists.
- Ownership is disjoint: Convex A 108, Convex B 68, Convex C 115, HTTP seven.
- Classification has zero unresolved rows. Source migration remains red through
  607 exact obligations on 190 rows; every prior finding is preserved verbatim and
  assigned to its owning leaf.

## Explicit red categories

`unresolvedReasons` is empty because no registration identity or classification
fact is missing. Exact findings now live in deterministic `migrationObligations`
arrays with their owner leaf. The principal obligations remain imported-handler
capability closure, workload snapshot materialization and target revalidation,
structural proof for public/narrow-system exemptions, and production exclusion for
the runtime-reachable `devSeed` registration. These are source-owned migration
gaps, not hosted/external evidence, and their runtime leaves remain red.

## Four passes

1. Implementation pass: moved every finding verbatim to an owned, deterministic
   migration obligation and reserved `unresolvedReasons` for missing classification
   identity only.
2. Expert pass: froze every unjoined protected internal row to the accepted fixed
   workload policy without inheriting caller identity or choosing mode dynamically.
3. Defect pass: verified all 32 dormant internal rows stay absent from the runtime
   namespace and carry the exact reviewed fail-closed reason.
4. Polish pass: normalized obligation ordering, recomputed counts and digests, and
   remeasured finding preservation and owner coverage.

Explicit stop: this repair edited only the owned classification contract and this
note; it edited no production source, tests, tools, package files, generated files,
gates, ledgers, or other contracts.
