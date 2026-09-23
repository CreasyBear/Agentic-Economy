# Admin console RFC review: seven-lens gate

Date: 22 September 2026  
Reviewed: `docs/designs/2026-09-22-admin-console-rfc.md` at `aa745c9c2`  
Method: non-interactive review of the full RFC, `agent://SchemaFacts?q=.report`, 14 repository citations and five external references.

## 1. Design-review — PASS

**RFC:** lines 6, 12, 18-31, 275-290.

The unifying idea is clear: the object is the unit of work; search finds it, the object page explains it, exceptions prioritize it, and Audit proves it. This is not a feature list. F1 is a credible minimum for one operator: exact search, one Call object and paginated Audit. F2/F3 are explicit later waves. The non-goals remove generic CRUD, identity, money commands, incidents, collaboration and raw-row editing, and the risk section protects those cuts.

**Exact change:** none.

## 2. Type-driven-designer — FIX (blocking)

**RFC:** lines 115-174, 177, 198, 239, 289, 297.

The object/view/exception unions are closed; refs are branded; `AdminException` has no optional soup; parser totality is promised; and `AdminPermission = AdminAction` matches the matrix key type. The command result is not closed or state-safe: success `code` and parse failure `code` are strings, `AdminCommandOutcome<T>` can return any read model, refusal alone has an optional audit ID, and a replay changes `kind` instead of returning the original outcome. The RFC also requires selected actions to have a second approver but defines no proposal state.

**Exact change:** replace local ref brands with canonical public types/parsers (and add a total Provider-slug parser); make parse/error/success codes literal unions; replace `AdminCommandOutcome<T>` with an action-indexed receipt union whose variants have no optional fields; and add a closed approval union (`not_required | awaiting_second_approval | approved | expired | refused`) carrying proposal ref, command digest, distinct proposer/approver refs and expiry. Do not add a Purchase-resolution action while it remains outside the six-action scope.

## 3. Module-secret-auditor — FIX (blocking)

**RFC:** lines 84-92, 181, 203-208.

The intended secret is good: translation of heterogeneous domain facts into stable operator projections and commands. The RFC does not protect it. It names both `src/modules/admin-console/internal` and `convex/lib/adminConsole` as owners of joined reads, never forbids imports from other modules' `internal/` paths, and proposes a thirtieth module although `tests/imports/module-boundaries-ratchet.test.ts:27-38` pins 29 and may only decrease.

**Exact change:** declare one ACL owner for raw Convex rows and immediate translation; prohibit `admin-console` imports from every `@/modules/*/internal/*`; consume only declared public entry surfaces; never export `Doc<>` or source DTOs; add an import-boundary assertion. Since this is an application adapter rather than a source-data domain, place its contracts/projections under `src/lib/operator/admin-console/`, or name the module retired in the same change so the module ratchet does not rise. Remove the duplicate join owner.

## 4. Bounded-context-auditor — NOTE (non-blocking)

**RFC:** lines 82-92, 98-109, 283-290.

“Platform operations” is a coherent downstream operational language, not an owner of Calls, money, supply, identity or audit. The no-`adminObjects`/no-`adminCases` decision and read-only projections prevent a god data model. Calling this a bounded context overstates it; it is an ACL/application service spanning established contexts.

**Exact change:** rename section 6 to “Application adapter and context map” and state that source domains own lifecycle and writes while this adapter owns only parsing, orchestration and projections.

## 5. CQS-auditor — FIX (blocking)

**RFC:** lines 76-79, 165-168, 181, 232-233.

N3 correctly bans writes, nonces and audit rows in queries, but the search threat control says successful and denied reads are audited. That is a concealed write. `AdminCommandOutcome<T>.value` also permits a mutation to return a joined read model. No `mark viewed` command exists, which is correct. `annotate_triage` is described as available to Support (line 239) but is not one of the six exposed actions.

**Exact change:** remove durable read-audit writes from queries; keep privacy-safe lookup analytics at the server telemetry boundary. Commands return only an action-specific receipt/effect refs and the cached command outcome; object state is re-read through a query. Say Support is read-only in alpha and `annotate_triage` remains unexposed.

## 6. Idempotency-guardian — FIX (blocking)

**RFC:** lines 161-168, 187-198, 232, 263, 289, 297.

The RFC does not paper over the existing gap: it correctly requires all six mutations to converge on `operationKeys`. However, `by_actor_operation_key` already exists (`src/modules/observability/internal/schema.ts:49-65`), so it must be reused, not added. Same-key/same-hash replay currently returns a different `replayed` envelope rather than the original stored outcome. The proposed distinct-second-owner policy has no idempotent propose/approve transition.

**Exact change:** specify atomic claim/effect/audit/result persistence for each of the six actions; cache the complete first outcome and return it byte-for-byte on same material; refuse changed material; bind scope, actor, action, key and request hash. Define idempotent proposal and approval keys, digest equality, expiry, distinct active approver, concurrent-approval behavior and terminal replay before enabling any two-person action.

## 7. Error-strategist — FIX (blocking)

**RFC:** lines 189-198, 241-253.

Refusals are values and unexpected invariant/render faults reach Sentry at the correct boundary. Expected unavailable/not-configured states remain typed. The action table is not exhaustive: “existing admin refusals,” “plus MFA” and “commercial-policy refusals” are prose sets, while several real source-write, authority, authentication and commercial-policy codes are omitted. There is no stable refusal-code-to-copy mapping. “Unexpected storage” also needs an explicit unknown-outcome guarantee after a transaction may have committed.

**Exact change:** publish `AdminRefusalCodesByAction` as literal sets derived into the closed union; map every code to retryability, effect certainty, operator copy and one next step; reserve throws for invariant/programmer faults and unexpected infrastructure faults; define pre-commit failure versus commit-unknown handling, with correlation/Audit recovery. Keep refusals out of Sentry and unexpected faults inside the existing boundary.

## Citation audit

Fourteen `path:line` citations were spot-checked; ten were correct. Wrong or stale:

1. RFC 187: `convex/businesses.ts:318-391` misses the handler/replay at 133-285 and extends past the 361-line file.
2. RFC 187: `convex/security.ts:354-389,461-480,502-519` is beyond the current 336-line façade; implementations live in `securityAdminMembership.ts` and `securityRemovalDisputes.ts`.
3. RFC 187: `convex/capabilitySupply.ts:752-829` is beyond the current 194-line façade; the handler is `convex/lib/capabilitySupply/sourceAuthority.ts:7-91`.
4. RFC 187: `convex/moneyCommercialPolicy.ts:44-73` shows validators, not replay persistence; the handler is 324-457.

The verified citations include the admin readback cap, Call money projection, permission matrix, FVA rule, canonical refs, table indexes, audit payload, `operationKeys` index, Sentry tag and reused UI primitives.

## SchemaFacts reconciliation

**PASS:** PRESENT/ABSENT claims for Calls, projections, Quotes, resolutions, publications, admission cases, Businesses, connections, disputes, Accounts, Agents and Audit match SchemaFacts. The proposed global state/time indexes are genuinely absent.

**FIX:** RFC 187 says it “adds” `operationKeys.by_actor_operation_key`; SchemaFacts and source show it is PRESENT. Say “reuse.” RFC 109 duplicates `outcome code` inside redacted payload although `auditEvents.outcome` already exists; use that field and add only the absent permission and versioned redacted before/after summary.

## Reference adoption and licences

**NOTE:** The adoption is patterns-only. RFC 41 rejects external runtimes/components, and no Polaris or Medusa package/import exists in `package.json`, lockfile or `src/`. Medusa DataTable, Stripe search and Shopify’s current details pattern support the claimed interaction patterns.

**Exact change:** replace the dead `polaris.shopify.com` links at lines 35 and 47-51; the checked patterns URL returns 404 rather than redirecting. Link current `shopify.dev` pattern pages. Correct “Shopify-licensed”: archived Polaris React is MIT; no licence or code is being pulled in.

## Ordered fixes for RfcWriter

1. Close and action-index the parser, command receipt, refusal and approval types.
2. Specify generic idempotent replay and the second-approval state machine end to end.
3. Reconcile CQS: no query audit writes; no mutation read models; no alpha annotation.
4. Make the adapter a single deep ACL using public seams only without raising the module-count ratchet.
5. Enumerate every per-action refusal and its UI/effect-certainty mapping.
6. Correct `operationKeys`/audit-field schema wording and the four stale source citations.
7. Replace dead Polaris URLs and correct the licence statement.

**GATE: APPROVED WITH FIXES (1-5 blocking; 6-7 required factual corrections).**

## Re-review (v2)

Reviewed RFC v2 at `2e72bf217` against the five blocking fixes above.

1. **Type contract — STILL OPEN** (`RFC:115-245`). Canonical public refs, total parsers, literal refusal/success codes, action-indexed receipts, non-optional fields and a closed approval union are now specified. One illegal state remains: `approval_proposed` is a success code for suppression and commercial policy (`:165-172`), but the only success receipt is `kind: 'completed'` (`:237-239`), so a pending proposal is representable as completed. Add a separate `kind: 'proposed'` receipt with `code: 'approval_proposed'`, empty effect refs and `approval.kind: 'awaiting_second_approval'`; remove that code from completed outcomes.
2. **Idempotency and second approval — RESOLVED** (`RFC:109,268-270,315,346-347`). All six actions use the existing operation-key index; canonical first-outcome bytes replay unchanged; changed material refuses; OCC protects a single effect; proposal and approval keys, digest, expiry, distinct active actor, concurrency and terminal replay are explicit.
3. **CQS — RESOLVED** (`RFC:249,255,316,322,348`). Queries write nothing, lookup telemetry sits at the server boundary, mutations return receipts/effect refs only, object state is re-queried, and alpha annotation is unexposed.
4. **Deep ACL/public seams — RESOLVED** (`RFC:84,92,287-291,348`). One Convex ACL owns raw-row translation; raw docs and internal imports cannot cross it; contracts live outside a new domain module; the 29-module ratchet remains fixed.
5. **Refusal/error strategy — RESOLVED** (`RFC:174-206,257-282,324-338,349`). Refusals are closed per action, source-write failures are enumerated, presentation maps retryability/effect certainty/copy/next step, transaction certainty is explicit, and only unexpected faults reach Sentry.

The prior factual corrections are also resolved at RFC lines 35-51, 109 and 255-266.

**GATE: STILL BLOCKED.**

## Re-review (v3)

Reviewed RFC v3 at `e2bbc6bec` against the five blocking fixes.

1. **Type contract — RESOLVED** (`RFC:165-173,238-246`). Completed codes now exclude proposal creation. Only the two proposable actions can produce `kind: 'proposed'`; that receipt requires a proposal command ref, `awaiting: 'second_approval'` and empty effect refs. Completed receipts admit only `not_required | approved`, so a pending proposal is no longer representable as completed. The state-machine prose and behavioral assertion agree (`RFC:277,354`).
2. **Idempotency and second approval — RESOLVED** (`RFC:275-277,322,353-354`).
3. **CQS — RESOLVED** (`RFC:256,262,323,329,355`).
4. **Deep ACL/public seams — RESOLVED** (`RFC:84,92,294-298,355`).
5. **Refusal/error strategy — RESOLVED** (`RFC:175-207,264-289,331-356`).

**GATE: APPROVED.**
