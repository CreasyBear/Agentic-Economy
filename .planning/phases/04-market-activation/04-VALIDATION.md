# Phase 4 validation strategy

## What the phase proves

Phase 4 proves a founder-operable, exact-revision, labelled sandbox path from
business operation setup through three-quote sourcing to one safely started or
honestly uncertain provider operation.

It does not prove provider quality, real credentials, real payment,
fulfilment, market liquidity, customer demand, willingness to pay, production
safety or customer value.

## Fast loops

Each parcel runs its named RED and focused files only. `git diff --check` runs
after every edit group. Typecheck, lint, import boundaries and broad Phase 4
integration run once after the parent integrates a subphase. Unrelated baseline
failures are recorded with ownership and do not become implementation loops.

## Phase 4A falsifiers

- the Business Account is merely a listing or capability-onboarding wrapper;
- a business cannot manage multiple members, services or operations;
- the last active owner can be removed, suspended or demoted;
- founder assist borrows owner authority or hides its actor identity;
- support replies and private customer-success notes share visibility;
- account closure deletes history or leaves new work routeable;
- a commercial form creates paid, invoice or settlement truth;
- an intended navigation destination has no source-backed route/readback;
- portfolio/detail reads grow with unrelated Business Accounts;
- any owner/form/projection fact alone makes supply routeable;
- raw credentials or auth headers can enter durable/shared records;
- an open endpoint is blocked for lacking credentials, or an authenticated
  endpoint becomes ready without a resolvable managed reference;
- a `none` binding invokes credential custody or emits an Authorization header;
- a `managed_ref` binding admits, probes or executes after failed custody
  resolution;
- credential-mode substitution preserves the prior binding/probe identity or
  reuses readiness evidence from the old mode;
- stale readiness remains publicly routeable;
- owner authorization trusts caller-supplied identity or Clerk subject after
  migration closure;
- public search hydrates/scans work proportional to total network size;
- deleting onboarding/projection state removes canonical supply;
- founder assist can impersonate an owner or self-approve admission.

Required evals include exact ceiling/one-over page limits, duplicate draft
commands, stale revisions, private/redirected probe targets, readiness expiry,
withdrawal, projection rebuild and 1k/10k unrelated-record query budgets.

Also run the ten Business Account completion scenarios in
`04A-BUSINESS-ACCOUNT-MANAGEMENT.md`, including membership, multiple services,
support, commercial context, offboarding and direct-URL restoration.

Only parcel 4A-A may aggregate these results into Phase 4A acceptance. It runs
after source integration, UI integration and parent-owned route generation.
4B cannot start from an earlier parcel even if every focused child command is
green.

The parent regenerates the route tree after owner routes land and verifies the
four exact route IDs/imports before focused route tests and typecheck. Generated
route output is never hand-edited by a child.

## Phase 4B falsifiers

- eligible suppliers are shown as quotes before provider results;
- the shared Request/UI parses a provider-specific payload;
- fewer than three current results are represented as three;
- uncertain solicitation is retried or silently replaced;
- wrong requirement revision, supplier, capability, currency, shape or expiry
  enters comparison;
- commercial influence or unlike output shape still produces a recommendation;
- cold restoration sends another solicitation;
- a supplier contact bypasses Registered Action/Invocation lineage;
- the routing offer becomes the only durable owner of quote business truth;
- query/read work grows with unrelated offers.

Required cases:

1. three current comparable offers;
2. two offers plus unavailable;
3. two offers plus uncertain;
4. invalid and expired results;
5. duplicate/redelivered provider response;
6. Request revision change;
7. cross-principal read;
8. 10,000 unrelated offers with unchanged exact read budget.

## Phase 4C falsifiers

- selection is treated as authority or execution;
- old approval applies to changed offer/provider/terms;
- selection cannot be reconstructed as an exact versioned Request transition;
- provider acknowledgement is shown as fulfilment;
- possible release becomes retryable;
- cancellation is shown as reversal without provider evidence;
- late result overwrites a newer generation;
- Activity owns copied business truth;
- reload/transcript/browser storage is required to determine safe continuation;
- human and agent paths disagree on consequence, release, result or commands.

Crash cuts occur before release, after possible release, after provider response
and after result commit. For every cut assert authorization count, provider-send
count, provider-response count and business-result count independently.

## UI and comprehension evals

For each canonical state, human and agent projections must agree on business,
operation, requirements, disclosure, coverage, selected offer, authority,
release/result truth, evidence environment and allowed commands.

A fresh evaluator must answer:

- 4A: what is public, what is supported, whether it is routeable and why;
- 4B: what the customer needs, who received what, how many viable offers exist,
  what is uncertain and whether anything has started;
- 4C: what was selected, authorized and released, what is known, what can still
  be stopped and the only safe next action.

Automated comprehension is an adjunct. It does not become human/customer proof.

The neutral Activity shell is also exercised with two materially different
sources: an RFQ Customer Request summary and the existing paid-operation
summary. The shell may share orientation/status/detail relations; quote and
payment fields must remain in separate domain panels.

After the Activity Request route lands, the parent reruns route generation and
verifies the exact `/activity` and `/activity/$requestRef` IDs/imports before
focused route tests and typecheck.

Accessibility acceptance: keyboard path, persistent labels, visible focus,
44px targets, 320px, 400% zoom, non-colour states, bounded live announcements
and reduced motion.

## Final integration commands

The parent confirms package scripts on the final base and records exact command
identities. The expected command families are:

```text
npm exec -- vitest run tests/unit/capability-supply tests/unit/registry
npm exec -- vitest run tests/unit/business-account tests/unit/business tests/unit/catalog
npm exec -- vitest run tests/unit/reference-digital-procurement
npm exec -- vitest run tests/unit/customer-request
npm exec -- vitest run tests/integration/capability-supply-onboarding*.test.ts
npm exec -- vitest run tests/integration/business-account-*.test.ts
npm exec -- vitest run tests/integration/*three-quotes*.test.ts tests/integration/*quote-to-close*.test.ts
npm exec -- playwright test tests/e2e/business-account-management.spec.ts tests/e2e/business-account-founder-console.spec.ts tests/e2e/supply-onboarding.spec.ts tests/e2e/phase4-three-quotes.spec.ts tests/e2e/phase4-quote-to-close.spec.ts
npm run test:imports
npm run typecheck
npm run lint
git diff --check
```

No child substitutes a broader command as its working loop. Missing/renamed
scripts are corrected in the parent dispatch contract before the first write.

## Evidence ladder

1. source inspection and exact ownership map;
2. focused unit/integration fixtures;
3. labelled local browser loop;
4. clean exact-revision evidence packet;
5. separately authorized labelled hosted-sandbox readback;
6. independent P0/P1 review.

Provider/customer operating evidence remains a separate later ladder. Phase 4
completion explicitly enables the founder to pursue it; it does not wait for it.
